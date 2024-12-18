
import { analyzeMatchTimelineForSummoner } from './matchTimeline.js';
import { getItemDetails } from './getItemsAndPrices.js';
import { gameResult } from './endGameResult.js';

const destroyedItems = new Map();

function initializeStats(matchId) {
    return {
        matchId,
        basicStats: {
            kills: { count: 0, timestamps: [] },
            deaths: { 
                count: 0, 
                timestamps: [], 
                timers: [],
                totalDeathTime: [],
                levelAtDeath: []
            },
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
            },
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
            itemPurchases: { 
                count: 0, 
                timestamps: [], 
                items: [] 
            },
            itemGold: { 
                total: 0, 
                history: { count: [], timestamps: [] }
            }
        },
        events: [],
        outcome: {
            result: null, // 'win', 'loss', 'surrender_win', 'surrender_loss'
            surrender: false // true if the game ended due to a surrender
        }
    };
}

export async function analyzePlayerStats(matchStats, puuid, gameResultMatches) {
    try {
        destroyedItems.clear();

        const matches = Array.isArray(matchStats) ? matchStats : matchStats.matches;
        if (!matches || !Array.isArray(matches)) {
            console.error('Invalid matchStats structure:', matchStats);
            return null;
        }

        // Get game results and add debug logging
        const gameResults = await gameResult(gameResultMatches, puuid);
        // console.log('Game results for analysis:', gameResults);

        const matchTimelines = await analyzeMatchTimelineForSummoner({ matches }, puuid);
        if (!Array.isArray(matchTimelines)) {
            console.error('Invalid matchTimelines structure:', matchTimelines);
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
            destroyedItems.clear();
            const { matchId, allEvents, metadata, frames } = match;

            // Ensure the matchId matches in both matchStats and gameResultMatches
            const matchStatsMatch = matches.find(m => m.metadata.matchId === matchId);
            const gameResultMatch = gameResultMatches.find(m => m.metadata.matchId === matchId);

            if (!matchStatsMatch || !gameResultMatch) {
                console.warn(`Skipping match ${matchId} due to mismatch in matchStats or gameResultMatches`);
                continue;
            }

            if (!allEvents || !Array.isArray(allEvents)) {
                console.warn(`Skipping match ${matchId} due to missing events`);
                continue;
            }

            const gameStats = {
                playerStats: initializeStats(matchId),
                teamStats: initializeStats(matchId),
                enemyStats: initializeStats(matchId)
            };

            // Debug log for specific match
            // console.log(`Processing match ${matchId} for outcome`);

            // Update game outcome with detailed logging
            const isWin = gameResults.results.wins.some(game => game.matchId === matchId);
            const isSurrender = gameResults.results.surrenderWins.some(game => game.matchId === matchId) ||
                              gameResults.results.surrenderLosses.some(game => game.matchId === matchId);
            const gameMode = gameResultMatches.find(m => m.metadata.matchId === matchId)?.info?.gameMode;

            // console.log(`Match ${matchId} outcome check:`, {
            //     gameMode: gameMode,
            //     isWin,
            //     isSurrender,
            //     inWinsArray: gameResults.results.wins.map(g => g.matchId),
            //     inLossesArray: gameResults.results.losses.map(g => g.matchId)
            // });

            gameStats.playerStats.outcome.result = isWin 
                ? (isSurrender ? 'surrenderWin' : 'win')
                : (isSurrender ? 'surrenderLoss' : 'loss');
            gameStats.playerStats.outcome.surrender = isSurrender;

            // console.log(`Final outcome for match ${matchId}:`, gameStats.playerStats.outcome);

            const participantInfo = getParticipantInfo(allEvents);
            if (!participantInfo) {
                console.warn(`Skipping match ${matchId} - cannot determine participant info`);
                continue;
            }

            const playerParticipantId = findPlayerParticipantId(allEvents, matchStatsMatch.info.participants, puuid);
            if (!playerParticipantId) {
                console.warn(`Skipping match ${matchId} - cannot determine player's participantId`);
                continue;
            }

            const teamParticipantIds = playerParticipantId <= 5 ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10];

            processMatchEvents(allEvents, playerParticipantId, teamParticipantIds, aggregateStats, gameStats, matchId, matchStats, frames, gameResultMatches);

            individualGameStats.push(gameStats);

            match.allEvents = null;
            match.frames = null;

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

function findPlayerParticipantId(events, participants, puuid) {
    const participant = participants.find(p => p.puuid === puuid);
    return participant ? participant.participantId : null;
}

function getTeamParticipantIds(participants, playerParticipantId) {
    const playerTeamId = participants.find(p => p.participantId === playerParticipantId).teamId;
    return participants.filter(p => p.teamId === playerTeamId).map(p => p.participantId);
}

function getParticipantInfo(events) {
    return events.some(event => 
        event.type === 'CHAMPION_KILL' || 
        event.type === 'ITEM_PURCHASED' ||
        event.type === 'SKILL_LEVEL_UP' ||
        event.type === 'LEVEL_UP'
    );
}

function processMatchEvents(events, playerParticipantId, teamParticipantIds, stats, gameStats, matchId, matchStats, frames, gameResultMatches) {
    events.forEach(event => {
        switch (event.type) {
            case 'CHAMPION_KILL': processChampionKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId, matchStats, frames, gameResultMatches); break;
            case 'BUILDING_KILL': processBuildingKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId); break;
            case 'ELITE_MONSTER_KILL': processMonsterKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId); break;
            case 'ITEM_PURCHASED': processItemPurchase(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId); break;
        }
    });
}

