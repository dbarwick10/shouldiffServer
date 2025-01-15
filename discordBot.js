// This module implements a Discord bot that generates statistical charts for League of Legends players
// It handles multiple game outcomes and displays them in a comparative visualization
import { Client, IntentsBitField, SlashCommandBuilder } from 'discord.js';
import { createCanvas } from 'canvas';
import { Chart } from 'chart.js/auto';

export class DiscordBot {
    constructor(app) {
        this.app = app;
        
        // Initialize Discord client with necessary permissions
        this.client = new Client({
            intents: [
                IntentsBitField.Flags.Guilds,
                IntentsBitField.Flags.GuildMessages
            ]
        });
        
        // Define color scheme for different game outcomes
        // Each outcome has both a border color (for the line) and a background color (for area under the line)
        this.categoryStyles = {
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
        
        this.setupEventHandlers();
        console.log('Discord bot initialized');
    }

    setupEventHandlers() {
        // Set up event handler for when the bot is ready
        this.client.once('ready', async () => {
            console.log(`Discord bot is ready! Logged in as ${this.client.user.tag}`);
            await this.registerCommands();
        });
    
        // Handle incoming slash commands
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isCommand()) return;
            console.log(`Received command: ${interaction.commandName}`);
            await this.handleCommand(interaction);
        });
    }

    async registerCommands() {
        // Define the available commands and their options
        const commands = [
            new SlashCommandBuilder()
                .setName('stats')
                .setDescription('Get player statistics chart')
                .addStringOption(option =>
                    option.setName('summoner')
                        .setDescription('Summoner Name')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('tagline')
                        .setDescription('Tagline (e.g., NA1)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('gamemode')
                        .setDescription('Game Mode to analyze')
                        .setRequired(true)
                        .addChoices(
                            { name: 'All Games', value: 'all' },
                            { name: 'Ranked Solo/Duo', value: 'ranked' },
                            { name: 'Normal Draft', value: 'draft' },
                            { name: 'ARAM', value: 'aram' },
                            { name: 'Arena', value: 'arena' }
                        ))
                .addStringOption(option =>
                    option.setName('stat')
                        .setDescription('Stat to display')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Kills', value: 'kills' },
                            { name: 'Deaths', value: 'deaths' },
                            { name: 'Assists', value: 'assists' },
                            { name: 'KDA', value: 'kda' },
                            { name: 'Item Purchases', value: 'itemPurchases' },
                            { name: 'Turrets', value: 'turrets' },
                            { name: 'Dragons', value: 'dragons' },
                            { name: 'Barons', value: 'barons' },
                            { name: 'Elders', value: 'elders' },
                            { name: 'Inhibitors', value: 'inhibitors' },
                            { name: 'Death Timers', value: 'timeSpentDead' }
                        ))
        ];

        try {
            await this.client.application?.commands.set(commands);
            console.log('Discord commands registered successfully!');
        } catch (error) {
            console.error('Error registering Discord commands:', error);
        }
    }

    async handleCommand(interaction) {
        if (interaction.commandName !== 'stats') return;

        // Defer the reply since chart generation might take some time
        await interaction.deferReply();

        try {
            // Get all required parameters from the command
            const summoner = interaction.options.getString('summoner');
            const tagline = interaction.options.getString('tagline');
            const gameMode = interaction.options.getString('gamemode');
            const statType = interaction.options.getString('stat');

            console.log('Processing stats request for:', { summoner, tagline, gameMode, statType });
            
            // Fetch the statistics from our API
            const statsData = await this.fetchStatsData(summoner, tagline, gameMode);
            
            // Generate a chart from the statistics
            const chartImage = await this.generateChart(statsData, statType, summoner);
            
            // Send the chart back to Discord
            await interaction.editReply({
                files: [{
                    attachment: chartImage,
                    name: 'stats-chart.png'
                }]
            });
        } catch (error) {
            console.error('Error processing command:', error);
            await interaction.editReply({
                content: `Error: ${error.message}`,
                ephemeral: true
            });
        }
    }

    async fetchStatsData(summoner, tagline, gameMode) {
        try {
            const apiUrl = 'https://shouldiffserver-test.onrender.com/api/stats';
            console.log(`Fetching stats from ${apiUrl}`);
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    summonerName: summoner,
                    tagLine: tagline,
                    gameMode: gameMode
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 404) {
                    throw new Error('Player not found. Please check the summoner name and tagline.');
                } else if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please try again in a few minutes.');
                }
                throw new Error(
                    errorData.error || 
                    errorData.details || 
                    `API error: ${response.status} - ${response.statusText}`
                );
            }

            const data = await response.json();
            
            if (!data.averageEventTimes) {
                throw new Error('Invalid data received from API. Required statistics are missing.');
            }

            return data;
        } catch (error) {
            console.error('Error fetching stats data:', error);
            throw new Error(`Failed to fetch player stats: ${error.message}`);
        }
    }

    async generateChart(data, statType, summoner) {
        // Debug logging to see what data we're receiving
        console.log('Data received in generateChart:', {
            hasData: !!data,
            hasAverageEventTimes: !!data?.averageEventTimes,
            playerStats: !!data?.averageEventTimes?.playerStats,
            latestGame: !!data?.averageEventTimes?.latestGame,
            statType,
            summoner
        });
    
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');
    
        // Get both aggregate data and latest game stats from our data structure
        const playerStats = data.averageEventTimes?.playerStats;
        
        // Initialize arrays to hold our datasets
        const datasets = [];
        const categories = ['wins', 'losses', 'surrenderWins', 'surrenderLosses'];
    
        // Process historical average data first
        for (const category of categories) {
            if (playerStats?.[category]?.[statType]) {
                const eventData = playerStats[category][statType];
                if (eventData && eventData.length > 0) {
                    console.log(`Processing ${category} data:`, {
                        dataLength: eventData.length,
                        sampleData: eventData.slice(0, 3)
                    });
                    
                    const processedData = this.processEventData(eventData, statType);
                    if (processedData.length > 0) {
                        datasets.push({
                            label: `Average ${this.formatCategoryLabel(category)}`,
                            data: processedData,
                            borderColor: this.categoryStyles[category].borderColor,
                            borderDash: [5, 5],  // Dashed lines for averages
                            borderWidth: 2,
                            fill: false,
                            tension: 0.1,
                            pointRadius: 1,
                            pointHoverRadius: 2,
                            order: 2  // Averages appear behind latest game
                        });
                    }
                }
            }
        }
    
        // Then try to add latest game data if available
        const latestGame = data.averageEventTimes?.latestGame;
        if (latestGame) {
            console.log('Processing latest game data:', {
                hasOutcome: !!latestGame.playerStats?.outcome,
                statType,
                availableData: Object.keys(latestGame.playerStats || {})
            });
    
            try {
                let latestGameData;
                if (statType === 'kda' || statType === 'itemPurchases') {
                    const rawData = latestGame.playerStats.basicStats?.[statType]?.history?.raw || [];
                    latestGameData = this.processEventData(rawData, statType);
                } else if (statType === 'timeSpentDead') {
                    const deathData = latestGame.playerStats.basicStats?.timeSpentDead?.totalDeathTime || [];
                    latestGameData = this.processEventData(deathData, statType);
                } else {
                    const timestamps = 
                        latestGame.playerStats.basicStats?.[statType]?.timestamps || 
                        latestGame.playerStats.objectives?.[statType]?.timestamps || 
                        [];
                    latestGameData = this.processEventData(timestamps, statType);
                }
    
                if (latestGameData && latestGameData.length > 0) {
                    const gameResult = latestGame.playerStats.outcome?.result || 'unknown';
                    datasets.push({
                        label: 'Latest Game',
                        data: latestGameData,
                        borderColor: this.categoryStyles[gameResult]?.borderColor || 'rgb(75, 192, 192)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.1,
                        pointRadius: 2,
                        pointHoverRadius: 3,
                        order: 1
                    });
                }
            } catch (error) {
                console.error('Error processing latest game data:', error);
            }
        }
    
        // Proceed with chart creation if we have any data
        if (datasets.length === 0) {
            throw new Error(`No data available for ${statType}`);
        }
    
        console.log('Creating chart with datasets:', {
            numberOfDatasets: datasets.length,
            datasetLabels: datasets.map(d => d.label)
        });
    
        // Create the chart
        const chart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: false,
                animation: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Time (minutes)',
                            padding: { top: 10, bottom: 10 }
                        },
                        ticks: {
                            callback: value => Math.round(value)
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: this.getYAxisLabel(statType),
                            padding: { top: 10, bottom: 10 }
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
                            filter: function(legendItem, data) {
                                return data.datasets[legendItem.datasetIndex].data.length > 0;
                            },
                            font: {
                                size: 12
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: [
                            `${summoner}'s ${this.formatStatLabel(statType)}`,
                            'Latest Game vs Historical Averages'
                        ],
                        padding: { top: 10, bottom: 20 },
                        font: { 
                            size: 16,
                            weight: 'bold'
                        }
                    }
                }
            }
        });
    
        const buffer = canvas.toBuffer('image/png');
        chart.destroy();
        return buffer;
    }

    processEventData(events, statType) {
        // Helper function to convert timestamps to minutes properly
        const convertToMinutes = (timestamp) => {
            // If timestamp is already in seconds (less than 100000), just divide by 60
            // If timestamp is in milliseconds (greater than 100000), divide by 60000
            return timestamp > 100000 ? timestamp / 60000 : timestamp / 60;
        };
        if (!Array.isArray(events)) {
            console.error('Invalid events data:', events);
            return [];
        }

        // Handle KDA and itemPurchases which have complex object structure
        if (statType === 'kda' || statType === 'itemPurchases') {
            return events
                .filter(event => event && typeof event === 'object')
                .map(event => ({
                    x: convertToMinutes(event.timestamp), // Convert to minutes using helper function
                    y: statType === 'kda' ? event.kdaValue : event.goldValue
                }))
                .sort((a, b) => a.x - b.x); // Ensure chronological order
        }

        // Handle timeSpentDead specially
        if (statType === 'timeSpentDead') {
            return events
                .filter(time => time !== null)
                .map((time, index) => ({
                    x: index,
                    y: time / 1000 // Convert ms to seconds
                }));
        }

        // Handle simple event timestamps (kills, deaths, etc)
        return events
            .filter(timestamp => timestamp !== null)
            .map((timestamp, index) => ({
                x: convertToMinutes(timestamp), // Convert to minutes using helper function
                y: index + 1 // Cumulative count
            }))
            .sort((a, b) => a.x - b.x);
    }

    formatCategoryLabel(category) {
        return category
            .replace(/([A-Z])/g, ' $1')
            .split(/[^a-zA-Z0-9]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    getYAxisLabel(statType) {
        const labels = {
            kills: 'Number of Kills',
            deaths: 'Number of Deaths',
            assists: 'Number of Assists',
            kda: 'KDA Ratio',
            itemPurchases: 'Total Gold Value',
            turrets: 'Turrets Destroyed',
            dragons: 'Dragons Secured',
            barons: 'Barons Secured',
            elders: 'Elder Dragons Secured',
            inhibitors: 'Inhibitors Destroyed',
            timeSpentDead: 'Time (seconds)'
        };
        return labels[statType] || 'Count';
    }

    formatStatLabel(statType) {
        return statType
            .replace(/([A-Z])/g, ' $1')
            .split(/[^a-zA-Z0-9]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    async start(token) {
        if (!token) {
            console.error('No Discord bot token provided!');
            throw new Error('Discord bot token is required');
        }
        
        try {
            await this.client.login(token);
            console.log('Discord bot successfully logged in');
        } catch (error) {
            console.error('Failed to start Discord bot:', error);
            throw error;
        }
    }

    shutdown() {
        return this.client.destroy();
    }
}