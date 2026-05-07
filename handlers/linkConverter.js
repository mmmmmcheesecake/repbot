const { EmbedBuilder } = require('discord.js');

const PL_CHANNEL = 'konwerter';
const EN_CHANNEL = 'converter';
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

        const ch = message.channel.name;
        const isEN = ch === EN_CHANNEL;
        if (ch !== PL_CHANNEL && ch !== EN_CHANNEL) return;

        const url = extractUrl(message.content);
        if (!url) return;

        const platform = detectPlatform(url);
        if (!platform) return;

        const usfansLink = buildUsfansLink(url);

        const embed = new EmbedBuilder()
            .setColor(0x111111)
            .setTitle(isEN ? '🔗 Link converted' : '🔗 Skonwertowany link')
            .addFields(
                { name: isEN ? 'Platform' : 'Platforma', value: platform, inline: true },
                { name: 'USFans', value: `[${isEN ? 'Open on USFans →' : 'Otwórz na USFans →'}](${usfansLink})`, inline: true },
            )
            .setFooter({ text: `replug24.com • ref: ${REF}` });

        await message.reply({ embeds: [embed] });
    });
};
