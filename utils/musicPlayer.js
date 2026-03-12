const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState
} = require('@discordjs/voice');
const play = require('play-dl');
const { EmbedBuilder } = require('discord.js');

class MusicQueue {
    constructor(interaction, client) {
        this.interaction = interaction;
        this.client = client;
        this.guildId = interaction.guild.id;
        this.textChannel = interaction.channel;
        this.voiceChannel = interaction.member.voice.channel;
        
        this.connection = null;
        this.player = createAudioPlayer();
        this.songs = [];
        this.playing = false;
        this.currentSong = null;
        this.volume = 100;
        this.leaveTimeout = null;
    }

    async connect() {
        this.connection = joinVoiceChannel({
            channelId: this.voiceChannel.id,
            guildId: this.guildId,
            adapterCreator: this.interaction.guild.voiceAdapterCreator,
        });

        this.connection.subscribe(this.player);

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                this.destroy();
            }
        });

        this.player.on(AudioPlayerStatus.Idle, () => {
            this.processQueue();
        });

        this.player.on('error', error => {
            console.error('Audio Player Error:', error);
            this.textChannel.send('There was an error playing the audio. Skipping...');
            this.processQueue();
        });
    }

    addSong(song) {
        this.songs.push(song);
        if (!this.playing) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.songs.length === 0) {
            this.playing = false;
            this.currentSong = null;
            this.startLeaveTimeout();
            return;
        }

        this.clearLeaveTimeout();

        this.currentSong = this.songs.shift();
        this.playing = true;

        try {
            const stream = await play.stream(this.currentSong.url);
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
                inlineVolume: true
            });
            resource.volume.setVolume(this.volume / 100);

            this.player.play(resource);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎶 Now Playing')
                .setDescription(`[${this.currentSong.title}](${this.currentSong.url})`)
                .setThumbnail(this.currentSong.thumbnail)
                .addFields(
                    { name: 'Duration', value: this.currentSong.duration || 'Unknown', inline: true },
                    { name: 'Requested By', value: `<@${this.currentSong.requestedBy}>`, inline: true }
                );

            this.textChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error processing queue:', error);
            this.textChannel.send('There was an error trying to play the song. Skipping to the next one.');
            this.processQueue();
        }
    }

    pause() {
        this.player.pause();
    }

    resume() {
        this.player.unpause();
    }

    skip() {
        this.player.stop(); // Stops the player, triggering the Idle event
    }

    stop() {
        this.songs = [];
        this.player.stop();
    }
    
    setVolume(volume) {
        this.volume = volume;
        if (this.player.state.status === AudioPlayerStatus.Playing) {
             this.player.state.resource.volume.setVolume(this.volume / 100);
        }
    }

    destroy() {
        if (this.connection) {
            this.connection.destroy();
        }
        this.client.queues.delete(this.guildId);
    }

    startLeaveTimeout() {
        this.leaveTimeout = setTimeout(() => {
            this.textChannel.send('Inactive for 5 minutes. Leaving the voice channel.');
            this.destroy();
        }, 5 * 60 * 1000);
    }

    clearLeaveTimeout() {
        if (this.leaveTimeout) {
            clearTimeout(this.leaveTimeout);
            this.leaveTimeout = null;
        }
    }
}

module.exports = { MusicQueue };
