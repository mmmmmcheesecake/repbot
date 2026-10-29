const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const { loadCatalog } = require('./saleFeed');

// Archiwum zdjęć QC na replug24: raz w tygodniu odpytujemy /api/qc dla całego katalogu, a strona
// dopisuje każdą galerię do swojej kopii (R2, galerie tylko rosną). Kiedy qcitems padnie, strona
// pokazuje zapisane zdjęcia zamiast samego ostatniego zamówienia z USFans. Jeśli qcitems leżało
// w trakcie obejścia, powtarzamy je od razu, gdy wróci.
const SITE = 'https://replug24.com';
const RUN_EVERY = 7 * 24 * 3600 * 1000;
const CHECK_EVERY = 6 * 3600 * 1000;
const STEP_MS = 15000;                      // /api/qc wpuszcza 300 zapytań na godzinę z jednego IP
const PROBE = 'https://weidian.com/item.html?itemID=7547810481';

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
const STATE = path.join(DATA_DIR, 'qc-archive.json');

function readState() {
    try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}

function writeState(state) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STATE, JSON.stringify(state));
    } catch (err) {
        console.error('[qc-archive] nie zapisano stanu:', err.message);
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Bez Referera z qcitems.com ich API odpowiada 403 (tak samo woła je strona).
async function qcitemsUp() {
    try {
        const res = await fetch(`https://qcitems.com/api/product?url=${encodeURIComponent(PROBE)}`, {
            headers: { Accept: 'application/json', Referer: 'https://qcitems.com/', Origin: 'https://qcitems.com' },
            signal: AbortSignal.timeout(30000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

const status = { running: false, done: 0, total: 0, withPhotos: 0, photos: 0, errors: 0, lastError: null, qcitems: null, checkedAt: null };

async function run() {
    status.running = true;
    const state = readState();
    try {
        const up = await qcitemsUp();
        const catalog = await loadCatalog();
        const start = state.position && state.position < catalog.length ? state.position : 0;
        Object.assign(status, { done: start, total: catalog.length, withPhotos: 0, photos: 0, errors: 0, qcitems: up });
        console.log(`[qc-archive] start od ${start}/${catalog.length}, qcitems ${up ? 'działa' : 'leży'}`);

        for (let i = start; i < catalog.length; i++) {
            await sleep(STEP_MS);
            const url = `https://weidian.com/item.html?itemID=${catalog[i].id}`;
            try {
                const res = await fetch(`${SITE}/api/qc?url=${encodeURIComponent(url)}`);
                if (res.status === 429) {
                    await sleep(10 * 60 * 1000);
                    i--;
                    continue;
                }
                const d = await res.json().catch(() => ({}));
                if (d.totalPhotos > 0) {
                    status.withPhotos++;
                    status.photos += d.totalPhotos;
                }
            } catch (err) {
                status.errors++;
                status.lastError = err.message;
            }
            status.done = i + 1;
            if (status.done % 50 === 0) writeState({ ...state, position: status.done });
        }

        // Jeśli qcitems leżało na początku albo na końcu, obejście nie złapało ich galerii.
        const degraded = !(up && await qcitemsUp());
        writeState({ finishedAt: Date.now(), degraded, position: 0 });
        console.log(`[qc-archive] koniec: ${status.withPhotos} przedmiotów ze zdjęciami, ${status.photos} zdjęć`);
    } catch (err) {
        status.lastError = err.message;
        console.error('[qc-archive]', err.message);
    } finally {
        status.running = false;
    }
}

async function tick() {
    if (status.running) return;
    const state = readState();
    status.qcitems = await qcitemsUp();
    status.checkedAt = Date.now();
    const due = !state.finishedAt
        || Date.now() - state.finishedAt > RUN_EVERY
        || state.position > 0
        || (state.degraded && status.qcitems);
    if (due) await run();
}

module.exports = (client) => {
    client.once('clientReady', () => {
        const loop = () => tick().finally(() => setTimeout(loop, CHECK_EVERY));
        setTimeout(loop, 2 * 60 * 1000);
    });

    client.on('messageCreate', async (message) => {
        if (!message.content.startsWith('!qcarchive')) return;
        if (!message.guild || message.author.bot) return;
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        if (message.content.trim().split(/\s+/)[1] === 'start') {
            if (status.running) return message.reply('Obejście już trwa.');
            run();
            return message.reply('▶️ Zaczynam obejście katalogu.');
        }

        const state = readState();
        const when = (t) => (t ? `<t:${Math.floor(t / 1000)}:R>` : '—');
        const qc = status.qcitems === null ? '—' : status.qcitems ? '🟢 działa' : '🔴 leży';
        return message.reply([
            `📸 Archiwum QC · qcitems: ${qc} (sprawdzone ${when(status.checkedAt)})`,
            status.running
                ? `Obejście w toku: ${status.done}/${status.total} · ze zdjęciami: ${status.withPhotos} · zdjęć: ${status.photos} · błędy: ${status.errors}`
                : `Ostatnie pełne obejście: ${when(state.finishedAt)}${state.degraded ? ' (qcitems wtedy leżało — powtórzę, gdy wróci)' : ''}`,
            status.lastError ? `Ostatni błąd: \`${status.lastError}\`` : null,
            '`!qcarchive start` — zacznij obejście teraz',
        ].filter(Boolean).join('\n'));
    });
};
