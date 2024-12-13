export async function analyzeMatchTimelineForSummoner(matchStats, puuid) {
    try {
        // Input validation
        if (!matchStats || !puuid) {
            // console.error('Missing required parameters:', { 
            //     hasMatchStats: !!matchStats, 
            //     hasPuuid: !!puuid 
            // });
            return null;
        }

        // Normalize matchStats to handle both direct array and object with matches property
        const matches = Array.isArray(matchStats) ? matchStats : matchStats.matches;

        if (!matches || !Array.isArray(matches)) {
            console.error('Invalid matches data structure');
            return null;
        }

        // Initialize analysis result
        const analysisResult = createInitialAnalysisResult();
        const matchEventsData = []; // Array to collect matchId and allEvents

        // Process each match
        for (const match of matches) {
            const matchId = match.metadata?.matchId;
            if (!matchId) {
                console.error('Match is missing matchId');
                continue;
            }

            if (!match?.info?.frames || !Array.isArray(match.info.frames)) {
                console.error('Match is missing timeline frames');
                continue;
            }

            // console.log(`Processing match ${matchId}`);

            // Collect all events for the match
            const allEvents = [];

            // Process each frame in the match
            for (const frame of match.info.frames) {
                if (!Array.isArray(frame.events)) {
                    console.error('Frame is missing events');
                    continue;
                }

                // Collect events from the frame
                allEvents.push(...frame.events);

                // Process each event in the frame
                for (const event of frame.events) {
                    if (!event?.type) {
                        console.warn('Skipping invalid event', event);
                        continue;
                    }

                    // Handle event using appropriate handler
                    const handler = eventHandlers[event.type];
                    if (handler) {
                        handler(event, analysisResult, matchId);
                    }
                }
            }

            // Log the matchId and all events for the match
            // console.log(`Match ID: ${matchId}, Events:`, allEvents);

            // Collect matchId and allEvents
            matchEventsData.push({ matchId, allEvents });
        }

        // console.log('events complete:', matchEventsData);
        return matchEventsData; // Return the array of matchId and allEvents
    } catch (error) {
        console.error('Error in analyzeMatchTimelineForSummoner:', error);
        return null;
    }
}

function createInitialAnalysisResult() {
    return {
        player: {
            championKills: [],
            buildingKills: [],
            eliteMonsterKills: [],
            itemPurchases: [],
            totalChampionKills: 0,
            totalBuildingKills: 0,
            totalEliteMonsterKills: 0,
            totalItemsPurchased: 0
        },
        team: {
            championKills: 0,
            buildingKills: 0,
            eliteMonsterKills: 0,
            totalGoldSpent: 0,
            totalItemsPurchased: 0
        },
        enemyTeam: {
            championKills: 0,
            buildingKills: 0,
            eliteMonsterKills: 0
        }
    };
}

const eventHandlers = {
    'CHAMPION_KILL': (event, analysisResult, matchId) => {
        analysisResult.player.championKills.push({
            matchId,
            victimId: event.victimId,
            bounty: event.bounty,
            timestamp: event.timestamp,
            position: event.position,
            assistingParticipantIds: event.assistingParticipantIds
        });
        analysisResult.player.totalChampionKills++;
    },
    'BUILDING_KILL': (event, analysisResult, matchId) => {
        analysisResult.player.buildingKills.push({
            matchId,
            buildingType: event.buildingType,
            towerType: event.towerType,
            laneType: event.laneType,
            timestamp: event.timestamp,
            position: event.position
        });
        analysisResult.player.totalBuildingKills++;
    },
    'ITEM_PURCHASED': (event, analysisResult, matchId) => {
        analysisResult.player.itemPurchases.push({
            matchId,
            itemId: event.itemId,
            timestamp: event.timestamp
        });
        analysisResult.player.totalItemsPurchased++;
    },
    'ELITE_MONSTER_KILL': (event, analysisResult, matchId) => {
        analysisResult.player.eliteMonsterKills.push({
            matchId,
            monsterType: event.monsterType,
            monsterSubType: event.monsterSubType || 'N/A',
            timestamp: event.timestamp,
            position: event.position,
            assistingParticipantIds: event.assistingParticipantIds
        });
        analysisResult.player.totalEliteMonsterKills++;
    }
};