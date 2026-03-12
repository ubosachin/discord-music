const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType,
} = require('@discordjs/voice');
const { ActivityType } = require('discord.js');

const { spawn }           = require('child_process');
const ffmpegStatic        = require('ffmpeg-static');
const { play }            = require('../utils/playdlSetup');
const { buildMusicPanel } = require('../ui/musicPanel');
const { robustSearch }    = require('../utils/search');
const { addLog }          = require('../utils/logger');

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSeconds(total) {
    if (!total || isNaN(total)) return 'Unknown';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function extractArtist(title) {
    // Better cleaning: remove [official video], (lyrics), etc.
    const clean = title.replace(/[\[\(].*?[\]\)]/gi, '').trim();

    // Support common YouTube separators: " - ", " | ", " : "
    if (clean.includes(' - ')) return clean.split(' - ')[0].trim();
    if (clean.includes(' | ')) return clean.split(' | ')[0].trim();
    if (clean.includes(' : ')) return clean.split(' : ')[0].trim();
    if (clean.toLowerCase().includes(' by ')) return clean.toLowerCase().split(' by ')[1].trim();

    // If no separator, take first 2-3 words (avoid single word fallback like "2")
    const words = clean.split(' ');
    if (words.length > 2) return words.slice(0, 2).join(' ');
    return words[0];
}

function detectGenre(title) {
    const lower = title.toLowerCase();
    const genres = [
        'lofi', 'chill', 'hip hop', 'rap', 'sad', 'pop', 'rock', 
        'gaming', 'edm', 'jazz', 'lo-fi', 'trap', 'romantic', 'acoustic', 
        'sufi', 'ghazal', 'indie', 'haryanvi', 'punjabi', 'bollywood', 'bhajan'
    ];
    const found = genres.find(g => lower.includes(g));
    return found || null;
}

/**
 * Stream audio from a YouTube URL via yt-dlp piped through ffmpeg.
 * This bypasses all play-dl / ytdl-core bot-detect failures.
 * Returns a Readable stream of raw Opus audio.
 */
function createYtdlpStream(url) {
    console.log(`[Stream] Starting yt-dlp for: ${url}`);
    
    const ytdlp = spawn('yt-dlp', [
        '-f', 'ba/best',
        '--no-playlist',
        '--no-warnings',
        '-o', '-',
        url,
    ]);

    const ffmpeg = spawn(ffmpegStatic, [
        '-i', 'pipe:0',
        '-probesize', '5M',
        '-analyzeduration', '5M',
        '-loglevel', 'error',
        '-vn',          // no video
        '-f', 's16le',  // raw PCM 16-bit little-endian
        '-ar', '48000', // Discord sample rate
        '-ac', '2',     // stereo
        'pipe:1',
    ]);

    ytdlp.stdout.pipe(ffmpeg.stdin);

    // Suppress EPIPE — occurs when ffmpeg closes stdin before yt-dlp finishes
    ffmpeg.stdin.on('error', (err) => {
        if (err.code !== 'EPIPE') console.error('[ffmpeg-stdin-error]', err.message);
    });
    
    ytdlp.stdout.on('error', (err) => {
        console.error('[ytdlp-stdout-error]', err.message);
    });

    ytdlp.stderr.on('data', d => {
        const msg = d.toString().trim();
        if (msg && !msg.startsWith('[download]')) console.error('[yt-dlp]', msg);
    });

    ffmpeg.stderr.on('data', d => {
        const msg = d.toString().trim();
        if (msg && !msg.includes('Broken pipe')) console.error('[ffmpeg]', msg);
    });

    ytdlp.on('error', err => {
        console.error('[yt-dlp spawn error]', err.message);
        addLog('ERROR', `yt-dlp error: ${err.message}. Ensure yt-dlp is installed.`);
    });
    
    ffmpeg.on('error', err => {
        console.error('[ffmpeg spawn error]', err.message);
        addLog('ERROR', `ffmpeg error: ${err.message}`);
    });

    return ffmpeg.stdout;
}

// ─── MusicPlayer Class ───────────────────────────────────────────────────────

class MusicPlayer {
    constructor(guildId, voiceChannel, textChannel, client) {
        this.guildId        = guildId;
        this.voiceChannelId = voiceChannel.id;
        this.voiceChannel   = voiceChannel;
        this.textChannel    = textChannel;
        this.client         = client;

        this.songs              = [];
        this.history            = [];
        this.currentSong        = null;

        this.volume             = 70;
        this.loopMode           = 0;    // 0=off  1=song  2=queue
        this.paused             = false;
        this.autoplay           = false; // Default to OFF per request
        this._autoplayFetching  = false;
        this._autoplayRetries   = 0;
        this.historyIds         = [];   // Last 50 played video IDs (Duplicate Prevention)
        this._destroyed         = false;

        this.connection     = null;
        this.audioPlayer    = createAudioPlayer();
        this.panelMessage   = null;
        this.panelInterval  = null;
        this.leaveTimeout   = null;

        this.startedAt      = 0;
        this.pausedDuration = 0;
        this.pausedAt       = null;

        this._setupAudioPlayer();
    }

    _setupAudioPlayer() {
        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            if (!this._destroyed) this._processQueue();
        });

        this.audioPlayer.on('error', err => {
            console.error(`[Player Error] ${err.message}`);
            if (!this._destroyed) {
                this.textChannel.send('❌ Playback error. Skipping...').catch(() => {});
                this._processQueue();
            }
        });
    }

    async connect() {
        this.connection = joinVoiceChannel({
            channelId:      this.voiceChannelId,
            guildId:        this.guildId,
            adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
        });
        this.connection.subscribe(this.audioPlayer);

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch { this.destroy(); }
        });
    }

    addSong(song) {
        this.songs.push(song);
        if (!this.currentSong && !this._destroyed) this._processQueue();
    }

    async _processQueue() {
        if (this._destroyed) return;
        this._clearPanelInterval();
        this._clearLeaveTimeout();

        if (this.loopMode === 1 && this.currentSong) {
            // Song loop: re-play current song
        } else {
            if (this.currentSong) {
                // Tracking history IDs for autoplay duplicate protection (keep last 50)
                const videoId = this.currentSong.id || this.currentSong.url.split('v=')[1]?.split('&')[0];
                if (videoId) {
                    if (!this.historyIds.includes(videoId)) {
                        this.historyIds.push(videoId);
                        if (this.historyIds.length > 50) this.historyIds.shift();
                    }
                }

                if (this.loopMode === 2) {
                    this.songs.push(this.currentSong);
                } else {
                    this.history.push(this.currentSong);
                    if (this.history.length > 50) this.history.shift();
                }
            }
            this.currentSong = this.songs.shift() || null;
        }

        if (!this.currentSong) {
            await this._handleEmpty();
            return;
        }
        await this._playSong(this.currentSong);
    }

    async _playSong(song) {
        if (this._destroyed) return;
        try {
            console.log(`[▶] ${song.title}`);
            addLog('MUSIC', `Playing: ${song.title} in ${this.voiceChannel.guild.name}`);

            // Use yt-dlp + ffmpeg pipeline — bypasses all YouTube bot blocking
            const pcmStream = createYtdlpStream(song.url);

            const resource = createAudioResource(pcmStream, {
                inputType:    StreamType.Raw,  // raw PCM from ffmpeg
                inlineVolume: true,
            });
            resource.volume.setVolume(this.volume / 100);
            this.audioPlayer.play(resource);

            this.startedAt      = Date.now();
            this.pausedDuration = 0;
            this.pausedAt       = null;
            this.paused         = false;

            await this._sendPanel();
            this._startPanelInterval();

            // Dynamic Activity Status
            this.client.user.setActivity(song.title, { type: ActivityType.Playing });

        } catch (err) {
            console.error(`[Stream Error] ${err.message}`);
            this.textChannel.send(`❌ Could not play **${song.title}**. Skipping...`).catch(() => {});
            await this._processQueue();
        }
    }

    async _sendPanel() {
        if (this.panelMessage) {
            try { await this.panelMessage.delete(); } catch {}
            this.panelMessage = null;
        }
        this.panelMessage = await this.textChannel.send(buildMusicPanel(this));
    }

    async updatePanel() {
        if (!this.panelMessage || this._destroyed) return;
        try { await this.panelMessage.edit(buildMusicPanel(this)); } catch {}
    }

    _startPanelInterval() {
        this.panelInterval = setInterval(() => {
            if (!this.paused && !this._destroyed) this.updatePanel();
        }, 15_000);
    }

    _clearPanelInterval() {
        if (this.panelInterval) { clearInterval(this.panelInterval); this.panelInterval = null; }
    }

    async _handleEmpty() {
        if (this._destroyed) return;

        // ── Smart Autoplay Logic (YouTube Music / Spotify Radio style) ────────
        if (this.autoplay && this.history.length > 0 && !this._autoplayFetching) {
            this._autoplayFetching = true;
            const last = this.history[this.history.length - 1];
            const lastId = last.id || last.url.split('v=')[1]?.split('&')[0];

            console.log(`[Autoplay] Building recommendation pool for: ${last.title}`);
            
            try {
                let pool = [];

                // SOURCE 1: Related videos (30 results)
                const related = await robustSearch(`${last.title} related`, 30);
                pool.push(...related);

                // SOURCE 2: Artist popular songs (15 results)
                const artist = extractArtist(last.title);
                if (artist && artist.length > 1) { // ignore single char artists
                    const artistSongs = await robustSearch(`${artist} hits non-stop`, 15);
                    pool.push(...artistSongs);
                }

                // SOURCE 3: Genre music mix (15 results)
                const genre = detectGenre(last.title);
                if (genre) {
                    const genreMix = await robustSearch(`${genre} music radio`, 15);
                    pool.push(...genreMix);
                }

                // FILTERING (no repeats, no queue duplicates, duration > 45s)
                let filtered = pool.filter(r => {
                    const isInHistory = this.historyIds.includes(r.id);
                    const isInQueue = this.songs.some(s => {
                        const sid = s.id || s.url.split('v=')[1]?.split('&')[0];
                        return sid === r.id;
                    });
                    return !isInHistory && !isInQueue && r.id !== lastId && r.durationInSec > 45;
                });

                // Dedup pool results by ID
                filtered = [...new Map(filtered.map(v => [v.id, v])).values()];

                console.log(`[Autoplay] Pool size: ${filtered.length} (History: ${this.historyIds.length}/50)`);

                let next = null;
                if (filtered.length > 0) {
                    // RANDOM SELECTION
                    next = filtered[Math.floor(Math.random() * filtered.length)];
                } else {
                    // RETRY / FALLBACK
                    this._autoplayRetries++;
                    if (this._autoplayRetries < 3) {
                        console.log(`[Autoplay] No results found. Retrying (${this._autoplayRetries}/3)...`);
                        this._autoplayFetching = false;
                        return this._handleEmpty();
                    } else {
                        // DEEP FALLBACK: Search for the title itself + "songs"
                        console.log(`[Autoplay] Deep Fallback triggered: ${last.title}`);
                        const fallbackResults = await robustSearch(`${last.title} songs`, 15);
                        
                        const finalFiltered = fallbackResults.filter(r => !this.historyIds.includes(r.id) && r.id !== lastId);
                        if (finalFiltered.length > 0) {
                            next = finalFiltered[Math.floor(Math.random() * Math.min(finalFiltered.length, 5))];
                        }
                    }
                }

                if (next) {
                    this._autoplayRetries = 0; // Success
                    const autoSong = {
                        id:          next.id,
                        title:       next.title,
                        url:         next.url,
                        thumbnail:   next.thumbnails?.[0]?.url || '',
                        duration:    next.durationRaw || formatSeconds(next.durationInSec),
                        requestedBy: 'autoplay',
                    };

                    console.log(`[Autoplay] Selected random track: ${autoSong.title} (History size: ${this.historyIds.length})`);
                    await this.textChannel.send(`🤖 **Autoplaying:** ${autoSong.title}`).catch(() => {});
                    
                    this.currentSong = null;
                    this.songs.unshift(autoSong);
                    this._autoplayFetching = false;
                    await this._processQueue();
                    return;
                } else {
                    console.log(`[Autoplay] All attempts failed. Turning OFF.`);
                    this.autoplay = false;
                    this._autoplayRetries = 0;
                }
            } catch (err) {
                console.error('[Autoplay Error]', err.message);
            } finally {
                this._autoplayFetching = false;
            }
        }

        // ── Queue truly empty ────────────────────────────────────────────────
        if (this.panelMessage) {
            try {
                await this.panelMessage.edit({
                    content: this.autoplay 
                        ? '❌ Smart Autoplay could not find fresh recommendations.' 
                        : '✅ Queue finished. Use `/play` to keep the music going!',
                    embeds: [],
                    components: []
                });
                this.panelMessage = null;
            } catch {}
        }
        this.client.user.setActivity('/play', { type: ActivityType.Listening });
        this._startLeaveTimeout();
    }

    // ── Controls ─────────────────────────────────────────────────────────────

    togglePause() {
        if (this.paused) {
            this.audioPlayer.unpause();
            if (this.pausedAt) { this.pausedDuration += Date.now() - this.pausedAt; this.pausedAt = null; }
            this.paused = false;
        } else {
            this.audioPlayer.pause();
            this.pausedAt = Date.now();
            this.paused   = true;
        }
    }

    skip() { this.audioPlayer.stop(); }

    toggleAutoplay() {
        this.autoplay = !this.autoplay;
        this._autoplayRetries = 0;
        if (this.autoplay) this.historyIds = []; 
        console.log(`[Autoplay] ${this.autoplay ? 'ON' : 'OFF'} — guild ${this.guildId}`);
        return this.autoplay;
    }

    async previous() {
        if (this.history.length === 0) return;
        const prev = this.history.pop();
        if (this.currentSong) this.songs.unshift(this.currentSong);
        this.songs.unshift(prev);
        this.currentSong = null;
        this.audioPlayer.stop();
    }

    toggleLoop() { this.loopMode = (this.loopMode + 1) % 3; }

    shuffle() {
        for (let i = this.songs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.songs[i], this.songs[j]] = [this.songs[j], this.songs[i]];
        }
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(150, vol));
        try {
            const { status, resource } = this.audioPlayer.state;
            if (status === AudioPlayerStatus.Playing || status === AudioPlayerStatus.Paused) {
                resource.volume?.setVolume(this.volume / 100);
            }
        } catch {}
    }

    stop() {
        const panel       = this.panelMessage;
        this.panelMessage = null;
        this._clearPanelInterval();
        this.songs       = [];
        this.history     = [];
        this.currentSong = null;
        this.audioPlayer.stop(true);
        this.client.user.setActivity('/play', { type: ActivityType.Listening });
        if (panel) panel.edit({ content: '⏹ Music stopped.', embeds: [], components: [] }).catch(() => {});
        this.destroy();
    }

    getElapsedSeconds() {
        if (!this.startedAt) return 0;
        let elapsed = Date.now() - this.startedAt - this.pausedDuration;
        if (this.paused && this.pausedAt) elapsed -= (Date.now() - this.pausedAt);
        return Math.max(0, Math.floor(elapsed / 1000));
    }

    destroy() {
        this._destroyed = true;
        this._clearPanelInterval();
        this._clearLeaveTimeout();
        try { this.connection?.destroy(); } catch {}
        this.client.players.delete(this.guildId);
        console.log(`[✓] Player destroyed — guild ${this.guildId}`);
    }

    _startLeaveTimeout() {
        this._clearLeaveTimeout();
        this.leaveTimeout = setTimeout(() => {
            this.textChannel.send('👋 Left voice channel — 5 minutes of inactivity.').catch(() => {});
            this.destroy();
        }, 5 * 60 * 1000);
    }

    _clearLeaveTimeout() {
        if (this.leaveTimeout) { clearTimeout(this.leaveTimeout); this.leaveTimeout = null; }
    }
}

module.exports = { MusicPlayer };
