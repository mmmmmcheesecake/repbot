const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function saveConfig(data) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.content !== '!setup') return;
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        await message.reply('⏳ Konfigurowanie...');

        const guild = message.guild;

        const rolePL = await guild.roles.fetch('1501690212827398175');
        const roleEN = await guild.roles.fetch('1497213401276092477');
        if (!rolePL || !roleEN) return message.reply('❌ Nie znaleziono rang.');

        const verifyCh = await guild.channels.fetch('1497196597207892012');
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

        saveConfig({
            reactionMessageId: msg.id,
            rolePLId: rolePL.id,
            roleENId: roleEN.id,
            channels: {
                pl: {
                    konwerter:    '1501699363989356604',
                    qc:           '1501699802738589706',
                    visualSearch: '1501700275310956564',
                    tracking:     '1501700750634651761',
                    tickets:      '1501696553247571988',
                },
                en: {
                    konwerter:    '1501001540524183562',
                    qc:           '1501002051096809492',
                    visualSearch: '1501002302796988496',
                    tracking:     '1501186060720410664',
                    tickets:      '1501192287210836039',
                },
            },
        });

        await message.reply('✅ Setup gotowy!');
    });
};
