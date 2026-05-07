const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TRACKING_REGEX = /\b([A-Z]{2}\d{9}[A-Z]{2}|[A-Z]{1,3}\d{8,30}|\d{10,30})\b/;

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')); }
    catch { return {}; }
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const config = loadConfig();
        const chId = message.channel.id;
        const isPL = chId === config.channels?.pl?.tracking;
        const isEN = chId === config.channels?.en?.tracking;
        if (!isPL && !isEN) return;

        const match = message.content.match(TRACKING_REGEX);
        if (!match) return;

        const num = match[1];

        const embed = new EmbedBuilder()
            .setColor(0x111111)
            .setTitle(isEN ? '📦 Package tracking' : '📦 Śledzenie paczki')
            .addFields(
                { name: isEN ? 'Tracking number' : 'Numer śledzenia', value: `\`${num}\`` },
                { name: '17track', value: `[${isEN ? 'Track →' : 'Śledź →'}](https://t.17track.net/en#nums=${num})` },
                { name: 'Parcelsapp', value: `[${isEN ? 'Track →' : 'Śledź →'}](https://parcelsapp.com/en/tracking/${num})` },
            )
            .setFooter({ text: 'replug24.com' });

        await message.reply({ embeds: [embed] });
    });
};
