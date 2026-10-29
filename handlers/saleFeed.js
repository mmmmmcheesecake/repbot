const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { boldSans } = require('./socialFeed');

// Obniżki cen z katalogu replug24.com -> kanały sale / promocje.
// Raz na dobę obchodzimy wszystkie przedmioty z Weidiana (prawie cały katalog) i porównujemy
// cenę na żywo (to samo /api/product co strona produktu) z ceną z poprzedniego obejścia.
const SITE = 'https://replug24.com';
const SWEEP_EVERY = 24 * 3600 * 1000;
const STEP_MS = 8000;                       // ~6 tys. przedmiotów -> ok. 14 h na obejście
const COOLDOWN = 3 * 24 * 3600 * 1000;      // ten sam przedmiot najwyżej raz na 3 dni
const MAX_POSTS_PER_SWEEP = 20;
const MIN_RATIO = 0.3;                      // spadek poniżej 30% starej ceny to raczej tani wariant/dopłata, nie promocja

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'sale-prices.json');

const WEIDIAN_ID = [/usfans\.com\/product\/3\/(\d+)/, /weidian\.com\/item\.html\?itemI[dD]=(\d+)/];

const TEXT = {
    en: { label: 'PRICE DROP', buy: 'Buy on replug24', preview: 'preview, sample price drop' },
    pl: { label: 'PROMOCJA', buy: 'Kup na replug24', preview: 'podgląd, przykładowa obniżka' },
};

function readStore() {
    try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; }
}

function writeStore(store) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE, JSON.stringify(store));
    } catch (err) {
        console.error('[sale] nie zapisano cen:', err.message);
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url.replace(SITE, '').split('?')[0]} HTTP ${res.status}`);
    return res.json();
}

async function loadCatalog() {
    const lists = await Promise.all([getJson(`${SITE}/api/sheet`), getJson(`${SITE}/api/sheet?gender=women`)]);
    const items = new Map();
    for (const p of lists.flat()) {
        let link = p.link || '';
        try { link = decodeURIComponent(link); } catch {}
        const id = WEIDIAN_ID.map(re => link.match(re)?.[1]).find(Boolean);
        if (!id || items.has(id) || !p.name) continue;
        items.set(id, { id, name: p.name.replace(/\s+/g, ' ').trim(), batch: p.batch || '', link: p.link });
    }
    return [...items.values()];
}

async function livePrice(id) {
    const url = `https://weidian.com/item.html?itemID=${id}`;
    const d = await getJson(`${SITE}/api/product?url=${encodeURIComponent(url)}`);
    return { price: d.priceUsd, stock: d.stock, image: d.image };
}

// Kwota w walucie kanału: EN w dolarach, PL w złotówkach (kurs ten sam co na stronie, /api/rates)
function money(lang, usd, rates) {
    return lang === 'pl' ? `${Math.round(usd * rates.PLN)} zł` : `$${usd.toFixed(2)}`;
}

function buildMessage(lang, item, oldPrice, live, rates, preview = false) {
    const t = TEXT[lang];
    const url = `${SITE}/produkt.html?${new URLSearchParams({ url: item.link, name: item.name, batch: item.batch })}`;
    const pct = Math.round((1 - live.price / oldPrice) * 100);
    const lines = [`## 🏷️ ${boldSans(t.label)} 🏷️`];
    if (preview) lines.push(`-# ${t.preview}`);
    return {
        content: lines.join('\n'),
        embeds: [{
            title: item.name.slice(0, 256),
            url,
            description: `~~${money(lang, oldPrice, rates)}~~ ➜ **${money(lang, live.price, rates)}** (−${pct}%)\n\n🛒 **[${t.buy}](${url})**`,
            image: live.image ? { url: live.image } : undefined,
            footer: item.batch ? { text: `Batch: ${item.batch}` } : undefined,
            color: 0xE74C3C,
        }],
        allowedMentions: { parse: [] },
    };
}

function isSale(prev, live) {
    if (!prev?.p || live.price >= prev.p || live.price < prev.p * MIN_RATIO) return false;
    if (live.stock === 0) return false;
    return !(prev.posted && Date.now() - prev.posted < COOLDOWN);
}

