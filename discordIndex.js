import dotenv from 'dotenv';
import StatsBot from './bot.js';

dotenv.config();

const bot = new StatsBot();
bot.start(process.env.DISCORD_BOT_TOKEN);