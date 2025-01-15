// src/discordBot.js
import { Client, IntentsBitField, SlashCommandBuilder } from 'discord.js';
import { createCanvas } from 'canvas';
import { Chart } from 'chart.js/auto';

export class DiscordBot {
    constructor(app) {
        this.app = app;
        
        this.client = new Client({
            intents: [
                IntentsBitField.Flags.Guilds,            // Basic server interaction
                IntentsBitField.Flags.GuildMessages      // Message handling
                // Removed MessageContent since we don't need it for slash commands
            ]
        });
        
        this.setupEventHandlers();
        console.log('Discord bot initialized');
    }

    setupEventHandlers() {
        this.client.once('ready', async () => {
            console.log(`Discord bot is ready! Logged in as ${this.client.user.tag}`);
            // Call registerCommands when bot is ready
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
                            { name: 'Death Timers', value: 'deathTimers' }
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

            // Use your existing API endpoint through Express router
            const statsData = await this.fetchStatsData(summoner, tagline, gameMode);
            
            // Create chart image from the data
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
                content: 'Error generating chart. Please try again.',
                ephemeral: true
            });
        }
    }

    async fetchStatsData(summoner, tagline, gameMode) {
        // Call your existing stats endpoint internally
        return new Promise((resolve, reject) => {
            const req = {
                body: {
                    summonerName: summoner,
                    tagLine: tagline,
                    gameMode: gameMode
                }
            };
            
            const res = {
                json: resolve,
                status: function(code) {
                    if (code !== 200) {
                        reject(new Error(`Server responded with status ${code}`));
                    }
                    return this;
                }
            };

            // Use your existing API route handler
            this.app._router.handle(req, res, (err) => {
                if (err) reject(err);
            });
        });
    }

    async generateChart(data, statType) {
        // Create a canvas for the chart
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');

        const datasets = [];

        // Process the data based on the stat type
        if (data.averageEventTimes?.[statType]) {
            datasets.push({
                label: `${statType} Over Time`,
                data: this.processStatData(data.averageEventTimes[statType], statType),
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            });
        }

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
                        text: `${statType.charAt(0).toUpperCase() + statType.slice(1)} Over Time`
                    }
                }
            }
        });

        // Convert to buffer and clean up
        const buffer = canvas.toBuffer('image/png');
        chart.destroy();

        return buffer;
    }

    processStatData(data, statType) {
        // Convert time-based data into chart points
        return data.map((time, index) => ({
            x: time / 60, // Convert to minutes
            y: index + 1
        }));
    }

    getYAxisLabel(statType) {
        // Return appropriate Y-axis label based on stat type
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