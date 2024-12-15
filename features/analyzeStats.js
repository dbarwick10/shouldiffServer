import { analyzeMatchTimelineForSummoner } from './matchTimeline.js';
import { getItemDetails } from './getItemsAndPrices.js';
import { gameResult } from './endGameResult.js';

function initializeStats(matchId) {
    return {
        matchId,
        basicStats: {
            kills: { count: 0, timestamps: [] },
            deaths: { count: 0, timestamps: [], timers: [], totalDeathTime: [], levelAtDeath: [] },
            assists: { count: 0, timestamps: [] },
            timeSpentDead: {
                deathMinute: [],
                deathLevel: [],
                expectedDeathTimer: [],
                totalDeathTime: [],
                history: {
                    deathMinute: [],
                    deathLevel: [],
                    expectedDeathTimer: [],
                    totalDeathTime: []
                },
                kda: {
                    total: 0,
                    history: { count: 0, timestamps: [] }
                }
            }
        },
        objectives: {
            turrets: { count: 0, timestamps: [] },
            towerKills: {
                outer: { count: 0, timestamps: [] },
                inner: { count: 0, timestamps: [] },
                base: { count: 0, timestamps: [] },
                nexus: { count: 0, timestamps: [] }
            },
            inhibitors: { count: 0, timestamps: [] },
            eliteMonsterKills: { count: 0, timestamps: [] },
            dragons: { count: 0, timestamps: [] },
            barons: { count: 0, timestamps: [] },
            elders: { count: 0, timestamps: [] }
        },
        economy: {
            itemPurchases: { count: 0, timestamps: [], items: [] },
            itemGold: { total: 0, history: { count: [], timestamps: [] } }
        },
        events: [],
        outcome: {
            result: null,
            surrender: false
        }
    };
}

function getTimeIncreaseFactor(currentMinutes) {
    if (currentMinutes < 15) return 0;
    if (currentMinutes < 30) {
        return Math.min(Math.ceil(2 * (currentMinutes - 15)) * 0.00425, 0.1275);
    } else if (currentMinutes < 45) {
        return Math.min(0.1275 + Math.ceil(2 * (currentMinutes - 30)) * 0.003, 0.2175);
    } else if (currentMinutes < 55) {
        return Math.min(0.2175 + Math.ceil(2 * (currentMinutes - 45)) * 0.0145, 0.50);
    }
    return 0.50;
}

function calculateDeathTimer(currentMinutes, level, gameMode) {
    if (gameMode === 'ARAM') {
        return level * 2 + 4;
    } else {
        const BRW = [10, 10, 12, 12, 14, 16, 20, 25, 28, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5];
        const baseRespawnWait = BRW[level - 1];
        const timeIncreaseFactor = getTimeIncreaseFactor(currentMinutes);
        return baseRespawnWait + (baseRespawnWait * timeIncreaseFactor);
    }
}

function buildLevelTimeline(matchInfo) {
    const levelsByParticipant = new Map();
    
    for (let i = 1; i <= 10; i++) {
        levelsByParticipant.set(i, [{
            level: 1,
            timestamp: 0
        }]);
    }

    if (matchInfo.info?.frames) {
        for (const frame of matchInfo.info.frames) {
            if (!frame.events) continue;
            
            const levelUpEvents = frame.events
                .filter(e => e.type === 'LEVEL_UP')
                .sort((a, b) => a.timestamp - b.timestamp);
            
            for (const event of levelUpEvents) {
                const participantId = event.participantId;
                const timestamp = event.timestamp / 1000;
                const newLevel = event.level;
                
                const levelHistory = levelsByParticipant.get(participantId);
                if (!levelHistory) continue;

                const currentLevel = levelHistory[levelHistory.length - 1].level;

                if (newLevel === currentLevel + 1) {
                    levelHistory.push({
                        level: newLevel,
                        timestamp: timestamp
                    });
                }
            }
        }
    }

    return levelsByParticipant;
}