async function processChampionKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId, matchStats, frames, gameResultMatches) {
    event.matchId = matchId;
    const timestamp = (event.timestamp / 1000);

    // Update KDA ratio
    const updateKDA = (basicStats) => {
        if (!basicStats.kda) {
            basicStats.kda = { 
                total: 0, 
                history: { 
                    count: [], 
                    timestamps: [],
                    raw: [] 
                } 
            };
        }

        const kills = basicStats.kills?.count || 0;
        const assists = basicStats.assists?.count || 0;
        const deaths = basicStats.deaths?.count || 1;
        const kdaRatio = (kills + assists) / deaths;
        
        basicStats.kda.total = kdaRatio;
        
        if (!Array.isArray(basicStats.kda.history.count)) basicStats.kda.history.count = [];
        if (!Array.isArray(basicStats.kda.history.timestamps)) basicStats.kda.history.timestamps = [];
        if (!Array.isArray(basicStats.kda.history.raw)) basicStats.kda.history.raw = [];
        
        basicStats.kda.history.raw.push(kdaRatio);
        basicStats.kda.history.count.push(kdaRatio);
        basicStats.kda.history.timestamps.push(timestamp);
    };

    // Update stats for a specific participant type
    const updateParticipantStats = (statsObj, eventType) => {
        if (!statsObj) return;
        
        if (!statsObj.basicStats) {
            statsObj.basicStats = {
                kills: { count: 0, timestamps: [] },
                deaths: { count: 0, timestamps: [] },
                assists: { count: 0, timestamps: [] },
                kda: { 
                    total: 0, 
                    history: { 
                        count: [], 
                        timestamps: [],
                        raw: []
                    } 
                }
            };
        }
        
        if (!statsObj.basicStats[eventType]) {
            statsObj.basicStats[eventType] = { count: 0, timestamps: [] };
        }
        
        statsObj.basicStats[eventType].count++;
        statsObj.basicStats[eventType].timestamps.push(timestamp);
        
        updateKDA(statsObj.basicStats);
    };

    // Process player stats first
    if (event.killerId === playerParticipantId) {
        updateParticipantStats(stats.playerStats, 'kills');
        updateParticipantStats(gameStats.playerStats, 'kills');
    }
    if (event.victimId === playerParticipantId) {
        updateParticipantStats(stats.playerStats, 'deaths');
        updateParticipantStats(gameStats.playerStats, 'deaths');
    }
    if (event.assistingParticipantIds?.includes(playerParticipantId)) {
        updateParticipantStats(stats.playerStats, 'assists');
        updateParticipantStats(gameStats.playerStats, 'assists');
    }

    // Process team stats
    if (teamParticipantIds.includes(event.killerId)) {
        updateParticipantStats(stats.teamStats, 'kills');
        updateParticipantStats(gameStats.teamStats, 'kills');
    }
    if (teamParticipantIds.includes(event.victimId)) {
        updateParticipantStats(stats.teamStats, 'deaths');
        updateParticipantStats(gameStats.teamStats, 'deaths');
    }
    
    // Process enemy stats using !includes
    if (!teamParticipantIds.includes(event.killerId)) {
        updateParticipantStats(stats.enemyStats, 'kills');
        updateParticipantStats(gameStats.enemyStats, 'kills');
    }
    if (!teamParticipantIds.includes(event.victimId)) {
        updateParticipantStats(stats.enemyStats, 'deaths');
        updateParticipantStats(gameStats.enemyStats, 'deaths');
    }

    // Process assists
    if (event.assistingParticipantIds) {
        const teamAssists = event.assistingParticipantIds.filter(id => teamParticipantIds.includes(id));
        const enemyAssists = event.assistingParticipantIds.filter(id => !teamParticipantIds.includes(id));

        if (teamAssists.length > 0) {
            updateParticipantStats(stats.teamStats, 'assists');
            updateParticipantStats(gameStats.teamStats, 'assists');
        }
        if (enemyAssists.length > 0) {
            updateParticipantStats(stats.enemyStats, 'assists');
            updateParticipantStats(gameStats.enemyStats, 'assists');
        }
    }

    // Process time spent dead
    const updateTimeSpentDead = await updateTimeSpentDeadFunction(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId, matchStats, frames, gameResultMatches);
}

