import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';
import apiRoutes from './api/routes.js';
import { DiscordBot } from './discordBot.js';
import { TwitchBot } from './twitchBot.js';
import { initializeCache } from './features/getItemsAndPrices.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Create a promise for server startup that must resolve first
        const serverStartPromise = new Promise((resolve) => {
            const server = app.listen(PORT, () => {
                console.log(`Server successfully started on port ${PORT}`);
                resolve(server);
            });
        });

        // Wait for server to start before proceeding with other initializations
        await serverStartPromise;

        // Now we can proceed with other initializations
        await initializeCache();
        console.log('Item cache initialized successfully');

        // Set up your middleware
        app.use(cors({
            origin: function(origin, callback) {
                const allowedOrigins = [
                    'http://127.0.0.1:5501',        
                    'http://localhost:5501',         
                    'http://127.0.0.1:10000',        
                    'http://localhost:10000',         
                    'https://shouldiff.netlify.app',
                    'http://shouldiff.com',
                    'http://test.shouldiff.com',
                    'https://test.shouldiff.com',
                    'https://shouldiff.com',
                    'https://dbarwick10.github.io',
                    'https://dbarwick10.github.io/shouldiff/',
                    'https://shouldiffserver-new.onrender.com',
                    'http://shouldiff.ddns.net:3000',
                    'https://shouldiff.ddns.net:3000',
                    'https://xd5sjj-3000.csb.app',
                    'https://shouldiff-jqmo--3000--1b4252dd.local-credentialless.webcontainer.io'
                ];
                
                if (!origin) return callback(null, true);
                
                if (allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    console.log('Origin not allowed:', origin);
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Content-Type', 
                'Authorization', 
                'Origin', 
                'Access-Control-Allow-Origin', 
                'Accept',
                'Client-ID',
                'client-id'
            ]
        }));

        app.use(express.json());

        app.use((req, res, next) => {
            res.on('finish', () => {
                console.log(`Memory usage after ${req.method} ${req.url}:`, getMemoryStats());
            });
            next();
        });

        // Routes
        app.use('/api', apiRoutes);
        app.use(express.static(path.join(__dirname, 'public')));

        // Error handling middleware
        app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(err.status || 500).json({ error: err.message });
        });

        function formatMemoryUsage(bytes) {
            return `${Math.round(bytes / 1024 / 1024 * 100) / 100} MB`;
        }

        function getMemoryStats() {
            const memoryData = process.memoryUsage();
            return {
                rss: formatMemoryUsage(memoryData.rss), 
                heapTotal: formatMemoryUsage(memoryData.heapTotal),
                heapUsed: formatMemoryUsage(memoryData.heapUsed),
                external: formatMemoryUsage(memoryData.external)
            };
        }

        // Set up intervals for memory logging and cache refresh
        const MEMORY_LOG_INTERVAL = 600000;
        setInterval(() => {
            console.log('Periodic memory check:', getMemoryStats());
        }, MEMORY_LOG_INTERVAL);

        const CACHE_REFRESH_INTERVAL = 1000 * 60 * 60 * 12; // 12 hour
        setInterval(async () => {
            try {
                await initializeCache();
                console.log('Item cache refreshed successfully');
            } catch (error) {
                console.error('Failed to refresh item cache:', error);
            }
        }, CACHE_REFRESH_INTERVAL);

        // Initialize Discord bot after server is running
        const discordBot = new DiscordBot(app);
        await discordBot.start(process.env.DISCORD_BOT_TOKEN);
        const twitchBot = new TwitchBot({ app, discord: discordBot.client });
        await twitchBot.start();

        console.log('Server initialization complete');
        console.log('Available endpoints:');
        console.log('  - GET /api/stats');
        console.log('  & discordBot');
        console.log('  & twitchBot');

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Add global error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    process.exit(1);
});

startServer();