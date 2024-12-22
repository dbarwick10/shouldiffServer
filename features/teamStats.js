export function calculateTeamStats(matchStats, puuid) {
    const teamStats = {
        wins: [],
        losses: [],
        surrenderWins: [],
        surrenderLosses: [],
    };

    matchStats.forEach(match => {
        const player = match.info.participants.find(p => p.puuid === puuid);
        if (!player) return;

        const playerTeam = match.info.participants.filter(p => p.teamId === player.teamId);
        const gameDuration = (match.info.gameEndTimestamp - match.info.gameStartTimestamp) / 1000

        const teamGameData = {
            kills: playerTeam.reduce((sum, teammate) => sum + teammate.kills, 0) / playerTeam.length,
            deaths: playerTeam.reduce((sum, teammate) => sum + teammate.deaths, 0) / playerTeam.length,
            assists: playerTeam.reduce((sum, teammate) => sum + teammate.assists, 0) / playerTeam.length,
            kda: playerTeam.reduce((sum, teammate) => sum + (teammate.kills + teammate.assists) / (teammate.deaths || 1), 0) / playerTeam.length,
            level: playerTeam.reduce((sum, teammate) => sum + teammate.champLevel, 0) / playerTeam.length,
            itemGold: playerTeam.reduce((sum, teammate) => sum + teammate.goldSpent, 0) / playerTeam.length,
            timeSpentDead: playerTeam.reduce((sum, teammate) => sum + (teammate.totalTimeSpentDead || 0), 0) / playerTeam.length,
            turretsKilled: playerTeam.reduce((sum, teammate) => sum + (teammate.turretKills || 0), 0),
            inhibitorsKilled: playerTeam.reduce((sum, teammate) => sum + (teammate.inhibitorKills || 0), 0),
            gameDuration: gameDuration // Include game duration in seconds
        };

        const team = match.info.teams.find(t => t.teamId === player.teamId);
        if (team) {
            if (team.win) {
                teamStats.wins.push(teamGameData);
            } else {
                teamStats.losses.push(teamGameData);
            }

            if (player.gameEndedInSurrender) {
                if (team.win) {
                    teamStats.surrenderWins.push(teamGameData);
                } else {  
                    teamStats.surrenderLosses.push(teamGameData);
                }
            }
        }
    });

    return teamStats;
}
//test github
