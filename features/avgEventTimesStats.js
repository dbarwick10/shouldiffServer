export function calculateAverageEventTimes(individualGameStats) {
    const aggregatedTimestamps = {
        playerStats: initializeStats(),
        teamStats: initializeStats(),
        enemyStats: initializeStats()
    };

    // Get the latest game (first game in the array)
    const latestGame = individualGameStats[0];

    // Process all games except the latest for averages
    individualGameStats.forEach((match, index) => {
        // Skip if this is the latest game
        if (index === 0) return;
        
        const { outcome } = match.playerStats;
        const category = getOutcomeCategory(outcome.result);

        if (category) {
            aggregatePlayerStats(aggregatedTimestamps.playerStats[category], match.playerStats);
            aggregatePlayerStats(aggregatedTimestamps.teamStats[category], match.teamStats);
            aggregatePlayerStats(aggregatedTimestamps.enemyStats[category], match.enemyStats);
        }
    });

    // Calculate averages for each category
    const averageEventTimes = {
        playerStats: calculateAverageForCategories(aggregatedTimestamps.playerStats),
        teamStats: calculateAverageForCategories(aggregatedTimestamps.teamStats),
        enemyStats: calculateAverageForCategories(aggregatedTimestamps.enemyStats)
    };

    // Add latest game data if available
    if (latestGame) {
        averageEventTimes.latestGame = {
            playerStats: latestGame.playerStats,
            teamStats: latestGame.teamStats,
            enemyStats: latestGame.enemyStats,
            metadata: {
                gameMode: latestGame.metadata?.gameMode,
                gameDuration: latestGame.metadata?.gameDuration,
                timestamp: latestGame.metadata?.timestamp
            }
        };
    }

    return averageEventTimes;
}

function initializeStats() {
    return {
        wins: initializeAggregatedStats(),
        losses: initializeAggregatedStats(),
        surrenderWins: initializeAggregatedStats(),
        surrenderLosses: initializeAggregatedStats()
    };
}

function initializeAggregatedStats() {
    return {
        kills: [],
        deaths: [],
        assists: [],
        kda: [],
        turrets: [],
        outerTowerKills: [],
        innerTowerKills: [],
        baseTowerKills: [],
        nexusTowerKills: [],
        inhibitors: [],
        eliteMonsterKills: [],
        barons: [],
        riftHeralds: [],
        hordeKills: [],
        dragons: [],
        elders: [],
        itemPurchases: [],
        timeSpentDead: []
    };
}

function getOutcomeCategory(result) {
    switch (result) {
        case 'win':
            return 'wins';
        case 'loss':
            return 'losses';
        case 'surrenderWin':
            return 'surrenderWins';
        case 'surrenderLoss':
            return 'surrenderLosses';
        default:
            return null;
    }
}

