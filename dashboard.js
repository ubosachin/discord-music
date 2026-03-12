const express = require('express');
const app = express();
const path = require('path');
const { logs } = require('./utils/logger');

// Export app for Vercel
module.exports = app;

let discordClient = null;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    const stats = {
        guilds: discordClient?.guilds.cache.size || 0,
        users: discordClient?.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0) || 0,
        uptime: formatUptime(discordClient?.uptime || 0),
        ping: discordClient?.ws.ping || 0,
        players: discordClient?.players?.size || 0,
        status: discordClient ? 'Online' : 'Starting bot...'
    };
    res.render('index', { stats, logs });
});

app.get('/ping', (req, res) => {
    res.json({ status: 'alive', timestamp: Date.now() });
});

function startDashboard(client) {
    discordClient = client;
    const PORT = process.env.PORT || 3000;
    
    // Only listen if not running on Vercel
    if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[Dashboard] Running on http://localhost:${PORT}`);
        });
    }
}

function formatUptime(ms) {
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24);
    
    hours %= 24;
    minutes %= 60;
    seconds %= 60;
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

module.exports = { startDashboard };
