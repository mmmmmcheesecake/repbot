const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

const PANEL_COMMANDS = new Set(['!setup-tickets', '!setup-proxy-tickets']);

function isTicketChannel(channelId) {
    if (channelId === config.channels.en.tickets) return 'en';
    if (channelId === config.channels.pl.tickets) return 'pl';
    return null;
}

function ticketThreadName(user) {
    const safeName = (user.username || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'user';
    return `proxy-ticket-${safeName}-${user.id}`;
}

async function findOpenTicket(channel, user) {
    const active = await channel.threads.fetchActive().catch(() => null);
    const threads = active?.threads || channel.threads.cache;
    const suffix = `-${user.id}`;
    return threads.find(t => !t.archived && t.name.startsWith('proxy-ticket-') && t.name.endsWith(suffix));
}

async function createProxyTicket(channel, user, isEN) {
    const existing = await findOpenTicket(channel, user);
    if (existing) return { thread: existing, created: false };

    const thread = await channel.threads.create({
        name: ticketThreadName(user),
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: `Proxy ticket created by ${user.tag}`,
    });

    await thread.members.add(user.id);
    await thread.send(isEN
        ? `Hey ${user}, your proxy ticket is open. Describe what you need and staff will help you shortly.`
        : `Czesc ${user}, Twoj proxy ticket jest otwarty. Opisz czego potrzebujesz, a obsluga wkrotce pomoze.`
    );

    return { thread, created: true };
}

function panelEmbed(isEN) {
    return new EmbedBuilder()
        .setColor(0x111111)
        .setTitle(isEN ? 'Proxy ticket' : 'Proxy ticket')
        .setDescription(isEN
            ? `React with ${config.proxyTicketEmoji} below to create a private proxy ticket.`
            : `Kliknij reakcje ${config.proxyTicketEmoji} ponizej, aby utworzyc prywatny proxy ticket.`
        )
        .setFooter({ text: 'replug24.com' });
}

async function sendTicketPanel(channel, isEN) {
    const msg = await channel.send({ embeds: [panelEmbed(isEN)] });
    await msg.react(config.proxyTicketEmoji);
    return msg;
}

async function setupTicketPanels(message) {
    const guild = message.guild;
    const enChannel = await guild.channels.fetch(config.channels.en.tickets).catch(() => null);
    const plChannel = await guild.channels.fetch(config.channels.pl.tickets).catch(() => null);

    if (!enChannel || !plChannel) {
        return message.reply('Nie znaleziono jednego z kanalow ticketow.');
    }

    await sendTicketPanel(enChannel, true);
    await sendTicketPanel(plChannel, false);

    const ack = await message.reply('Proxy ticket panels sent to PL and EN ticket channels.');
    setTimeout(() => ack.delete().catch(() => {}), 8000);
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.guild) return;
        if (message.author.bot) return;

        if (PANEL_COMMANDS.has(message.content.trim().toLowerCase())) {
            if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;
            await setupTicketPanels(message).catch(err => {
                console.error('setup proxy tickets:', err);
                message.reply('Nie udalo sie wyslac paneli proxy ticket.').catch(() => {});
            });
            return;
        }

        if (message.channel.isThread()) return;

        const chId = message.channel.id;
        const lang = isTicketChannel(chId);
        if (!lang) return;

        const { thread, created } = await createProxyTicket(message.channel, message.author, lang === 'en')
            .catch(err => {
                console.error('create proxy ticket from message:', err);
                return {};
            });
        if (!thread) return;

        const reply = await message.reply(lang === 'en'
            ? (created ? `Ticket created: ${thread}` : `You already have an open ticket: ${thread}`)
            : (created ? `Ticket utworzony: ${thread}` : `Masz juz otwarty ticket: ${thread}`)
        );

        setTimeout(() => reply.delete().catch(() => {}), 8000);
        await message.delete().catch(() => {});
    });

    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
        if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }

        const message = reaction.message;
        const lang = isTicketChannel(message.channelId);
        if (!lang) return;
        if (message.author?.id !== client.user.id) return;
        if (reaction.emoji.name !== config.proxyTicketEmoji) return;

        const channel = message.channel;
        const { thread, created } = await createProxyTicket(channel, user, lang === 'en')
            .catch(err => {
                console.error('create proxy ticket from reaction:', err);
                return {};
            });
        if (!thread) return;

        await reaction.users.remove(user.id).catch(() => {});

        await channel.send({
            content: lang === 'en'
                ? (created ? `${user}, ticket created: ${thread}` : `${user}, you already have an open ticket: ${thread}`)
                : (created ? `${user}, ticket utworzony: ${thread}` : `${user}, masz juz otwarty ticket: ${thread}`),
            allowedMentions: { users: [user.id] },
        }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 8000)).catch(() => {});
    });
};
