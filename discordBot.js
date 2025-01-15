// This module implements a Discord bot that generates statistical charts for League of Legends players
import { Client, IntentsBitField, SlashCommandBuilder } from 'discord.js';
import { createCanvas } from 'canvas';
import { Chart } from 'chart.js/auto';

export class DiscordBot {
    constructor(app) {
        this.app = app;
        
        this.client = new Client({
            intents: [
                IntentsBitField.Flags.Guilds,
                IntentsBitField.Flags.GuildMessages
            ]
        });
        
        this.setupEventHandlers();
        console.log('Discord bot initialized');
    }

    setupEventHandlers() {
        this.client.once('ready', async () => {
            console.log(`Discord bot is ready! Logged in as ${this.client.user.tag}`);
            await this.registerCommands();
        });
    
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isCommand()) return;
            console.log(`Received command: ${interaction.commandName}`);
            await this.handleCommand(interaction);
        });
    }

    async registerCommands() {
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

        await interaction.deferReply();

        try {
            const summoner = interaction.options.getString('summoner');
            const tagline = interaction.options.getString('tagline');
            const gameMode = interaction.options.getString('gamemode');
            const statType = interaction.options.getString('stat');

            console.log('Fetching stats for:', { summoner, tagline, gameMode, statType });
            
            const statsData = await this.fetchStatsData(summoner, tagline, gameMode);
            console.log('Received stats data:', statsData);
            
            const chartImage = await this.generateChart(statsData, statType);
            
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

    async generateChart(data, statType) {
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');

        // Debug log the data structure
        console.log('Data structure received:', {
            hasAverageEventTimes: !!data.averageEventTimes,
            playerStats: data.averageEventTimes?.playerStats ? 
                Object.keys(data.averageEventTimes.playerStats) : [],
            statType
        });

        // First, get the playerStats data
        const playerStats = data.averageEventTimes?.playerStats;
        if (!playerStats) {
            throw new Error('No player statistics available');
        }

        // Find a category with data
        const categories = ['wins', 'losses', 'surrenderWins', 'surrenderLosses'];
        let selectedCategory = null;
        let eventData = null;

        for (const category of categories) {
            if (playerStats[category] && playerStats[category][statType]) {
                console.log(`Found data in category ${category}:`, 
                    playerStats[category][statType]
                );
                if (playerStats[category][statType].length > 0) {
                    selectedCategory = category;
                    eventData = playerStats[category][statType];
                    break;
                }
            }
        }

        if (!selectedCategory || !eventData) {
            throw new Error(`No data found for ${statType} in any game category`);
        }

        console.log('Selected category:', selectedCategory);
        console.log('Event data sample:', eventData.slice(0, 3));

        // Create the chart
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: this.getChartLabel(statType),
                    data: chartData,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                responsive: false,
                animation: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Time (minutes)'
                        }
                    },
                    y: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: this.getYAxisLabel(statType)
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: `${this.formatStatLabel(statType)} Over Time (${category})`
                    }
                }
            }
        });

        const buffer = canvas.toBuffer('image/png');
        chart.destroy();
        return buffer;
    }

    processEventData(events, statType) {
        if (!Array.isArray(events)) {
            console.error('Invalid events data:', events);
            return [];
        }

        // Handle complex stats (KDA and itemPurchases)
        if (statType === 'kda' || statType === 'itemPurchases') {
            return events
                .filter(event => event && typeof event === 'object')
                .map(event => ({
                    x: event.timestamp / 60000, // Convert ms to minutes
                    y: statType === 'kda' ? event.kdaValue : event.goldValue
                }));
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
                x: timestamp / 60000, // Convert ms to minutes
                y: index + 1 // Cumulative count
            }))
            .sort((a, b) => a.x - b.x); // Ensure chronological order
    }

    getChartLabel(statType) {
        const labels = {
            kills: 'Cumulative Kills',
            deaths: 'Cumulative Deaths',
            assists: 'Cumulative Assists',
            kda: 'KDA Ratio',
            itemPurchases: 'Total Gold',
            turrets: 'Turrets Destroyed',
            dragons: 'Dragons Secured',
            barons: 'Barons Secured',
            elders: 'Elder Dragons Secured',
            inhibitors: 'Inhibitors Destroyed',
            timeSpentDead: 'Death Duration'
        };
        return labels[statType] || statType;
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
            .replace(/([A-Z])/g, ' $1') // Add spaces before capital letters
            .split(/[^a-zA-Z0-9]+/) // Split on non-alphanumeric characters
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize first letter
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