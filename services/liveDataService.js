import fetch from 'node-fetch';
import https from 'https';
import { LIVE_POLLING_RATE, LIVE_STATS_ENABLED } from '../config/constraints.js';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

let cachedData = null;
let pollingInterval = null;

export async function getLiveData() {
    if (!LIVE_STATS_ENABLED) {
        console.log('Live stats are disabled');
        return null;
    }

    try {
        if (!pollingInterval) {
            await fetchLiveGameData().then(data => {
                cachedData = data;
            });
            startPolling();
        }
        
        return cachedData;
    } catch (error) {
        console.error('Error in getLiveData:', error);
        return null;
    }
}

async function fetchLiveGameData() {
    if (!LIVE_STATS_ENABLED) {
        return null;
    }
    try {
        const response = await fetch('https://127.0.0.1:2999/liveclientdata/allgamedata', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            agent: httpsAgent
        });

        if (!response.ok) {
            console.error('Error fetching from League client:', response.status, response.statusText);
            stopPolling();
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching live game data:', error);
        stopPolling();
        return null;
    }
}

function startPolling() {
    if (!LIVE_STATS_ENABLED) {
        console.log('Live stats are disabled - polling not started');
        return;
    }

    console.log('Starting live game data polling...');
    
    fetchLiveGameData().then(data => {
        cachedData = data;
    });

    pollingInterval = setInterval(async () => {
        const newData = await fetchLiveGameData();
        if (newData) {
            cachedData = newData;
            console.log('Live game data updated');
        }
    }, LIVE_POLLING_RATE);
}

function stopPolling() {
    if (pollingInterval) {
        console.log('Stopping live game data polling...');
        clearInterval(pollingInterval);
        pollingInterval = null;
        cachedData = null;
    }
}

process.on('SIGTERM', stopPolling);
process.on('SIGINT', stopPolling);
