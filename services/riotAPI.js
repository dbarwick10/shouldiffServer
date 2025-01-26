const MATCH_COUNT = 10;
const DELAY_BETWEEN_REQUESTS = 0;

const QUEUE_MAPPINGS = {
    'aram': 450,       // ARAM
    'normal': 400,     // Normal 5v5 Draft Pick
    'blind': 430,      // Normal 5v5 Blind Pick
    'ranked': 420,     // Ranked Solo/Duo
    'flex': 440,       // Ranked Flex
    'arurf': 900,       // ARURF
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
    }

    async getPuuid(summonerName, tagline) {
        const tag = tagline.replace(/[^a-zA-Z0-9 ]/g, "");
        console.log(`Searching for player: ${summonerName}#${tag}`);
        
        for (const region of this.regions) {
            try {
                const riotUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(summonerName)}/${encodeURIComponent(tag)}`;
                console.log(`Trying region ${region} with URL: ${riotUrl}`);
                
                const response = await fetch(`${riotUrl}?api_key=${this.apiKey}`);
                const responseText = await response.text();
                
                console.log(`Response from ${region}:`, {
                    status: response.status,
                    statusText: response.statusText,
                    body: responseText
                });
                
                if (response.ok) {
                    const data = JSON.parse(responseText);
                    console.log(`Found player in ${region}`);
                    return {
                        ...data,
                        region
                    };
                }
            } catch (error) {
                console.error(`Error searching in ${region}:`, error);
                continue;
            }
        }
        
        // If no region found the player
        throw new Error(`Player "${summonerName}#${tag}" not found in any region (searched: ${this.regions.join(', ')})`);
    }

    // Update getMatchStats to use the region from getPuuid
    async getMatchStats(puuid, region, gameMode) {
        try {
            console.log('Fetching match IDs...');
            
            const queue = gameMode && this.queueMappings[gameMode.toLowerCase()]
                ? this.queueMappings[gameMode.toLowerCase()]
                : null;

            const initialCount = MATCH_COUNT;

            const matchIdsUrl = queue != null 
                ? `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queueid=${encodeURIComponent(queue)}&start=0&count=${initialCount}&api_key=${this.apiKey}`
                : `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${initialCount}&api_key=${this.apiKey}`;
            
            const response = await fetch(matchIdsUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch match IDs: ${await response.text()}`);
            }

            const matchIds = await response.json();
            console.log(`Received ${matchIds.length} matches from API, will process up to ${MATCH_COUNT}`);
                        
            this.matchIds.set(puuid, matchIds);

            const matchDetails = [];
            for (const matchId of matchIds) {
                if (matchDetails.length >= MATCH_COUNT) break; 

                const matchUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${this.apiKey}`;
                const matchResponse = await fetch(matchUrl);
                
                if (matchResponse.ok) {
                    const matchData = await matchResponse.json();
                    
                    if (!queue || matchData.info.queueId === queue) {
                        matchDetails.push(matchData);
                        // console.log(`Added Match Stats. Current count: ${matchDetails.length}/${MATCH_COUNT}`);
                    }
                } else {
                    console.error(`Failed to fetch match ${matchId}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
            }

            return matchDetails;

        } catch (error) {
            console.error('Error in getMatchStats:', error);
            throw error;
        }
    }

    // getMatchEvents remains the same but uses the region from getPuuid
    async getMatchEvents(puuid, region) {
        const matchIds = this.matchIds.get(puuid);
        if (!matchIds || matchIds.length === 0) {
            throw new Error('No match IDs found. Please fetch match stats first.');
        }

        try {
            const matchEvents = [];
            for (const matchId of matchIds.slice(0, MATCH_COUNT)) {
                const timelineUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline?api_key=${this.apiKey}`;
                const response = await fetch(timelineUrl);
                if (response.ok) {
                    const eventData = await response.json();
                    matchEvents.push(eventData);
                    // console.log(`Analyzing Match Events. Current count: ${matchEvents.length}/${MATCH_COUNT}`);
                } else {
                    console.error(`Failed to fetch events for match ${matchId}`);
                }
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
            }

            this.matchIds.delete(puuid);
            return matchEvents;

        } catch (error) {
            this.matchIds.delete(puuid);
            console.error('Error in getMatchEvents:', error);
            throw error;
        }
    }
}

export const getRiotData = new RiotAPIService();
