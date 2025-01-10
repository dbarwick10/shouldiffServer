export function calculatePlayerStats(matchStats, puuid) {
    const playerStats = {
        wins: [],
        losses: [],
        surrenderWins: [],
        surrenderLosses: [],
        winTime: [],
        lossTime: [],
        surrenderWinTime: [],
        surrenderLossTime: []
    };

    const calculateGameDataAverages = (games) => {
        if (!games || !games.length) {
            return {
                kda: 0,
                level: 0,
                itemGold: 0,
                timeSpentDead: 0,
                turretsKilled: 0,
                inhibitorsKilled: 0
            };
        }

        return {
            kda: games.reduce((sum, game) => sum + game.kda, 0) / games.length,
            level: games.reduce((sum, game) => sum + game.level, 0) / games.length,
            itemGold: games.reduce((sum, game) => sum + game.itemGold, 0) / games.length,
            timeSpentDead: games.reduce((sum, game) => sum + game.timeSpentDead, 0) / games.length,
            turretsKilled: games.reduce((sum, game) => sum + game.turretsKilled, 0) / games.length,
            inhibitorsKilled: games.reduce((sum, game) => sum + game.inhibitorsKilled, 0) / games.length
        };
    };

    matchStats.forEach(match => {
        const player = match.info.participants.find(p => p.puuid === puuid);
        if (!player) return;

        const kda = (player.kills + player.assists) / (player.deaths || 1);
        const gameDuration = (match.info.gameEndTimestamp - match.info.gameStartTimestamp) / 1000;

        const gameData = {
            kills: player.kills,
            deaths: player.deaths,
            assists: player.assists,
            kda: kda,
            level: player.champLevel,
            itemGold: player.goldSpent,
            timeSpentDead: player.totalTimeSpentDead || 0,
            turretsKilled: player.turretKills || 0,
            inhibitorsKilled: player.inhibitorKills || 0,
            gameDuration: gameDuration
        };

        if (player.win) {
            playerStats.wins.push(gameData);
            playerStats.winTime.push(gameDuration);
        } else {
            playerStats.losses.push(gameData);
            playerStats.lossTime.push(gameDuration);
        }

        if (player.gameEndedInSurrender) {
            if (player.win) {
                playerStats.surrenderWins.push(gameData);
                playerStats.surrenderWinTime.push(gameDuration);
            } else {
                playerStats.surrenderLosses.push(gameData);
                playerStats.surrenderLossTime.push(gameDuration);
            }
        }
    });

    const formatTime = (seconds) => {
        if (!seconds && seconds !== 0) return "0m 0s";
        return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
    };

    const calculateAverage = (times) => {
        if (!times.length) return 0;
        const sum = times.reduce((a, b) => a + b, 0);
        return sum / times.length;
    };

    playerStats.winStats = calculateGameDataAverages(playerStats.wins);
    playerStats.lossStats = calculateGameDataAverages(playerStats.losses);
    playerStats.surrenderWinStats = calculateGameDataAverages(playerStats.surrenderWins);
    playerStats.surrenderLossStats = calculateGameDataAverages(playerStats.surrenderLosses);

    playerStats.averageWinTime = calculateAverage(playerStats.winTime);
    playerStats.averageLossTime = calculateAverage(playerStats.lossTime);
    playerStats.averageSurrenderWinTime = calculateAverage(playerStats.surrenderWinTime);
    playerStats.averageSurrenderLossTime = calculateAverage(playerStats.surrenderLossTime);

    playerStats.winTime = formatTime(playerStats.averageWinTime);
    playerStats.lossTime = formatTime(playerStats.averageLossTime);
    playerStats.surrenderWinTime = formatTime(playerStats.averageSurrenderWinTime);
    playerStats.surrenderLossTime = formatTime(playerStats.averageSurrenderLossTime);

    return playerStats;
}

export async function getPlayerTeamId(matchData, puuid) {
    try {
        if (!Array.isArray(matchData)) {
            console.error('matchData is not an array:', typeof matchData);
            return null;
        }

        for (const match of matchData) {
            if (!match?.info?.participants) {
                console.error('Match is missing info or participants:', match);
                continue;
            }

            const playerParticipant = match.info.participants.find(p => p.puuid === puuid);
            if (playerParticipant) {
                return { 
                    teamId: playerParticipant.teamId, 
                    matchId: match.metadata?.matchId 
                };
            } else {
                console.warn(`Player with puuid ${puuid} not found in match ${match.metadata?.matchId}`);
            }
        }
        return null;
    } catch (error) {
        console.error(`Error in getPlayerTeamId:`, error);
        return null;
    }
}

export async function getPlayerTeamMatesAndEnemies(matchData, puuid) {
    try {
        if (!Array.isArray(matchData)) {
            console.error('matchData is not an array:', typeof matchData);
            return { teamMates: [], teammatesByMatch: {}, enemies: [] };
        }

        const player = [];
        const teamMates = [];
        const teammatesByMatch = {};
        const enemies = [];

        for (const match of matchData) {
            if (!match?.info?.participants) {
                console.error('Match is missing info or participants:', match);
                continue;
            }

            const matchId = match.metadata?.matchId;
            if (!matchId) {
                console.error('Match is missing matchId');
                continue;
            }

            const playerTeamInfo = await getPlayerTeamId([match], puuid);
            if (!playerTeamInfo) {
                console.warn(`Could not find player team info for match ${matchId}`);
                continue;
            }

            const gameMode = match.info?.gameMode;
            teammatesByMatch[matchId] = [];

            for (const participant of match.info.participants) {
                if (participant.puuid === puuid) {
                    player.push({
                        ...participant,
                        matchId
                    });
                }
                if (participant.teamId === playerTeamInfo.teamId) {
                    teamMates.push({
                        ...participant,
                        matchId
                    });
                    teammatesByMatch[matchId].push(participant.participantId);
                } else {
                    enemies.push({
                        ...participant,
                        matchId
                    });
                }
            }
        }

        return {
            teamMates,
            teammatesByMatch,
            enemies
        };
    } catch (error) {
        console.error('Error in getPlayerTeamMatesAndEnemies:', error);
        return {
            teamMates: [],
            teammatesByMatch: {},
            enemies: []
        };
    }
}

export async function getPlayerId(matchData, puuid) {
    try {
        if (!Array.isArray(matchData)) {
            console.error('matchData is not an array:', typeof matchData);
            return null;
        }

        for (const match of matchData) {
            if (!match?.info?.participants) {
                console.error('Match is missing info or participants:', match);
                continue;
            }

            const matchId = match.metadata?.matchId;
            if (!matchId) {
                console.error('Match is missing matchId');
                continue;
            }

            const playerParticipant = match.info.participants.find(p => p.puuid === puuid);
            if (playerParticipant) {
                return {
                    participantId: playerParticipant.participantId,
                    matchId
                };
            } else {
                console.warn(`Player with puuid ${puuid} not found in match ${matchId}`);
            }
        }
        
        console.warn('Could not find player ID in any match');
        return null;
    } catch (error) {
        console.error('Error in getPlayerId:', error);
        return null;
    }
}