async function updateTimeSpentDeadFunction(event, timestamp, playerParticipantId, teamParticipantIds, stats, gameStats, matchStats, gameResultMatches) {
    async function updateTimeSpentDead(statsObj, victimId, timestamp, matchStats) {
        // Initialize if needed
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

        // Get match info for level calculation
        const matchInfo = matchStats.find(match => match.info);
        if (!matchInfo) {
            console.warn('No match info found in matchStats:', { matchStats });
            return;
        }

        // Build level timeline if needed
        if (!matchInfo.levelTimeline) {
            matchInfo.levelTimeline = buildLevelTimeline(matchInfo);
        }

        // Get death information
        const gameMode = gameResultMatches.find(m => m.metadata.matchId === matchId)?.info?.gameMode;
        const currentMinutes = Math.floor(timestamp / 60);
        const level = getChampionLevel(matchInfo.levelTimeline, victimId, timestamp);
        const deathTimer = calculateDeathTimer(currentMinutes, level, gameMode);

        // Calculate total death time using existing data
        const previousTotalTimeSpentDead = 
            statsObj.basicStats.timeSpentDead.history.totalDeathTime.length > 0
                ? statsObj.basicStats.timeSpentDead.history.totalDeathTime[
                    statsObj.basicStats.timeSpentDead.history.totalDeathTime.length - 1
                  ]
                : 0;
        
        const totalTimeSpentDead = previousTotalTimeSpentDead + deathTimer;

        // Update all arrays through direct mutation
        statsObj.basicStats.deaths.totalDeathTime.push(totalTimeSpentDead);
        statsObj.basicStats.timeSpentDead.deathMinute.push(Number(timestamp));
        statsObj.basicStats.timeSpentDead.deathLevel.push(level);
        statsObj.basicStats.timeSpentDead.expectedDeathTimer.push(deathTimer);
        statsObj.basicStats.timeSpentDead.totalDeathTime.push(Number(Math.round(totalTimeSpentDead)));

        // Update history arrays
        statsObj.basicStats.timeSpentDead.history.deathMinute.push(Number(timestamp));
        statsObj.basicStats.timeSpentDead.history.deathLevel.push(level);
        statsObj.basicStats.timeSpentDead.history.expectedDeathTimer.push(deathTimer);
        statsObj.basicStats.timeSpentDead.history.totalDeathTime.push(Number(Math.round(totalTimeSpentDead)));
    }

    // Process player dead time
    if (event.victimId === playerParticipantId) {
        await updateTimeSpentDead(stats.playerStats, event.victimId, timestamp, matchStats);
        await updateTimeSpentDead(gameStats.playerStats, event.victimId, timestamp, matchStats);
    }
    
    // Process team dead time
    if (teamParticipantIds.includes(event.victimId)) {
        await updateTimeSpentDead(stats.teamStats, event.victimId, timestamp, matchStats);
        await updateTimeSpentDead(gameStats.teamStats, event.victimId, timestamp, matchStats);
    }
    
    // Process enemy dead time using !includes
    if (!teamParticipantIds.includes(event.victimId)) {
        await updateTimeSpentDead(stats.enemyStats, event.victimId, timestamp, matchStats);
        await updateTimeSpentDead(gameStats.enemyStats, event.victimId, timestamp, matchStats);
    }
}

