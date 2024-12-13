class RiotAPIService {
    constructor() {
        this.apiKey = process.env.RIOT_API_KEY;
        this.matchIds = new Map();
    }

    async getMatchStats(puuid, region, gameMode) {
        try {
            console.log('Fetching match IDs...');
            const matchIdsUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=100&api_key=${this.apiKey}`;
            
            const response = await fetch(matchIdsUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch match IDs: ${await response.text()}`);
            }

            const matchIds = await response.json();
            console.log(`Found ${matchIds.length} matches`);
            
            // Store the match IDs
            this.matchIds.set(puuid, matchIds);

            // Get details for first 5 matches
            const matchDetails = [];
            for (const matchId of matchIds.slice(0, 5)) {
                const matchUrl = `https://${encodeURIComponent(region)}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${this.apiKey}`;
                const matchResponse = await fetch(matchUrl);
                if (matchResponse.ok) {
                    const matchData = await matchResponse.json();
                    matchDetails.push(matchData);
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

            return matchEvents;

        } catch (error) {
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