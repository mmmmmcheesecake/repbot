const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

const USAGE =
    'Użycie: `!say #kanał treść`\n' +
    '• tekst (multiline) — zwykła wiadomość\n' +
    '• załączniki — zostaną dołączone\n' +
    '• blok ```json``` z obiektem embeda (lub tablicą do 10) — embedy\n' +
    'Przykład:\n' +
    '`!say #ogloszenia Cześć wszystkim!`';

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.content.startsWith('!say')) return;
        if (!message.guild) return;
        if (message.author.bot) return;
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        const rest = message.content.slice('!say'.length).trim();
        if (!rest) return message.reply(USAGE);

        const head = rest.match(/^(?:<#(\d+)>|(\d+))\s*([\s\S]*)$/);
        if (!head) return message.reply('❌ Pierwszym argumentem musi być kanał (`#nazwa` lub ID).');

        const channelId = head[1] || head[2];
        let body = head[3] || '';

        const channel = await message.guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return message.reply('❌ Nie znaleziono kanału o tym ID.');
        if (![ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(channel.type)) {
            return message.reply('❌ Tego typu kanału nie obsługuję (potrzebny tekstowy/ogłoszeniowy/wątek).');
        }

        const embeds = [];
        let parseError = null;
        body = body.replace(/```json\s*([\s\S]*?)```/gi, (_, json) => {
            try {
                const data = JSON.parse(json);
                const list = Array.isArray(data) ? data : [data];
                for (const e of list) embeds.push(EmbedBuilder.from(e));
            } catch (err) {
                parseError = err.message;
            }
            return '';
        }).trim();

        if (parseError) return message.reply('❌ Błąd parsowania JSON embeda: ' + parseError);
        if (embeds.length > 10) return message.reply('❌ Discord pozwala maks. 10 embedów na wiadomość.');

        const files = message.attachments.size
            ? [...message.attachments.values()].map(a => ({ attachment: a.url, name: a.name }))
            : [];

        if (!body && !embeds.length && !files.length) {
            return message.reply('❌ Pusta wiadomość — dodaj tekst, embed lub załącznik.');
        }

        try {
            await channel.send({
                content: body || undefined,
                embeds: embeds.length ? embeds : undefined,
                files: files.length ? files : undefined,
                allowedMentions: { parse: ['users', 'roles', 'everyone'] },
            });
        } catch (err) {
            return message.reply('❌ Nie udało się wysłać: ' + err.message);
        }

        const ack = await message.channel.send(`✅ Wysłano do <#${channel.id}>.`).catch(() => null);
        message.delete().catch(() => {});
        if (ack) setTimeout(() => ack.delete().catch(() => {}), 5000);
    });
};
