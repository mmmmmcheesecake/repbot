const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const API = 'https://replug24.com/api/visual-search';

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const chId = message.channel.id;
        const isPL = chId === config.channels.pl.visualSearch;
        const isEN = chId === config.channels.en.visualSearch;
        if (!isPL && !isEN) return;

        const attachment = message.attachments.first();
        if (!attachment || !attachment.contentType?.startsWith('image/')) return;

        const thinking = await message.reply(isEN ? '🔍 Searching by image...' : '🔍 Szukam po zdjęciu...');

        try {
            const imgRes = await fetch(attachment.url);
            const imgBuffer = await imgRes.arrayBuffer();

            const formData = new FormData();
            formData.append('image', new Blob([imgBuffer], { type: attachment.contentType }), attachment.name);

            const res = await fetch(API, { method: 'POST', body: formData });
            const data = await res.json();

            if (!res.ok || data?.error) {
                return thinking.edit(isEN ? '❌ Search failed. Try another image.' : '❌ Wyszukiwanie nie powiodło się.');
            }

            const results = data.results || data.items || [];
            if (!results.length) {
                return thinking.edit(isEN ? '📭 No matches found.' : '📭 Brak wyników.');
            }

            const lines = results.slice(0, 5).map((r, i) =>
                `**${i + 1}.** [${r.title || r.name || 'Produkt'}](${r.url || r.link}) — $${r.price || '?'}`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x111111)
                .setTitle(isEN ? `🖼️ Visual search — ${results.length} results` : `🖼️ Wyszukiwanie po zdjęciu — ${results.length} wyników`)
                .setThumbnail(attachment.url)
                .setDescription(lines)
                .setFooter({ text: 'replug24.com' });

            await thinking.edit({ content: '', embeds: [embed] });

        } catch (e) {
            console.error(e);
            await thinking.edit('❌ Error. Try again.');
        }
    });
};
