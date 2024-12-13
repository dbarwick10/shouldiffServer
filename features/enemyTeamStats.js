export function calculateEnemyTeamStats(matchStats, puuid) {
    const enemyTeamStats = {
        wins: [],
        losses: [],
        surrenderWins: [],
        surrenderLosses: [],
    };

    matchStats.forEach(match => {
        const player = match.info.participants.find(p => p.puuid === puuid);
        if (!player) return;

        const enemyTeam = match.info.participants.filter(p => p.teamId !== player.teamId);
        const gameDuration = (match.info.gameEndTimestamp - match.info.gameStartTimestamp) / 1000

        const enemyTeamGameData = {
            kills: enemyTeam.reduce((sum, enemy) => sum + enemy.kills, 0) / enemyTeam.length,
            deaths: enemyTeam.reduce((sum, enemy) => sum + enemy.deaths, 0) / enemyTeam.length,
            assists: enemyTeam.reduce((sum, enemy) => sum + enemy.assists, 0) / enemyTeam.length,
            kda: enemyTeam.reduce((sum, enemy) => sum + (enemy.kills + enemy.assists) / (enemy.deaths || 1), 0) / enemyTeam.length,
            level: enemyTeam.reduce((sum, enemy) => sum + enemy.champLevel, 0) / enemyTeam.length,
            itemGold: enemyTeam.reduce((sum, enemy) => sum + enemy.goldSpent, 0) / enemyTeam.length,
            timeSpentDead: enemyTeam.reduce((sum, enemy) => sum + (enemy.totalTimeSpentDead || 0), 0) / enemyTeam.length,
            turretsKilled: enemyTeam.reduce((sum, enemy) => sum + (enemy.turretKills || 0), 0),
            inhibitorsKilled: enemyTeam.reduce((sum, enemy) => sum + (enemy.inhibitorKills || 0), 0),
            gameDuration: gameDuration // Add game duration in seconds
        };

        const enemyTeamResult = match.info.teams.find(t => t.teamId !== player.teamId);
        if (enemyTeamResult) {
            if (enemyTeamResult.win) {
                enemyTeamStats.wins.push(enemyTeamGameData);
            } else {
                enemyTeamStats.losses.push(enemyTeamGameData);
            }
            if (player.gameEndedInSurrender) {
                if (enemyTeamResult.win) {
                    enemyTeamStats.surrenderWins.push(enemyTeamGameData);
                } else {
                    enemyTeamStats.surrenderLosses.push(enemyTeamGameData);
                }
            }
        }
});

    return enemyTeamStats;
}