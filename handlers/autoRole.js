const config = require('../config');

module.exports = (client) => {
    client.on('guildMemberAdd', async (member) => {
        if (member.user.bot) return;
        await member.roles.add(config.autoRoleId).catch(e => console.error('autoRole:', e.message));
    });
};
