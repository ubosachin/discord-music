const axios = require('axios');

function keepAlive(url) {
    if (!url) {
        console.log('[Keep-Alive] No URL provided. Skipping...');
        return;
    }

    console.log(`[Keep-Alive] Monitoring started for ${url}`);
    
    // Ping every 5 minutes
    setInterval(async () => {
        try {
            await axios.get(url);
            console.log(`[Keep-Alive] Successfully pinged dashboard at ${new Date().toLocaleTimeString()}`);
        } catch (e) {
            console.error(`[Keep-Alive] Ping failed: ${e.message}`);
        }
    }, 5 * 60 * 1000);
}

module.exports = { keepAlive };
