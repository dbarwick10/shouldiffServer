export const BRW = [10, 10, 12, 12, 14, 16, 20, 25, 28, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5];

export function createEmptyTeamStats() {
    return { 
        kills: [], 
        deaths: [],
        timeSpentDead: [],
        totalTimeSpentDead: [],
        assists: [],
        kda: [],
        turrets: [],      
        inhibitors: [],   
        dragons: [],      
        barons: [],       
        elders: [],       
        items: []
    };
}

export function createDefaultStats() {
    return {
        playerStats: createEmptyTeamStats(),
        teamStats: createEmptyTeamStats(),
        enemyStats: createEmptyTeamStats()
    };
}