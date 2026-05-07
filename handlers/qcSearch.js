const { EmbedBuilder } = require('discord.js');

const PL_CHANNEL = 'qc';
const EN_CHANNEL = 'qc-en';
const API = 'https://replug24.com/api/qc';
const IMG_API = 'https://replug24.com/api/qcimg';

function b64url(s) {
    return Buffer.from(s).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function proxyImg(url) {
    return `${IMG_API}?u=${b64url(url)}`;
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const ch = message.channel.name;
        const isEN = ch === EN_CHANNEL;
        if (ch !== PL_CHANNEL && ch !== EN_CHANNEL) return;

        const urlMatch = message.content.match(/https?:\/\/[^\s]+/);
        if (!urlMatch) return;

        const productUrl = urlMatch[0];
        const thinking = await message.reply(isEN ? '🔍 Searching for QC photos...' : '🔍 Szukam zdjęć QC...');

        try {
            const res = await fetch(`${API}?url=${encodeURIComponent(productUrl)}`);
            const data = await res.json();

            if (!res.ok || data?.error) {
                return thinking.edit(isEN ? '❌ Could not load QC photos.' : '❌ Nie udało się pobrać zdjęć QC.');
            }

            if (!data.sets?.length) {
                return thinking.edit(isEN ? '📭 No QC photos found for this product.' : '📭 Brak zdjęć QC dla tego produktu.');
            }

            const firstSet = data.sets[0];
            const firstPhoto = firstSet.photos[0];

            // Embed z pierwszym zdjęciem i podsumowaniem
            const embed = new EmbedBuilder()
                .setColor(0x111111)
                .setTitle(isEN
                    ? `QC Photos — ${data.totalPhotos} photos from ${data.sources.join(', ')}`
                    : `Zdjęcia QC — ${data.totalPhotos} zdjęć z ${data.sources.join(', ')}`)
                .setImage(proxyImg(firstPhoto.url.includes('qcimg') ? productUrl : firstPhoto.url))
                .setFooter({ text: `${firstSet.sourceLabel} • replug24.com` });

            // Linki do wszystkich setów
            const links = data.sets.map(s =>
                `**${s.sourceLabel}** — ${s.photos.length} ${isEN ? 'photos' : 'zdjęć'}`
            ).join('\n');

            await thinking.edit({
                content: links,
                embeds: [embed],
            });

        } catch (e) {
            console.error(e);
            await thinking.edit('❌ Error. Try again.');
        }
    });
};
