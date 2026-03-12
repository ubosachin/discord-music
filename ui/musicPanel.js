const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const LOOP_LABELS = ['Off', 'Song 🔂', 'Queue 🔁'];
const LOOP_EMOJIS = ['🔁', '🔂', '♾️'];

function formatTime(seconds = 0) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function parseDuration(raw) {
    if (!raw) return 0;
    const parts = raw.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function buildProgressBar(elapsed, total, len = 20) {
    if (!total || total <= 0) return '`🔴 LIVE`';
    const e = Math.min(elapsed, total);
    const p = Math.round((e / total) * len);
    const bar = '█'.repeat(p) + '░'.repeat(Math.max(0, len - p));
    return `\`${formatTime(e)}\` \`[${bar}]\` \`${formatTime(total)}\``;
}

function buildMusicPanel(player) {
    const song = player.currentSong;
    if (!song) return { content: '❔ No song playing.', embeds: [], components: [] };

    const elapsed = player.getElapsedSeconds();
    const total = parseDuration(song.duration);
    const progressBar = buildProgressBar(elapsed, total);
    const color = player.paused ? 0xFFA500 : 0x5865F2;
    const requester = song.requestedBy === 'autoplay' ? '🤖 Autoplay' : `<@${song.requestedBy}>`;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: player.paused ? '⏸ Paused' : '▶️ Now Playing' })
        .setTitle(song.title.length > 256 ? song.title.slice(0, 253) + '...' : song.title)
        .setURL(song.url)
        .setThumbnail(song.thumbnail || null)
        .setDescription(`\n${progressBar}\n`)
        .addFields(
            { name: '⏱️ Duration',    value: song.duration || 'Unknown',                  inline: true },
            { name: '👤 Requested',   value: requester,                                    inline: true },
            { name: '🔊 Volume',      value: `${player.volume}%`,                         inline: true },
            { name: `${LOOP_EMOJIS[player.loopMode]} Loop`, value: LOOP_LABELS[player.loopMode], inline: true },
            { name: '🪄 Autoplay',   value: player.autoplay ? 'ON ✅' : 'OFF ❌',         inline: true },
            { name: '📋 Queue',       value: `${player.songs.length} song(s) remaining`,  inline: true },
        )
        .setFooter({ text: 'Use the buttons below to control playback' })
        .setTimestamp();

    // Row 1: ⏮ Previous | ⏯ Pause/Resume | ⏭ Skip | 🔁 Loop | 🔀 Shuffle
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_previous')
            .setEmoji('⏮')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(player.history.length === 0),
        new ButtonBuilder()
            .setCustomId('music_pause')
            .setEmoji(player.paused ? '▶️' : '⏸️')
            .setStyle(player.paused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('music_skip')
            .setEmoji('⏭')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_loop')
            .setEmoji(LOOP_EMOJIS[player.loopMode])
            .setStyle(player.loopMode === 0 ? ButtonStyle.Secondary : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('music_shuffle')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(player.songs.length < 2),
    );

    // Row 2: 🔊 Vol+ | 🔉 Vol- | ▶️ Autoplay | 📜 Queue | ⏹ Stop
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_volup')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(player.volume >= 150),
        new ButtonBuilder()
            .setCustomId('music_voldown')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(player.volume <= 0),
        new ButtonBuilder()
            .setCustomId('music_autoplay')
            .setEmoji('🤖')
            .setLabel(`Autoplay: ${player.autoplay ? 'ON' : 'OFF'}`)
            .setStyle(player.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_queue')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setEmoji('⏹')
            .setStyle(ButtonStyle.Danger),
    );

    return { embeds: [embed], components: [row1, row2] };
}

function buildQueueEmbed(player) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 Music Queue');

    let description = '';
    if (player.currentSong) {
        description += `**▶️ Now Playing:**\n[${player.currentSong.title}](${player.currentSong.url}) — \`${player.currentSong.duration || 'Unknown'}\`\n\n`;
    }

    if (player.songs.length > 0) {
        description += `**📋 Up Next (${player.songs.length} song${player.songs.length > 1 ? 's' : ''}):**\n`;
        player.songs.slice(0, 15).forEach((s, i) => {
            description += `**${i + 1}.** [${s.title}](${s.url}) — \`${s.duration || 'Unknown'}\`\n`;
        });
        if (player.songs.length > 15) description += `\n*...and ${player.songs.length - 15} more song(s)*`;
    } else {
        description += '**Queue is empty.** Add songs with `/play`!';
    }

    embed.setDescription(description);
    embed.setFooter({ text: `Volume: ${player.volume}% • Loop: ${LOOP_LABELS[player.loopMode]}` });
    return { embeds: [embed], ephemeral: true };
}

module.exports = { buildMusicPanel, buildQueueEmbed, formatTime, parseDuration };
