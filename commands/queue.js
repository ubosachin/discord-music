const { SlashCommandBuilder } = require('discord.js');
const { buildQueueEmbed } = require('../ui/musicPanel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Shows the current music queue.'),

    async execute(interaction, client) {
        const player = client.players.get(interaction.guild.id);
        if (!player || (!player.currentSong && player.songs.length === 0)) {
            return interaction.reply({ content: '❔ The queue is empty. Use `/play` to add songs!', ephemeral: true });
        }
        return interaction.reply(buildQueueEmbed(player));
    },
};
