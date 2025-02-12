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
            hordeKills: { count: 0, timestamps: [] },
            riftHeralds: { count: 0, timestamps: [] },
            dragons: { count: 0, timestamps: [] },
            barons: { count: 0, timestamps: [] },
            elders: { count: 0, timestamps: [] },
            atakhans: { count: 0, timestamps: [] }
        },
        economy: {
            itemPurchases: {
                count: 0,
                timestamps: [],
                items: []
            },
            itemGold: {
                total: 0,
                history: {
                    count: [],
                    timestamps: []
                }
            }
        },
        events: [],
        outcome: {
            result: null,
            surrender: false
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

        const gameResults = await gameResult(gameResultMatches, puuid);
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

        const latestGameStats = {
            playerStats: initializeStats(matchId),
            teamStats: initializeStats(matchId),
            enemyStats: initializeStats(matchId),
            metadata: null
        };

        const individualGameStats = [];

        for (let i = 0; i < matchTimelines.length; i++) {
            destroyedItems.clear();
            const match = matchTimelines[i];
            const { matchId, allEvents, metadata, frames } = match;

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

            const playerParticipantId = findPlayerParticipantId(allEvents, matchStatsMatch.info.participants, puuid);
            if (!playerParticipantId) {
                console.warn(`Skipping match ${matchId} - cannot determine player's participantId`);
                continue;
            }

            const playerTeamId = playerParticipantId <= 5 ? 100 : 200;
            const isWin = gameResults.results.wins.some(game => game.matchId === matchId);
            const isSurrender = gameResults.results.surrenderWins.some(game => game.matchId === matchId) ||
                              gameResults.results.surrenderLosses.some(game => game.matchId === matchId);
            const gameMode = gameResultMatch?.info?.gameMode;

            // Set outcomes based on perspective
            gameStats.playerStats.outcome = {
                result: isWin ? (isSurrender ? 'surrenderWin' : 'win') : (isSurrender ? 'surrenderLoss' : 'loss'),
                surrender: isSurrender
            };

            gameStats.teamStats.outcome = {
                result: isWin ? (isSurrender ? 'surrenderWin' : 'win') : (isSurrender ? 'surrenderLoss' : 'loss'),
                surrender: isSurrender
            };

            // Enemy team outcome is opposite of player's team
            gameStats.enemyStats.outcome = {
                result: !isWin ? (isSurrender ? 'surrenderWin' : 'win') : (isSurrender ? 'surrenderLoss' : 'loss'),
                surrender: isSurrender
            };

            const teamParticipantIds = playerParticipantId <= 5 ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10];

            await processMatchEvents(allEvents, playerParticipantId, teamParticipantIds, 
                                  aggregateStats, gameStats, matchId, matchStats, frames, gameResultMatches);

            // Update aggregate stats outcomes
            if (isWin) {
                aggregateStats.playerStats.outcome.wins = (aggregateStats.playerStats.outcome.wins || 0) + 1;
                aggregateStats.teamStats.outcome.wins = (aggregateStats.teamStats.outcome.wins || 0) + 1;
            } else {
                aggregateStats.enemyStats.outcome.wins = (aggregateStats.enemyStats.outcome.wins || 0) + 1;
            }

            individualGameStats.push(gameStats);

            // Store first game stats
            if (i === 0) {
                latestGameStats.playerStats = JSON.parse(JSON.stringify(gameStats.playerStats));
                latestGameStats.teamStats = JSON.parse(JSON.stringify(gameStats.teamStats));
                latestGameStats.enemyStats = JSON.parse(JSON.stringify(gameStats.enemyStats));
                latestGameStats.metadata = {
                    matchId,
                    gameMode,
                    timestamp: matchStatsMatch.info.gameCreation,
                    gameDuration: matchStatsMatch.info.gameDuration,
                    participantId: playerParticipantId,
                    teamId: playerTeamId
                };
            }
        }

        return { 
            aggregateStats,
            individualGameStats,
            latestGameStats
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

async function processMatchEvents(events, playerParticipantId, teamParticipantIds, stats, gameStats, matchId, matchStats, frames, gameResultMatches) {
    await Promise.all(events.map(async (event) => {
        if (event.type === 'ITEM_PURCHASED') {
            await processItemPurchase(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId);
        }
        switch (event.type) {
            case 'CHAMPION_KILL': processChampionKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId, matchStats, frames, gameResultMatches); break;
            case 'BUILDING_KILL': processBuildingKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId); break;
            case 'ELITE_MONSTER_KILL': processMonsterKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId); break;
            // case 'ITEM_PURCHASED':  itemPurchases; break;
        }
    }));

    // console.log('After processing all events:', {
    //     matchId,
    //     totalEvents: events.length,
    //     playerStats: {
    //         itemCount: stats.playerStats.economy.itemPurchases.items.length,
    //         totalGold: stats.playerStats.economy.itemGold.total
    //     }
    // });
}

