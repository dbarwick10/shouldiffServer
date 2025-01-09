import express from 'express';
import { getRiotData } from '../services/riotAPI.js';
import { calculateLiveStats } from '../features/liveMatchStats.js';
import { analyzePlayerStats } from '../features/analyzeStats.js';
import { calculateAverageEventTimes } from '../features/avgEventTimesStats.js';

const router = express.Router();

router.post('/stats', async (req, res) => {
    let matchStats = null;
    let matchEvents = null;
    let analysis = null;
    
    try {
        const { summonerName, tagLine, gameMode } = req.body;
        console.log('Processing request for:', { summonerName, tagLine, gameMode });

        // Step 1: Get PUUID and region
        const puuidData = await getRiotData.getPuuid(summonerName, tagLine);
        const { puuid, region } = puuidData;
        console.log('PUUID obtained:', puuid, 'in region:', region);

        // Step 2: Get match stats
        console.log('Getting match stats...');
        matchStats = await getRiotData.getMatchStats(puuid, region, gameMode);
        console.log('Match stats obtained');

        // Step 3: Get match events
        console.log('Getting match events...');
        matchEvents = await getRiotData.getMatchEvents(puuid, region);
        console.log('Match events obtained');

        // Step 4: Analyze all player stats
        console.log('Analyzing player stats...');
        analysis = await analyzePlayerStats(matchEvents, puuid, matchStats);
        
        // Step 5: Calculate average event times
        console.log('Calculating average event times...');
        const averageEventTimes = await calculateAverageEventTimes(analysis.individualGameStats);

        // Step 6: Try to get live stats
        let liveStats = null;
        try {
            console.log('Attempting to get live stats...');
            liveStats = await calculateLiveStats();
        } catch (error) {
            console.log('Live stats not available:', error.message);
            console.error('Detailed error in /stats:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            res.status(500).json({ 
                error: 'Failed to process stats', 
                details: error.message,
                stack: error.stack // Remove in production
            });
        }

        // Extract needed data before clearing
        const responseData = {
            playerStats: analysis.individualGameStats[0]?.playerStats || {},
            teamStats: analysis.individualGameStats[0]?.teamStats || {},
            enemyTeamStats: analysis.individualGameStats[0]?.enemyStats || {},
            averageEventTimes,
            liveStats
        };

        // Send processed data
        console.log('Sending response...');
        res.json(responseData);

        console.log('Response sent successfully');

    } catch (error) {
        console.error('Error processing request:', error);
        
        // Parse the error message if it's from Riot API
        let errorMessage = error.message;
        try {
            if (error.message.includes('Failed to fetch PUUID:')) {
                const riotError = JSON.parse(error.message.split('Failed to fetch PUUID:')[1]);
                errorMessage = riotError.status.message;
            }
        } catch (e) {
            // If parsing fails, use the original error message
            console.error('Error parsing Riot API error:', e);
        }

        // Send a structured error response
        res.status(400).json({
            error: errorMessage,
            details: error.message
        });
    } finally {
        // Clear large data structures
        if (matchStats) {
            matchStats.matches = null;
            matchStats = null;
        }
        if (matchEvents) {
            matchEvents.matches = null;
            matchEvents = null;
        }
        if (analysis) {
            analysis.aggregateStats = null;
            analysis.individualGameStats = null;
            analysis = null;
        }

        // Clear large data structures we don't need anymore
        clearObject(matchStats);
        clearObject(matchEvents);
        clearObject(analysis);
        runGC();
        
        // Force garbage collection if available
        if (global.gc) {
            try {
                global.gc();
            } catch (e) {
                console.error('Failed to force garbage collection:', e);
            }
        }
    }
});

// Keep your existing routes
router.get('/puuid', async (req, res) => {
    const { summonerName, region, tagline } = req.query;

    if (!summonerName || !tagline) {
        return res.status(400).json({ 
            error: `Missing ${!summonerName ? 'summonerName' : 'tagline'} parameter` 
        });
    }

    try {
        const puuidData = await getRiotData.getPuuid(summonerName, tagline, region);
        res.json(puuidData);
    } catch (error) {
        console.error('Server error in /api/puuid:', error);
        res.status(error.status || 500).json({ 
            error: 'Riot API error', 
            details: error.message 
        });
    }
});

router.get('/match-stats', async (req, res) => {
    const { puuid, region, gameMode } = req.query;

    if (!puuid) {
        return res.status(400).json({ error: 'Missing puuid parameter' });
    }

    try {
        const matchStats = await getRiotData.getMatchStats(puuid, region, gameMode);
        res.json(matchStats);
    } catch (error) {
        console.error('Server error in /api/match-stats:', error);
        res.status(error.status || 500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    } finally {
        if (matchStats) {
            if (matchStats.matches) {
                matchStats.matches.forEach(match => {
                    if (match.info) {
                        match.info.frames = null;
                        match.info.events = null;
                    }
                });
                matchStats.matches = null;
            }
            matchStats = null;
        }
        if (global.gc) try { global.gc(); } catch (e) {}
    }
});

router.get('/match-events', async (req, res) => {
    const { puuid, region } = req.query;

    if (!puuid) {
        return res.status(400).json({ error: 'Missing puuid parameter' });
    }

    try {
        const matchEvents = await getRiotData.getMatchEvents(puuid, region);
        res.json(matchEvents);
    } catch (error) {
        console.error('Server error in /api/match-events:', error);
        res.status(error.status || 500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    } finally {
        if (matchEvents) {
            if (matchEvents.matches) {
                matchEvents.matches.forEach(match => {
                    if (match.info) {
                        match.info.frames = null;
                        match.info.events = null;
                    }
                });
                matchEvents.matches = null;
            }
            matchEvents = null;
        }
        if (global.gc) try { global.gc(); } catch (e) {}
    }
});

// router.get('/live-stats', async (req, res) => {
//     try {
//         const liveStats = await calculateLiveStats();
//         console.log('Live stats data'); // Add this

//         if (!liveStats) {
//             return res.status(404).json({ error: 'No live game found' });
//         }
//         res.json(liveStats);
//     } catch (error) {
//         console.error('Server error in /api/live-stats:', error);
//         res.status(500).json({ 
//             error: 'Internal server error', 
//             details: error.message 
//         });
//     }
// });

// Helper function to clear object properties
function clearObject(obj) {
    if (!obj) return;
    for (const key in obj) {
        if (Array.isArray(obj[key])) {
            // Clear each element in the array
            obj[key].forEach((item, index) => {
                if (typeof item === 'object') {
                    clearObject(item);
                }
                obj[key][index] = null;
            });
            obj[key].length = 0;
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            clearObject(obj[key]);
        }
        obj[key] = null;
    }
    // Clear any properties on the prototype chain
    Object.setPrototypeOf(obj, null);
}

// Helper function to safely run garbage collection
function runGC() {
    if (global.gc) {
        try {
            global.gc();
        } catch (e) {
            console.error('GC failed:', e);
        }
    }
}

export default router;