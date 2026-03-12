require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { setupPlayDl } = require('./utils/playdlSetup');
const { startDashboard } = require('./dashboard');
const { keepAlive } = require('./utils/keepAlive');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
    ],
});

client.commands = new Collection();
client.players  = new Map();

// Load Commands
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
    const cmd = require(path.join(__dirname, 'commands', file));
    if ('data' in cmd && 'execute' in cmd) client.commands.set(cmd.data.name, cmd);
}

// Load Events
for (const file of fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'))) {
    const evt = require(path.join(__dirname, 'events', file));
    if (evt.once) client.once(evt.name, (...a) => evt.execute(...a, client));
    else          client.on(evt.name,   (...a) => evt.execute(...a, client));
}

// Initialise play-dl with YouTube cookies FIRST, then login
setupPlayDl().then(() => {
    client.login(process.env.DISCORD_TOKEN);
    startDashboard(client);
    
    // 24/7 Connectivity: Self-ping the dashboard
    if (process.env.DASHBOARD_URL) {
        keepAlive(process.env.DASHBOARD_URL);
    }
});
