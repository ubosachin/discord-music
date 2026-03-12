/**
 * ytdlAgent.js
 * Builds a @distube/ytdl-core authenticated agent using cookies.json.
 * Supports both JSON array format and Netscape cookies.txt format.
 */
const ytdl = require('@distube/ytdl-core');
const fs   = require('fs');
const path = require('path');

let agent = null;

/** Parse Netscape cookies.txt into JSON array */
function parseNetscape(raw) {
    const cookies = [];
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const parts = t.split('\t');
        if (parts.length < 7) continue;
        const [domain, , p, secureStr, expiresStr, name, ...rest] = parts;
        cookies.push({
            name:           name.trim(),
            value:          rest.join('\t').trim(),
            domain:         domain.trim(),
            path:           p.trim(),
            secure:         secureStr.trim().toUpperCase() === 'TRUE',
            httpOnly:       false,
            sameSite:       'None',
            expirationDate: parseInt(expiresStr.trim()) || 9999999999,
        });
    }
    return cookies;
}

const jsonPath = path.join(__dirname, '..', 'cookies.json');
const txtPath  = path.join(__dirname, '..', 'cookies.txt');

if (fs.existsSync(jsonPath)) {
    try {
        let raw = fs.readFileSync(jsonPath, 'utf8').trim();
        let cookies;

        // Handle both Netscape text format and JSON array saved with .json extension
        if (raw.startsWith('#') || raw.startsWith('www.') || raw.startsWith('.')) {
            cookies = parseNetscape(raw);
            // Re-save as proper JSON for next boot
            fs.writeFileSync(jsonPath, JSON.stringify(cookies, null, 2));
            console.log(`🔄 Auto-converted Netscape cookies.json → JSON (${cookies.length} cookies)`);
        } else {
            cookies = JSON.parse(raw);
        }

        agent = ytdl.createAgent(cookies);
        console.log(`✅ YouTube cookies loaded (${cookies.length} cookies) — authenticated streaming enabled.`);
    } catch (err) {
        console.warn(`⚠️  cookies.json error: ${err.message}`);
        console.warn('    Bot will run without cookies (some videos may fail).');
    }
} else if (fs.existsSync(txtPath)) {
    try {
        const cookies = parseNetscape(fs.readFileSync(txtPath, 'utf8'));
        agent = ytdl.createAgent(cookies);
        // Save as JSON for next time
        fs.writeFileSync(jsonPath, JSON.stringify(cookies, null, 2));
        console.log(`✅ Loaded cookies.txt and saved as cookies.json (${cookies.length} cookies).`);
    } catch (err) {
        console.warn(`⚠️  cookies.txt error: ${err.message}`);
    }
} else {
    console.warn('⚠️  No cookies.json / cookies.txt found.');
    console.warn('    YouTube may block streams. See cookies.json.example for setup.');
}

/** Returns ytdl options merged with the agent (if available) */
function ytdlOptions(extra = {}) {
    return agent ? { agent, ...extra } : { ...extra };
}

module.exports = { ytdl, agent, ytdlOptions };
