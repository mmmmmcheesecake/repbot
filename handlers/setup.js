const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
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

        await message.reply('⏳ Konfigurowanie serwera...');

        const guild = message.guild;
        const everyone = guild.roles.everyone.id;

        // Rangi
        let rolePL = guild.roles.cache.find(r => r.name === 'Verified PL - polski')
            ?? await guild.roles.create({ name: 'Verified PL - polski', color: '#dc143c' });

        let roleEN = guild.roles.cache.find(r => r.name === 'Verified EN - angielski')
            ?? await guild.roles.create({ name: 'Verified EN - angielski', color: '#012169' });

        // Kanał #start — wszyscy widzą, nikt nie pisze
        let startCh = guild.channels.cache.find(c => c.name === 'start' && c.type === ChannelType.GuildText)
            ?? await guild.channels.create({
                name: 'start',
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions], deny: [PermissionFlagsBits.SendMessages] },
                ],
            });

        // Kategoria PL
        let catPL = guild.channels.cache.find(c => c.name === '🇵🇱・polska' && c.type === ChannelType.GuildCategory)
            ?? await guild.channels.create({
                name: '🇵🇱・polska',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: rolePL.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
                ],
            });

        for (const name of ['konwerter', 'qc', 'tracking', 'visual-search', 'tickety']) {
            if (!guild.channels.cache.find(c => c.name === name && c.parentId === catPL.id)) {
                await guild.channels.create({
                    name,
                    type: ChannelType.GuildText,
                    parent: catPL.id,
                });
            }
        }

        // Kategoria EN
        let catEN = guild.channels.cache.find(c => c.name === '🇬🇧・english' && c.type === ChannelType.GuildCategory)
            ?? await guild.channels.create({
                name: '🇬🇧・english',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: roleEN.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
                ],
            });

        for (const name of ['converter', 'qc-en', 'tracking-en', 'visual-search-en', 'tickets']) {
            if (!guild.channels.cache.find(c => c.name === name && c.parentId === catEN.id)) {
                await guild.channels.create({
                    name,
                    type: ChannelType.GuildText,
                    parent: catEN.id,
                });
            }
        }

        // Wiadomość startowa
        const embed = new EmbedBuilder()
            .setColor(0x111111)
            .setTitle('replug')
            .setDescription('Wybierz język aby uzyskać dostęp do serwera.\nChoose your language to access the server.')
            .addFields(
                { name: '🇵🇱 Polski', value: 'Kliknij flagę poniżej', inline: true },
                { name: '🇬🇧 English', value: 'React with the flag below', inline: true },
            )
            .setFooter({ text: 'replug24.com' });

        const msg = await startCh.send({ embeds: [embed] });
        await msg.react('🇵🇱');
        await msg.react('🇬🇧');

        saveConfig({
            reactionMessageId: msg.id,
            startChannelId: startCh.id,
            rolePLId: rolePL.id,
            roleENId: roleEN.id,
        });

        await message.reply('✅ Setup gotowy! Kanały i rangi skonfigurowane.');
    });
};
