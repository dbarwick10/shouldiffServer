// This module implements a Discord bot that generates statistical charts for League of Legends players
// It uses the discord.js library for bot functionality and chart.js for visualization
import { Client, IntentsBitField, SlashCommandBuilder } from 'discord.js';
import { createCanvas } from 'canvas';
import { Chart } from 'chart.js/auto';

export class DiscordBot {
    // Constructor initializes the Discord client with required permissions
    constructor(app) {
        this.app = app;
        
        // Initialize Discord client with necessary intents
        this.client = new Client({
            intents: [
                IntentsBitField.Flags.Guilds,        // Required for basic server interactions
                IntentsBitField.Flags.GuildMessages  // Required for message handling
            ]
        });
        
        this.setupEventHandlers();
        console.log('Discord bot initialized');
    }

    // Set up event handlers for Discord events
    setupEventHandlers() {
        // Triggered once when the bot successfully connects to Discord
        this.client.once('ready', async () => {
            console.log(`Discord bot is ready! Logged in as ${this.client.user.tag}`);
            await this.registerCommands();
        });
    
        // Handles all incoming slash commands
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isCommand()) return;
            console.log(`Received command: ${interaction.commandName}`);
            await this.handleCommand(interaction);
        });
    }

    // Register slash commands that users can use to interact with the bot
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
                            { name: 'Death Timers', value: 'deathTimers' }
                        ))
        ];

        try {
            // Register the commands with Discord
            await this.client.application?.commands.set(commands);
            console.log('Discord commands registered successfully!');
        } catch (error) {
            console.error('Error registering Discord commands:', error);
        }
    }

    // Handle incoming slash commands
    async handleCommand(interaction) {
        if (interaction.commandName !== 'stats') return;

        // Defer the reply to give us time to generate the chart
        await interaction.deferReply();

        try {
            // Get command parameters from the interaction
            const summoner = interaction.options.getString('summoner');
            const tagline = interaction.options.getString('tagline');
            const gameMode = interaction.options.getString('gamemode');
            const statType = interaction.options.getString('stat');

            // Fetch player statistics from our API
            const statsData = await this.fetchStatsData(summoner, tagline, gameMode);
            
            // Generate a chart from the statistics
            const chartImage = await this.generateChart(statsData, statType);
            
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

    // Fetch player statistics from our API
    async fetchStatsData(summoner, tagline, gameMode) {
        try {
            // The production API endpoint for fetching player statistics
            const apiUrl = 'https://shouldiffserver-test.onrender.com/api/stats';
            
            // Log the request for debugging purposes
            console.log(`Fetching stats for ${summoner}#${tagline} in ${gameMode} mode`);
            
            // Make the POST request to the production stats endpoint
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

            // Handle various API response status codes
            if (!response.ok) {
                const errorData = await response.json();
                
                // Handle specific API error cases
                if (response.status === 404) {
                    throw new Error('Player not found. Please check the summoner name and tagline.');
                } else if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please try again in a few minutes.');
                }
                
                // Handle general API errors with more detailed messages
                throw new Error(
                    errorData.error || 
                    errorData.details || 
                    `API error: ${response.status} - ${response.statusText}`
                );
            }

            const data = await response.json();
            
            // Validate the response data structure
            if (!data.averageEventTimes) {
                throw new Error('Invalid data received from API. Required statistics are missing.');
            }

            return data;

        } catch (error) {
            console.error('Error fetching stats data:', error);
            throw new Error(`Failed to fetch player stats: ${error.message}`);
        }
    }

    // Generate a chart visualization of the player statistics
    async generateChart(data, statType) {
        // Create a canvas for the chart
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');

        // Process the data from the API response
        const timeData = data.averageEventTimes?.[statType] || [];
        
        // Convert the time data into chart points
        const chartData = timeData.map((time, index) => ({
            x: time / 60, // Convert to minutes
            y: this.getStatValue(data, statType, index)
        }));

        // Create and configure the chart
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: `${this.formatStatLabel(statType)} Over Time`,
                    data: chartData,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
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
                        text: `${this.formatStatLabel(statType)} Over Time`
                    }
                }
            }
        });

        // Convert the chart to a buffer and clean up
        const buffer = canvas.toBuffer('image/png');
        chart.destroy();

        return buffer;
    }

    // Extract the appropriate value for a given stat type
    getStatValue(data, statType, index) {
        const playerStats = data.playerStats || {};
        const teamStats = data.teamStats || {};
        
        switch (statType) {
            case 'kda':
                return (playerStats.kills + playerStats.assists) / Math.max(1, playerStats.deaths);
            case 'kills':
            case 'deaths':
            case 'assists':
                return playerStats[statType] || 0;
            case 'dragons':
            case 'barons':
            case 'elders':
                return teamStats[statType] || 0;
            default:
                return index + 1; // Fallback for other stats
        }
    }

    // Format stat labels for display
    formatStatLabel(statType) {
        return statType.charAt(0).toUpperCase() + 
               statType.slice(1).replace(/([A-Z])/g, ' $1').trim();
    }

    // Get appropriate Y-axis label for different stat types
    getYAxisLabel(statType) {
        const labels = {
            kills: 'Number of Kills',
            deaths: 'Number of Deaths',
            assists: 'Number of Assists',
            kda: 'KDA Ratio',
            itemPurchases: 'Items Purchased',
            turrets: 'Turrets Destroyed',
            dragons: 'Dragons Secured',
            barons: 'Barons Secured',
            elders: 'Elder Dragons Secured',
            inhibitors: 'Inhibitors Destroyed',
            deathTimers: 'Death Duration (minutes)'
        };
        return labels[statType] || 'Value';
    }

    // Start the Discord bot
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

    // Gracefully shut down the Discord bot
    shutdown() {
        return this.client.destroy();
    }
}