const { EmbedBuilder } = require('discord.js');

const PL_CHANNEL = 'tracking';
const EN_CHANNEL = 'tracking-en';

// Numery śledzenia — najczęstsze formaty (China Post, DHL, UPS, FedEx, itp.)
const TRACKING_REGEX = /\b([A-Z]{2}\d{9}[A-Z]{2}|[A-Z]{1,3}\d{8,30}|[0-9]{10,30})\b/;

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const ch = message.channel.name;
        const isEN = ch === EN_CHANNEL;
        if (ch !== PL_CHANNEL && ch !== EN_CHANNEL) return;

        const match = message.content.match(TRACKING_REGEX);
        if (!match) return;

        const trackingNumber = match[1];

        const embed = new EmbedBuilder()
            .setColor(0x111111)
            .setTitle(isEN ? '📦 Package tracking' : '📦 Śledzenie paczki')
            .addFields(
                { name: isEN ? 'Tracking number' : 'Numer śledzenia', value: `\`${trackingNumber}\`` },
                { name: '17track', value: `[${isEN ? 'Track package →' : 'Śledź paczkę →'}](https://t.17track.net/en#nums=${trackingNumber})` },
                { name: 'Parcelsapp', value: `[${isEN ? 'Track on Parcelsapp →' : 'Śledź na Parcelsapp →'}](https://parcelsapp.com/en/tracking/${trackingNumber})` },
            )
            .setFooter({ text: 'replug24.com' });

        await message.reply({ embeds: [embed] });
    });
};