function buildLevelTimeline(matchInfo) {
    const levelsByParticipant = new Map();
    
    // Initialize tracking arrays for each participant
    for (let i = 1; i <= 10; i++) {
        levelsByParticipant.set(i, [{
            level: 1,
            timestamp: 0
        }]);
    }

    if (matchInfo.info?.frames) {
        // Go through each frame
        for (const frame of matchInfo.info.frames) {
            if (!frame.events) continue;
            
            // Get level up events from this frame
            const levelUpEvents = frame.events.filter(e => e.type === 'LEVEL_UP')
                .sort((a, b) => a.timestamp - b.timestamp);
            
            // Process each level up
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
    if (!levels) {
        console.warn('No level data found for participant:', participantId);
        return 1;
    }
    
    for (let i = levels.length - 1; i >= 0; i--) {
        if (levels[i].timestamp <= timestamp) {
            return levels[i].level;
        }
    }
    
    return 1;
}

// Update processBuildingKill
function processBuildingKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId) {
    event.matchId = matchId;
    const timestamp = (event.timestamp / 1000);

    if (event.killerId === playerParticipantId) {
        stats.playerStats.objectives.turrets.count++;
        stats.playerStats.objectives.turrets.timestamps.push(timestamp);
        gameStats.playerStats.objectives.turrets.count++;
        gameStats.playerStats.objectives.turrets.timestamps.push(timestamp);
    } else if (teamParticipantIds.includes(event.killerId)) {
        stats.teamStats.objectives.turrets.count++;
        stats.teamStats.objectives.turrets.timestamps.push(timestamp);
        gameStats.teamStats.objectives.turrets.count++;
        gameStats.teamStats.objectives.turrets.timestamps.push(timestamp);
    } else if (!teamParticipantIds.includes(event.killerId)) {
        stats.enemyStats.objectives.turrets.count++;
        stats.enemyStats.objectives.turrets.timestamps.push(timestamp);
        gameStats.enemyStats.objectives.turrets.count++;
        gameStats.enemyStats.objectives.turrets.timestamps.push(timestamp);
    }

    if (event.buildingType === 'TOWER_BUILDING') {
        const towerType = event.towerType.toLowerCase().replace('_turret', '');
        if (event.killerId === playerParticipantId) {
            stats.playerStats.objectives.towerKills[towerType].count++;
            stats.playerStats.objectives.towerKills[towerType].timestamps.push(timestamp);
            gameStats.playerStats.objectives.towerKills[towerType].count++;
            gameStats.playerStats.objectives.towerKills[towerType].timestamps.push(timestamp);
        } else if (teamParticipantIds.includes(event.killerId)) {
            stats.teamStats.objectives.towerKills[towerType].count++;
            stats.teamStats.objectives.towerKills[towerType].timestamps.push(timestamp);
            gameStats.teamStats.objectives.towerKills[towerType].count++;
            gameStats.teamStats.objectives.towerKills[towerType].timestamps.push(timestamp);
        } else if (!teamParticipantIds.includes(event.killerId)) {
            stats.enemyStats.objectives.towerKills[towerType].count++;
            stats.enemyStats.objectives.towerKills[towerType].timestamps.push(timestamp);
            gameStats.enemyStats.objectives.towerKills[towerType].count++;
            gameStats.enemyStats.objectives.towerKills[towerType].timestamps.push(timestamp);
        }
    } else if (event.buildingType === 'INHIBITOR_BUILDING') {
        if (event.killerId === playerParticipantId) {
            stats.playerStats.objectives.inhibitors.count++;
            stats.playerStats.objectives.inhibitors.timestamps.push(timestamp);
            gameStats.playerStats.objectives.inhibitors.count++;
            gameStats.playerStats.objectives.inhibitors.timestamps.push(timestamp);
        } else if (teamParticipantIds.includes(event.killerId)) {
            stats.teamStats.objectives.inhibitors.count++;
            stats.teamStats.objectives.inhibitors.timestamps.push(timestamp);
            gameStats.teamStats.objectives.inhibitors.count++;
            gameStats.teamStats.objectives.inhibitors.timestamps.push(timestamp);
        } else if (!teamParticipantIds.includes(event.killerId)) {
            stats.enemyStats.objectives.inhibitors.count++;
            stats.enemyStats.objectives.inhibitors.timestamps.push(timestamp);
            gameStats.enemyStats.objectives.inhibitors.count++;
            gameStats.enemyStats.objectives.inhibitors.timestamps.push(timestamp);
        }
    }
}

// Update processMonsterKill
function processMonsterKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId) {
    event.matchId = matchId;
    const timestamp = (event.timestamp / 1000);

    if (event.killerId === playerParticipantId) {
        stats.playerStats.objectives.eliteMonsterKills.count++;
        stats.playerStats.objectives.eliteMonsterKills.timestamps.push(timestamp);
        gameStats.playerStats.objectives.eliteMonsterKills.count++;
        gameStats.playerStats.objectives.eliteMonsterKills.timestamps.push(timestamp);
    } else if (teamParticipantIds.includes(event.killerId)) {
        stats.teamStats.objectives.eliteMonsterKills.count++;
        stats.teamStats.objectives.eliteMonsterKills.timestamps.push(timestamp);
        gameStats.teamStats.objectives.eliteMonsterKills.count++;
        gameStats.teamStats.objectives.eliteMonsterKills.timestamps.push(timestamp);
    } else if (!teamParticipantIds.includes(event.killerId)) {
        stats.enemyStats.objectives.eliteMonsterKills.count++;
        stats.enemyStats.objectives.eliteMonsterKills.timestamps.push(timestamp);
        gameStats.enemyStats.objectives.eliteMonsterKills.count++;
        gameStats.enemyStats.objectives.eliteMonsterKills.timestamps.push(timestamp);
    }

    if (event.monsterType === 'DRAGON') {
        if (event.killerId === playerParticipantId) {
            stats.playerStats.objectives.dragons.count++;
            stats.playerStats.objectives.dragons.timestamps.push(timestamp);
            gameStats.playerStats.objectives.dragons.count++;
            gameStats.playerStats.objectives.dragons.timestamps.push(timestamp);
        } else if (teamParticipantIds.includes(event.killerId)) {
            stats.teamStats.objectives.dragons.count++;
            stats.teamStats.objectives.dragons.timestamps.push(timestamp);
            gameStats.teamStats.objectives.dragons.count++;
            gameStats.teamStats.objectives.dragons.timestamps.push(timestamp);
        } else if (!teamParticipantIds.includes(event.killerId)) {
            stats.enemyStats.objectives.dragons.count++;
            stats.enemyStats.objectives.dragons.timestamps.push(timestamp);
            gameStats.enemyStats.objectives.dragons.count++;
            gameStats.enemyStats.objectives.dragons.timestamps.push(timestamp);
        }
    } else if (event.monsterType === 'BARON_NASHOR') {
        if (event.killerId === playerParticipantId) {
            stats.playerStats.objectives.barons.count++;
            stats.playerStats.objectives.barons.timestamps.push(timestamp);
            gameStats.playerStats.objectives.barons.count++;
            gameStats.playerStats.objectives.barons.timestamps.push(timestamp);
        } else if (teamParticipantIds.includes(event.killerId)) {
            stats.teamStats.objectives.barons.count++;
            stats.teamStats.objectives.barons.timestamps.push(timestamp);
            gameStats.teamStats.objectives.barons.count++;
            gameStats.teamStats.objectives.barons.timestamps.push(timestamp);
        } else if (!teamParticipantIds.includes(event.killerId)) {
            stats.enemyStats.objectives.barons.count++;
            stats.enemyStats.objectives.barons.timestamps.push(timestamp);
            gameStats.enemyStats.objectives.barons.count++;
            gameStats.enemyStats.objectives.barons.timestamps.push(timestamp);
        }
    } else if (event.monsterType === 'ELDER_DRAGON') {
        if (event.killerId === playerParticipantId) {
            stats.playerStats.objectives.elders.count++;
            stats.playerStats.objectives.elders.timestamps.push(timestamp);
            gameStats.playerStats.objectives.elders.count++;
            gameStats.playerStats.objectives.elders.timestamps.push(timestamp);
        } else if (teamParticipantIds.includes(event.killerId)) {
            stats.teamStats.objectives.elders.count++;
            stats.teamStats.objectives.elders.timestamps.push(timestamp);
            gameStats.teamStats.objectives.elders.count++;
            gameStats.teamStats.objectives.elders.timestamps.push(timestamp);
        } else if (!teamParticipantIds.includes(event.killerId)) {
            stats.enemyStats.objectives.elders.count++;
            stats.enemyStats.objectives.elders.timestamps.push(timestamp);
            gameStats.enemyStats.objectives.elders.count++;
            gameStats.enemyStats.objectives.elders.timestamps.push(timestamp);
        }
    }
}