function getChampionLevel(levelTimeline, participantId, timestamp) {
    const levels = levelTimeline.get(participantId);
    if (!levels) return 1;
    
    for (let i = levels.length - 1; i >= 0; i--) {
        if (levels[i].timestamp <= timestamp) {
            return levels[i].level;
        }
    }
    
    return 1;
}

async function updateTimeSpentDead(statsObj, victimId, timestamp, matchStats) {
    if (!statsObj.basicStats) {
        statsObj.basicStats = {
            timeSpentDead: {
                deathMinute: [],
                deathLevel: [],
                expectedDeathTimer: [],
                totalDeathTime: [],
                history: {
                    deathMinute: [],
                    deathLevel: [],
                    expectedDeathTimer: [],
                    totalDeathTime: []
                }
            },
            deaths: {
                count: 0,
                timestamps: [],
                totalDeathTime: []
            }
        };
    }

    const matchInfo = matchStats.find(match => match.info);
    if (!matchInfo) return;

    if (!matchInfo.levelTimeline) {
        matchInfo.levelTimeline = buildLevelTimeline(matchInfo);
    }

    const currentMinutes = Math.floor(timestamp / 60);
    const level = getChampionLevel(matchInfo.levelTimeline, victimId, timestamp);
    const deathTimer = calculateDeathTimer(currentMinutes, level, matchInfo.info.gameMode);

    const previousTotalTimeSpentDead = 
        statsObj.basicStats.timeSpentDead.history.totalDeathTime.length > 0
            ? statsObj.basicStats.timeSpentDead.history.totalDeathTime[
                statsObj.basicStats.timeSpentDead.history.totalDeathTime.length - 1
              ]
            : 0;
    
    const totalTimeSpentDead = previousTotalTimeSpentDead + deathTimer;

    statsObj.basicStats.deaths.totalDeathTime.push(totalTimeSpentDead);
    statsObj.basicStats.timeSpentDead.deathMinute.push(Number(timestamp));
    statsObj.basicStats.timeSpentDead.deathLevel.push(level);
    statsObj.basicStats.timeSpentDead.expectedDeathTimer.push(deathTimer);
    statsObj.basicStats.timeSpentDead.totalDeathTime.push(Number(Math.round(totalTimeSpentDead)));

    statsObj.basicStats.timeSpentDead.history.deathMinute.push(Number(timestamp));
    statsObj.basicStats.timeSpentDead.history.deathLevel.push(level);
    statsObj.basicStats.timeSpentDead.history.expectedDeathTimer.push(deathTimer);
    statsObj.basicStats.timeSpentDead.history.totalDeathTime.push(Number(Math.round(totalTimeSpentDead)));
}

function findPlayerParticipantId(events, participants, puuid) {
    const participant = participants.find(p => p.puuid === puuid);
    return participant ? participant.participantId : null;
}

async function analyzePlayerStats(matchStats, puuid, gameResultMatches) {
    try {
        const matches = Array.isArray(matchStats) ? matchStats : matchStats.matches;
        if (!matches || !Array.isArray(matches)) {
            return null;
        }

        const gameResults = await gameResult(gameResultMatches, puuid);
        const matchTimelines = await analyzeMatchTimelineForSummoner({ matches }, puuid);
        
        if (!Array.isArray(matchTimelines)) {
            return null;
        }

        const matchId = matchStats.metadata?.matchId;
        const aggregateStats = {
            playerStats: initializeStats(matchId),
            teamStats: initializeStats(matchId),
            enemyStats: initializeStats(matchId)
        };

        const individualGameStats = [];

        for (const match of matchTimelines) {
            const destroyedItems = new Map();
            const { matchId, allEvents, frames } = match;

            const matchStatsMatch = matches.find(m => m.metadata.matchId === matchId);
            const gameResultMatch = gameResultMatches.find(m => m.metadata.matchId === matchId);

            if (!matchStatsMatch || !gameResultMatch || !allEvents || !Array.isArray(allEvents)) {
                continue;
            }

            const gameStats = {
                playerStats: initializeStats(matchId),
                teamStats: initializeStats(matchId),
                enemyStats: initializeStats(matchId)
            };

            // Set game outcome
            const isWin = gameResults.results.wins.some(game => game.matchId === matchId);
            const isSurrender = gameResults.results.surrenderWins.some(game => game.matchId === matchId) ||
                              gameResults.results.surrenderLosses.some(game => game.matchId === matchId);

            gameStats.playerStats.outcome.result = isWin 
                ? (isSurrender ? 'surrenderWin' : 'win')
                : (isSurrender ? 'surrenderLoss' : 'loss');
            gameStats.playerStats.outcome.surrender = isSurrender;

            const playerParticipantId = findPlayerParticipantId(allEvents, matchStatsMatch.info.participants, puuid);
            if (!playerParticipantId) {
                continue;
            }

            const teamParticipantIds = playerParticipantId <= 5 ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10];

            await processEvents(
                allEvents, 
                playerParticipantId, 
                teamParticipantIds, 
                aggregateStats, 
                gameStats, 
                matchId, 
                matchStats, 
                frames, 
                gameResultMatches,
                destroyedItems
            );

            match.allEvents = null;
            match.frames = null;

            individualGameStats.push(gameStats);

            if (global.gc) {
                try {
                    global.gc();
                } catch (e) {}
            }
        }

        return { 
            aggregateStats,
            individualGameStats
        };

    } catch (error) {
        console.error('Error analyzing player stats:', error);
        return null;
    }
}

