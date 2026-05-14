const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

const PANEL_COMMANDS = {
    proxy: new Set(['!setup-tickets', '!setup-proxy-tickets']),
    dev: new Set(['!setup-dev-tickets', '!setup-devtickets']),
};

const TICKET_TYPES = {
    proxy: {
        name: 'proxy',
        emoji: config.proxyTicketEmoji,
        channels: {
            en: config.channels.en.tickets,
            pl: config.channels.pl.tickets,
        },
        title: {
            en: 'Proxy ticket',
            pl: 'Proxy ticket',
        },
        panelText: {
            en: 'React with {emoji} below to create a private proxy ticket.',
            pl: 'Kliknij reakcje {emoji} ponizej, aby utworzyc prywatny proxy ticket.',
        },
        openText: {
            en: 'your proxy ticket is open. Describe what you need and staff will help you shortly.',
            pl: 'Twoj proxy ticket jest otwarty. Opisz czego potrzebujesz, a obsluga wkrotce pomoze.',
        },
    },
    dev: {
        name: 'dev',
        emoji: config.devTicketEmoji,
        channels: {
            en: config.channels.en.devTickets,
            pl: config.channels.pl.devTickets,
        },
        title: {
            en: 'Dev ticket',
            pl: 'Dev ticket',
        },
        panelText: {
            en: 'React with {emoji} below to create a private dev ticket.',
            pl: 'Kliknij reakcje {emoji} ponizej, aby utworzyc prywatny dev ticket.',
        },
        openText: {
            en: 'your dev ticket is open. Describe the technical issue or request and staff will help you shortly.',
            pl: 'Twoj dev ticket jest otwarty. Opisz problem techniczny lub prosbe, a obsluga wkrotce pomoze.',
        },
    },
};

function findTicketTarget(channelId) {
    for (const [type, data] of Object.entries(TICKET_TYPES)) {
        if (channelId === data.channels.en) return { type, data, lang: 'en' };
        if (channelId === data.channels.pl) return { type, data, lang: 'pl' };
    }
    return null;
}

function commandTicketType(content) {
    const cmd = content.trim().toLowerCase();
    for (const [type, commands] of Object.entries(PANEL_COMMANDS)) {
        if (commands.has(cmd)) return type;
    }
    return null;
}

function ticketThreadName(user, type) {
    const safeName = (user.username || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'user';
    return `${type}-ticket-${safeName}-${user.id}`;
}

async function findOpenTicket(channel, user, type) {
    const active = await channel.threads.fetchActive().catch(() => null);
    const threads = active?.threads || channel.threads.cache;
    const prefix = `${type}-ticket-`;
    const suffix = `-${user.id}`;
    return threads.find(t => !t.archived && t.name.startsWith(prefix) && t.name.endsWith(suffix));
}

async function addTicketStaffMembers(thread) {
    const guild = thread.guild;
    const role = await guild.roles.fetch(config.ticketStaffRoleId).catch(err => {
        console.error('fetch ticket staff role:', err.message);
        return null;
    });
    if (!role) return;

    await guild.members.fetch().catch(err => {
        console.error('fetch guild members for ticket staff:', err.message);
    });

    const staffMembers = role.members.filter(member => !member.user.bot);
    for (const member of staffMembers.values()) {
        await thread.members.add(member.id).catch(err => {
            console.error(`add ticket staff ${member.id}:`, err.message);
        });
    }
}

async function createTicket(channel, user, target) {
    const existing = await findOpenTicket(channel, user, target.type);
    if (existing) return { thread: existing, created: false };

    const thread = await channel.threads.create({
        name: ticketThreadName(user, target.type),
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: `${target.data.title.en} created by ${user.tag}`,
    });

    await thread.members.add(user.id);
    await addTicketStaffMembers(thread);
    await thread.send(target.lang === 'en'
        ? `Hey ${user}, ${target.data.openText.en}`
        : `Czesc ${user}, ${target.data.openText.pl}`
    );

    return { thread, created: true };
}

function panelEmbed(data, lang) {
    return new EmbedBuilder()
        .setColor(0x111111)
        .setTitle(data.title[lang])
        .setDescription(data.panelText[lang].replace('{emoji}', data.emoji))
        .setFooter({ text: 'replug24.com' });
}

async function sendTicketPanel(channel, data, lang) {
    const msg = await channel.send({ embeds: [panelEmbed(data, lang)] });
    await msg.react(data.emoji);
    return msg;
}

async function setupTicketPanels(message, type) {
    const data = TICKET_TYPES[type];
    const guild = message.guild;
    const enChannel = await guild.channels.fetch(data.channels.en).catch(() => null);
    const plChannel = await guild.channels.fetch(data.channels.pl).catch(() => null);

    if (!enChannel || !plChannel) {
        return message.reply('Nie znaleziono jednego z kanalow ticketow.');
    }

    await sendTicketPanel(enChannel, data, 'en');
    await sendTicketPanel(plChannel, data, 'pl');

    const ack = await message.reply(`${data.title.en} panels sent to PL and EN ticket channels.`);
    setTimeout(() => ack.delete().catch(() => {}), 8000);
}

function ticketStatusText(target, user, thread, created) {
    if (target.lang === 'en') {
        return created
            ? `${user}, ticket created: ${thread}`
            : `${user}, you already have an open ticket: ${thread}`;
    }
    return created
        ? `${user}, ticket utworzony: ${thread}`
        : `${user}, masz juz otwarty ticket: ${thread}`;
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.guild) return;
        if (message.author.bot) return;

        const setupType = commandTicketType(message.content);
        if (setupType) {
            if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;
            await setupTicketPanels(message, setupType).catch(err => {
                console.error(`setup ${setupType} tickets:`, err);
                message.reply(`Nie udalo sie wyslac paneli ${setupType} ticket.`).catch(() => {});
            });
            return;
        }

        if (message.channel.isThread()) return;

        const target = findTicketTarget(message.channel.id);
        if (!target) return;

        const { thread, created } = await createTicket(message.channel, message.author, target)
            .catch(err => {
                console.error(`create ${target.type} ticket from message:`, err);
                return {};
            });
        if (!thread) return;

        const reply = await message.reply(ticketStatusText(target, message.author, thread, created));

        setTimeout(() => reply.delete().catch(() => {}), 8000);
        await message.delete().catch(() => {});
    });

    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
        if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }

        const message = reaction.message;
        const target = findTicketTarget(message.channelId);
        if (!target) return;
        if (message.author?.id !== client.user.id) return;
        if (reaction.emoji.name !== target.data.emoji) return;

        const { thread, created } = await createTicket(message.channel, user, target)
            .catch(err => {
                console.error(`create ${target.type} ticket from reaction:`, err);
                return {};
            });
        if (!thread) return;

        await reaction.users.remove(user.id).catch(() => {});

        await message.channel.send({
            content: ticketStatusText(target, user, thread, created),
            allowedMentions: { users: [user.id] },
        }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 8000)).catch(() => {});
    });
};
