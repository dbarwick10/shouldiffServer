export async function gameResult(matchStats, puuid) {
    const playerResults = {
        matchID: null,
        gameEndedInSurrender: null,
        results: {
            wins: [],
            losses: [],
            surrenderWins: [],
            surrenderLosses: []
        }
    };

    matchStats.forEach(match => {
        if (!match?.info?.participants) {
            console.error('Match is missing participants:', match);
            return;
        }

        const player = match.info.participants.find(p => p.puuid === puuid);
        if (!player) return;

        const gameData = {
            matchId: match.metadata.matchId,
            gameDuration: match.info.gameDuration,
            gameMode: match.info.gameMode,
            gameType: match.info.gameType,
            gameCreation: match.info.gameCreation
        };

        playerResults.matchID = match.metadata.matchId;

        // console.log('Player results:', player.win);

        if (player.win) {
            playerResults.results.wins.push(gameData);
        } else {
            playerResults.results.losses.push(gameData);
        }

        if (player.gameEndedInSurrender) {
            if (player.win) {
                playerResults.gameEndedInSurrender = true;
                playerResults.results.surrenderWins.push(gameData);
            } else {
                playerResults.gameEndedInSurrender = false;
                playerResults.results.surrenderLosses.push(gameData);
            }
        }
    });

    return playerResults;
}