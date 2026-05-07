const { ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')); }
    catch { return {}; }
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.channel.isThread()) return;

        const config = loadConfig();
        const chId = message.channel.id;
        const isPL = chId === config.channels?.pl?.tickets;
        const isEN = chId === config.channels?.en?.tickets;
        if (!isPL && !isEN) return;

        const threadName = `ticket-${message.author.username}`;

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
