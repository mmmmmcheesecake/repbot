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
            if (!imgRes.ok) throw new Error(`image download ${imgRes.status}`);
            const imgBuffer = await imgRes.arrayBuffer();

            const formData = new FormData();
            formData.append('image', new Blob([imgBuffer], { type: attachment.contentType }), attachment.name);

            const res = await fetch(API, { method: 'POST', body: formData });
            const raw = await res.text();

            let data;
            try {
                data = JSON.parse(raw);
            } catch {
                console.error('[visualSearch] non-JSON response', res.status, raw.slice(0, 500));
                return thinking.edit(isEN ? '❌ Search failed (invalid response).' : '❌ Wyszukiwanie nie powiodło się (nieprawidłowa odpowiedź).');
            }

            if (!res.ok || data?.error) {
                console.error('[visualSearch] API error', res.status, data);
                return thinking.edit(isEN ? '❌ Search failed. Try another image.' : '❌ Wyszukiwanie nie powiodło się.');
            }

            const results = data.results || data.items || [];
            if (!results.length) {
                return thinking.edit(isEN ? '📭 No matches found.' : '📭 Brak wyników.');
            }

            const best = results[0];
            const title = best.title || best.name || (isEN ? 'Product' : 'Produkt');
            const url = best.url || best.link;
            const price = best.price ? `$${best.price}` : null;
            const productImg = best.image || best.thumbnail || best.imageUrl;

            const embed = new EmbedBuilder()
                .setColor(0x111111)
                .setTitle(isEN ? '🖼️ Best match' : '🖼️ Najbardziej podobny')
                .setURL(url)
                .setDescription(`**[${title}](${url})**${price ? ` — ${price}` : ''}`)
                .setThumbnail(attachment.url)
                .setFooter({ text: 'replug24.com' });

            if (productImg) embed.setImage(productImg);

            await thinking.edit({ content: '', embeds: [embed] });

        } catch (e) {
            console.error('[visualSearch] exception', e);
            await thinking.edit(isEN ? '❌ Error. Try again.' : '❌ Wystąpił błąd. Spróbuj ponownie.');
        }
    });
};
