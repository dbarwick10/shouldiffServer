export function calculateAverageEventTimes(individualGameStats) {
    // console.log('Starting calculateAverageEventTimes with data:', individualGameStats);
    
    const aggregatedTimestamps = {
        playerStats: initializeStats(),
        teamStats: initializeStats(),
        enemyStats: initializeStats()
    };

    individualGameStats.forEach((match, index) => {
        // Aggregate stats based on match outcome
        const { outcome } = match.playerStats;
        const category = getOutcomeCategory(outcome.result);

        if (category) {
            aggregatePlayerStats(aggregatedTimestamps.playerStats[category], match.playerStats);
            aggregatePlayerStats(aggregatedTimestamps.teamStats[category], match.teamStats);
            aggregatePlayerStats(aggregatedTimestamps.enemyStats[category], match.enemyStats);
        }
    });

    // console.log('After processing all matches, aggregatedTimestamps:', aggregatedTimestamps);

    // Calculate averages for each category
    const averageEventTimes = {
        playerStats: calculateAverageForCategories(aggregatedTimestamps.playerStats),
        teamStats: calculateAverageForCategories(aggregatedTimestamps.teamStats),
        enemyStats: calculateAverageForCategories(aggregatedTimestamps.enemyStats)
    };

    // console.log('Final averageEventTimes:', averageEventTimes);
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
        dragons: [],
        elders: [],
        itemGold: [],
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

    // console.log('Comparing death data formats:', {
    //     deathTimestamps: {
    //         data: stats.basicStats?.deaths?.timestamps,
    //         type: typeof stats.basicStats?.deaths?.timestamps?.[0],
    //         sample: stats.basicStats?.deaths?.timestamps?.[0]
    //     },
    //     totalDeathTime: {
    //         data: stats.basicStats?.timeSpentDead?.totalDeathTime,
    //         type: typeof stats.basicStats?.timeSpentDead?.totalDeathTime?.[0],
    //         sample: stats.basicStats?.timeSpentDead?.totalDeathTime?.[0]
    //     }
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
    aggregateTimestamps(aggregatedStats.dragons, stats.objectives?.dragons?.timestamps || []);
    aggregateTimestamps(aggregatedStats.elders, stats.objectives?.elders?.timestamps || []);

    aggregateGoldTimestamps(aggregatedStats.itemGold, stats.economy?.itemPurchases?.items);

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
    // console.log('Original timestamps:', timestamps);
    
    // Convert to array using Object.values
    const actualTimestamps = Object.values(timestamps);
    
    // Try alternate methods if first one fails
    if (actualTimestamps.length === 0 && timestamps && typeof timestamps === 'object') {
        const keys = Object.keys(timestamps).filter(k => !isNaN(parseInt(k)));
        const manualArray = keys.map(k => timestamps[k]);
        

        // Use the manual array if it has values
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
        // Ensure both timestamp and kdaValue are valid
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

function aggregateGoldTimestamps(aggregatedArray, items) {
    // Ensure items is an array before processing
    if (!Array.isArray(items)) {
        console.error('Invalid items data:', items);
        return;
    }

    items.forEach((item, index) => {
        const gold = item?.gold;
        const timestamp = item?.timestamp;

        // Validate both gold and timestamp
        if (
            gold === undefined ||
            timestamp === undefined ||
            isNaN(gold) ||
            isNaN(timestamp)
        ) {
            // console.log('Skipping invalid item at index:', index, 'gold:', gold, 'timestamp:', timestamp);
            return;
        }

        // Initialize sub-array if necessary
        if (!aggregatedArray[index]) {
            aggregatedArray[index] = [];
        }

        // Push the object into the aggregated array
        aggregatedArray[index].push({
            gold: gold,
            timestamp: timestamp
        });

        // console.log('Pushed item into aggregatedArray at index:', index, {
        //     gold,
        //     timestamp
        // });
    });
}


// Aggregate item gold data
function aggregateItemGold(aggregatedArray, amounts, timestamps) {
    // console.log('Aggregating Item Gold - Debug Info:');
    // console.log('Input Arguments:');
    // console.log('aggregatedArray:', aggregatedArray);
    // console.log('amounts:', amounts);
    // console.log('timestamps:', timestamps);

    // Detailed type and content checking
    // console.log('Type Checks:');
    // console.log('amounts is Array:', Array.isArray(amounts));
    // console.log('timestamps is Array:', Array.isArray(timestamps));
    
    if (!Array.isArray(amounts) || !Array.isArray(timestamps)) {
        console.warn('Invalid input: amounts or timestamps is not an array');
        // console.log('amounts type:', typeof amounts);
        // console.log('timestamps type:', typeof timestamps);
        return aggregatedArray || [];
    }

    // console.log('amounts length:', amounts.length);
    // console.log('timestamps length:', timestamps.length);

    // If arrays are empty, return existing aggregated array
    if (amounts.length === 0 || timestamps.length === 0) {
        console.warn('Amounts or timestamps array is empty');
        return aggregatedArray || [];
    }

    // Ensure aggregatedArray is an array
    aggregatedArray = Array.isArray(aggregatedArray) ? aggregatedArray : [];

    // Ensure array has enough slots
    while (aggregatedArray.length < timestamps.length) {
        aggregatedArray.push([]);
    }

    // console.log('After slot preparation, aggregatedArray:', aggregatedArray);

    // Process each timestamp and amount
    for (let index = 0; index < timestamps.length; index++) {
        const timestamp = Number(timestamps[index]);
        const amount = Number(amounts[index]);

        console.log(`Processing index ${index}:`, {
            timestamp,
            amount,
            timestampType: typeof timestamps[index],
            amountType: typeof amounts[index]
        });

        // Validate timestamp and amount
        if (
            isNaN(timestamp) || 
            isNaN(amount) ||
            timestamp === undefined || 
            amount === undefined ||
            timestamp === null || 
            amount === null
        ) {
            // console.warn(`Skipping invalid entry at index ${index}:`, {
            //     timestamp: timestamps[index],
            //     amount: amounts[index]
            // });
            continue;
        }

        // Ensure the sub-array exists
        if (!aggregatedArray[index]) {
            aggregatedArray[index] = [];
        }

        // Add the entry
        aggregatedArray[index].push({
            timestamp: timestamp,
            amount: amount
        });
    }

    // console.log('Final aggregatedArray:', aggregatedArray);
    return aggregatedArray;
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
        dragons: calculateAverageTimes(aggregatedStats.dragons),
        elders: calculateAverageTimes(aggregatedStats.elders),
        timeSpentDead: calculateAverageTimes(aggregatedStats.timeSpentDead),
        itemGold: calculateAverageItemGold(aggregatedStats.itemGold)
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

function calculateAverageItemGold(itemGoldData) {
    return itemGoldData.map(subArray => {
        if (!subArray || subArray.length === 0) return null;
        
        const totalAmount = subArray.reduce((sum, item) => sum + item.amount, 0);
        const averageAmount = totalAmount / subArray.length;
        const averageTimestamp = subArray.reduce((sum, item) => sum + item.timestamp, 0) / subArray.length;
        
        return {
            timestamp: averageTimestamp,
            averageAmount: averageAmount
        };
    });
}