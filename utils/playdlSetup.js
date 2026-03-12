/**
 * playdlSetup.js
 * Initialises play-dl with YouTube cookies so authenticated streaming works.
 * Call setupPlayDl() once at startup before any streaming occurs.
 */
const play = require('play-dl');
const fs   = require('fs');
const path = require('path');

async function setupPlayDl() {
    let raw = "";
    
    // 1. Check if cookies are provided via Environment Variable (Recommended for Render/Vercel)
    if (process.env.YOUTUBE_COOKIES) {
        console.log('✅ play-dl: Using cookies from environment variable.');
        raw = process.env.YOUTUBE_COOKIES.trim();
    } 
    // 2. Fallback to cookies.json file
    else {
        const cookiesPath = path.join(__dirname, '..', 'cookies.json');
        if (!fs.existsSync(cookiesPath)) {
            console.warn('⚠️  No YOUTUBE_COOKIES env or cookies.json found. YouTube may block streams.');
            return;
        }
        raw = fs.readFileSync(cookiesPath, 'utf8').trim();
    }

    try {
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
