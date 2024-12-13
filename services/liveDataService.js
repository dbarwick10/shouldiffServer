import fetch from 'node-fetch';
import https from 'https';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

let cachedData = null;
let pollingInterval = null;
const POLLING_RATE = 1000; // 1 second

export async function getLiveData() {
    try {
        // If polling isn't started, start it
        if (!pollingInterval) {
            startPolling();
        }
        
        return cachedData;
    } catch (error) {
        console.error('Error in getLiveData:', error);
        return null;
    }
}

async function fetchLiveGameData() {
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
    console.log('Starting live game data polling...');
    
    // Initial fetch
    fetchLiveGameData().then(data => {
        cachedData = data;
    });

    // Set up interval for subsequent fetches
    pollingInterval = setInterval(async () => {
        const newData = await fetchLiveGameData();
        if (newData) {
            cachedData = newData;
            console.log('Live game data updated');
        }
    }, POLLING_RATE);
}

function stopPolling() {
    if (pollingInterval) {
        console.log('Stopping live game data polling...');
        clearInterval(pollingInterval);
        pollingInterval = null;
        cachedData = null;
    }
}

// Clean up when the process exits
process.on('SIGTERM', stopPolling);
process.on('SIGINT', stopPolling);

export const liveDataService = {
    getLiveData,
    startPolling,
    stopPolling
};