const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stops music and clears the queue.'),

    async execute(interaction, client) {
        const player = client.players.get(interaction.guild.id);
        if (!player) {
            return interaction.reply({ content: '❔ No music is playing right now.', ephemeral: true });
        }
        if (!interaction.member.voice?.channel || interaction.member.voice.channel.id !== player.voiceChannelId) {
            return interaction.reply({ content: '🔒 You must be in the same voice channel as the bot.', ephemeral: true });
        }
        player.stop();
        return interaction.reply('⏹ Stopped the music and cleared the queue.');
    },
};
