const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const API = 'https://replug24.com/api/qc';
const QC_PAGE = 'https://replug24.com/qc';
const HOST = 'https://replug24.com';

function toAbsolute(u) {
    if (!u) return null;
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return `${HOST}${u}`;
    return u;
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
        const qcUrl = `${QC_PAGE}?url=${encodeURIComponent(productUrl)}`;

        const thinking = await message.reply(isEN ? '🔍 Searching for QC photos...' : '🔍 Szukam zdjęć QC...');

        const fallbackEmbed = () => new EmbedBuilder()
            .setColor(0x111111)
            .setTitle(isEN ? '📸 QC Photos' : '📸 Zdjęcia QC')
            .setURL(qcUrl)
            .setDescription(isEN
                ? `[Open QC photos on replug24 →](${qcUrl})`
                : `[Otwórz zdjęcia QC na replug24 →](${qcUrl})`)
            .setFooter({ text: 'replug24.com' });

        try {
            const res = await fetch(`${API}?url=${encodeURIComponent(productUrl)}`);
            const raw = await res.text();

            let data;
            try { data = JSON.parse(raw); }
            catch {
                console.error('[qcSearch] non-JSON response', res.status, raw.slice(0, 300));
                return thinking.edit({ content: '', embeds: [fallbackEmbed()] });
            }

            if (!res.ok || data?.error) {
                console.error('[qcSearch] API error', res.status, data);
                return thinking.edit({ content: '', embeds: [fallbackEmbed()] });
            }

            if (!data.sets?.length) {
                return thinking.edit(isEN ? '📭 No QC photos found.' : '📭 Brak zdjęć QC dla tego produktu.');
            }

            const photoLabel = isEN ? 'photos' : 'zdjęć';
            const sets = data.sets.slice(0, 10);

            const embeds = sets.map((s, i) => {
                const firstPhoto = s.photos[0];
                const photoUrl = toAbsolute(firstPhoto.url);

                const eb = new EmbedBuilder()
                    .setColor(0x111111)
                    .setTitle(`${s.sourceLabel} — ${s.photos.length} ${photoLabel}`)
                    .setURL(qcUrl)
                    .setImage(photoUrl);

                if (i === 0) {
                    eb.setAuthor({
                        name: isEN
                            ? `QC Photos — ${data.totalPhotos} from ${data.sources.join(', ')}`
                            : `Zdjęcia QC — ${data.totalPhotos} z ${data.sources.join(', ')}`,
                    });
                }
                if (i === sets.length - 1) {
                    eb.setFooter({
                        text: isEN
                            ? `Open full gallery on replug24.com`
                            : `Otwórz pełną galerię na replug24.com`,
                    });
                }
                return eb;
            });

            await thinking.edit({ content: '', embeds });

        } catch (e) {
            console.error('[qcSearch] exception', e);
            await thinking.edit({ content: '', embeds: [fallbackEmbed()] });
        }
    });
};
