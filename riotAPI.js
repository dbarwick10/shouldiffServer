const MATCH_COUNT = 100;
const DELAY_BETWEEN_REQUESTS = 0;

const QUEUE_MAPPINGS = {
    'aram': 450,       // ARAM
    'normal': 400,     // Normal 5v5 Draft Pick
    'blind': 430,      // Normal 5v5 Blind Pick
    'rankedSolo': 420, // Ranked Solo/Duo
    'rankedFlex': 440, // Ranked Flex 5v5
    'arurf': 900,      // ARURF
    'oneForAll': 1020, // One for All
    'ultbook': 1400,   // Ultimate Spellbook
    'all': null        // All queues
};

class RiotAPIService {
    constructor() {
        this.apiKey = process.env.RIOT_API_KEY;
        this.matchIds = new Map();
        this.queueMappings = QUEUE_MAPPINGS;
        this.regions = [
            'americas',
            'europe',
            'asia',
            'sea'
        ];
        // Enhanced metrics tracking
        this.metrics = {
            totalPuuidSearches: 0,
            uniquePuuids: new Set(),
            searchesByRegion: {
                americas: 0,
                europe: 0,
                asia: 0,
                sea: 0
            },
            totalMatchesProcessed: 0,
            matchesByQueue: {},
            totalMatchRequests: 0,
            apiLatency: {
                puuid: [],
                matches: [],
                timeline: []
            },
            errors: {
                puuidLookup: 0,
                matchFetch: 0,
                timelineFetch: 0
            },
            rateLimitHits: 0,
            startTime: Date.now(),
            lastRequestTime: null
        };

        console.log('\n=== RiotAPIService Initialized ===');
        console.log('Start Time:', new Date(this.metrics.startTime).toISOString());
        console.log('============================\n');
    }