async function processEvents(events, playerParticipantId, teamParticipantIds, stats, gameStats, matchId, matchStats, frames, gameResultMatches, destroyedItems) {
    const processedEvents = events.map(event => ({
        type: event.type,
        timestamp: event.timestamp / 1000,
        participantId: event.participantId,
        killerId: event.killerId,
        victimId: event.victimId,
        assistingParticipantIds: event.assistingParticipantIds,
        buildingType: event.buildingType,
        towerType: event.towerType,
        monsterType: event.monsterType,
        itemId: event.itemId
    }));

    for (const event of processedEvents) {
        const timestamp = event.timestamp;
        const participantType = event.participantId === playerParticipantId ? 'playerStats' :
                              teamParticipantIds.includes(event.participantId) ? 'teamStats' : 
                              'enemyStats';

        switch (event.type) {
            case 'CHAMPION_KILL':
                await processKill(event, stats[participantType], gameStats[participantType], matchStats);
                break;
            case 'BUILDING_KILL':
                processBuilding(event, stats[participantType], gameStats[participantType]);
                break;
            case 'ELITE_MONSTER_KILL':
                processMonster(event, stats[participantType], gameStats[participantType]);
                break;
            case 'ITEM_PURCHASED':
                await processItem(event, stats[participantType], gameStats[participantType], destroyedItems);
                break;
        }
    }
}

async function processKill(event, stats, gameStats, matchStats) {
    const timestamp = event.timestamp;
    
    // Update KDA
    if (event.killerId === event.participantId) {
        stats.basicStats.kills.count++;
        stats.basicStats.kills.timestamps.push(timestamp);
        gameStats.basicStats.kills.count++;
        gameStats.basicStats.kills.timestamps.push(timestamp);
    } else if (event.victimId === event.participantId) {
        await updateTimeSpentDead(stats, event.victimId, timestamp, matchStats);
        await updateTimeSpentDead(gameStats, event.victimId, timestamp, matchStats);
    } else if (event.assistingParticipantIds?.includes(event.participantId)) {
        stats.basicStats.assists.count++;
        stats.basicStats.assists.timestamps.push(timestamp);
        gameStats.basicStats.assists.count++;
        gameStats.basicStats.assists.timestamps.push(timestamp);
    }
}

function processBuilding(event, stats, gameStats) {
    const timestamp = event.timestamp;
    
    if (event.buildingType === 'TOWER_BUILDING') {
        const towerType = event.towerType.toLowerCase().replace('_turret', '');
        stats.objectives.towerKills[towerType].count++;
        stats.objectives.towerKills[towerType].timestamps.push(timestamp);
        gameStats.objectives.towerKills[towerType].count++;
        gameStats.objectives.towerKills[towerType].timestamps.push(timestamp);
    } else if (event.buildingType === 'INHIBITOR_BUILDING') {
        stats.objectives.inhibitors.count++;
        stats.objectives.inhibitors.timestamps.push(timestamp);
        gameStats.objectives.inhibitors.count++;
        gameStats.objectives.inhibitors.timestamps.push(timestamp);
    }
}

