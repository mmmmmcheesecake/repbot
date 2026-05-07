const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const AUTO_ROLE_ID = '1497207039422894151';

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

        const autoRoleId = config.autoRoleId || AUTO_ROLE_ID;
        let verifiedRoleId = null;

        if (reaction.emoji.name === '🇵🇱' && config.rolePLId) {
            verifiedRoleId = config.rolePLId;
        } else if (reaction.emoji.name === '🇬🇧' && config.roleENId) {
            verifiedRoleId = config.roleENId;
        }

        if (!verifiedRoleId) return;

        await member.roles.add(verifiedRoleId).catch(console.error);
        if (member.roles.cache.has(autoRoleId)) {
            await member.roles.remove(autoRoleId).catch(console.error);
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

        const autoRoleId = config.autoRoleId || AUTO_ROLE_ID;
        let verifiedRoleId = null;

        if (reaction.emoji.name === '🇵🇱' && config.rolePLId) {
            verifiedRoleId = config.rolePLId;
        } else if (reaction.emoji.name === '🇬🇧' && config.roleENId) {
            verifiedRoleId = config.roleENId;
        }

        if (!verifiedRoleId) return;

        await member.roles.remove(verifiedRoleId).catch(console.error);

        // Jeśli stracił obie rangi verified, przywróć auto-rangę
        const stillHasOther = (verifiedRoleId === config.rolePLId)
            ? member.roles.cache.has(config.roleENId)
            : member.roles.cache.has(config.rolePLId);

        if (!stillHasOther && !member.roles.cache.has(autoRoleId)) {
            await member.roles.add(autoRoleId).catch(console.error);
        }
    });
};