function aggregatePlayerStats(aggregatedStats, stats) {
    
    if (!stats) {
        console.warn('Received null or undefined stats');
        return;
    }

    // console.log('Processing stats with economy data:', {
    //     hasEconomy: !!stats.economy,
    //     total: stats.economy?.itemGold?.history?.count,
    //     timestamps: stats.economy?.itemGold?.history?.timestamps
    // });

    // console.log('Processing stats with kda data:', {
    //     count: stats.basicStat?.kda?.history?.count,
    //     timestamps: stats.basicStats?.kda?.history?.timestamps
    // });

    aggregateTimestamps(aggregatedStats.kills, stats.basicStats?.kills?.timestamps || []);
    aggregateTimestamps(aggregatedStats.deaths, stats.basicStats?.deaths?.timestamps || []);
    aggregateTimestamps(aggregatedStats.timeSpentDead, stats.basicStats?.deaths?.totalDeathTime);
    aggregateTimestamps(aggregatedStats.assists, stats.basicStats?.assists?.timestamps || []);
    aggregateTimestamps(aggregatedStats.kda, stats.basicStats?.kda?.timestamps || []);
    aggregateTimestamps(aggregatedStats.turrets, stats.objectives?.turrets?.timestamps || []);
    aggregateTimestamps(aggregatedStats.outerTowerKills, stats.objectives?.towerKills?.outer?.timestamps || []);
    aggregateTimestamps(aggregatedStats.innerTowerKills, stats.objectives?.towerKills?.inner?.timestamps || []);
    aggregateTimestamps(aggregatedStats.baseTowerKills, stats.objectives?.towerKills?.base?.timestamps || []);
    aggregateTimestamps(aggregatedStats.nexusTowerKills, stats.objectives?.towerKills?.nexus?.timestamps || []);
    aggregateTimestamps(aggregatedStats.inhibitors, stats.objectives?.inhibitors?.timestamps || []);
    aggregateTimestamps(aggregatedStats.eliteMonsterKills, stats.objectives?.eliteMonsterKills?.timestamps || []);
    aggregateTimestamps(aggregatedStats.barons, stats.objectives?.barons?.timestamps || []);
    aggregateTimestamps(aggregatedStats.hordeKills, stats.objectives?.hordeKills?.timestamps || []);
    aggregateTimestamps(aggregatedStats.riftHeralds, stats.objectives?.riftHeralds?.timestamps || []);
    aggregateTimestamps(aggregatedStats.dragons, stats.objectives?.dragons?.timestamps || []);
    aggregateTimestamps(aggregatedStats.elders, stats.objectives?.elders?.timestamps || []);

    aggregateGoldTimestamps(aggregatedStats.itemPurchases, stats.economy?.itemGold?.history?.count, stats.economy?.itemGold?.history?.timestamps);

    if (stats.basicStats?.kda?.history?.count && stats.basicStats.kda.history.timestamps) {
        aggregateKDATimestamps(aggregatedStats.kda, stats.basicStats.kda.history.count, stats.basicStats.kda.history.timestamps);
    }
}

function aggregateTimestamps(aggregatedArray, timestamps) {
    if (!Array.isArray(timestamps)) return;

    timestamps.forEach((timestamp, index) => {
        if (timestamp === undefined || timestamp === null) return;
        if (!aggregatedArray[index]) {
            aggregatedArray[index] = [];
        }
        aggregatedArray[index].push(timestamp);
    });
}

function aggregateDeathTimes(aggregatedArray, timestamps) {
    
    const actualTimestamps = Object.values(timestamps);
    
    if (actualTimestamps.length === 0 && timestamps && typeof timestamps === 'object') {
        const keys = Object.keys(timestamps).filter(k => !isNaN(parseInt(k)));
        const manualArray = keys.map(k => timestamps[k]);
        
        if (manualArray.length > 0) {
            manualArray.forEach((timestamp, index) => {
                if (timestamp === undefined || timestamp === null) return;
                if (!aggregatedArray[index]) {
                    aggregatedArray[index] = [];
                }
                aggregatedArray[index].push(timestamp);
            });
        }
    }

}

function aggregateKDATimestamps(aggregatedArray, kdaValues, timestamps) {
    if (!Array.isArray(kdaValues) || !Array.isArray(timestamps)) return;

    timestamps.forEach((timestamp, index) => {
        if (
            timestamp === undefined || 
            timestamp === null || 
            kdaValues[index] === undefined || 
            kdaValues[index] === null ||
            isNaN(timestamp) ||
            isNaN(kdaValues[index])
        ) return;

        if (!aggregatedArray[index]) {
            aggregatedArray[index] = [];
        }
        
        aggregatedArray[index].push({
            timestamp: timestamp,
            kdaValue: kdaValues[index]
        });
    });
}

function calculateAverageForCategories(categories) {
    return {
        wins: calculateAverageTimesForStats(categories.wins),
        losses: calculateAverageTimesForStats(categories.losses),
        surrenderWins: calculateAverageTimesForStats(categories.surrenderWins),
        surrenderLosses: calculateAverageTimesForStats(categories.surrenderLosses)
    };
}