// Helper function to initialize economy stats
function initializeEconomyStats(target) {
    target.economy = target.economy || {};
    target.economy.itemPurchases = target.economy.itemPurchases || { count: 0, timestamps: [], items: [] };
    target.economy.itemGold = target.economy.itemGold || { total: 0, history: { count: [], timestamps: [] } };
    target.events = target.events || [];
}

// Helper function to update stats
function updateStats(target, event, itemDetails, timestamp) {
    // Add running total to item purchases
    const itemGold = itemDetails?.gold?.base || 0;
    const lastTotal = target.economy.itemPurchases.items.length > 0 
    ? target.economy.itemPurchases.items[target.economy.itemPurchases.items.length - 1].totalGold 
    : 0;
    const totalGold = lastTotal + itemGold;

    target.economy.itemPurchases.count++;
    target.economy.itemPurchases.timestamps.push(timestamp);
    target.economy.itemPurchases.items.push({
        itemName: itemDetails.name || 'Unknown',
        itemId: event.itemId,
        timestamp,
        gold: itemDetails.gold.base || 0,
        totalGold: totalGold
    });
    target.economy.itemGold.total += itemDetails.gold.base || 0;
    target.economy.itemGold.history.count.push(itemDetails.gold.base || 0);
    target.economy.itemGold.history.timestamps.push(timestamp);
    // target.events.push({ ...event, timestamp, itemDetails });
}

