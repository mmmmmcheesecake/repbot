const { ChannelType, PermissionFlagsBits } = require('discord.js');

const PL_CHANNEL = 'tickety';
const EN_CHANNEL = 'tickets';

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const ch = message.channel.name;
        const isEN = ch === EN_CHANNEL;
        if (ch !== PL_CHANNEL && ch !== EN_CHANNEL) return;

        // Nie twórz ticketu jeśli to wiadomość w już istniejącym wątku
        if (message.channel.isThread()) return;

        const threadName = isEN
            ? `ticket-${message.author.username}`
            : `ticket-${message.author.username}`;

        // Sprawdź czy ticket już istnieje
        const existing = message.channel.threads.cache.find(t => t.name === threadName && !t.archived);
        if (existing) {
            const reply = await message.reply(isEN
                ? `You already have an open ticket: ${existing}`
                : `Masz już otwarty ticket: ${existing}`);
            setTimeout(() => reply.delete().catch(() => {}), 8000);
            await message.delete().catch(() => {});
            return;
        }

        const thread = await message.channel.threads.create({
            name: threadName,
            type: ChannelType.PrivateThread,
            invitable: false,
            reason: `Ticket od ${message.author.tag}`,
        });

        await thread.members.add(message.author.id);

        await thread.send(isEN
            ? `👋 Hey ${message.author}, your ticket is open. Describe your issue and staff will help you shortly.`
            : `👋 Cześć ${message.author}, Twój ticket jest otwarty. Opisz problem, a obsługa pomoże Ci wkrótce.`
        );

        const reply = await message.reply(isEN
            ? `✅ Ticket created: ${thread}`
            : `✅ Ticket utworzony: ${thread}`);

        setTimeout(() => reply.delete().catch(() => {}), 8000);
        await message.delete().catch(() => {});
    });
};