// Wrzuca na każdy kanał, na którym obniżka przekracza próg w jego walucie (5 $ / 20 zł).
async function announce(client, item, oldPrice, live, rates) {
    let sent = false;
    for (const ch of config.saleFeed) {
        const drop = (oldPrice - live.price) * (ch.lang === 'pl' ? rates.PLN : 1);
        if (drop < ch.minDrop) continue;
        const channel = await client.channels.fetch(ch.channelId);
        await channel.send(buildMessage(ch.lang, item, oldPrice, live, rates));
        sent = true;
    }
    return sent;
}

const status = { tracked: 0, done: 0, startedAt: null, finishedAt: null, posted: 0, errors: 0, lastError: null };
let running = false;
let catalog = [];

async function sweep(client) {
    if (running) return;
    running = true;
    try {
        const store = readStore();
        catalog = await loadCatalog();
        const rates = await getJson(`${SITE}/api/rates`).then(r => r.rates).catch(() => ({ PLN: 4 }));
        Object.assign(status, { tracked: catalog.length, done: 0, startedAt: Date.now(), posted: 0, errors: 0 });

        for (const item of catalog) {
            await sleep(STEP_MS);
            status.done++;
            let live;
            try {
                live = await livePrice(item.id);
            } catch (err) {
                status.errors++;
                status.lastError = err.message;
                continue;
            }
            if (!(live.price > 0)) continue;

            const prev = store[item.id];
            store[item.id] = { ...prev, p: live.price };
            if (isSale(prev, live) && status.posted < MAX_POSTS_PER_SWEEP) {
                try {
                    if (await announce(client, item, prev.p, live, rates)) {
                        store[item.id].posted = Date.now();
                        status.posted++;
                        console.log(`[sale] ${item.name} ${prev.p} -> ${live.price} USD`);
                    }
                } catch (err) {
                    status.lastError = err.message;
                    console.error('[sale] wysyłka:', err.message);
                }
            }
            if (status.done % 100 === 0) writeStore(store);
        }
        writeStore(store);
        status.finishedAt = Date.now();
    } catch (err) {
        status.lastError = err.message;
        console.error('[sale]', err.message);
    } finally {
        running = false;
    }
}

module.exports = (client) => {
    client.once('clientReady', () => {
        const loop = async () => {
            const start = Date.now();
            await sweep(client);
            setTimeout(loop, Math.max(60 * 1000, SWEEP_EVERY - (Date.now() - start)));
        };
        setTimeout(loop, 60 * 1000);
    });

    client.on('messageCreate', async (message) => {
        if (!message.content.startsWith('!sale')) return;
        if (!message.guild || message.author.bot) return;
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        const [, sub, lang = 'pl'] = message.content.trim().split(/\s+/);

        if (sub === 'preview') {
            if (!catalog.length) return message.reply('Katalog jeszcze się nie wczytał, spróbuj za minutę.');
            if (!TEXT[lang]) return message.reply('Użycie: `!sale preview [pl|en]`');
            try {
                const item = catalog[Math.floor(Math.random() * catalog.length)];
                const live = await livePrice(item.id);
                if (!(live.price > 0)) return message.reply('Wylosowany przedmiot nie ma ceny, spróbuj jeszcze raz.');
                const rates = await getJson(`${SITE}/api/rates`).then(r => r.rates).catch(() => ({ PLN: 4 }));
                return message.channel.send(buildMessage(lang, item, live.price * 1.25, live, rates, true));
            } catch (err) {
                return message.reply('❌ Błąd: ' + err.message);
            }
        }

        const known = Object.keys(readStore()).length;
        const when = (t) => (t ? `<t:${Math.floor(t / 1000)}:R>` : '—');
        const channels = config.saleFeed.map(c => `<#${c.channelId}> (od ${c.lang === 'pl' ? `${c.minDrop} zł` : `$${c.minDrop}`})`).join(', ');
        return message.reply([
            `🏷️ Obniżki → ${channels}`,
            `Przedmioty z Weidiana w katalogu: **${status.tracked}**, zapamiętane ceny: **${known}**`,
            running
                ? `Obejście w toku: ${status.done}/${status.tracked}, start ${when(status.startedAt)}`
                : `Ostatnie pełne obejście: ${when(status.finishedAt)}`,
            `Wrzucone w tym obejściu: ${status.posted} · błędy: ${status.errors}${status.lastError ? ` (ostatni: \`${status.lastError}\`)` : ''}`,
            '`!sale preview [pl|en]` — przykładowa wiadomość tutaj',
        ].join('\n'));
    });
};