    getMetrics() {
        const now = Date.now();
        const uptime = now - this.metrics.startTime;
        
        const avgLatency = (arr) => arr.length ? 
            (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;

        return {
            searches: {
                total: this.metrics.totalPuuidSearches,
                unique: this.metrics.uniquePuuids.size,
                byRegion: this.metrics.searchesByRegion,
                errorRate: (this.metrics.errors.puuidLookup / this.metrics.totalPuuidSearches || 0).toFixed(4)
            },
            matches: {
                processed: this.metrics.totalMatchesProcessed,
                byQueue: this.metrics.matchesByQueue,
                totalRequests: this.metrics.totalMatchRequests,
                errorRate: (this.metrics.errors.matchFetch / this.metrics.totalMatchRequests || 0).toFixed(4)
            },
            performance: {
                uptime: uptime,
                avgLatencyMs: {
                    puuid: avgLatency(this.metrics.apiLatency.puuid),
                    matches: avgLatency(this.metrics.apiLatency.matches),
                    timeline: avgLatency(this.metrics.apiLatency.timeline)
                },
                requestsPerMinute: (this.metrics.totalMatchRequests / (uptime / 60000)).toFixed(2)
            },
            rateLimit: {
                hits: this.metrics.rateLimitHits
            }
        };
    }

    logMetrics(context = '') {
        const metrics = this.getMetrics();
        console.log(`\n=== Metrics ${context ? `(${context})` : ''} ===`);
        console.log(JSON.stringify(metrics, null, 2));
        console.log('============================\n');
    }

    async getPuuid(summonerName, tagline) {
        const tag = tagline.replace(/^#/, "");
        console.log(`\n>>> Searching for player: ${summonerName}#${tag}`);
        
        this.metrics.totalPuuidSearches++;
        this.metrics.lastRequestTime = Date.now();
        
        let playerData = null;
        
        // First, find the player's account in any region
        for (const region of this.regions) {
            try {
                const startTime = Date.now();
                this.metrics.searchesByRegion[region]++;
                
                const riotUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(summonerName)}/${encodeURIComponent(tag)}`;
                
                const response = await fetch(`${riotUrl}?api_key=${this.apiKey}`);
                const responseText = await response.text();
                
                this.metrics.apiLatency.puuid.push(Date.now() - startTime);
                
                if (response.status === 429) {
                    this.metrics.rateLimitHits++;
                }
                
                if (response.ok) {
                    playerData = JSON.parse(responseText);
                    console.log(`Found player in ${region}:`, playerData, riotUrl);
                    break; // Exit the loop once the player is found
                }
            } catch (error) {
                this.metrics.errors.puuidLookup++;
                console.error(`Error searching in ${region}:`, error);
                continue;
            }
        }
        
        if (!playerData) {
            this.metrics.errors.puuidLookup++;
            throw new Error(`Player "${summonerName}#${tag}" not found in any region (searched: ${this.regions.join(', ')})`);
        }
        
        // Now, check all regions for match history
        for (const region of this.regions) {
            try {
                const matchIdsUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(playerData.puuid)}/ids?start=0&count=1&api_key=${this.apiKey}`;
                const matchResponse = await fetch(matchIdsUrl);
                
                if (matchResponse.status === 429) {
                    this.metrics.rateLimitHits++;
                }
                
                if (matchResponse.ok) {
                    const matchIds = await matchResponse.json();
                    if (matchIds.length > 0) {
                        this.metrics.uniquePuuids.add(playerData.puuid);
                        return {
                            ...playerData,
                            region
                        };
                    }
                }
            } catch (error) {
                console.error(`Error checking match history in ${region}:`, error);
                continue;
            }
        }
        
        this.metrics.errors.puuidLookup++;
        throw new Error(`Player "${summonerName}#${tag}" not found in any region with match history (searched: ${this.regions.join(', ')})`);
    }

    async getMatchStats(puuid, region, gameMode) {
        try {
            console.log('\n>>> Fetching match IDs...');
            
            const queue = gameMode && this.queueMappings[gameMode.toLowerCase()]
                ? this.queueMappings[gameMode.toLowerCase()]
                : null;

            const startTime = Date.now();
            this.metrics.lastRequestTime = startTime;

            const matchIdsUrl = queue != null 
                ? `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=${encodeURIComponent(queue)}&start=0&count=${MATCH_COUNT}&api_key=${this.apiKey}`
                : `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${MATCH_COUNT}&api_key=${this.apiKey}`;
            
            const response = await fetch(matchIdsUrl);
            if (!response.ok) {
                if (response.status === 429) {
                    this.metrics.rateLimitHits++;
                }
                this.metrics.errors.matchFetch++;
                throw new Error(`Failed to fetch match IDs: ${await response.text()}`);
            }

            const matchIds = await response.json();
            console.log(`Received ${matchIds.length} matches from API`);
                        
            this.matchIds.set(puuid, matchIds);

            const matchDetails = [];
            for (const matchId of matchIds) {
                if (matchDetails.length >= MATCH_COUNT) break; 

                const matchStartTime = Date.now();
                this.metrics.totalMatchRequests++;
                this.metrics.lastRequestTime = matchStartTime;

                const matchUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${this.apiKey}`;
                const matchResponse = await fetch(matchUrl);
                
                if (matchResponse.status === 429) {
                    this.metrics.rateLimitHits++;
                }
                
                if (matchResponse.ok) {
                    const matchData = await matchResponse.json();
                    
                    if (!queue || matchData.info.queueId === queue) {
                        matchDetails.push(matchData);
                        this.metrics.totalMatchesProcessed++;
                        
                        const queueId = matchData.info.queueId;
                        this.metrics.matchesByQueue[queueId] = (this.metrics.matchesByQueue[queueId] || 0) + 1;
                    }
                    
                    this.metrics.apiLatency.matches.push(Date.now() - matchStartTime);
                } else {
                    this.metrics.errors.matchFetch++;
                }
                
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
            }

            // this.logMetrics('After Match Processing');
            return matchDetails;

        } catch (error) {
            console.error('Error in getMatchStats:', error);
            throw error;
        }
    }

    async getMatchEvents(puuid, region) {
        const matchIds = this.matchIds.get(puuid);
        if (!matchIds || matchIds.length === 0) {
            throw new Error('No match IDs found. Please fetch match stats first.');
        }

        try {
            console.log('\n>>> Fetching match events...');
            const matchEvents = [];
            for (const matchId of matchIds.slice(0, MATCH_COUNT)) {
                const startTime = Date.now();
                const timelineUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline?api_key=${this.apiKey}`;
                const response = await fetch(timelineUrl);
                
                if (response.status === 429) {
                    this.metrics.rateLimitHits++;
                }
                
                if (response.ok) {
                    const eventData = await response.json();
                    matchEvents.push(eventData);
                    this.metrics.apiLatency.timeline.push(Date.now() - startTime);
                } else {
                    this.metrics.errors.timelineFetch++;
                }
                
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
            }

            this.matchIds.delete(puuid);
            this.logMetrics('After Timeline Processing');
            return matchEvents;

        } catch (error) {
            this.matchIds.delete(puuid);
            console.error('Error in getMatchEvents:', error);
            throw error;
        }
    }
}

export const getRiotData = new RiotAPIService();
