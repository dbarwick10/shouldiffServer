const MATCH_COUNT = 100;
const DELAY_BETWEEN_REQUESTS = 0;

const QUEUE_MAPPINGS = {
    'aram': 450,
    'normal': 400,
    'blind': 430,
    'rankedSolo': 420,
    'rankedFlex': 440,
    'arurf': 900,
    'urf': 1020,
    'ultbook': 1400,
    'all': null
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

        console.log(JSON.stringify({
            level: 'info',
            event: 'riot_service_init',
            timestamp: new Date().toISOString(),
            service: 'riot-api',
            message: 'RiotAPIService Initialized'
        }));
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
        console.log(JSON.stringify({
            level: 'info',
            event: 'riot_metrics',
            context,
            timestamp: new Date().toISOString(),
            service: 'riot-api',
            metrics
        }));
    }

    async getPuuid(summonerName, tagline) {
        const tag = tagline.replace(/[^a-zA-Z0-9 ]/g, "");
        console.log(JSON.stringify({
            level: 'info',
            event: 'riot_puuid_search_start',
            timestamp: new Date().toISOString(),
            service: 'riot-api',
            data: { summonerName, tagline: tag }
        }));
        
        this.metrics.totalPuuidSearches++;
        this.metrics.lastRequestTime = Date.now();
        
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
                    console.log(JSON.stringify({
                        level: 'warn',
                        event: 'riot_rate_limit',
                        timestamp: new Date().toISOString(),
                        service: 'riot-api',
                        endpoint: 'puuid',
                        region
                    }));
                }
                
                if (response.ok) {
                    const data = JSON.parse(responseText);
                    this.metrics.uniquePuuids.add(data.puuid);
                    this.logMetrics('After PUUID Search');
                    
                    console.log(JSON.stringify({
                        level: 'info',
                        event: 'riot_puuid_found',
                        timestamp: new Date().toISOString(),
                        service: 'riot-api',
                        data: { region, summonerName, tagline: tag }
                    }));
                    
                    return {
                        ...data,
                        region
                    };
                }
            } catch (error) {
                this.metrics.errors.puuidLookup++;
                console.log(JSON.stringify({
                    level: 'error',
                    event: 'riot_puuid_error',
                    timestamp: new Date().toISOString(),
                    service: 'riot-api',
                    error: error.message,
                    data: { region, summonerName, tagline: tag }
                }));
                continue;
            }
        }
        
        this.metrics.errors.puuidLookup++;
        throw new Error(`Player "${summonerName}#${tag}" not found in any region (searched: ${this.regions.join(', ')})`);
    }

    async getMatchStats(puuid, region, gameMode) {
        try {
            console.log(JSON.stringify({
                level: 'info',
                event: 'riot_match_fetch_start',
                timestamp: new Date().toISOString(),
                service: 'riot-api',
                data: { puuid, region, gameMode }
            }));
            
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
                    console.log(JSON.stringify({
                        level: 'warn',
                        event: 'riot_rate_limit',
                        timestamp: new Date().toISOString(),
                        service: 'riot-api',
                        endpoint: 'matches',
                        region
                    }));
                }
                this.metrics.errors.matchFetch++;
                throw new Error(`Failed to fetch match IDs: ${await response.text()}`);
            }

            const matchIds = await response.json();
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

            this.logMetrics('After Match Processing');
            return matchDetails;

        } catch (error) {
            console.log(JSON.stringify({
                level: 'error',
                event: 'riot_match_error',
                timestamp: new Date().toISOString(),
                service: 'riot-api',
                error: error.message,
                data: { puuid, region, gameMode }
            }));
            throw error;
        }
    }

    async getMatchEvents(puuid, region) {
        const matchIds = this.matchIds.get(puuid);
        if (!matchIds || matchIds.length === 0) {
            throw new Error('No match IDs found. Please fetch match stats first.');
        }

        try {
            console.log(JSON.stringify({
                level: 'info',
                event: 'riot_timeline_fetch_start',
                timestamp: new Date().toISOString(),
                service: 'riot-api',
                data: { puuid, region }
            }));

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
            console.log(JSON.stringify({
                level: 'error',
                event: 'riot_timeline_error',
                timestamp: new Date().toISOString(),
                service: 'riot-api',
                error: error.message,
                data: { puuid, region }
            }));
            throw error;
        }
    }
}

export const getRiotData = new RiotAPIService();
