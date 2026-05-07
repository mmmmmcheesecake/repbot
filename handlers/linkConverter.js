const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const REF = 'MGRSBE';

function extractUrl(text) {
    const match = text.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : null;
}

function detectPlatform(url) {
    if (url.includes('weidian.com')) return 'Weidian';
    if (url.includes('taobao.com')) return 'Taobao';
    if (url.includes('1688.com')) return '1688';
    if (url.includes('tmall.com')) return 'Tmall';
    return null;
}

function buildUsfansLink(originalUrl) {
    return `https://www.usfans.com/search?keyword=${encodeURIComponent(originalUrl)}&ref=${REF}`;
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const chId = message.channel.id;
        const isPL = chId === config.channels.pl.konwerter;
        const isEN = chId === config.channels.en.konwerter;
        if (!isPL && !isEN) return;

        const url = extractUrl(message.content);
        if (!url) return;

        const platform = detectPlatform(url);
        if (!platform) return;

        const embed = new EmbedBuilder()
            .setColor(0x111111)
            .setTitle(isEN ? '🔗 Link converted' : '🔗 Skonwertowany link')
            .addFields(
                { name: isEN ? 'Platform' : 'Platforma', value: platform, inline: true },
                { name: 'USFans', value: `[${isEN ? 'Open on USFans →' : 'Otwórz na USFans →'}](${buildUsfansLink(url)})`, inline: true },
            )
            .setFooter({ text: `replug24.com • ref: ${REF}` });

        await message.reply({ embeds: [embed] });
    });
};