// Track destroyed items, including multiple instances of the same item
function trackDestroyedItems(participantId, componentIds) {
    if (!destroyedItems.has(participantId)) {
        destroyedItems.set(participantId, new Map());
    }
    const participantDestroyedItems = destroyedItems.get(participantId);

    componentIds.forEach(itemId => {
        participantDestroyedItems.set(
            itemId,
            (participantDestroyedItems.get(itemId) || 0) + 1
        );
    });
}

// Check if an item is destroyed and reduce its count if so
function wasItemDestroyed(participantId, itemId) {
    const participantDestroyedItems = destroyedItems.get(participantId);
    if (!participantDestroyedItems || !participantDestroyedItems.has(itemId)) {
        return false;
    }
    const count = participantDestroyedItems.get(itemId);
    if (count > 1) {
        participantDestroyedItems.set(itemId, count - 1);
    } else {
        participantDestroyedItems.delete(itemId);
    }
    return true;
}

// Process when an item is destroyed explicitly
export function processItemDestroyed(event) {
    if (event.type === 'ITEM_DESTROYED') {
        trackDestroyedItems(event.participantId, [event.itemId]);
    }
}

// Process item purchase with component tracking
export async function processItemPurchase(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId) {
    if (event.type !== 'ITEM_PURCHASED') return stats;

    event.matchId = matchId;

    // Fetch item details
    let itemDetails = { gold: { total: 0 }, from: [] };
    try {
        if (event.itemId) {
            itemDetails = await getItemDetails(event.itemId.toString());
        }
    } catch (error) {
        console.warn(`Failed to fetch details for item ${event.itemId}, proceeding without component logic:`, error);
    }

    const timestamp = (event.timestamp / 1000);

    // Check if the item is built from components
    if (itemDetails.from && itemDetails.from.length > 0) {
        const components = [...itemDetails.from];
        const destroyed = [];
        for (const component of components) {
            if (!wasItemDestroyed(event.participantId, component)) {
                destroyed.push(component);
            }
        }
        // Track components used for the new item
        trackDestroyedItems(event.participantId, destroyed);
    }

    // Prevent processing if the item itself was already destroyed
    if (wasItemDestroyed(event.participantId, event.itemId)) return stats;

    // Initialize stats objects
    [stats, gameStats].forEach(target => {
        initializeEconomyStats(target.playerStats || {});
        initializeEconomyStats(target.teamStats || {});
        initializeEconomyStats(target.enemyStats || {});
    });

    if (event.participantId === playerParticipantId) {
        updateStats(stats.playerStats, event, itemDetails, timestamp);
        updateStats(gameStats.playerStats, event, itemDetails, timestamp);
    } else if (teamParticipantIds.includes(event.participantId)) {
        updateStats(stats.teamStats, event, itemDetails, timestamp);
        updateStats(gameStats.teamStats, event, itemDetails, timestamp);
    } else {
        updateStats(stats.enemyStats, event, itemDetails, timestamp);
        updateStats(gameStats.enemyStats, event, itemDetails, timestamp);
    }

    return stats;
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
    return 0.50; // Cap at 50%
}

function calculateDeathTimer(currentMinutes, level, gameMode) {
    if (gameMode === 'ARAM') {
        const deathTimer = level * 2 + 4;

        return deathTimer;
    } else {
    const BRW = [10, 10, 12, 12, 14, 16, 20, 25, 28, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5];
    const baseRespawnWait = BRW[level - 1];
    const timeIncreaseFactor = getTimeIncreaseFactor(currentMinutes);
    const deathTimer = baseRespawnWait + (baseRespawnWait * timeIncreaseFactor);
    
    return deathTimer;
    }
}