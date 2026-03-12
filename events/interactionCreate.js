const { Events } = require('discord.js');
const { buildQueueEmbed } = require('../ui/musicPanel');
const { addLog } = require('../utils/logger');

// Cooldown to prevent button spam (per user, per button)
const cooldowns = new Map();
const COOLDOWN_MS = 500;

function isOnCooldown(userId, action) {
    const key = `${userId}_${action}`;
    const last = cooldowns.get(key) || 0;
    if (Date.now() - last < COOLDOWN_MS) return true;
    cooldowns.set(key, Date.now());
    return false;
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {

        // ── Slash Commands ──────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                addLog('COMMAND', `/${interaction.commandName} used by ${interaction.user.tag}`);
                await command.execute(interaction, client);
            } catch (error) {
                console.error(`[Command Error] /${interaction.commandName}:`, error);
                const msg = { content: '❌ An error occurred executing this command.', ephemeral: true };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(msg).catch(() => {});
                } else {
                    await interaction.reply(msg).catch(() => {});
                }
            }
            return;
        }

        // ── Button Interactions ─────────────────────────────────────────────
        if (!interaction.isButton()) return;

        const [prefix, action] = interaction.customId.split('_');
        if (prefix !== 'music') return;

        if (isOnCooldown(interaction.user.id, action)) {
            return interaction.reply({ content: '⏳ Please wait before clicking again.', ephemeral: true }).catch(() => {});
        }

        const player = client.players.get(interaction.guild.id);
        if (!player || !player.currentSong) {
            return interaction.reply({ content: '❌ No music is currently playing.', ephemeral: true });
        }

        // Security: user must be in same VC
        const userVC = interaction.member.voice?.channel;
        if (!userVC || userVC.id !== player.voiceChannelId) {
            return interaction.reply({ content: '🔒 You must be in the same voice channel to control the music.', ephemeral: true });
        }

        // Queue button → reply with queue embed without updating the panel
        if (action === 'queue') {
            addLog('INFO', `Queue viewed by ${interaction.user.tag} in ${interaction.guild.name}`);
            return interaction.reply(buildQueueEmbed(player));
        }

        // For all other buttons: defer the update (silently updates panel)
        await interaction.deferUpdate().catch(() => {});

        switch (action) {
            case 'pause':   player.togglePause(); addLog('INFO', `Music paused/resumed by ${interaction.user.tag}`); break;
            case 'skip':    player.skip(); addLog('INFO', `Music skipped by ${interaction.user.tag}`); break;
            case 'previous':await player.previous(); addLog('INFO', `Previous song requested by ${interaction.user.tag}`); break;
            case 'loop':    player.toggleLoop(); addLog('INFO', `Loop toggled by ${interaction.user.tag}`); break;
            case 'shuffle': player.shuffle(); addLog('INFO', `Queue shuffled by ${interaction.user.tag}`); break;
            case 'autoplay':
                const state = player.toggleAutoplay();
                addLog('INFO', `Autoplay ${state ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);
                return interaction.followUp({ 
                    content: `🤖 Autoplay is now **${state ? 'ENABLED' : 'DISABLED'}** ${state ? '✅' : '❌'}`, 
                    ephemeral: true 
                });
            case 'volup':   player.setVolume(player.volume + 10); break;
            case 'voldown': player.setVolume(player.volume - 10); break;
            case 'stop':    player.stop(); addLog('INFO', `Music stopped by ${interaction.user.tag}`); return; // stop destroys the player
        }

        await player.updatePanel();
    },
};
