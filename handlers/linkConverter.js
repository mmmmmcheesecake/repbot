const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const REF = 'MGRSBE';

function extractUrl(text) {
    const match = text.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : null;
}

function parseProduct(url) {
    if (url.includes('weidian.com')) {
        const id = url.match(/[?&]itemID=(\d+)/i)?.[1];
        return id ? { platform: 'Weidian', channel: 3, id } : null;
    }
    if (url.includes('taobao.com')) {
        const id = url.match(/[?&]id=(\d+)/i)?.[1];
        return id ? { platform: 'Taobao', channel: 2, id } : null;
    }
    if (url.includes('tmall.com')) {
        const id = url.match(/[?&]id=(\d+)/i)?.[1];
        return id ? { platform: 'Tmall', channel: 2, id } : null;
    }
    if (url.includes('1688.com')) {
        const id = url.match(/\/offer\/(\d+)\.html/i)?.[1];
        return id ? { platform: '1688', channel: 1, id } : null;
    }
    return null;
}

function buildUsfansLink({ channel, id }) {
    return `https://www.usfans.com/product/${channel}/${id}?ref=${REF}`;
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

        const product = parseProduct(url);
        if (!product) return;

        const embed = new EmbedBuilder()
            .setColor(0x111111)
            .setTitle(isEN ? '🔗 Link converted' : '🔗 Skonwertowany link')
            .addFields(
                { name: isEN ? 'Platform' : 'Platforma', value: product.platform, inline: true },
                { name: 'USFans', value: `[${isEN ? 'Open on USFans →' : 'Otwórz na USFans →'}](${buildUsfansLink(product)})`, inline: true },
            )
            .setFooter({ text: `replug24.com • ref: ${REF}` });

        await message.reply({ embeds: [embed] });
    });
};
