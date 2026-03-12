const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { addLog } = require('./logger');

async function deployCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, '..', 'commands');

    if (!fs.existsSync(commandsPath)) return;

    for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        }
    }

    if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
        console.error('❌ Cannot deploy commands: Missing DISCORD_TOKEN or CLIENT_ID');
        return;
    }

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`🚀 Deploying ${commands.length} slash commands...`);
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log(`✅ Successfully deployed slash commands.`);
    } catch (error) {
        console.error('❌ Deploy error:', error);
        addLog('ERROR', `Slash command deployment failed: ${error.message}`);
    }
}

module.exports = { deployCommands };
