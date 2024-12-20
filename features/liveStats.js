import { getLiveData } from '../services/liveDataService.js';
import { getItemDetails } from './getItemsAndPrices.js';
import { BRW, createEmptyTeamStats } from '../utils/gameConstants.js';

export async function calculateLiveStats() {
    console.log('Entering calculateLiveStats');

    try {
        const gameData = await getLiveData();
        console.log('Received game data:', gameData);

        if (!gameData || !gameData.events || !gameData.events.Events || !gameData.allPlayers) {
            console.log('Insufficient game data');
            return createDefaultStats();
        }

        const events = gameData.events.Events;
        const activePlayerName = gameData?.activePlayer?.riotIdGameName;
        const allPlayers = gameData.allPlayers;
        const activePlayerTeam = findPlayerTeam(allPlayers, activePlayerName);

        const teamStats = {
            playerStats: createEmptyTeamStats(),
            teamStats: createEmptyTeamStats(),
            enemyStats: createEmptyTeamStats()
        };

        // Initialize total time spent dead
        const deathTimers = {
            player: 0,
            team: 0,
            enemy: 0
        };

        // Find and set game start time
        const gameStartEvent = events.find(event => event.EventName === 'GameStart');
        teamStats.teamStats.gameStartRealTime = gameStartEvent ? Date.now() : null;
        teamStats.teamStats.gameStartGameTime = gameStartEvent ? gameStartEvent.EventTime : null;

        // Process all events
        await processEvents(events, allPlayers, activePlayerName, activePlayerTeam, teamStats, deathTimers);

        // Calculate final values
        calculateItemValues(teamStats);

        console.log('Calculated team stats:', teamStats);
        return teamStats;

    } catch (error) {
        console.error('Error in calculateLiveStats:', error);
        return createDefaultStats();
    }
}

function createDefaultStats() {
    return {
        playerStats: createEmptyTeamStats(),
        teamStats: createEmptyTeamStats(),
        enemyStats: createEmptyTeamStats()
    };
}

function findPlayerTeam(allPlayers, activePlayerName) {
    const activePlayer = allPlayers.find(p => p.riotIdGameName === activePlayerName);
    return activePlayer ? activePlayer.team : null;
}

function calculateItemValues(teamStats) {
    ['playerStats', 'teamStats', 'enemyStats'].forEach(teamKey => {
        const items = teamStats[teamKey].items;
        teamStats[teamKey].totalRawPrice = items.reduce((total, item) => total + (item.rawPrice || 0), 0);
        teamStats[teamKey].totalDetailedPrice = items.reduce((total, item) => 
            total + (item.detailedPrice?.total || 0), 0);
    });
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

function calculateDeathTimer(currentMinutes, level) {
    const baseRespawnWait = BRW[level - 1];
    const timeIncreaseFactor = getTimeIncreaseFactor(currentMinutes);
    return baseRespawnWait + (baseRespawnWait * timeIncreaseFactor);
}

async function processEvents(events, allPlayers, activePlayerName, activePlayerTeam, teamStats, deathTimers) {
    for (const event of events) {
        const timestamp = event.EventTime;
        
        switch (event.EventName) {
            case 'ChampionKill':
                await processKillEvent(event, allPlayers, activePlayerName, activePlayerTeam, teamStats, deathTimers);
                break;
            case 'TurretKilled':
                processTurretEvent(event, allPlayers, activePlayerName, activePlayerTeam, teamStats);
                break;
            case 'InhibKilled':
                processInhibEvent(event, allPlayers, activePlayerName, activePlayerTeam, teamStats);
                break;
            case 'DragonKill':
                processDragonEvent(event, allPlayers, activePlayerName, activePlayerTeam, teamStats);
                break;
            case 'BaronKill':
                processBaronEvent(event, allPlayers, activePlayerName, activePlayerTeam, teamStats);
                break;
        }
    }
}

// Import the event processing functions from your original file
async function processKillEvent(event, allPlayers, activePlayerName, activePlayerTeam, teamStats, deathTimers) {
    const { KillerName, VictimName, Assisters = [] } = event;
    const timestamp = event.EventTime;
    const killerPlayer = allPlayers.find(p => p.riotIdGameName === KillerName);
    const victimPlayer = allPlayers.find(p => p.riotIdGameName === VictimName);

    // Player stats
    if (KillerName === activePlayerName) {
        teamStats.playerStats.kills.push(timestamp);
    }
    if (VictimName === activePlayerName) {
        teamStats.playerStats.deaths.push(timestamp);
        await updateDeathTimer(teamStats.playerStats, timestamp, victimPlayer.level);
    }
    if (Assisters.includes(activePlayerName)) {
        teamStats.playerStats.assists.push(timestamp);
    }

    // Team stats
    if (killerPlayer?.team === activePlayerTeam) {
        teamStats.teamStats.kills.push(timestamp);
    }
    if (victimPlayer?.team === activePlayerTeam) {
        teamStats.teamStats.deaths.push(timestamp);
        await updateDeathTimer(teamStats.teamStats, timestamp, victimPlayer.level);
    }

    // Enemy stats
    if (killerPlayer?.team !== activePlayerTeam) {
        teamStats.enemyStats.kills.push(timestamp);
    }
    if (victimPlayer?.team !== activePlayerTeam) {
        teamStats.enemyStats.deaths.push(timestamp);
        await updateDeathTimer(teamStats.enemyStats, timestamp, victimPlayer.level);
    }

    // Update KDA for all teams
    updateKDA(teamStats.playerStats);
    updateKDA(teamStats.teamStats);
    updateKDA(teamStats.enemyStats);
}

// Add the rest of your event processing functions (processTurretEvent, processInhibEvent, etc.)
// and helper functions from your original file

function updateKDA(stats) {
    const kills = stats.kills.length;
    const deaths = Math.max(1, stats.deaths.length);
    const assists = stats.assists.length;
    const kdaValue = (kills + assists) / deaths;
    
    stats.kda.push({
        timestamp: Date.now(),
        kdaValue: parseFloat(kdaValue.toFixed(2))
    });
}

async function updateDeathTimer(stats, timestamp, level) {
    const currentMinutes = Math.floor(timestamp / 60);
    const deathTimer = await calculateDeathTimer(currentMinutes, level);
    
    stats.timeSpentDead = stats.timeSpentDead || [];
    stats.totalTimeSpentDead = stats.totalTimeSpentDead || [];
    
    stats.timeSpentDead.push(deathTimer);
    const previousTotal = stats.totalTimeSpentDead.length > 0 
        ? stats.totalTimeSpentDead[stats.totalTimeSpentDead.length - 1] 
        : 0;
    stats.totalTimeSpentDead.push(previousTotal + deathTimer);
}

export default {
    calculateLiveStats,
    createDefaultStats,
    calculateDeathTimer
};