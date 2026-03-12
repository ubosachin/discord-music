const { Events, ActivityType } = require('discord.js');
const { addLog } = require('../utils/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`✅ Logged in as ${client.user.tag}`);
        console.log(`📡 Serving ${client.guilds.cache.size} guild(s)`);
        addLog('INFO', `Bot started: Serving ${client.guilds.cache.size} guilds`);
        client.user.setActivity('/play', { type: ActivityType.Listening });
    },
};