async function processChampionKill(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId, matchStats, frames, gameResultMatches) {
    event.matchId = matchId;
    const timestamp = (event.timestamp / 1000);

    const getParticipantType = (participantId) => {
        if (participantId === playerParticipantId) return 'playerStats';
        if (teamParticipantIds.includes(participantId)) return 'teamStats';
        if (!teamParticipantIds.includes(participantId)) return 'enemyStats';
    };

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
        
        if (!Array.isArray(basicStats.kda.history.count)) {
            basicStats.kda.history.count = [];
        }
        if (!Array.isArray(basicStats.kda.history.timestamps)) {
            basicStats.kda.history.timestamps = [];
        }
        if (!Array.isArray(basicStats.kda.history.raw)) {
            basicStats.kda.history.raw = [];
        }
        
        basicStats.kda.history.raw.push(kdaRatio);
        basicStats.kda.history.count.push(kdaRatio);
        basicStats.kda.history.timestamps.push(timestamp);
    };

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

    // Process killer
    if (event.killerId === playerParticipantId) {
        updateParticipantStats(stats.playerStats, 'kills');
        updateParticipantStats(gameStats.playerStats, 'kills');
    } else if (teamParticipantIds.includes(event.killerId)) {
        updateParticipantStats(stats.teamStats, 'kills');
        updateParticipantStats(gameStats.teamStats, 'kills');
    } else {
        updateParticipantStats(stats.enemyStats, 'kills');
        updateParticipantStats(gameStats.enemyStats, 'kills');
    }

    // Process victim
    if (event.victimId === playerParticipantId) {
        updateParticipantStats(stats.playerStats, 'deaths');
        updateParticipantStats(gameStats.playerStats, 'deaths');
    } else if (teamParticipantIds.includes(event.victimId)) {
        updateParticipantStats(stats.teamStats, 'deaths');
        updateParticipantStats(gameStats.teamStats, 'deaths');
    } else {
        updateParticipantStats(stats.enemyStats, 'deaths');
        updateParticipantStats(gameStats.enemyStats, 'deaths');
    }

    // Process assists
    if (event.assistingParticipantIds) {
        event.assistingParticipantIds.forEach(assisterId => {
            if (assisterId === playerParticipantId) {
                updateParticipantStats(stats.playerStats, 'assists');
                updateParticipantStats(gameStats.playerStats, 'assists');
            } else if (teamParticipantIds.includes(assisterId)) {
                updateParticipantStats(stats.teamStats, 'assists');
                updateParticipantStats(gameStats.teamStats, 'assists');
            } else {
                updateParticipantStats(stats.enemyStats, 'assists');
                updateParticipantStats(gameStats.enemyStats, 'assists');
            }
        });
    }

    // Process time spent dead
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
                
                const levelUpEvents = frame.events.filter(e => e.type === 'LEVEL_UP')
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
                    } else {
                        console.warn(`Non-sequential level up detected for participant ${participantId}:`, 
                            `Current level: ${currentLevel}, New level: ${newLevel}, Time: ${timestamp}s`);
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
        if (!matchInfo) {
            console.warn('No match info found in matchStats:', { matchStats });
            return;
        }

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
    
        statsObj.basicStats.deaths.totalDeathTime.push(totalTimeSpentDead);
        statsObj.basicStats.timeSpentDead.deathMinute.push(Number(timestamp));
        statsObj.basicStats.timeSpentDead.deathLevel.push(level);
        statsObj.basicStats.timeSpentDead.expectedDeathTimer.push(deathTimer);
        statsObj.basicStats.timeSpentDead.totalDeathTime.push(Number(Math.round(totalTimeSpentDead)));
    
        statsObj.basicStats.timeSpentDead.history.deathMinute.push(Number(timestamp));
        statsObj.basicStats.timeSpentDead.history.deathLevel.push(level);
        statsObj.basicStats.timeSpentDead.history.expectedDeathTimer.push(deathTimer);
        statsObj.basicStats.timeSpentDead.history.totalDeathTime.push(Number(Math.round(totalTimeSpentDead)));
    };
    const participantType = getParticipantType(event.victimId);
    updateTimeSpentDead(stats[participantType], event.victimId, timestamp, matchStats);
    updateTimeSpentDead(gameStats[participantType], event.victimId, timestamp, matchStats);
}

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
    } else {
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
        } else {
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
        } else {
            stats.enemyStats.objectives.inhibitors.count++;
            stats.enemyStats.objectives.inhibitors.timestamps.push(timestamp);
            gameStats.enemyStats.objectives.inhibitors.count++;
            gameStats.enemyStats.objectives.inhibitors.timestamps.push(timestamp);
        }
    }
}

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
    } else {
        stats.enemyStats.objectives.eliteMonsterKills.count++;
        stats.enemyStats.objectives.eliteMonsterKills.timestamps.push(timestamp);
        gameStats.enemyStats.objectives.eliteMonsterKills.count++;
        gameStats.enemyStats.objectives.eliteMonsterKills.timestamps.push(timestamp);
    }

    if (event.monsterType === 'RIFTHERALD') {
        if (event.killerId === playerParticipantId) {
            stats.playerStats.objectives.riftHeralds.count++;
            stats.playerStats.objectives.riftHeralds.timestamps.push(timestamp);
            gameStats.playerStats.objectives.riftHeralds.count++;
            gameStats.playerStats.objectives.riftHeralds.timestamps.push(timestamp);
        } else if (teamParticipantIds.includes(event.killerId)) {
            stats.teamStats.objectives.riftHeralds.count++;
            stats.teamStats.objectives.riftHeralds.timestamps.push(timestamp);
            gameStats.teamStats.objectives.riftHeralds.count++;
            gameStats.teamStats.objectives.riftHeralds.timestamps.push(timestamp);
        } else {
            stats.enemyStats.objectives.riftHeralds.count++;
            stats.enemyStats.objectives.riftHeralds.timestamps.push(timestamp);
            gameStats.enemyStats.objectives.riftHeralds.count++;
            gameStats.enemyStats.objectives.riftHeralds.timestamps.push(timestamp);
        }

    } else if (event.monsterType === 'HORDE') {
            if (event.killerId === playerParticipantId) {
                stats.playerStats.objectives.hordeKills.count++;
                stats.playerStats.objectives.hordeKills.timestamps.push(timestamp);
                gameStats.playerStats.objectives.hordeKills.count++;
                gameStats.playerStats.objectives.hordeKills.timestamps.push(timestamp);
            } else if (teamParticipantIds.includes(event.killerId)) {
                stats.teamStats.objectives.hordeKills.count++;
                stats.teamStats.objectives.hordeKills.timestamps.push(timestamp);
                gameStats.teamStats.objectives.hordeKills.count++;
                gameStats.teamStats.objectives.hordeKills.timestamps.push(timestamp);
            } else {
                stats.enemyStats.objectives.hordeKills.count++;
                stats.enemyStats.objectives.hordeKills.timestamps.push(timestamp);
                gameStats.enemyStats.objectives.hordeKills.count++;
                gameStats.enemyStats.objectives.hordeKills.timestamps.push(timestamp);
            }

    } else if (event.monsterType === 'DRAGON') {
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
        } else {
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
        } else {
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
        } else {
            stats.enemyStats.objectives.elders.count++;
            stats.enemyStats.objectives.elders.timestamps.push(timestamp);
            gameStats.enemyStats.objectives.elders.count++;
            gameStats.enemyStats.objectives.elders.timestamps.push(timestamp);
        }
    } else if (event.monsterType === 'ATAKHAN') {
        if (event.killerId === playerParticipantId) {
            stats.playerStats.objectives.atakhans.count++;
            stats.playerStats.objectives.atakhans.timestamps.push(timestamp);
            gameStats.playerStats.objectives.atakhans.count++;
            gameStats.playerStats.objectives.atakhans.timestamps.push(timestamp);
        } else if (teamParticipantIds.includes(event.killerId)) {
            stats.teamStats.objectives.atakhans.count++;
            stats.teamStats.objectives.atakhans.timestamps.push(timestamp);
            gameStats.teamStats.objectives.atakhans.count++;
            gameStats.teamStats.objectives.atakhans.timestamps.push(timestamp);
        } else {
            stats.enemyStats.objectives.atakhans.count++;
            stats.enemyStats.objectives.atakhans.timestamps.push(timestamp);
            gameStats.enemyStats.objectives.atakhans.count++;
            gameStats.enemyStats.objectives.atakhans.timestamps.push(timestamp);
        }
    }
}

