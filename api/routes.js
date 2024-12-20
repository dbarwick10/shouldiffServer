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
        const { summonerName, tagLine, region, gameMode } = req.body;
        console.log('Processing request for:', { summonerName, tagLine, region, gameMode });

        // Step 1: Get PUUID
        const puuidData = await getRiotData.getPuuid(summonerName, tagLine, region);
        const puuid = puuidData.puuid;
        console.log('PUUID obtained:', puuid);

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
        try {
            await Promise.resolve();
        
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
        await safeCleanup(matchStats, matchEvents, analysis);

        runGC();
        
        // Force garbage collection if available
        if (global.gc) {
            try {
                global.gc();
            } catch (e) {
                console.error('Failed to force garbage collection:', e);
            }
        }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
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
async function safeCleanup(matchStats, matchEvents, analysis) {
    try {
        // Wait for any pending operations
        await Promise.resolve();

        // Clean each major object separately to prevent cascading failures
        if (matchStats) await safeCleanupMatchStats(matchStats);
        if (matchEvents) await safeCleanupMatchEvents(matchEvents);
        if (analysis) await safeCleanupAnalysis(analysis);

        // Final GC
        runGC();
    } catch (e) {
        console.error('Error in safeCleanup:', e);
    }
}

async function safeCleanupMatchStats(matchStats) {
    try {
        if (matchStats?.matches) {
            for (const match of matchStats.matches) {
                try {
                    if (match?.info) {
                        if (match.info.frames) {
                            for (const frame of match.info.frames) {
                                try {
                                    if (frame?.events) {
                                        frame.events = null;
                                    }
                                    safeNullify(frame);
                                } catch (e) {
                                    console.error('Error cleaning frame:', e);
                                }
                            }
                            match.info.frames = null;
                        }
                        safeNullify(match.info);
                    }
                    safeNullify(match);
                } catch (e) {
                    console.error('Error cleaning match:', e);
                }
            }
            matchStats.matches = null;
        }
        safeNullify(matchStats);
    } catch (e) {
        console.error('Error in safeCleanupMatchStats:', e);
    }
}

async function safeCleanupMatchEvents(matchEvents) {
    try {
        if (matchEvents?.matches) {
            for (const match of matchEvents.matches) {
                try {
                    if (match?.info) {
                        match.info.frames = null;
                        match.info.events = null;
                        safeNullify(match.info);
                    }
                    safeNullify(match);
                } catch (e) {
                    console.error('Error cleaning match event:', e);
                }
            }
            matchEvents.matches = null;
        }
        safeNullify(matchEvents);
    } catch (e) {
        console.error('Error in safeCleanupMatchEvents:', e);
    }
}

async function safeCleanupAnalysis(analysis) {
    try {
        if (analysis) {
            if (analysis.aggregateStats) {
                safeNullify(analysis.aggregateStats);
                analysis.aggregateStats = null;
            }
            if (analysis.individualGameStats) {
                for (const game of analysis.individualGameStats) {
                    try {
                        safeNullify(game);
                    } catch (e) {
                        console.error('Error cleaning game:', e);
                    }
                }
                analysis.individualGameStats = null;
            }
            safeNullify(analysis);
        }
    } catch (e) {
        console.error('Error in safeCleanupAnalysis:', e);
    }
}

// Safer version of object nullification
function safeNullify(obj) {
    if (!obj || typeof obj !== 'object') return;
    
    for (const key in obj) {
        try {
            if (Array.isArray(obj[key])) {
                obj[key].length = 0;
            }
            obj[key] = null;
        } catch (e) {
            console.error(`Error nullifying ${key}:`, e);
        }
    }
    
    try {
        Object.setPrototypeOf(obj, null);
    } catch (e) {
        console.error('Error clearing prototype:', e);
    }
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