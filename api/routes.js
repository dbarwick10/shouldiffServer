import express from 'express';
import { getRiotData } from '../services/riotAPI.js';
import { calculateLiveStats } from '../features/liveMatchStats.js';
import { analyzePlayerStats } from '../features/analyzeStats.js';
import { calculateAverageEventTimes } from '../features/avgEventTimesStats.js';

const router = express.Router();

// Helper function to clear object properties
function clearObject(obj) {
    if (!obj) return;
    for (const key in obj) {
        if (Array.isArray(obj[key])) {
            obj[key].length = 0;
        } else if (typeof obj[key] === 'object') {
            clearObject(obj[key]);
        }
        obj[key] = null;
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

router.post('/stats', async (req, res) => {
    const resources = {
        matchStats: null,
        matchEvents: null,
        analysis: null,
        responseData: null
    };
    
    try {
        const { summonerName, tagLine, region, gameMode } = req.body;
        console.log('Processing request for:', { summonerName, tagLine, region, gameMode });

        // Step 1: Get PUUID
        const { puuid } = await getRiotData.getPuuid(summonerName, tagLine, region);
        console.log('PUUID obtained:', puuid);

        // Step 2: Get match stats
        console.log('Getting match stats...');
        resources.matchStats = await getRiotData.getMatchStats(puuid, region, gameMode);
        console.log('Match stats obtained');

        // Step 3: Get match events
        console.log('Getting match events...');
        resources.matchEvents = await getRiotData.getMatchEvents(puuid, region);
        console.log('Match events obtained');

        // Step 4: Analyze player stats
        console.log('Analyzing player stats...');
        resources.analysis = await analyzePlayerStats(resources.matchEvents, puuid, resources.matchStats);

        // Step 5: Calculate average event times
        console.log('Calculating average event times...');
        const averageEventTimes = await calculateAverageEventTimes(resources.analysis.individualGameStats);

        // Clear large data structures we don't need anymore
        clearObject(resources.matchStats);
        clearObject(resources.matchEvents);
        runGC();

        // Step 6: Try to get live stats
        let liveStats = null;
        try {
            console.log('Attempting to get live stats...');
            liveStats = await calculateLiveStats();
        } catch (error) {
            console.log('Live stats not available:', error.message);
        }

        // Prepare response data
        resources.responseData = {
            playerStats: resources.analysis.individualGameStats[0]?.playerStats || {},
            teamStats: resources.analysis.individualGameStats[0]?.teamStats || {},
            enemyTeamStats: resources.analysis.individualGameStats[0]?.enemyStats || {},
            averageEventTimes,
            liveStats
        };

        // Clear analysis data
        clearObject(resources.analysis);
        runGC();

        // Send response
        console.log('Sending response...');
        res.json(resources.responseData);
        console.log('Response sent successfully');

    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ 
            error: 'Failed to process stats', 
            details: error.message 
        });
    } finally {
        // Clear all remaining resources
        Object.keys(resources).forEach(key => {
            clearObject(resources[key]);
        });
        runGC();
        
        // Log memory usage
        const memUsage = process.memoryUsage();
        console.log('Memory usage after cleanup:', {
            rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
            external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
        });
    }
});

// Apply the same pattern to other routes
router.get('/match-stats', async (req, res) => {
    let matchStats = null;
    try {
        const { puuid, region, gameMode } = req.query;
        if (!puuid) {
            return res.status(400).json({ error: 'Missing puuid parameter' });
        }
        matchStats = await getRiotData.getMatchStats(puuid, region, gameMode);
        res.json(matchStats);
    } catch (error) {
        console.error('Server error in /api/match-stats:', error);
        res.status(error.status || 500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    } finally {
        clearObject(matchStats);
        runGC();
    }
});