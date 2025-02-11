const MATCH_COUNT = 100;
const DELAY_BETWEEN_REQUESTS = 0;

const QUEUE_MAPPINGS = {
    'aram': 450,       // ARAM
    'normal': 400,     // Normal 5v5 Draft Pick
    'blind': 430,      // Normal 5v5 Blind Pick
    'rankedSolo': 420, // Ranked Solo/Duo
    'rankedFlex': 440, // Ranked Flex 5v5
    'arurf': 900,      // ARURF
    'urf': 1020,       // Ultra Rapid Fire
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

        // Log initial startup
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
        console.log(`\n=== Metrics Update ${context ? `(${context})` : ''} ===`);
        console.log(JSON.stringify(metrics, null, 2));
        console.log('============================\n');
    }

    async getPuuid(summonerName, tagline) {
        const tag = tagline.replace(/[^a-zA-Z0-9 ]/g, "");
        console.log(`\n>>> Searching for player: ${summonerName}#${tag}`);
        
        this.metrics.totalPuuidSearches++;
        this.metrics.lastRequestTime = Date.now();
        
        for (const region of this.regions) {
            try {
                const startTime = Date.now();
                this.metrics.searchesByRegion[region]++;
                
                const riotUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(summonerName)}/${encodeURIComponent(tag)}`;
                console.log(`Trying region ${region} with URL: ${riotUrl}`);
                
                const response = await fetch(`${riotUrl}?api_key=${this.apiKey}`);
                const responseText = await response.text();
                
                this.metrics.apiLatency.puuid.push(Date.now() - startTime);
                
                if (response.status === 429) {
                    this.metrics.rateLimitHits++;
                    console.log('⚠️ Rate limit hit during PUUID search');
                }
                
                if (response.ok) {
                    const data = JSON.parse(responseText);
                    console.log(`✅ Found player in ${region}`);
                    this.metrics.uniquePuuids.add(data.puuid);
                    this.logMetrics('After PUUID Search');
                    return {
                        ...data,
                        region
                    };
                }
            } catch (error) {
                this.metrics.errors.puuidLookup++;
                console.error(`❌ Error searching in ${region}:`, error);
                continue;
            }
        }
        
        this.metrics.errors.puuidLookup++;
        this.logMetrics('After Failed PUUID Search');
        throw new Error(`Player "${summonerName}#${tag}" not found in any region (searched: ${this.regions.join(', ')})`);
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
                    console.log('⚠️ Rate limit hit during match ID fetch');
                }
                this.metrics.errors.matchFetch++;
                throw new Error(`Failed to fetch match IDs: ${await response.text()}`);
            }

            const matchIds = await response.json();
            console.log(`📊 Received ${matchIds.length} matches from API, will process up to ${MATCH_COUNT}`);
                        
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
                    console.log('⚠️ Rate limit hit during match fetch');
                }
                
                if (matchResponse.ok) {
                    const matchData = await matchResponse.json();
                    
                    if (!queue || matchData.info.queueId === queue) {
                        matchDetails.push(matchData);
                        this.metrics.totalMatchesProcessed++;
                        
                        const queueId = matchData.info.queueId;
                        this.metrics.matchesByQueue[queueId] = (this.metrics.matchesByQueue[queueId] || 0) + 1;
                        
                        console.log(`✅ Processed match ${matchDetails.length}/${MATCH_COUNT} (Queue: ${queueId})`);
                    }
                    
                    this.metrics.apiLatency.matches.push(Date.now() - matchStartTime);
                } else {
                    this.metrics.errors.matchFetch++;
                    console.error(`❌ Failed to fetch match ${matchId}`);
                }
                
                // Log metrics every 10 matches
                if (matchDetails.length % 10 === 0) {
                    this.logMetrics(`After ${matchDetails.length} matches`);
                }
                
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
            }

            // Log final metrics for this batch
            this.logMetrics('After completing match fetching');
            return matchDetails;

        } catch (error) {
            console.error('Error in getMatchStats:', error);
            this.logMetrics('After error in getMatchStats');
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
                    console.log('⚠️ Rate limit hit during timeline fetch');
                }
                
                if (response.ok) {
                    const eventData = await response.json();
                    matchEvents.push(eventData);
                    this.metrics.apiLatency.timeline.push(Date.now() - startTime);
                    console.log(`✅ Processed timeline ${matchEvents.length}/${MATCH_COUNT}`);
                } else {
                    this.metrics.errors.timelineFetch++;
                    console.error(`❌ Failed to fetch events for match ${matchId}`);
                }
                
                // Log metrics every 10 timelines
                if (matchEvents.length % 10 === 0) {
                    this.logMetrics(`After ${matchEvents.length} timelines`);
                }
                
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
            }

            this.matchIds.delete(puuid);
            this.logMetrics('After completing timeline fetching');
            return matchEvents;

        } catch (error) {
            this.matchIds.delete(puuid);
            console.error('Error in getMatchEvents:', error);
            this.logMetrics('After error in getMatchEvents');
            throw error;
        }
    }
}

export const getRiotData = new RiotAPIService();
