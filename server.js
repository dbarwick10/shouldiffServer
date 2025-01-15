import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';
import apiRoutes from './api/routes.js';
import { DiscordBot } from './discordBot.js';
import { initializeCache } from './features/getItemsAndPrices.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;


async function startServer() {
    try {

        await initializeCache();
        console.log('Item cache initialized successfully');

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
                    'https://shouldiff.ddns.net:3000'
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
            allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Access-Control-Allow-Origin', 'Accept']
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

        // static files
        app.use(express.static(path.join(__dirname, 'public')));

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

        const discordBot = new DiscordBot(app);
        await discordBot.start(process.env.DISCORD_BOT_TOKEN);

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
            console.log('Available endpoints:');
            console.log('  - GET /api/test');
            console.log('  - GET /api/puuid');
            console.log('  - GET /api/match-stats');
            console.log('  - GET /api/match-events');
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();