const { spawn } = require('child_process');
const { play }  = require('./playdlSetup');

/**
 * Robust YouTube search with yt-dlp fallback.
 * @param {string} query 
 * @param {object} options 
 * @returns {Promise<Array>}
 */
async function robustSearch(query, limit = 10) {
    try {
        // Try play-dl first
        const results = await play.search(query, {
            source: { youtube: 'video' },
            limit: limit,
        });
        
        if (results && results.length > 0) {
            return results.map(v => ({
                id: v.id,
                title: v.title,
                url: v.url,
                durationInSec: v.durationInSec,
                durationRaw: v.durationRaw,
                thumbnails: v.thumbnails,
                source: 'play-dl'
            }));
        }
    } catch (err) {
        console.error(`[Search Error] play-dl failed: ${err.message}`);
    }

    // Fallback to yt-dlp
    console.log(`[Search] Falling back to yt-dlp for query: ${query}`);
    return new Promise((resolve) => {
        const ytdlp = spawn('yt-dlp', [
            `ytsearch${limit}:${query}`,
            '--print', '%(id)s|%(title)s|%(webpage_url)s|%(duration)s|%(duration_string)s|%(thumbnail)s',
            '--no-playlist',
            '--quiet'
        ]);

        let output = '';
        ytdlp.stdout.on('data', data => { output += data.toString(); });
        ytdlp.on('close', code => {
            if (code !== 0) {
                console.error(`[Search Error] yt-dlp failed with code ${code}`);
                return resolve([]);
            }
            
            const lines = output.trim().split('\n').filter(l => l.includes('|'));
            const results = lines.map(line => {
                const parts = line.split('|');
                if (parts.length < 5) return null;
                
                const [id, title, url, durationSec, durationRaw, thumbnail] = parts;
                
                return {
                    id,
                    title,
                    url,
                    durationInSec: parseInt(durationSec) || 0,
                    durationRaw: durationRaw || 'Unknown',
                    thumbnails: [{ url: thumbnail }],
                    source: 'yt-dlp'
                };
            }).filter(Boolean);
            
            resolve(results);
        });

        ytdlp.on('error', err => {
            console.error(`[Search Error] yt-dlp spawn error: ${err.message}`);
            resolve([]);
        });
    });
}

/**
 * Robust Video Info with yt-dlp fallback.
 * @param {string} url 
 * @returns {Promise<object|null>}
 */
async function getVideoInfo(url) {
    try {
        const info = await play.video_info(url);
        if (info?.video_details) {
            const v = info.video_details;
            return {
                id: v.id,
                title: v.title,
                url: v.url,
                durationInSec: v.durationInSec,
                durationRaw: v.durationRaw,
                thumbnails: v.thumbnails,
                source: 'play-dl'
            };
        }
    } catch (err) {
        console.error(`[Info Error] play-dl failed: ${err.message}`);
    }

    // Fallback to yt-dlp
    console.log(`[Info] Falling back to yt-dlp for URL: ${url}`);
    return new Promise((resolve) => {
        const ytdlp = spawn('yt-dlp', [
            url,
            '--print', '%(id)s|%(title)s|%(webpage_url)s|%(duration)s|%(duration_string)s|%(thumbnail)s',
            '--no-playlist',
            '--quiet'
        ]);

        let output = '';
        ytdlp.stdout.on('data', data => { output += data.toString(); });
        ytdlp.on('close', code => {
            if (code !== 0) return resolve(null);
            
            const line = output.trim().split('\n')[0];
            if (!line || !line.includes('|')) return resolve(null);
            
            const parts = line.split('|');
            if (parts.length < 5) return resolve(null);
            
            const [id, title, url, durationSec, durationRaw, thumbnail] = parts;
            resolve({
                id,
                title,
                url,
                durationInSec: parseInt(durationSec) || 0,
                durationRaw: durationRaw || 'Unknown',
                thumbnails: [{ url: thumbnail }],
                source: 'yt-dlp'
            });
        });

        ytdlp.on('error', () => resolve(null));
    });
}

module.exports = { robustSearch, getVideoInfo };
