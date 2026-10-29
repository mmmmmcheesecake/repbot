const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const tiktok = require('../social/tiktok');
const instagram = require('../social/instagram');

const POLL_MS = 10 * 60 * 1000;
const MAX_AGE_MS = 48 * 3600 * 1000;
const PLATFORMS = { tiktok, instagram };

const ID_PATTERNS = [/tiktok\.com\/@[^/\s]+\/(?:video|photo)\/(\d+)/g, /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/g];

const TEXT = {
    en: {
        tiktok: { icon: '🎵', label: 'NEW TIKTOK DROP' },
        instagram: { icon: '📸', label: 'NEW REEL DROP' },
        links: 'All links',
        watch: 'Watch now',
    },
    pl: {
        tiktok: { icon: '🎵', label: 'NOWY TIKTOK' },
        instagram: { icon: '📸', label: 'NOWA ROLKA' },
        links: 'Wszystkie linki',
        watch: 'Oglądaj',
    },
};

// A-Z / 0-9 -> Unicode "Mathematical Sans-Serif Bold"; reszta (np. polskie znaki) bez zmian
function boldSans(str) {
    return [...str].map(ch => {
        const c = ch.codePointAt(0);
        if (c >= 65 && c <= 90) return String.fromCodePoint(0x1D5D4 + c - 65);
        if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D5EE + c - 97);
        if (c >= 48 && c <= 57) return String.fromCodePoint(0x1D7EC + c - 48);
        return ch;
    }).join('');
}

function captionSummary(caption) {
    const clean = caption.replace(/[#@]\S+/g, '').replace(/\s+/g, ' ').trim();
    const first = clean.split(/(?<=[.!?])\s/)[0] || '';
    return first.length > 160 ? first.slice(0, 157) + '…' : first;
}

function buildMessage(source, post) {
    const t = TEXT[source.lang];
    const p = t[source.platform];
    const lines = ['@everyone', `## ${p.icon} ${boldSans(p.label)} ${p.icon}`];

    const summary = captionSummary(post.caption);
    if (summary) lines.push(`> **${summary}**`);

    lines.push('', `🛒 **${t.links} ➜ <https://replug24.com>**`);
    lines.push(`▶️ **${t.watch}:** ${post.url}`);
    return lines.join('\n');
}

const state = new Map(); // key -> { seen:Set, lastCheck, lastError, seeded }
const keyOf = (s) => `${s.platform}:${s.username}`;

async function seedFromHistory(client, source, st) {
    const channel = await client.channels.fetch(source.channelId);
    const messages = await channel.messages.fetch({ limit: 100 });
    for (const msg of messages.values()) {
        if (msg.author.id !== client.user.id) continue;
        for (const re of ID_PATTERNS) for (const m of msg.content.matchAll(re)) st.seen.add(m[1]);
    }
    st.seeded = true;
}

async function publish(client, source, post, { ping = true, channelOverride = null } = {}) {
    const channel = channelOverride || await client.channels.fetch(source.channelId);
    let content = buildMessage(source, post);
    if (!ping) content = content.replace('@everyone\n', '');
    await channel.send({ content, allowedMentions: { parse: ping ? ['everyone'] : [] } });
}

async function checkSource(client, source) {
    const st = state.get(keyOf(source));
    try {
        if (!st.seeded) await seedFromHistory(client, source, st);
        const posts = await PLATFORMS[source.platform].fetchLatest(source);
        const fresh = posts
            .filter(p => !st.seen.has(p.id) && Date.now() - p.createdAt < MAX_AGE_MS)
            .reverse();
        for (const post of fresh) {
            await publish(client, source, post);
            st.seen.add(post.id);
            console.log(`[social] opublikowano ${source.platform} @${source.username} ${post.id}`);
        }
        st.lastError = null;
    } catch (err) {
        st.lastError = err.message;
        console.error(`[social] ${source.platform} @${source.username}:`, err.message);
    }
    st.lastCheck = Date.now();
}

function activeSources() {
    return config.socialFeed.filter(s => s.platform !== 'instagram' || instagram.hasToken(s));
}

let running = false;
async function checkAll(client) {
    if (running) return;
    running = true;
    try {
        for (const source of activeSources()) await checkSource(client, source);
    } finally {
        running = false;
    }
}

async function findPost(url) {
    for (const source of activeSources()) {
        if (source.platform === 'tiktok' && !url.includes(`tiktok.com/@${source.username}/`)) continue;
        if (source.platform === 'instagram' && !url.includes('instagram.com/')) continue;
        const posts = await PLATFORMS[source.platform].fetchLatest(source, 15);
        const post = posts.find(p => url.includes(p.id));
        if (post) return { source, post };
    }
    return null;
}

const USAGE =
    'Użycie:\n' +
    '`!feed` — status i sprawdzenie nowych filmików teraz\n' +
    '`!feed preview <link>` — podgląd wiadomości tutaj (bez @everyone)\n' +
    '`!feed post <link>` — wrzuć filmik na jego kanał (np. starszy, pominięty)';

module.exports = (client) => {
    for (const s of config.socialFeed) state.set(keyOf(s), { seen: new Set(), lastCheck: null, lastError: null, seeded: false });

    client.once('clientReady', () => {
        const loop = () => checkAll(client).finally(() => setTimeout(loop, POLL_MS));
        setTimeout(loop, 30 * 1000);
    });

    client.on('messageCreate', async (message) => {
        if (!message.content.startsWith('!feed')) return;
        if (!message.guild || message.author.bot) return;
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        const [, sub, url] = message.content.trim().split(/\s+/);

        if (!sub) {
            await checkAll(client);
            const lines = config.socialFeed.map(s => {
                const st = state.get(keyOf(s));
                if (s.platform === 'instagram' && !instagram.hasToken(s)) return `⚪ ${s.platform} @${s.username} — brak tokenu \`${s.tokenEnv}\``;
                const when = st.lastCheck ? `<t:${Math.floor(st.lastCheck / 1000)}:R>` : '—';
                return `${st.lastError ? '🔴' : '🟢'} ${s.platform} @${s.username} → <#${s.channelId}> · sprawdzono ${when}${st.lastError ? ` · \`${st.lastError}\`` : ''}`;
            });
            return message.reply(lines.join('\n') + '\n\n' + USAGE);
        }

        if ((sub !== 'preview' && sub !== 'post') || !url) return message.reply(USAGE);

        await message.channel.sendTyping().catch(() => {});
        try {
            const found = await findPost(url);
            if (!found) return message.reply('❌ Nie znalazłem tego filmiku wśród ostatnich 15 z obserwowanych kont.');
            if (sub === 'preview') {
                await publish(client, found.source, found.post, { ping: false, channelOverride: message.channel });
            } else {
                state.get(keyOf(found.source)).seen.add(found.post.id);
                await publish(client, found.source, found.post);
                await message.reply(`✅ Wrzucone na <#${found.source.channelId}>.`);
            }
        } catch (err) {
            console.error('[social] !feed:', err);
            await message.reply('❌ Błąd: ' + err.message);
        }
    });
};

module.exports.buildMessage = buildMessage;
