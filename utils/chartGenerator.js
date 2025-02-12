// utils/chartGenerator.js
import { createCanvas } from 'canvas';
import { Chart } from 'chart.js/auto';

export class ChartGenerator {
    static categoryStyles = {
        wins: { 
            borderColor: 'rgb(46, 204, 113, .75)' 
        },
        losses: { 
            borderColor: 'rgb(231, 76, 60, .75)' 
        },
        surrenderWins: { 
            borderColor: 'rgb(52, 152, 219, .75)' 
        },
        surrenderLosses: { 
            borderColor: 'rgb(230, 126, 34, .75)' 
        }
    };

    static async generateChart(data, statType, summoner, tagline, gameMode, perspective = 'playerStats', showLastGame = true) {
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');
    
        const stats = data.averageEventTimes?.[perspective];
        if (!stats) {
            throw new Error(`No ${perspective.replace('Stats', '')} statistics available`);
        }
    
        const datasets = [];
        const categories = ['wins', 'losses', 'surrenderWins', 'surrenderLosses'];
    
        // Process latest game data if showLastGame is true
        if (showLastGame) {
            const latestGame = data.averageEventTimes?.latestGame;
            if (latestGame?.[perspective]) {
                let latestGameData;
                if (statType === 'kda') {
                    const kdaHistory = latestGame[perspective].basicStats?.kda?.history;
                    if (kdaHistory && Array.isArray(kdaHistory.count)) {
                        latestGameData = kdaHistory.count.map((kdaValue, index) => ({
                            x: kdaHistory.timestamps[index] / 60,
                            y: kdaValue
                        })).filter(point => point.x != null && point.y != null);
                    }
                } else if (statType === 'itemPurchases') {
                    const goldHistory = latestGame[perspective].economy?.itemGold?.history;
                    latestGameData = ChartGenerator.processEventData(goldHistory?.count || [], 'itemPurchases');
                } else if (statType === 'timeSpentDead') {
                    const deathData = latestGame[perspective].basicStats?.timeSpentDead?.totalDeathTime;
                    latestGameData = ChartGenerator.processEventData(deathData || [], 'timeSpentDead');
                } else {
                    const timestamps = 
                        latestGame[perspective].basicStats?.[statType]?.timestamps || 
                        latestGame[perspective].objectives?.[statType]?.timestamps || 
                        [];
                    latestGameData = ChartGenerator.processEventData(timestamps, statType);
                }
    
                if (latestGameData?.length > 0) {
                    const gameResult = `${latestGame[perspective].outcome.result}` || '';
                    datasets.push({
                        label: !gameResult ? 'Last Game' : `Last Game (${ChartGenerator.formatStatLabel(gameResult)})`,
                        data: latestGameData,
                        borderColor: 'rgb(149, 165, 166, .75)',
                        borderWidth: 2.5,
                        fill: false,
                        tension: 0.1,
                        pointRadius: 1,
                        pointHoverRadius: 2,
                        order: 2
                    });
                }
            }
        }
    
        // Add historical data
        for (const category of categories) {
            if (stats[category]?.[statType]) {
                const eventData = stats[category][statType];
                if (eventData?.length > 0) {
                    const processedData = ChartGenerator.processEventData(eventData, statType);
                    if (processedData?.length > 0) {
                        datasets.push({
                            label: ChartGenerator.formatStatLabel(category),
                            data: processedData,
                            borderColor: ChartGenerator.categoryStyles[category].borderColor,
                            borderWidth: 2,
                            fill: false,
                            tension: 0.1,
                            pointRadius: 1,
                            pointHoverRadius: 2,
                            order: 1000
                        });
                    }
                }
            }
        }
    
        if (datasets.length === 0) {
            throw new Error(`No data available for ${statType}`);
        }
    
        const perspectiveLabel = perspective === 'playerStats' ? '' : 
            ` (${perspective === 'teamStats' ? 'Team' : 'Enemy Team'})`;
    
        ctx.fillStyle = 'rgba(28, 36, 52, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const chart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                backgroundColor: 'rgba(28, 36, 52, 0.85)',
                color: '#a0aec0',
                responsive: false,
                animation: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Game Time (minutes)',
                            padding: { top: 10, bottom: 10 },
                            color: '#d4af37',
                            font: {
                                family: "'Beaufort for LoL', Arial, sans-serif",
                                weight: 600
                            }
                        },
                        ticks: {
                            callback: value => Math.round(value),
                            color: '#a0aec0',
                            font: {
                                family: "'Beaufort for LoL', Arial, sans-serif"
                            }
                        },
                        grid: {
                            color: 'rgba(114, 137, 218, 0.4)'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: ChartGenerator.getYAxisLabel(statType),
                            padding: { top: 10, bottom: 10 },
                            color: '#d4af37',
                            font: {
                                family: "'Beaufort for LoL', Arial, sans-serif",
                                weight: 600
                            }
                        },
                        ticks: {
                            color: '#a0aec0',
                            font: {
                                family: "'Beaufort for LoL', Arial, sans-serif"
                            }
                        },
                        grid: {
                            color: 'rgba(114, 137, 218, 0.4)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'rect',
                            boxWidth: 10,
                            boxHeight: 10,
                            boxFill: true,
                            color: '#a0aec0',
                            font: {
                                family: "'Beaufort for LoL', Arial, sans-serif",
                                size: 12,
                                weight: '500'
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: [
                            `${summoner}#${tagline}${perspectiveLabel}'s ${ChartGenerator.formatStatLabel(statType)}:`,
                            `${gameMode.toUpperCase()} Games`
                        ],
                        padding: { top: 10, bottom: 20 },
                        color: '#d4af37',
                        font: { 
                            family: "'Beaufort for LoL', Arial, sans-serif",
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    layout: {
                        padding: {
                            top: 20,
                            right: 20,
                            bottom: 20,
                            left: 20
                        }
                    }
                }
            }
        });
    
        const buffer = canvas.toBuffer('image/png');
        chart.destroy();
        return buffer;
    }

    static processEventData(events, statType) {
        const convertToMinutes = (timestamp) => {
            return timestamp > 100000 ? timestamp / 60000 : timestamp / 60;
        };
    
        if (!Array.isArray(events)) {
            console.error('Invalid events data:', events);
            return [];
        }
    
        if (statType === 'kda' || statType === 'itemPurchases') {
            return events
                .filter(event => event && typeof event === 'object')
                .sort((a, b) => a.timestamp - b.timestamp)
                .map(event => ({
                    x: convertToMinutes(event.timestamp),
                    y: statType === 'kda' ? event.kdaValue : event.goldValue
                }));
        }
    
        if (statType === 'timeSpentDead') {
            return events
                .filter(time => time !== null)
                .sort((a, b) => a - b)
                .map(time => ({
                    x: convertToMinutes(time),
                    y: time / 60
                }));
        }
    
        return events
            .filter(timestamp => timestamp !== null)
            .sort((a, b) => a - b)
            .map((timestamp, index) => ({
                x: convertToMinutes(timestamp),
                y: index + 1
            }));
    }

    static formatStatLabel(statType) {
        switch(statType) {
            case 'kda':
                return 'KDA';
            case 'itemPurchases':
                return 'Item Value';
            case 'timeSpentDead':
                return 'Total Time Spent Dead';
            case 'hordeKills':
                return 'Voidgrubs';
            case 'eliteMonsterKills':
                return 'Elite Monsters';
            default:
                return statType
                    .replace(/([A-Z])/g, ' $1')
                    .split(/[^a-zA-Z0-9#]+/)
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
        }
    }

    static getYAxisLabel(statType) {
        const labels = {
            kills: 'Number of Kills',
            deaths: 'Number of Deaths',
            assists: 'Number of Assists',
            kda: 'KDA',
            itemPurchases: 'Total Gold Value',
            turrets: 'Turrets Destroyed',
            dragons: 'Dragons Secured',
            barons: 'Barons Secured',
            elders: 'Elder Dragons Secured',
            inhibitors: 'Inhibitors Destroyed',
            timeSpentDead: 'Time Spent Dead (Minutes)'
        };
        return labels[statType] || 'Count';
    }
}