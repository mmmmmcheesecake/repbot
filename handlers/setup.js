const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.content !== '!setup') return;
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        const verifyCh = await message.guild.channels.fetch(config.verifyChannelId).catch(() => null);
        if (!verifyCh) return message.reply('❌ Nie znaleziono kanału verify.');

        const embed = new EmbedBuilder()
            .setColor(0x111111)
            .setTitle('replug')
            .setDescription('Wybierz język aby uzyskać dostęp do serwera.\nChoose your language to access the server.')
            .addFields(
                { name: '🇵🇱 Polski', value: 'Kliknij flagę poniżej', inline: true },
                { name: '🇬🇧 English', value: 'React with the flag below', inline: true },
            )
            .setFooter({ text: 'replug24.com' });

        const msg = await verifyCh.send({ embeds: [embed] });
        await msg.react('🇵🇱');
        await msg.react('🇬🇧');

        await message.reply('✅ Wiadomość weryfikacji wysłana w #verify.');
    });
};
