const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const API = 'https://qcitems.com/api/image-search/internal';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const CHANNEL_LABEL = { 1: '1688', 2: 'Taobao', 3: 'Weidian' };

function marketplaceToChannel(m) {
    const x = (m || '').toLowerCase();
    if (x === '1688' || x === 'alibaba') return 1;
    if (x === 'taobao' || x === 'tmall') return 2;
    if (x === 'weidian') return 3;
    return null;
}

function buildUsfansUrl(result, fallbackChannel) {
    const id = result.goodsId || result.id;
    if (!id) return null;
    const channel = marketplaceToChannel(result.marketplace) || fallbackChannel;
    return `https://www.usfans.com/product/${channel}/${encodeURIComponent(id)}?ref=MGRSBE`;
}

function formatPrice(result) {
    const p = result.discountPrice || result.price;
    if (!p) return null;
    const cur = result.currency ? ` ${result.currency}` : '';
    return `${p}${cur}`;
}

async function searchChannel(imgBuffer, contentType, fileName, channel) {
    const fd = new FormData();
    fd.append('image', new Blob([imgBuffer], { type: contentType }), fileName);
    fd.append('channel', String(channel));
    fd.append('page', '1');

    const res = await fetch(API, {
        method: 'POST',
        body: fd,
        headers: { 'User-Agent': UA },
    });
    const raw = await res.text();
    try {
        const data = JSON.parse(raw);
        return { channel, ok: res.ok && !data?.error, data };
    } catch {
        console.error('[visualSearch] non-JSON', channel, res.status, raw.slice(0, 200));
        return { channel, ok: false };
    }
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

            const channels = [3, 2, 1];
            const responses = await Promise.all(
                channels.map(c => searchChannel(imgBuffer, attachment.contentType, attachment.name, c))
            );

            const withResults = responses.find(r => r.ok && r.data?.results?.length);
            if (!withResults) {
                const allFailed = responses.every(r => !r.ok);
                if (allFailed) {
                    console.error('[visualSearch] all channels failed', responses.map(r => ({ ch: r.channel, status: r.data?.error })));
                    return thinking.edit(isEN ? '❌ Search failed. Try another image.' : '❌ Wyszukiwanie nie powiodło się.');
                }
                return thinking.edit(isEN ? '📭 No matches found.' : '📭 Brak wyników.');
            }

            const best = withResults.data.results[0];
            const usfansUrl = buildUsfansUrl(best, withResults.channel);
            if (!usfansUrl) {
                console.error('[visualSearch] result has no id', best);
                return thinking.edit(isEN ? '❌ Got result but no product id.' : '❌ Otrzymano wynik, ale brak ID produktu.');
            }

            const title = (best.title || (isEN ? 'Product' : 'Produkt')).replace(/[<>]/g, '');
            const productImg = best.image;
            const price = formatPrice(best);
            const sourceLabel = CHANNEL_LABEL[withResults.channel] || '';

            const description = `**[${title}](${usfansUrl})**${price ? ` — ${price}` : ''}`;

            const embed = new EmbedBuilder()
                .setColor(0x111111)
                .setTitle(isEN ? '🖼️ Best match' : '🖼️ Najbardziej podobny')
                .setURL(usfansUrl)
                .setDescription(description)
                .setThumbnail(attachment.url)
                .setFooter({ text: `${sourceLabel} • replug24.com` });

            if (productImg) embed.setImage(productImg);

            await thinking.edit({ content: '', embeds: [embed] });

        } catch (e) {
            console.error('[visualSearch] exception', e);
            await thinking.edit(isEN ? '❌ Error. Try again.' : '❌ Wystąpił błąd. Spróbuj ponownie.');
        }
    });
};