async function processItemPurchase(event, playerParticipantId, teamParticipantIds, stats, gameStats, matchId) {
    if (event.type !== 'ITEM_PURCHASED') return stats;

    const timestamp = event.timestamp / 1000;
    
    // Skip if item was destroyed
    const key = `${event.participantId}-${event.itemId}`;
    if (destroyedItems.has(key)) {
        destroyedItems.delete(key);
        return stats;
    }

    // Get the actual item price from the cache
    let goldValue = 0;
    try {
        const itemDetails = await getItemDetails(event.itemId.toString());
        // console.log('Processing item purchase:', {
        //     itemId: event.itemId,
        //     goldInfo: itemDetails?.gold,
        //     totalGold: itemDetails?.gold?.total
        // });
        
        if (itemDetails?.gold?.total) {
            goldValue = itemDetails.gold.base;
        } else {
            // console.warn(`Missing gold info for item ${event.itemId}:`, itemDetails);
        }
    } catch (error) {
        console.warn(`Could not get price for item ${event.itemId}, using 0`);
    }

    if (event.participantId === playerParticipantId) {

        // console.log('Before updating stats:', {
        //     itemId: event.itemId,
        //     goldValue,
        //     timestamp,
        //     currentItems: stats.playerStats.economy.itemPurchases.items.length
        // });
        // Player stats
        stats.playerStats.economy.itemPurchases.count++;
        stats.playerStats.economy.itemPurchases.timestamps.push(timestamp);
        stats.playerStats.economy.itemPurchases.items.push({
            itemId: event.itemId,
            timestamp,
            gold: goldValue,
            totalGold: stats.playerStats.economy.itemGold.total + goldValue
        });
        stats.playerStats.economy.itemGold.total += goldValue;
        stats.playerStats.economy.itemGold.history.count.push(goldValue);
        stats.playerStats.economy.itemGold.history.timestamps.push(timestamp);

        // console.log('After updating stats:', {
        //     newTotal: stats.playerStats.economy.itemGold.total,
        //     itemsCount: stats.playerStats.economy.itemPurchases.items.length,
        //     latestItem: stats.playerStats.economy.itemPurchases.items[
        //         stats.playerStats.economy.itemPurchases.items.length - 1
        //     ]
        // });

        // Game stats
        gameStats.playerStats.economy.itemPurchases.count++;
        gameStats.playerStats.economy.itemPurchases.timestamps.push(timestamp);
        gameStats.playerStats.economy.itemPurchases.items.push({
            itemId: event.itemId,
            timestamp,
            gold: goldValue,
            totalGold: gameStats.playerStats.economy.itemGold.total + goldValue
        });
        gameStats.playerStats.economy.itemGold.total += goldValue;
        gameStats.playerStats.economy.itemGold.history.count.push(goldValue);
        gameStats.playerStats.economy.itemGold.history.timestamps.push(timestamp);

    } else if (teamParticipantIds.includes(event.participantId)) {
        // Team stats
        stats.teamStats.economy.itemPurchases.count++;
        stats.teamStats.economy.itemPurchases.timestamps.push(timestamp);
        stats.teamStats.economy.itemPurchases.items.push({
            itemId: event.itemId,
            timestamp,
            gold: goldValue,
            totalGold: stats.teamStats.economy.itemGold.total + goldValue
        });
        stats.teamStats.economy.itemGold.total += goldValue;
        stats.teamStats.economy.itemGold.history.count.push(goldValue);
        stats.teamStats.economy.itemGold.history.timestamps.push(timestamp);

        // Game team stats
        gameStats.teamStats.economy.itemPurchases.count++;
        gameStats.teamStats.economy.itemPurchases.timestamps.push(timestamp);
        gameStats.teamStats.economy.itemPurchases.items.push({
            itemId: event.itemId,
            timestamp,
            gold: goldValue,
            totalGold: gameStats.teamStats.economy.itemGold.total + goldValue
        });
        gameStats.teamStats.economy.itemGold.total += goldValue;
        gameStats.teamStats.economy.itemGold.history.count.push(goldValue);
        gameStats.teamStats.economy.itemGold.history.timestamps.push(timestamp);

    } else {
        // Enemy stats
        stats.enemyStats.economy.itemPurchases.count++;
        stats.enemyStats.economy.itemPurchases.timestamps.push(timestamp);
        stats.enemyStats.economy.itemPurchases.items.push({
            itemId: event.itemId,
            timestamp,
            gold: goldValue,
            totalGold: stats.enemyStats.economy.itemGold.total + goldValue
        });
        stats.enemyStats.economy.itemGold.total += goldValue;
        stats.enemyStats.economy.itemGold.history.count.push(goldValue);
        stats.enemyStats.economy.itemGold.history.timestamps.push(timestamp);

        // Game enemy stats
        gameStats.enemyStats.economy.itemPurchases.count++;
        gameStats.enemyStats.economy.itemPurchases.timestamps.push(timestamp);
        gameStats.enemyStats.economy.itemPurchases.items.push({
            itemId: event.itemId,
            timestamp,
            gold: goldValue,
            totalGold: gameStats.enemyStats.economy.itemGold.total + goldValue
        });
        gameStats.enemyStats.economy.itemGold.total += goldValue;
        gameStats.enemyStats.economy.itemGold.history.count.push(goldValue);
        gameStats.enemyStats.economy.itemGold.history.timestamps.push(timestamp);
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
    return 0.50;
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