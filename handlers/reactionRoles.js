const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
    catch { return {}; }
}

module.exports = (client) => {
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
        if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }

        const config = loadConfig();
        if (reaction.message.id !== config.reactionMessageId) return;

        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        if (reaction.emoji.name === '🇵🇱' && config.rolePLId) {
            await member.roles.add(config.rolePLId).catch(console.error);
        } else if (reaction.emoji.name === '🇬🇧' && config.roleENId) {
            await member.roles.add(config.roleENId).catch(console.error);
        }
    });

    client.on('messageReactionRemove', async (reaction, user) => {
        if (user.bot) return;
        if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
        if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }

        const config = loadConfig();
        if (reaction.message.id !== config.reactionMessageId) return;

        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        if (reaction.emoji.name === '🇵🇱' && config.rolePLId) {
            await member.roles.remove(config.rolePLId).catch(console.error);
        } else if (reaction.emoji.name === '🇬🇧' && config.roleENId) {
            await member.roles.remove(config.roleENId).catch(console.error);
        }
    });
};
