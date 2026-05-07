const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const AUTO_ROLE_ID = '1497207039422894151';

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
    catch { return {}; }
}

module.exports = (client) => {
    client.on('guildMemberAdd', async (member) => {
        if (member.user.bot) return;
        const config = loadConfig();
        const roleId = config.autoRoleId || AUTO_ROLE_ID;
        await member.roles.add(roleId).catch(console.error);
    });
};
