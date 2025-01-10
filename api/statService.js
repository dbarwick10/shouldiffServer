import {
    getPuuid,
    getMatchStats,
    getMatchEvents
} from './riotAPI.js';

import {
    calculatePlayerStats,
    calculateTeamStats,
    calculateEnemyTeamStats,
    analyzeMatchTimeline,
    calculateAverageEventTimes,
    calculateLiveStats
} from '../features/index.js';

export async function getPlayerStats(summonerName, tagLine, region, gameMode) {
    try {
        const puuid = await getPuuid(summonerName, tagLine, region);
        
        const [matchStats, matchEvents] = await Promise.all([
            getMatchStats(puuid, region, gameMode),
            getMatchEvents(puuid, region)
        ]);

        const [
            playerStats,
            teamStats,
            enemyTeamStats,
            timelineAnalysis,
            liveStats
        ] = await Promise.all([
            calculatePlayerStats(matchStats, puuid),
            calculateTeamStats(matchStats, puuid),
            calculateEnemyTeamStats(matchStats, puuid),
            analyzeMatchTimeline(matchEvents, puuid),
            calculateLiveStats()
        ]);

        const averageEventTimes = await calculateAverageEventTimes(timelineAnalysis);

        return {
            playerStats,
            teamStats,
            enemyTeamStats,
            averageEventTimes,
            liveStats
        };
    } catch (error) {
        console.error('Error in getPlayerStats:', error);
        throw error;
    }
}