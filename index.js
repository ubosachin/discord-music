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

const { addLog } = require('./utils/logger');
const { deployCommands } = require('./utils/deployer');

addLog('INFO', 'Bot process initialized.');

// 1. Start the dashboard IMMEDIATELY (Fixes Render "No open ports" error)
startDashboard(client);

// 2. Initialise play-dl and deploy commands in background
setupPlayDl().then(async () => {
    addLog('INFO', 'play-dl setup complete.');
    
    // Deploy slash commands programmatically
    await deployCommands();

    if (!process.env.DISCORD_TOKEN) {
        console.error('❌ CRITICAL: DISCORD_TOKEN is missing in environment variables!');
        addLog('ERROR', 'DISCORD_TOKEN is missing in Render environment variables.');
        return;
    }

    client.login(process.env.DISCORD_TOKEN).catch(err => {
        console.error('❌ Failed to login to Discord:', err.message);
        addLog('ERROR', `Login failed: ${err.message}`);
    });
    
    // 24/7 Connectivity: Self-ping the dashboard
    if (process.env.DASHBOARD_URL) {
        keepAlive(process.env.DASHBOARD_URL);
    }
}).catch(err => {
    console.error('❌ Initialization error:', err);
});