function calculateAverageTimesForStats(aggregatedStats) {
    return {
        kills: calculateAverageTimes(aggregatedStats.kills),
        deaths: calculateAverageTimes(aggregatedStats.deaths),
        assists: calculateAverageTimes(aggregatedStats.assists),
        kda: calculateAverageKDATimes(aggregatedStats.kda),
        turrets: calculateAverageTimes(aggregatedStats.turrets),
        outerTowerKills: calculateAverageTimes(aggregatedStats.outerTowerKills),
        innerTowerKills: calculateAverageTimes(aggregatedStats.innerTowerKills),
        baseTowerKills: calculateAverageTimes(aggregatedStats.baseTowerKills),
        nexusTowerKills: calculateAverageTimes(aggregatedStats.nexusTowerKills),
        inhibitors: calculateAverageTimes(aggregatedStats.inhibitors),
        eliteMonsterKills: calculateAverageTimes(aggregatedStats.eliteMonsterKills),
        barons: calculateAverageTimes(aggregatedStats.barons),
        riftHeralds: calculateAverageTimes(aggregatedStats.riftHeralds),
        hordeKills: calculateAverageTimes(aggregatedStats.hordeKills),
        dragons: calculateAverageTimes(aggregatedStats.dragons),
        elders: calculateAverageTimes(aggregatedStats.elders),
        timeSpentDead: calculateAverageTimes(aggregatedStats.timeSpentDead),
        itemPurchases: calculateAverageGoldTimes(aggregatedStats.itemPurchases)
    };
}

function calculateAverageTimes(aggregatedArray) {
    return aggregatedArray.map(timestamps => {
        if (!timestamps || timestamps.length === 0) return null;
        const sum = timestamps.reduce((acc, timestamp) => acc + timestamp, 0);
        return sum / timestamps.length;
    });
}

function calculateAverageKDATimes(aggregatedArray) {
    return aggregatedArray.map(subArray => {
        const totalEntries = subArray.length;
        const totalTimestamp = subArray.reduce((sum, {timestamp}) => sum + timestamp, 0);
        const totalKDAValue = subArray.reduce((sum, {kdaValue}) => sum + kdaValue, 0);
        
        return {
            timestamp: totalTimestamp / totalEntries,
            kdaValue: totalKDAValue / totalEntries
        };
    });
}

function aggregateGoldTimestamps(aggregatedArray, goldValues, timestamps) {
    if (!Array.isArray(goldValues) || !Array.isArray(timestamps)) {
        // console.log('Invalid gold data:', { goldValues, timestamps });
        return;
    }

    let runningTotal = 0;
    // console.log('Processing gold data:', {
    //     goldValuesLength: goldValues.length,
    //     timestampsLength: timestamps.length
    // });

    timestamps.forEach((timestamp, index) => {
        if (timestamp === undefined || 
            timestamp === null || 
            goldValues[index] === undefined || 
            goldValues[index] === null) {
            // console.log('Skipping invalid data point at index:', index);
            return;
        }

        runningTotal += goldValues[index];
        
        if (!aggregatedArray[index]) {
            aggregatedArray[index] = [];
        }
        
        aggregatedArray[index].push({
            timestamp: timestamp,
            goldValue: runningTotal
        });
    });

    // console.log('Processed gold data:', {
    //     samplePoint: aggregatedArray[0]?.[0],
    //     totalPoints: aggregatedArray.reduce((sum, arr) => sum + (arr?.length || 0), 0)
    // });
}

function calculateAverageGoldTimes(aggregatedArray) {
    return aggregatedArray.map(subArray => {
        const totalEntries = subArray.length;
        const totalTimestamp = subArray.reduce((sum, {timestamp}) => sum + timestamp, 0);
        const totalGoldValue = subArray.reduce((sum, {goldValue}) => sum + goldValue, 0);
        
        return {
            timestamp: totalTimestamp / totalEntries,
            goldValue: totalGoldValue / totalEntries
        };
    });
}