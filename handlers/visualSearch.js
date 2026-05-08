const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const API = 'https://qcitems.com/api/image-search/internal';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

function marketplaceToChannel(m) {
    const x = (m || '').toLowerCase();
    if (x === '1688' || x === 'alibaba') return 1;
    if (x === 'taobao' || x === 'tmall') return 2;
    if (x === 'weidian') return 3;
    return 3;
}

function buildUsfansUrl(result) {
    const id = result.goodsId || result.id;
    if (!id) return null;
    const channel = marketplaceToChannel(result.marketplace);
    return `https://www.usfans.com/product/${channel}/${encodeURIComponent(id)}?ref=MGRSBE`;
}

function formatPrice(result) {
    const p = result.discountPrice || result.price;
    if (!p) return null;
    const cur = result.currency ? ` ${result.currency}` : '';
    return `${p}${cur}`;
}

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
            formData.append('channel', '3');
            formData.append('page', '1');

            const res = await fetch(API, {
                method: 'POST',
                body: formData,
                headers: { 'User-Agent': UA },
            });
            const raw = await res.text();

            let data;
            try { data = JSON.parse(raw); }
            catch {
                console.error('[visualSearch] non-JSON response', res.status, raw.slice(0, 300));
                return thinking.edit(isEN ? '❌ Search failed (invalid response).' : '❌ Wyszukiwanie nie powiodło się (nieprawidłowa odpowiedź).');
            }

            if (!res.ok || data?.error) {
                console.error('[visualSearch] API error', res.status, data);
                return thinking.edit(isEN ? '❌ Search failed. Try another image.' : '❌ Wyszukiwanie nie powiodło się.');
            }

            const results = data.results || [];
            if (!results.length) {
                return thinking.edit(isEN ? '📭 No matches found.' : '📭 Brak wyników.');
            }

            const best = results[0];
            const usfansUrl = buildUsfansUrl(best);
            const title = best.title || (isEN ? 'Product' : 'Produkt');
            const productImg = best.image;
            const price = formatPrice(best);

            if (!usfansUrl) {
                console.error('[visualSearch] result has no id', best);
                return thinking.edit(isEN ? '❌ Got result but no product id.' : '❌ Otrzymano wynik, ale brak ID produktu.');
            }

            const description = `**[${title.replace(/[<>]/g, '')}](${usfansUrl})**${price ? ` — ${price}` : ''}`;

            const embed = new EmbedBuilder()
                .setColor(0x111111)
                .setTitle(isEN ? '🖼️ Best match' : '🖼️ Najbardziej podobny')
                .setURL(usfansUrl)
                .setDescription(description)
                .setThumbnail(attachment.url)
                .setFooter({ text: 'replug24.com • via USFans' });

            if (productImg) embed.setImage(productImg);

            await thinking.edit({ content: '', embeds: [embed] });

        } catch (e) {
            console.error('[visualSearch] exception', e);
            await thinking.edit(isEN ? '❌ Error. Try again.' : '❌ Wystąpił błąd. Spróbuj ponownie.');
        }
    });
};
