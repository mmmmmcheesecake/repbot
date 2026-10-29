const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Instagram API with Instagram Login (konto profesjonalne). Token long-lived jest ważny 60 dni,
// odświeżamy go co tydzień i zapisujemy na wolumenie Railway, żeby przetrwał restart.
const GRAPH = 'https://graph.instagram.com';
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'instagram-tokens.json');
const REFRESH_EVERY = 7 * 24 * 3600 * 1000;

function readStore() {
    try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; }
}

function writeStore(store) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
    } catch (err) {
        console.error('[instagram] nie zapisano tokenów:', err.message);
    }
}

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function currentToken(source) {
    const envToken = process.env[source.tokenEnv];
    if (!envToken) return null;
    const saved = readStore()[source.username];
    // nowy token w env (np. wygenerowany od zera) ma pierwszeństwo przed zapisanym
    if (saved && saved.base === hash(envToken)) return saved;
    return { base: hash(envToken), token: envToken, refreshedAt: 0 };
}

async function refreshIfDue(source, entry) {
    if (Date.now() - entry.refreshedAt < REFRESH_EVERY) return entry;
    const res = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(entry.token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
        console.error(`[instagram] refresh tokenu @${source.username} nieudany:`, data.error?.message || res.status);
        return entry;
    }
    const next = {
        base: entry.base,
        token: data.access_token,
        refreshedAt: Date.now(),
        expiresAt: Date.now() + (data.expires_in || 0) * 1000,
    };
    const store = readStore();
    store[source.username] = next;
    writeStore(store);
    return next;
}

function hasToken(source) {
    return Boolean(process.env[source.tokenEnv]);
}

// Najnowsze rolki konta, od najnowszej.
async function fetchLatest(source, count = 15) {
    let entry = currentToken(source);
    if (!entry) throw new Error(`brak tokenu ${source.tokenEnv}`);
    entry = await refreshIfDue(source, entry);

    const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp';
    const res = await fetch(`${GRAPH}/me/media?fields=${fields}&limit=${count}&access_token=${encodeURIComponent(entry.token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Instagram API ${res.status}: ${data.error?.message || 'unknown'}`);

    return (data.data || [])
        .filter(m => m.media_product_type === 'REELS')
        .map(m => ({
            id: (m.permalink.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/) || [])[1] || m.id,
            url: m.permalink,
            createdAt: Date.parse(m.timestamp),
            caption: m.caption || '',
            videoUrl: m.media_url || null,
            coverUrl: m.thumbnail_url || null,
            imageUrls: [],
            transcriptUrl: null,
            requestHeaders: {},
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = { fetchLatest, hasToken };
