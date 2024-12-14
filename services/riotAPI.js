class RiotAPIService {
    constructor() {
        this.apiKey = process.env.RIOT_API_KEY;
        this.matchIds = new Map();
        this.queueMappings = {
            'aram': 450,       // ARAM
            'normal': 400,     // Normal 5v5 Draft Pick
            'blind': 430,      // Normal 5v5 Blind Pick
            'ranked': 420,     // Ranked Solo/Duo
            'flex': 440,       // Ranked Flex
            'urf': 1020,       // Ultra Rapid Fire
            'ultbook': 1400,   // Ultimate Spellbook
            'all': null        // All queues
        };
    }

    async getMatchStats(puuid, region, gameMode) {
        try {
            console.log('Fetching match IDs...');
            
            // Determine queue number based on gameMode
            const queue = gameMode && this.queueMappings[gameMode.toLowerCase()]
                ? this.queueMappings[gameMode.toLowerCase()]
                : null;

            // Request more matches initially if filtering by game mode
            const initialCount = queue ? Math.min(100, 5 * 30) : 5;

            // Construct URL with queue parameter if specified
            const matchIdsUrl = queue != null 
                ? `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=${encodeURIComponent(queue)}&start=0&count=${initialCount}&api_key=${this.apiKey}`
                : `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${initialCount}&api_key=${this.apiKey}`;
            
            const response = await fetch(matchIdsUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch match IDs: ${await response.text()}`);
            }

            const matchIds = await response.json();
            console.log(`Found ${matchIds.length} matches`);
            
            // Store the match IDs
            this.matchIds.set(puuid, matchIds);

            const matchDetails = [];
            for (const matchId of matchIds) {
                if (matchDetails.length >= 5) break; // Limit to 5 matches

                const matchUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${this.apiKey}`;
                const matchResponse = await fetch(matchUrl);
                
                if (matchResponse.ok) {
                    const matchData = await matchResponse.json();
                    
                    // Additional filtering if needed
                    if (!queue || matchData.info.queueId === queue) {
                        matchDetails.push(matchData);
                        console.log(`Added match. Current count: ${matchDetails.length}/5`);
                    }
                } else {
                    console.error(`Failed to fetch match ${matchId}`);
                }
                
                // Add a small delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }

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
            const matchEvents = [];
            for (const matchId of matchIds.slice(0, 5)) {
                const timelineUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline?api_key=${this.apiKey}`;
                const response = await fetch(timelineUrl);
                if (response.ok) {
                    const eventData = await response.json();
                    matchEvents.push(eventData);
                } else {
                    console.error(`Failed to fetch events for match ${matchId}`);
                }
                // Add a small delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            this.matchIds.delete(puuid);
            return matchEvents;

        } catch (error) {
            this.matchIds.delete(puuid);
            console.error('Error in getMatchEvents:', error);
            throw error;
        }
    }

    async getPuuid(summonerName, tagline, region) {
        try {
            const riotUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(summonerName)}/${encodeURIComponent(tagline)}`;
            const response = await fetch(`${riotUrl}?api_key=${this.apiKey}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch PUUID: ${await response.text()}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error in getPuuid:', error);
            throw error;
        }
    }
}

export const getRiotData = new RiotAPIService();