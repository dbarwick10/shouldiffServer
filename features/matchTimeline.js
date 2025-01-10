export async function analyzeMatchTimelineForSummoner(matchStats, puuid) {
    try {
        if (!matchStats || !puuid) {
            return null;
        }

        const matches = Array.isArray(matchStats) ? matchStats : matchStats.matches;

        if (!matches || !Array.isArray(matches)) {
            console.error('Invalid matches data structure');
            return null;
        }

        const analysisResult = createInitialAnalysisResult();
        const matchEventsData = [];

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

            const allEvents = [];

            for (const frame of match.info.frames) {
                if (!Array.isArray(frame.events)) {
                    console.error('Frame is missing events');
                    continue;
                }

                allEvents.push(...frame.events);

                for (const event of frame.events) {
                    if (!event?.type) {
                        console.warn('Skipping invalid event', event);
                        continue;
                    }

                    const handler = eventHandlers[event.type];
                    if (handler) {
                        handler(event, analysisResult, matchId);
                    }
                }
            }

            matchEventsData.push({ matchId, allEvents });
        }

        return matchEventsData;
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