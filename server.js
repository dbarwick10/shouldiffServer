import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';
import apiRoutes from './api/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
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
        
        // Allow requests with no origin (like mobile apps or curl requests)
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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(err.status || 500).json({ error: err.message });
});

// Function to format memory usage
function formatMemoryUsage(bytes) {
    return `${Math.round(bytes / 1024 / 1024 * 100) / 100} MB`;
}

// Function to get memory stats
function getMemoryStats() {
    const memoryData = process.memoryUsage();
    return {
        rss: formatMemoryUsage(memoryData.rss), // RSS: total memory allocated
        heapTotal: formatMemoryUsage(memoryData.heapTotal), // Total size of allocated heap
        heapUsed: formatMemoryUsage(memoryData.heapUsed), // Actual memory used
        external: formatMemoryUsage(memoryData.external) // Memory used by external C++ objects
    };
}

const MEMORY_LOG_INTERVAL = 600000; // Log every 10 minutes
setInterval(() => {
    console.log('Periodic memory check:', getMemoryStats());
}, MEMORY_LOG_INTERVAL);

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  - GET /api/test');
    console.log('  - GET /api/puuid');
    console.log('  - GET /api/match-stats');
    console.log('  - GET /api/match-events');
});
