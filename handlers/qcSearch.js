const { EmbedBuilder } = require('discord.js');
const config = require('../config');

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

        const chId = message.channel.id;
        const isPL = chId === config.channels.pl.qc;
        const isEN = chId === config.channels.en.qc;
        if (!isPL && !isEN) return;

        const urlMatch = message.content.match(/https?:\/\/[^\s]+/);
        if (!urlMatch) return;

        const productUrl = urlMatch[0];
        const thinking = await message.reply(isEN ? '🔍 Searching for QC photos...' : '🔍 Szukam zdjęć QC...');

        try {
            const res = await fetch(`${API}?url=${encodeURIComponent(productUrl)}`);
            const raw = await res.text();

            let data;
            try {
                data = JSON.parse(raw);
            } catch {
                console.error('[qcSearch] non-JSON response', res.status, raw.slice(0, 500));
                return thinking.edit(isEN ? '❌ Could not load QC photos (invalid response).' : '❌ Nie udało się pobrać zdjęć QC (nieprawidłowa odpowiedź).');
            }

            if (!res.ok || data?.error) {
                console.error('[qcSearch] API error', res.status, data);
                return thinking.edit(isEN ? '❌ Could not load QC photos.' : '❌ Nie udało się pobrać zdjęć QC.');
            }

            if (!data.sets?.length) {
                return thinking.edit(isEN ? '📭 No QC photos found.' : '📭 Brak zdjęć QC dla tego produktu.');
            }

            const photoLabel = isEN ? 'photos' : 'zdjęć';

            const embeds = data.sets.slice(0, 10).map((s, i) => {
                const firstPhoto = s.photos[0];
                const imgUrl = proxyImg(firstPhoto.url);
                const linkUrl = s.url || firstPhoto.url;

                const eb = new EmbedBuilder()
                    .setColor(0x111111)
                    .setTitle(`${s.sourceLabel} — ${s.photos.length} ${photoLabel}`)
                    .setURL(linkUrl)
                    .setImage(imgUrl);

                if (i === 0) {
                    eb.setAuthor({
                        name: isEN
                            ? `QC Photos — ${data.totalPhotos} from ${data.sources.join(', ')}`
                            : `Zdjęcia QC — ${data.totalPhotos} z ${data.sources.join(', ')}`,
                    });
                }
                if (i === Math.min(data.sets.length, 10) - 1) {
                    eb.setFooter({ text: 'replug24.com' });
                }
                return eb;
            });

            await thinking.edit({ content: '', embeds });

        } catch (e) {
            console.error('[qcSearch] exception', e);
            await thinking.edit(isEN ? '❌ Error. Try again.' : '❌ Wystąpił błąd. Spróbuj ponownie.');
        }
    });
};
