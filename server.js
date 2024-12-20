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
    origin: [
        'http://127.0.0.1:5501',        
        'http://localhost:5501',         
        'http://127.0.0.1:10000',        
        'http://localhost:10000',         
        'https://shouldiff.netlify.app',
        'http://shouldiff.com',
        'https://shouldiff.com',
        'https://dbarwick10.github.io',  // Changed to base domain
        'https://dbarwick10.github.io/shouldiff/',
        'https://shouldiffserver-new.onrender.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
    credentials: true,
    maxAge: 86400 // Cache preflight requests for 24 hours
}));

// Add explicit CORS headers middleware after the cors() middleware
app.use((req, res, next) => {
    // Get the origin from the request
    const origin = req.headers.origin;
    
    // Check if the origin is in our allowed list
    if (origin && origin.match(/(localhost|127\.0\.0\.1|shouldiff\.netlify\.app|dbarwick10\.github\.io)/)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

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