function processMonster(event, stats, gameStats) {
    const timestamp = event.timestamp;
    
    stats.objectives.eliteMonsterKills.count++;
    stats.objectives.eliteMonsterKills.timestamps.push(timestamp);
    gameStats.objectives.eliteMonsterKills.count++;
    gameStats.objectives.eliteMonsterKills.timestamps.push(timestamp);

    if (event.monsterType === 'DRAGON') {
        stats.objectives.dragons.count++;
        stats.objectives.dragons.timestamps.push(timestamp);
        gameStats.objectives.dragons.count++;
        gameStats.objectives.dragons.timestamps.push(timestamp);
    } else if (event.monsterType === 'BARON_NASHOR') {
        stats.objectives.barons.count++;
        stats.objectives.barons.timestamps.push(timestamp);
        gameStats.objectives.barons.count++;
        gameStats.objectives.barons.timestamps.push(timestamp);
    } else if (event.monsterType === 'ELDER_DRAGON') {
        stats.objectives.elders.count++;
        stats.objectives.elders.timestamps.push(timestamp);
        gameStats.objectives.elders.count++;
        gameStats.objectives.elders.timestamps.push(timestamp);
    }
}

async function processItem(event, stats, gameStats, destroyedItems) {
    if (!event.itemId) return;

    try {
        const itemDetails = await getItemDetails(event.itemId.toString());
        if (!itemDetails) return;

        // Process components
        if (itemDetails.from?.length > 0) {
            const participantItems = destroyedItems.get(event.participantId) || new Map();
            destroyedItems.set(event.participantId, participantItems);

            for (const componentId of itemDetails.from) {
                if (participantItems.has(componentId)) {
                    participantItems.delete(componentId);
                } else {
                    const itemGold = itemDetails.gold?.base || 0;
                    updateEconomyStats(stats, event.timestamp, event.itemId, itemGold);
                    updateEconomyStats(gameStats, event.timestamp, event.itemId, itemGold);
                }
            }
        } else {
            const itemGold = itemDetails.gold?.base || 0;
            updateEconomyStats(stats, event.timestamp, event.itemId, itemGold);
            updateEconomyStats(gameStats, event.timestamp, event.itemId, itemGold);
        }

    } catch (error) {
        console.warn(`Error processing item ${event.itemId}:`, error);
    }
}

function updateEconomyStats(stats, timestamp, itemId, gold) {
    if (!stats.economy) {
        stats.economy = {
            itemPurchases: { count: 0, timestamps: [], items: [] },
            itemGold: { total: 0, history: { count: [], timestamps: [] } }
        };
    }

    const lastTotal = stats.economy.itemPurchases.items.length > 0 
        ? stats.economy.itemPurchases.items[stats.economy.itemPurchases.items.length - 1].totalGold 
        : 0;

    stats.economy.itemPurchases.count++;
    stats.economy.itemPurchases.timestamps.push(timestamp);
    stats.economy.itemPurchases.items.push({
        itemId,
        timestamp,
        gold,
        totalGold: lastTotal + gold
    });
    
    stats.economy.itemGold.total += gold;
    stats.economy.itemGold.history.count.push(gold);
    stats.economy.itemGold.history.timestamps.push(timestamp);
}

function updateKDAStats(stats) {
    const kills = stats.basicStats.kills.count;
    const deaths = Math.max(1, stats.basicStats.deaths.count); // Avoid division by zero
    const assists = stats.basicStats.assists.count;
    
    if (!stats.basicStats.kda) {
        stats.basicStats.kda = {
            total: 0,
            history: {
                count: [],
                timestamps: []
            }
        };
    }
    
    const kda = (kills + assists) / deaths;
    stats.basicStats.kda.total = kda;
}

export {
    analyzePlayerStats,
    initializeStats,
    processEvents,
    calculateDeathTimer,
    updateTimeSpentDead
};