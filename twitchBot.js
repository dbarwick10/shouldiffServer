import { ChatClient } from '@twurple/chat';
import { StaticAuthProvider } from '@twurple/auth';
import { DiscordBot } from './discordBot.js';
import { allowedChannels, TWITCH_TESTING, discordImageChannelIds } from './config/constraints.js';
import { ChartGenerator } from './utils/chartGenerator.js';

export class TwitchBot {
    constructor({ app }) {
        this.app = app;
        
        // Available game modes
        this.gameModes = {
            ranked: { name: 'Ranked Solo/Duo', value: 'ranked' },
            flex: { name: 'Ranked Flex', value: 'flex' },
            normal: { name: 'Normal Draft', value: 'normal' },
            blind: { name: 'Normal Blind', value: 'blind' },
            aram: { name: 'ARAM', value: 'aram' },
            urf: { name: 'URF', value: 'urf' },
            ultbook: { name: 'Ultimate Spellbook', value: 'ultbook' }
        };

        // Available stats with names
        this.stats = {
            kills: { name: 'Kills', value: 'kills' },
            deaths: { name: 'Deaths', value: 'deaths' },
            assists: { name: 'Assists', value: 'assists' },
            kda: { name: 'KDA', value: 'kda' },
            itemPurchases: { name: 'Item Purchases', value: 'itemPurchases' },
            turrets: { name: 'Turrets', value: 'turrets' },
            dragons: { name: 'Dragons', value: 'dragons' },
            barons: { name: 'Barons', value: 'barons' },
            elders: { name: 'Elders', value: 'elders' },
            inhibitors: { name: 'Inhibitors', value: 'inhibitors' },
            timeSpentDead: { name: 'Death Timers', value: 'timeSpentDead' }
        };

        this.setupEventHandlers();
        console.log('Twitch bot initialized');
    }

    setupEventHandlers() {
        // Initialize authentication and chat client
        const authProvider = new StaticAuthProvider(
            process.env.TWITCH_CLIENT_ID,
            process.env.TWITCH_ACCESS_TOKEN
        );

        this.chatClient = new ChatClient({
            authProvider,
            channels: allowedChannels
        });

        // Handle chat messages
        this.chatClient.onMessage(async (channel, user, message, msg) => {
            if (message.startsWith('!stats')) {
                await this.handleStatsCommand(channel, user, message);
            } else if (message === '!help') {
                await this.handleHelpCommand(channel);
            }
        });

        // Handle connection events
        this.chatClient.onConnect(() => {
            console.log('Connected to Twitch chat');
        });

        this.chatClient.onDisconnect((manually, reason) => {
            console.log('Disconnected from Twitch chat:', reason);
            if (!manually) {
                this.handleReconnect();
            }
        });
    }

    async uploadImage(imageBuffer) {
        try {
            const randomIndex = Math.floor(Math.random() * discordImageChannelIds.length);
            const channelId = discordImageChannelIds[randomIndex];
            const discordChannel = await DiscordBot.channels.cache.get(channelId);
            if (!discordChannel) {
                throw new Error('Could not access Discord channel');
            }
            
            const attachment = { files: [{ attachment: imageBuffer, name: 'stats.png' }] };
            const message = await discordChannel.send(attachment);
            
            if (!message.attachments.first()) {
                throw new Error('Failed to upload image to Discord');
            }
            
            return message.attachments.first().url;
        } catch (error) {
            console.error('Error uploading image to Discord:', error);
            throw new Error('Failed to upload image');
        }
    }

    async handleStatsCommand(channel, user, message) {
        try {
            const args = message.split(' ').slice(1);
            if (args.length < 4) {
                throw new Error('Usage: !stats <summoner> <tagline> <gamemode> <stat> [perspective] [showlastgame]');
            }

            const [summoner, tagline, gameMode, statType] = args;
            const perspective = args[4] || 'playerStats';
            const showLastGame = args[5] === 'true';

            if (!Object.values(this.gameModes).find(mode => mode.value === gameMode)) {
                throw new Error('Invalid game mode. Use !help for available options.');
            }
            if (!Object.values(this.stats).find(stat => stat.value === statType)) {
                throw new Error('Invalid stat type. Use !help for available options.');
            }

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

            const imageUrl = await this.uploadImage(chartImage);
            
            this.chatClient.say(channel, `@${user} Here are your stats: ${imageUrl}`);

        } catch (error) {
            this.chatClient.say(channel, `@${user} Error: ${error.message}`);
        }
    }

    async handleHelpCommand(channel) {
        const gameModeList = Object.values(this.gameModes)
            .map(mode => `${mode.value} (${mode.name})`)
            .join(', ');
            
        const statsList = Object.values(this.stats)
            .map(stat => `${stat.value} (${stat.name})`)
            .join(', ');

        const helpMessage = [
            'Usage: !stats <summoner> <tagline> <gamemode> <stat> [perspective] [showlastgame]',
            'Game modes: ' + gameModeList,
            'Stats: ' + statsList,
            'Perspective: playerStats, teamStats, enemyStats',
            'ShowLastGame: true/false'
        ].join(' | ');
        
        this.chatClient.say(channel, helpMessage);
    }

    async fetchStatsData(summoner, tagline, gameMode) {
        try {
            const testingAPI = 'http://127.0.0.1:3000/api/stats';
            const apiUrl = 'https://shouldiffserver-test.onrender.com/api/stats';
            console.log(`Fetching stats from ${TWITCH_TESTING ? testingAPI : apiUrl}`);
            
            const response = await fetch(TWITCH_TESTING ? testingAPI : apiUrl, {
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

    async start() {
        try {
            await this.chatClient.connect();
            console.log('Twitch bot started successfully');
        } catch (error) {
            console.error('Failed to start Twitch bot:', error);
            throw error;
        }
    }

    async generateChart(data, statType, summoner, tagline, gameMode, perspective, showLastGame) {
        return await ChartGenerator.generateChart(
            data,
            statType,
            summoner,
            tagline,
            gameMode,
            perspective,
            showLastGame
        );
    }

    async handleReconnect() {
        try {
            await this.chatClient.connect();
            console.log('Reconnected to Twitch chat');
        } catch (error) {
            console.error('Failed to reconnect:', error);
            // Implement exponential backoff retry logic if needed
        }
    }

    async shutdown() {
        try {
            await this.chatClient.quit();
            console.log('Twitch bot shut down successfully');
        } catch (error) {
            console.error('Error during shutdown:', error);
        }
    }
}