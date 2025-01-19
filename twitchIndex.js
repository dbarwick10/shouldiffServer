import dotenv from 'dotenv';
import { TwitchBot } from './twitch-bot.js';

dotenv.config();

const bot = new TwitchBot();
bot.start().catch(console.error);