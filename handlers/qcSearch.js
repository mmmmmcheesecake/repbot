const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const QC_PAGE = 'https://replug24.com/qc';

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const chId = message.channel.id;
        const isPL = chId === config.channels.pl.qc;
        const isEN = chId === config.channels.en.qc;
        if (!isPL && !isEN) return;

        const urlMatch = message.content.match(/https?:\/\/[^\s]+/);
        if (!urlMatch) return;

        const productUrl = urlMatch[0];
        const qcUrl = `${QC_PAGE}?url=${encodeURIComponent(productUrl)}`;

        const embed = new EmbedBuilder()
            .setColor(0x111111)
            .setTitle(isEN ? '📸 QC Photos' : '📸 Zdjęcia QC')
            .setURL(qcUrl)
            .setDescription(isEN
                ? `[Open QC photos on replug24 →](${qcUrl})`
                : `[Otwórz zdjęcia QC na replug24 →](${qcUrl})`)
            .setFooter({ text: 'replug24.com' });

        await message.reply({ embeds: [embed] });
    });
};
