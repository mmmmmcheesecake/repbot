const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { boldSans } = require('./socialFeed');

// Obniżki cen z replug24.com -> kanały sale / promocje. Raz na dobę:
// - katalog: przedmioty z Weidiana (prawie cały katalog), cena na żywo z /api/product, jeden po drugim,
// - sprzedawcy: sklepy z kategorii Sellers, listowane hurtem przez /api/sheet?shop= (setki przedmiotów na zapytanie).
// Cenę porównujemy z tą z poprzedniego obejścia.
const SITE = 'https://replug24.com';
const SWEEP_EVERY = 24 * 3600 * 1000;
const STEP_MS = 8000;                       // ~6 tys. przedmiotów -> ok. 14 h na obejście katalogu
const COOLDOWN = 3 * 24 * 3600 * 1000;      // ten sam przedmiot najwyżej raz na 3 dni
const MAX_POSTS_PER_SWEEP = 20;
const MAX_SHOP_BATCHES = 10;
const MIN_RATIO = 0.3;                      // spadek poniżej 30% starej ceny to raczej tani wariant/dopłata, nie promocja

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'sale-prices.json');

const WEIDIAN_ID = [/usfans\.com\/product\/3\/(\d+)/, /weidian\.com\/item\.html\?itemI[dD]=(\d+)/];

const TEXT = {
    en: { label: 'PRICE DROP', buy: 'Buy on replug24', seller: 'Seller', preview: 'preview, sample price drop' },
    pl: { label: 'PROMOCJA', buy: 'Kup na replug24', seller: 'Sprzedawca', preview: 'podgląd, przykładowa obniżka' },
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
const absolute = (url) => (url && url.startsWith('/') ? SITE + url : url || null);

function decodeLink(link) {
    try { return decodeURIComponent(link); } catch { return link; }
}

async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url.replace(SITE, '').split('?')[0]} HTTP ${res.status}`);
    return res.json();
}

async function loadCatalog() {
    const lists = await Promise.all([getJson(`${SITE}/api/sheet`), getJson(`${SITE}/api/sheet?gender=women`)]);
    const items = new Map();
    for (const p of lists.flat()) {
        const link = decodeLink(p.link || '');
        const id = WEIDIAN_ID.map(re => link.match(re)?.[1]).find(Boolean);
        if (!id || items.has(id) || !p.name) continue;
        items.set(id, { id, name: p.name.replace(/\s+/g, ' ').trim(), batch: p.batch || '', link: p.link });
    }
    return [...items.values()];
}

// Przedmiot ze sklepu sprzedawcy. Klucz: itemID z Weidiana (wspólny z katalogiem), a dla Taobao / Yupoo
// id sklepu + id przedmiotu / albumu.
function sellerItem(shop, p) {
    if (!p.link || !p.name) return null;
    const link = decodeLink(p.link);
    const weidian = WEIDIAN_ID.map(re => link.match(re)?.[1]).find(Boolean);
    const key = link.match(/mi_id=([\w-]+)/)?.[1] || link.match(/[?&]id=(\d{5,})/)?.[1]
        || link.match(/albums\/(\d+)/)?.[1] || link.split('?')[0];
    const seller = shop.shopName || shop.name || null;
    const name = p.name.replace(/\s+/g, ' ').trim();
    return {
        id: weidian || `${shop.shopId}:${key}`,
        // albumy z Yupoo bywają podpisane samą ceną ("¥80") — wtedy tytułem jest sprzedawca
        name: /\p{L}/u.test(name) || !seller ? name : seller,
        batch: p.batch || '',
        link: p.link,
        img: p.imageOverride || null,
        yupoo: p.yupooAlbumUrl || null,
        seller,
    };
}

async function livePrice(id) {
    const url = `https://weidian.com/item.html?itemID=${id}`;
    const d = await getJson(`${SITE}/api/product?url=${encodeURIComponent(url)}`);
    return { price: d.priceUsd, stock: d.stock, image: d.image };
}

// Link do strony produktu, tak jak buduje go katalog na stronie (katalog.js)
function productUrl(item, live) {
    const q = new URLSearchParams({ url: item.link, name: item.name, batch: item.batch });
    if (item.img) q.set('img', item.img);
    // Taobao nie ma skąd wziąć ceny na stronie produktu, więc ją przekazujemy
    if (/kakobuy\.com|taobao\.com/i.test(item.link)) {
        q.set('price', String(live.price));
        q.set('cur', 'USD');
    }
    if (item.yupoo) q.set('yupoo', item.yupoo);
    return `${SITE}/produkt.html?${q}`;
}

