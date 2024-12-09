// server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';
import { match } from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const httpsAgent = new https.Agent({
    rejectUnauthorized: false, // Disable SSL/TLS certificate verification
  });
const PORT = 3000;
const matchCount = 100;
const delayBetweenMatchRequests = 1200;
let fetchedMatchIds = [];

// Middleware
app.use(cors());
app.use(express.json());

// Debug middleware to log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

const RIOT_API_KEY = process.env.RIOT_API_KEY;
if (!RIOT_API_KEY) {
    console.error('RIOT_API_KEY not found in environment variables');
    process.exit(1);
}

// Test endpoint to verify API is working
app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working' });
});

// PUUID endpoint
app.get('/api/puuid', async (req, res) => {
    console.log('Received request for PUUID:', req.query);
    const { summonerName, region, tagline } = req.query;

    if (!summonerName) {
        return res.status(400).json({ error: 'Missing summonerName parameter' });
    }

    if (!tagline) {
        return res.status(400).json({ error: 'Missing tagline parameter' });
    }

    try {
        const riotUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(summonerName)}/${encodeURIComponent(tagline)}`;
        console.log('Fetching from Riot API:', riotUrl);

        const puuidResponse = await fetch(
            `${riotUrl}?api_key=${RIOT_API_KEY}`
        );

        console.log('Riot API response status:', puuidResponse.status);

        if (!puuidResponse.ok) {
            const errorText = await puuidResponse.text();
            console.error('Riot API error:', errorText);
            return res.status(puuidResponse.status).json({ 
                error: 'Riot API error', 
                details: errorText 
            });
        }

        const puuidData = await puuidResponse.json();
        console.log('PUUID data:', puuidData);
        res.json(puuidData);
    } catch (error) {
        console.error('Server error in /api/puuid:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Match stats endpoint
app.get('/api/match-stats', async (req, res) => {
    console.log('Received request for match stats:', req.query);
    const { puuid, region, gameMode } = req.query;

    if (!puuid) {
        return res.status(400).json({ error: 'Missing puuid parameter' });
    }

    // Define queue numbers for different game modes
    const queueMappings = {
        'aram': 450,       // ARAM
        'normal': 400,     // Normal 5v5 Draft Pick
        'blind': 430,      // Normal 5v5 Blind Pick
        'ranked': 420,     // Ranked Solo/Duo
        'flex': 440,       // Ranked Flex
        'urf': 1020,       // Ultra Rapid Fire
        'ultbook': 1400,      // ultimate spellbook
        'all': null,       // All queues
    };

    try {
        fetchedMatchIds = [];
        console.log('[] Cleared fetchedMatchIds []');

        // Determine queue number based on gameMode
        const queue = gameMode && queueMappings[gameMode.toLowerCase()] 
            ? queueMappings[gameMode.toLowerCase()] 
            : null;

        // Request more matches initially if filtering by game mode to ensure we get enough
        const initialCount = queue ? Math.min(100, matchCount * 30) : matchCount;
        
        // Construct URL with queue parameter if specified
        const matchIdsUrl = queue != null ? `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=${encodeURIComponent(queue)}&start=0&count=${initialCount}&api_key=${RIOT_API_KEY}` : 
        `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${initialCount}&api_key=${RIOT_API_KEY}`

        // const matchIdsUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids` +
        //     (queue != null ? `?queue=${encodeURIComponent(queue)}` : '') + 
        //     `&start=0&count=${initialCount}&api_key=${RIOT_API_KEY}`;
        
        console.log('Fetching match IDs from Riot API');
        
        const matchIdsResponse = await fetch(matchIdsUrl);

        if (!matchIdsResponse.ok) {
            const errorText = await matchIdsResponse.text();
            console.error('Match IDs error:', errorText);
            return res.status(matchIdsResponse.status).json({ 
                error: 'Riot API error', 
                details: errorText 
            });
        }

        const matchIds = await matchIdsResponse.json();
        console.log(`Found ${matchIds.length} matches`);

        const matchStats = [];

        for (const matchId of matchIds) {
            if (matchStats.length >= matchCount) break;

            try {
                const matchUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${RIOT_API_KEY}`;
                console.log(`Fetching data for match ${matchId}`);
                
                const matchResponse = await fetch(matchUrl);

                if (!matchResponse.ok) {
                    console.error(`Failed to fetch match ${matchId}:`, await matchResponse.text());
                    continue;
                }

                const matchData = await matchResponse.json();

                // Additional filtering if needed
                if (!queue || matchData.info.queueId === queue) {
                    matchStats.push(matchData);
                    console.log(`Added match. Current count: ${matchStats.length}/${matchCount}`);
                    fetchedMatchIds.push(matchId);
                }
                
                console.log('Stored match IDs:', fetchedMatchIds);
                // Rate limiting delay
                await new Promise(resolve => setTimeout(resolve, `${delayBetweenMatchRequests}`));
            } catch (error) {
                console.error(`Error fetching match ${matchId}:`, error);
            }
        }

        console.log(`Returning ${matchStats.length}/${matchCount} matches`);

        res.json(matchStats);
    } catch (error) {
        console.error('Server error in /api/match-stats:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Match events endpoint
app.get('/api/match-events', async (req, res) => {
    console.log('Received request for match events:', req.query);
    const { puuid, region } = req.query;

    if (!puuid) {
        return res.status(400).json({ error: 'Missing puuid parameter' });
    }

    try {
        // Use the fetched match IDs from the match-stats endpoint
        if (fetchedMatchIds.length === 0) {
            return res.status(400).json({ error: 'No match IDs found. Please fetch match stats first.' });
        }

        console.log('Fetching match events for the following matchIds:', fetchedMatchIds); // Log the match IDs being fetched

        const matchEvents = [];
        for (const matchId of fetchedMatchIds) {

            try {
                const matchUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline?api_key=${RIOT_API_KEY}`;
                console.log(`Fetching events for match ${matchId}`);
                
                const matchResponse = await fetch(matchUrl);

                if (!matchResponse.ok) {
                    console.error(`Failed to fetch match ${matchId}:`, await matchResponse.text());
                    continue;
                }

                const matchData = await matchResponse.json();
                matchEvents.push(matchData);

                // Rate limiting delay
                await new Promise(resolve => setTimeout(resolve, `${delayBetweenMatchRequests}`));
            } catch (error) {
                console.error(`Error fetching match ${matchId}:`, error);
            }
        }

        res.json(matchEvents);
    } catch (error) {
        console.error('Server error in /api/match-events:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// app.get('/liveclientdata/allgamedata', async (req, res) => {
//     try {
//       // Fetch data from the League client, using the HTTPS agent to ignore SSL verification
//       const response = await fetch('https://127.0.0.1:2999/liveclientdata/allgamedata', {
//         method: 'GET',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         agent: httpsAgent, // Use the agent here
//       });
  
//       if (!response.ok) {
//         console.error('Error fetching data from League client:', response.status, response.statusText);
//         return res.status(response.status).json({ error: 'Failed to fetch game data from League client' });
//       }
  
//       const data = await response.json();
//       console.log('Data updated from League Client');
  
//       // Send the data to the client
//       res.json(data);
//     } catch (error) {
//       console.error('Error in proxy server:', error);
//       res.status(500).json({ error: 'Failed to fetch game data from proxy server' });
//     }
//   });

// Serve static files - this should come after API routes
app.use(express.static(path.join(__dirname, 'services')));

// Start server
app.listen(PORT, () => {
// app.listen(() => {
    // console.log(`Server running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('  - GET /api/test');
    console.log('  - GET /api/puuid');
    console.log('  - GET /api/match-stats');
    console.log('  - GET /api/match-events');
    // console.log('  - GET /api/liveclientdata/allgamedata');
});
