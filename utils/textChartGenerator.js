import { discordImageChannelIds } from '../config/constraints.js';


export async function uploadImage(imageBuffer) {
    try {
        const randomIndex = Math.floor(Math.random() * discordImageChannelIds.length);
        const channelId = discordImageChannelIds[randomIndex];
        
        const discordChannel = await this.app.discord.channels.fetch(channelId);
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