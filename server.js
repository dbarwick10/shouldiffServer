// server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import 'dotenv/config';

const app = express();
const PORT = 3000;
const matchCount = 5;

app.use(cors());
app.use(express.json());

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message });
});

const RIOT_API_KEY = process.env.RIOT_API_KEY;
if (!RIOT_API_KEY) {
    console.error('RIOT_API_KEY not found in environment variables');
    process.exit(1);
}

app.post('/api/stats', async (req, res) => {
    console.log('Received stats request with data:', req.body);
    const { summonerName, tagLine, region, gameMode } = req.body;

    if (!summonerName || !tagLine) {
        return res.status(400).json({ 
            error: 'Missing required parameters',
            details: 'Both summonerName and tagLine are required'
        });
    }

    try {
        // Step 1: Get PUUID
        console.log('Step 1: Getting PUUID...');
        const puuidUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(summonerName)}/${encodeURIComponent(tagLine)}?api_key=${RIOT_API_KEY}`;
        const puuidResponse = await fetch(puuidUrl);
        if (!puuidResponse.ok) {
            throw new Error('Failed to fetch PUUID');
        }
        const puuidData = await puuidResponse.json();
        const puuid = puuidData.puuid;
        console.log('PUUID obtained:', puuid);

        // Step 2: Get match IDs
        const queueId = getQueueId(gameMode);
        const matchIdsUrl = queueId ? 
            `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queueId}&start=0&count=${matchCount}&api_key=${RIOT_API_KEY}` :
            `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${matchCount}&api_key=${RIOT_API_KEY}`;

        const matchIdsResponse = await fetch(matchIdsUrl);
        if (!matchIdsResponse.ok) {
            throw new Error('Failed to fetch match IDs');
        }
        const matchIds = await matchIdsResponse.json();

        // Step 3: Get match details and timelines
        const matchStats = [];
        const matchEvents = [];

        for (const matchId of matchIds) {
            // Get match stats
            const matchUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${RIOT_API_KEY}`;
            const matchResponse = await fetch(matchUrl);
            if (matchResponse.ok) {
                const matchData = await matchResponse.json();
                matchStats.push(matchData);
            }

            // Get match timeline
            const timelineUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline?api_key=${RIOT_API_KEY}`;
            const timelineResponse = await fetch(timelineUrl);
            if (timelineResponse.ok) {
                const timelineData = await timelineResponse.json();
                matchEvents.push(timelineData);
            }
        }

        res.json({ matchStats, matchEvents });

    } catch (error) {
        console.error('Error processing stats request:', error);
        res.status(500).json({ 
            error: 'Failed to process stats', 
            details: error.message 
        });
    }
});

function getQueueId(gameMode) {
    const queueMappings = {
        'aram': 450,
        'normal': 400,
        'blind': 430,
        'ranked': 420,
        'flex': 440,
        'urf': 1020,
        'ultbook': 1400,
        'all': null
    };
    return gameMode ? queueMappings[gameMode.toLowerCase()] : null;
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  - POST /api/stats');
});