// Kwota w walucie kanału: EN w dolarach, PL w złotówkach (kurs ten sam co na stronie, /api/rates)
function money(lang, usd, rates) {
    if (lang === 'pl') return `${Math.round(usd * rates.PLN)} zł`;
    return `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`;
}

function buildMessage(lang, item, oldPrice, live, rates, preview = false) {
    const t = TEXT[lang];
    const url = productUrl(item, live);
    const pct = Math.round((1 - live.price / oldPrice) * 100);
    const lines = [`## 🏷️ ${boldSans(t.label)} 🏷️`];
    if (preview) lines.push(`-# ${t.preview}`);
    const footer = [item.seller && `${t.seller}: ${item.seller}`, item.batch && `Batch: ${item.batch}`].filter(Boolean).join(' · ');
    const image = absolute(live.image || item.img);
    return {
        content: lines.join('\n'),
        embeds: [{
            title: item.name.slice(0, 256),
            url,
            description: `~~${money(lang, oldPrice, rates)}~~ ➜ **${money(lang, live.price, rates)}** (−${pct}%)\n\n🛒 **[${t.buy}](${url})**`,
            image: image ? { url: image } : undefined,
            footer: footer ? { text: footer } : undefined,
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

const status = { tracked: 0, done: 0, shops: 0, shopsDone: 0, sellerItems: 0, startedAt: null, finishedAt: null, posted: 0, errors: 0, lastError: null };
let running = false;
let catalog = [];

async function check(client, store, item, live, rates) {
    if (!(live.price > 0)) return;
    const prev = store[item.id];
    store[item.id] = { ...prev, p: live.price };
    if (!isSale(prev, live) || status.posted >= MAX_POSTS_PER_SWEEP) return;
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

async function sweepCatalog(client, store, rates) {
    for (const item of catalog) {
        await sleep(STEP_MS);
        status.done++;
        try {
            await check(client, store, item, await livePrice(item.id), rates);
        } catch (err) {
            status.errors++;
            status.lastError = err.message;
        }
        if (status.done % 100 === 0) writeStore(store);
    }
}

async function sweepSellers(client, store, rates) {
    const inCatalog = new Set(catalog.map(i => i.id));
    const shops = await getJson(`${SITE}/api/sheet?sellers=1`);
    status.shops = shops.length;
    for (const shop of shops) {
        for (let batch = 0; batch < MAX_SHOP_BATCHES; batch++) {
            await sleep(STEP_MS);
            let hasMore = false;
            try {
                const res = await fetch(`${SITE}/api/sheet?shop=${encodeURIComponent(shop.shopId)}&batch=${batch}`);
                if (!res.ok) throw new Error(`sklep ${shop.shopName || shop.shopId} HTTP ${res.status}`);
                hasMore = res.headers.get('x-shop-has-more') === '1';
                for (const p of await res.json()) {
                    const item = sellerItem(shop, p);
                    if (!item || inCatalog.has(item.id)) continue;
                    status.sellerItems++;
                    await check(client, store, item, { price: p.livePrice, image: p.image }, rates);
                }
            } catch (err) {
                status.errors++;
                status.lastError = err.message;
            }
            if (!hasMore) break;
        }
        status.shopsDone++;
        writeStore(store);
    }
}

async function sweep(client) {
    if (running) return;
    running = true;
    try {
        const store = readStore();
        catalog = await loadCatalog();
        const rates = await getJson(`${SITE}/api/rates`).then(r => r.rates).catch(() => ({ PLN: 4 }));
        Object.assign(status, { tracked: catalog.length, done: 0, shops: 0, shopsDone: 0, sellerItems: 0, startedAt: Date.now(), posted: 0, errors: 0 });

        await sweepCatalog(client, store, rates);
        await sweepSellers(client, store, rates);
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
        const progress = status.done < status.tracked
            ? `katalog ${status.done}/${status.tracked}`
            : `sprzedawcy ${status.shopsDone}/${status.shops} sklepów`;
        return message.reply([
            `🏷️ Obniżki → ${channels}`,
            `Katalog (Weidian): **${status.tracked}** · przedmioty sprzedawców: **${status.sellerItems}** · zapamiętane ceny: **${known}**`,
            running
                ? `Obejście w toku: ${progress}, start ${when(status.startedAt)}`
                : `Ostatnie pełne obejście: ${when(status.finishedAt)}`,
            `Wrzucone w tym obejściu: ${status.posted} · błędy: ${status.errors}${status.lastError ? ` (ostatni: \`${status.lastError}\`)` : ''}`,
            '`!sale preview [pl|en]` — przykładowa wiadomość tutaj',
        ].join('\n'));
    });
};

module.exports.loadCatalog = loadCatalog;
