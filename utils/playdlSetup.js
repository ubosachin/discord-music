/**
 * playdlSetup.js
 * Initialises play-dl with YouTube cookies so authenticated streaming works.
 * Call setupPlayDl() once at startup before any streaming occurs.
 */
const play = require('play-dl');
const fs   = require('fs');
const path = require('path');

async function setupPlayDl() {
    const cookiesPath = path.join(__dirname, '..', 'cookies.json');

    if (!fs.existsSync(cookiesPath)) {
        console.warn('⚠️  No cookies.json found. YouTube may block streams.');
        console.warn('    Export cookies from youtube.com and save as cookies.json.');
        return;
    }

    try {
        const raw = fs.readFileSync(cookiesPath, 'utf8').trim();
        let cookiesArr;

        // Support both JSON array and Netscape txt format
        if (raw.startsWith('[')) {
            cookiesArr = JSON.parse(raw);
        } else {
            // Netscape format: domain \t flag \t path \t secure \t expiry \t name \t value
            cookiesArr = [];
            for (const line of raw.split('\n')) {
                const t = line.trim();
                if (!t || t.startsWith('#')) continue;
                const parts = t.split('\t');
                if (parts.length < 7) continue;
                const [domain, , p, , , name, ...rest] = parts;
                cookiesArr.push({ name: name.trim(), value: rest.join('\t').trim(), domain: domain.trim(), path: p });
            }
        }

        // Convert cookie array to HTTP Cookie header string
        const cookieStr = cookiesArr
            .filter(c => c.domain && c.domain.includes('youtube'))
            .map(c => `${c.name}=${c.value}`)
            .join('; ');

        await play.setToken({ youtube: { cookie: cookieStr } });
        console.log(`✅ play-dl: Authenticated with ${cookiesArr.length} YouTube cookies.`);
    } catch (err) {
        console.warn(`⚠️  play-dl cookie setup error: ${err.message}`);
        console.warn('    Streaming may fail for age-restricted or private videos.');
    }
}

module.exports = { play, setupPlayDl };
