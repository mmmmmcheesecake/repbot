const config = require('../config');

module.exports = (client) => {
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
        if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }

        // Tylko reakcje w kanale verify, na wiadomości bota
        if (reaction.message.channelId !== config.verifyChannelId) return;
        if (reaction.message.author?.id !== client.user.id) return;

        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        let verifiedRoleId = null;
        if (reaction.emoji.name === '🇵🇱') verifiedRoleId = config.rolePLId;
        else if (reaction.emoji.name === '🇬🇧') verifiedRoleId = config.roleENId;
        if (!verifiedRoleId) return;

        await member.roles.add(verifiedRoleId).catch(e => console.error('add verified:', e.message));
        if (member.roles.cache.has(config.autoRoleId)) {
            await member.roles.remove(config.autoRoleId).catch(e => console.error('remove auto:', e.message));
        }
    });

    client.on('messageReactionRemove', async (reaction, user) => {
        if (user.bot) return;
        if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
        if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }

        if (reaction.message.channelId !== config.verifyChannelId) return;
        if (reaction.message.author?.id !== client.user.id) return;

        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        let verifiedRoleId = null;
        if (reaction.emoji.name === '🇵🇱') verifiedRoleId = config.rolePLId;
        else if (reaction.emoji.name === '🇬🇧') verifiedRoleId = config.roleENId;
        if (!verifiedRoleId) return;

        await member.roles.remove(verifiedRoleId).catch(e => console.error('remove verified:', e.message));

        const stillHasOther = (verifiedRoleId === config.rolePLId)
            ? member.roles.cache.has(config.roleENId)
            : member.roles.cache.has(config.rolePLId);

        if (!stillHasOther && !member.roles.cache.has(config.autoRoleId)) {
            await member.roles.add(config.autoRoleId).catch(e => console.error('readd auto:', e.message));
        }
    });
};
