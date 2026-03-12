const { SlashCommandBuilder } = require('discord.js');
const { MusicPlayer }         = require('../music/player');
const { play }                = require('../utils/playdlSetup');
const { robustSearch, getVideoInfo } = require('../utils/search');

function formatSeconds(total) {
    if (!total || isNaN(total)) return 'Unknown';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube — URL or search query.')
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('YouTube URL or search query')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        const query = interaction.options.getString('query');

        // Voice channel check
        const voiceChannel = interaction.member.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: '🔇 Join a voice channel first!', ephemeral: true });
        }

        const perms = voiceChannel.permissionsFor(interaction.client.user);
        if (!perms.has('Connect') || !perms.has('Speak')) {
            return interaction.reply({ content: '🔒 I need **Connect** and **Speak** permissions.', ephemeral: true });
        }

        await interaction.deferReply();

        // Get or create player for this guild
        let player = client.players.get(interaction.guild.id);
        if (!player) {
            player = new MusicPlayer(interaction.guild.id, voiceChannel, interaction.channel, client);
            client.players.set(interaction.guild.id, player);
            try {
                await player.connect();
            } catch (err) {
                console.error('[Connect Error]', err);
                client.players.delete(interaction.guild.id);
                return interaction.followUp('❌ Could not join your voice channel.');
            }
        } else if (voiceChannel.id !== player.voiceChannelId) {
            return interaction.followUp({ content: '🔒 Already playing in a different voice channel.', ephemeral: true });
        }

        // Resolve song(s)
        try {
            const urlType = play.yt_validate(query);

            // ── YouTube playlist ─────────────────────────────────────────
            if (urlType === 'playlist') {
                const pl = await play.playlist_info(query, { incomplete: true });
                const videos = await pl.all_videos();
                let added = 0;
                for (const v of videos) {
                    if (!v.url) continue;
                    player.addSong({
                        title:       v.title,
                        url:         v.url,
                        thumbnail:   v.thumbnails?.[0]?.url || '',
                        duration:    v.durationRaw || formatSeconds(v.durationInSec),
                        requestedBy: interaction.user.id,
                    });
                    added++;
                }
                return interaction.followUp(`📋 Added **${added}** song(s) from **${pl.title}** to the queue.`);
            }

            // ── Direct YouTube video URL ─────────────────────────────────
            if (urlType === 'video') {
                const v = await getVideoInfo(query);
                if (!v) {
                    return interaction.followUp('❌ Could not fetch video info. YouTube might be blocking the request.');
                }
                const song = {
                    title:       v.title,
                    url:         v.url,
                    thumbnail:   v.thumbnails?.[0]?.url || '',
                    duration:    v.durationRaw,
                    requestedBy: interaction.user.id,
                };
                const wasPlaying = !!player.currentSong;
                player.addSong(song);
                return interaction.followUp(
                    wasPlaying
                        ? `✅ Queued: **${song.title}** \`[${song.duration}]\``
                        : `🎵 Loading: **${song.title}**...`
                );
            }

            // ── Search query ─────────────────────────────────────────────
            const results = await robustSearch(query, 1);

            if (!results?.length) {
                return interaction.followUp('❌ No results found. Try a different search term.');
            }

            const v = results[0];
            const song = {
                title:       v.title,
                url:         v.url,
                thumbnail:   v.thumbnails?.[0]?.url || '',
                duration:    v.durationRaw || formatSeconds(v.durationInSec),
                requestedBy: interaction.user.id,
            };

            const wasPlaying = !!player.currentSong;
            player.addSong(song);
            return interaction.followUp(
                wasPlaying
                    ? `✅ Queued: **${song.title}** \`[${song.duration}]\``
                    : `🎵 Loading: **${song.title}**...`
            );

        } catch (err) {
            console.error('[Play Error]', err.message);
            return interaction.followUp('❌ Failed to fetch song info. Please check the URL or try a different query.');
        }
    },
};
