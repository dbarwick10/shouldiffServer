// This module implements a Discord bot that generates statistical charts for League of Legends players
import { Client, IntentsBitField, SlashCommandBuilder } from 'discord.js';
import { createCanvas } from 'canvas';
import { Chart } from 'chart.js/auto';
import { allowedServers, DISCORD_TESTING } from './config/constaints.js';

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

        // Add reconnection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectTimeout = 5000; // 5 seconds

        this.setupEventHandlers();
        console.log('Discord bot initialized');
    }

    setupEventHandlers() {
        // Ready event
        this.client.once('ready', async () => {
            console.log(`Discord bot is ready! Logged in as ${this.client.user.tag}`);
            this.reconnectAttempts = 0;
            await this.registerCommands();
        });
    
        // Handle commands
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isCommand()) return;
            console.log(`Received command: ${interaction.commandName}`);
            await this.handleCommand(interaction);
        });

        // Disconnect handler
        this.client.on('disconnect', async (event) => {
            console.log('Bot disconnected from Discord:', event);
            await this.handleDisconnect();
        });

        // Error handler
        this.client.on('error', async (error) => {
            console.error('Discord client error:', error);
            await this.handleDisconnect();
        });

        // Debug and warning logging
        this.client.on('debug', (info) => console.log('Discord Debug:', info));
        this.client.on('warn', (info) => console.warn('Discord Warning:', info));

        // Reconnection handlers
        this.client.on('reconnecting', () => {
            console.log('Bot is attempting to reconnect...');
        });

        this.client.on('resumed', (replayed) => {
            console.log(`Bot connection resumed. ${replayed} events replayed.`);
            this.reconnectAttempts = 0;
        });
    }

    async handleDisconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached. Please check the bot\'s token and connection.');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectTimeout * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Attempting to reconnect in ${delay/1000} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(async () => {
            try {
                if (!this.client.isReady()) {
                    await this.client.login(process.env.DISCORD_BOT_TOKEN);
                    console.log('Reconnection successful!');
                }
            } catch (error) {
                console.error('Reconnection attempt failed:', error);
                await this.handleDisconnect();
            }
        }, delay);
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
                            // { name: 'All Games', value: 'all' },
                            { name: 'Ranked Solo/Duo', value: 'ranked' },
                            { name: 'Ranked Flex', value: 'flex' },
                            { name: 'Normal Draft', value: 'normal' },
                            { name: 'Normal Blind', value: 'blind' },
                            { name: 'ARAM', value: 'aram' },
                            { name: 'URF', value: 'urf' },
                            { name: 'Ultimate Spellbook', value: 'ultbook' }
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
                .addStringOption(option =>
                    option.setName('perspective')
                        .setDescription('Choose whose stats to view')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Player Stats', value: 'playerStats' },
                            { name: 'Team Stats', value: 'teamStats' },
                            { name: 'Enemy Team Stats', value: 'enemyStats' }
                        ))
                .addBooleanOption(option =>
                    option.setName('showlastgame')
                        .setDescription('Show last game data (if available)')
                        .setRequired(false))
        ];

        try {
            await this.client.application?.commands.set(commands);
            console.log('Discord commands registered successfully!');
        } catch (error) {
            console.error('Error registering Discord commands:', error);
        }
    }

    async handleCommand(interaction) {

    if (!allowedServers.includes(interaction.guild.name)) {
        return await interaction.reply({
            content: 'This bot is only available in official partner servers.',
            ephemeral: true
        });
    } else if(allowedServers.includes(interaction.guild.name)) {
        console.log('Approved. Server name:', interaction.guild.name);
    }

        if (interaction.commandName !== 'stats') return;

        await interaction.deferReply();

        try {
            const summoner = interaction.options.getString('summoner');
            const tagline = interaction.options.getString('tagline');
            const gameMode = interaction.options.getString('gamemode');
            const statType = interaction.options.getString('stat');
            const perspective = interaction.options.getString('perspective') || 'playerStats';
            const showLastGame = interaction.options.getBoolean('showlastgame') ?? true;

            console.log('Processing stats request for:', { 
                summoner, 
                tagline, 
                gameMode, 
                statType,
                perspective,
                showLastGame 
            });
            
            const statsData = await this.fetchStatsData(summoner, tagline, gameMode);
            const chartImage = await this.generateChart(
                statsData, 
                statType, 
                summoner,
                tagline, 
                gameMode, 
                perspective,
                showLastGame
            );
            
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
            const testingAPI = 'http://127.0.0.1:3000/api/stats';
            const apiUrl = 'https://shouldiffserver-test.onrender.com/api/stats';
            console.log(`Fetching stats from ${DISCORD_TESTING ? testingAPI : apiUrl}`);
            
            const response = await fetch(DISCORD_TESTING ? testingAPI : apiUrl, {
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

    async generateChart(data, statType, summoner, tagline, gameMode, perspective = 'playerStats', showLastGame = true) {
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
                    latestGameData = this.processEventData(goldHistory?.count || [], 'itemPurchases');
                } else if (statType === 'timeSpentDead') {
                    const deathData = latestGame[perspective].basicStats?.timeSpentDead?.totalDeathTime;
                    latestGameData = this.processEventData(deathData || [], 'timeSpentDead');
                } else {
                    const timestamps = 
                        latestGame[perspective].basicStats?.[statType]?.timestamps || 
                        latestGame[perspective].objectives?.[statType]?.timestamps || 
                        [];
                    latestGameData = this.processEventData(timestamps, statType);
                }
    
                if (latestGameData?.length > 0) {
                    const gameResult = `${latestGame[perspective].outcome.result}` || '';
                    datasets.push({
                        label: !gameResult ? 'Last Game' : `Last Game (${this.formatStatLabel(gameResult)})`,
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
                    const processedData = this.processEventData(eventData, statType);
                    if (processedData?.length > 0) {
                        datasets.push({
                            label: this.formatStatLabel(category),
                            data: processedData,
                            borderColor: this.categoryStyles[category].borderColor,
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
                            color: 'rgba(114, 137, 218, 0.4)',
                            // borderColor: 'rgba(114, 137, 218, 0.2)'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: this.getYAxisLabel(statType),
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
                            color: 'rgba(114, 137, 218, 0.4)',
                            // borderColor: 'rgba(114, 137, 218, 0.2)'
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
                            `${summoner}#${tagline}${perspectiveLabel}'s ${this.formatStatLabel(statType)}:`,
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

    processEventData(events, statType) {
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
                .sort((a, b) => a.timestamp - b.timestamp)  // Sort by raw timestamp first
                .map(event => ({
                    x: convertToMinutes(event.timestamp),
                    y: statType === 'kda' ? event.kdaValue : event.goldValue
                }));
        }
    
        if (statType === 'timeSpentDead') {
            return events
                .filter(time => time !== null)
                .sort((a, b) => a - b)  // Sort times first
                .map(time => ({
                    x: convertToMinutes(time),  // Use actual time instead of index
                    y: time / 60
                }));
        }
    
        // Default case (turrets)
        return events
            .filter(timestamp => timestamp !== null)
            .sort((a, b) => a - b)  // Sort raw timestamps first
            .map((timestamp, index) => ({
                x: convertToMinutes(timestamp),
                y: index + 1
            }));
    }

    formatStatLabel(statType) {
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

    getYAxisLabel(statType) {
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

    // formatStatLabel(statType) {
    //     return statType
    //         .replace(/([A-Z])/g, ' $1')
    //         .split(/[^a-zA-Z0-9#]+/)
    //         .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    //         .join(' ');
    // }

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
            await this.handleDisconnect();
        }
    }

    async shutdown() {
        try {
            await this.client.destroy();
            console.log('Discord bot successfully shut down');
        } catch (error) {
            console.error('Error during shutdown:', error);
        }
    }
}