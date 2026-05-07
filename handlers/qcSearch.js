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
            const data = await res.json();

            if (!res.ok || data?.error) {
                return thinking.edit(isEN ? '❌ Could not load QC photos.' : '❌ Nie udało się pobrać zdjęć QC.');
            }

            if (!data.sets?.length) {
                return thinking.edit(isEN ? '📭 No QC photos found.' : '📭 Brak zdjęć QC dla tego produktu.');
            }

            const firstPhoto = data.sets[0].photos[0];
            const imgUrl = proxyImg(firstPhoto.url);

            const lines = data.sets.map(s =>
                `**${s.sourceLabel}** — ${s.photos.length} ${isEN ? 'photos' : 'zdjęć'}`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x111111)
                .setTitle(isEN
                    ? `QC Photos — ${data.totalPhotos} from ${data.sources.join(', ')}`
                    : `Zdjęcia QC — ${data.totalPhotos} z ${data.sources.join(', ')}`)
                .setImage(imgUrl)
                .setFooter({ text: `${data.sets[0].sourceLabel} • replug24.com` });

            await thinking.edit({ content: lines, embeds: [embed] });

        } catch (e) {
            console.error(e);
            await thinking.edit('❌ Error. Try again.');
        }
    });
};
