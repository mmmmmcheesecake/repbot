const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const sharp = require('sharp');
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.SOCIAL_AI_MODEL || 'claude-haiku-5-5';
const MAX_FRAMES = 16;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const SCHEMA = {
    type: 'object',
    properties: {
        headline: { type: 'string' },
        summary: { type: 'string' },
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    emoji: { type: 'string' },
                    name: { type: 'string' },
                    price: { type: 'string' },
                },
                required: ['emoji', 'name', 'price'],
                additionalProperties: false,
            },
        },
    },
    required: ['headline', 'summary', 'items'],
    additionalProperties: false,
};

const LANG_NAME = { en: 'English', pl: 'Polish' };

const systemPrompt = (lang) => `You write Discord announcements for replug24.com, a catalog of Taobao/Weidian rep finds.
You get evenly spaced frames from one short vertical video (or the photos of a slideshow post), in order, its caption and,
when available, TikTok's auto-transcript.
The transcript is speech recognition and often mangles brand names - trust what is visible in the frames over it.

Return:
- headline: the post's theme in 2-4 words, like "Racing Edition" or "Denim Under $50".
- summary: one punchy sentence (max 20 words) about what kind of finds the video shows. No hashtags, no links.
- items: the 3-5 most attractive items shown, most hyped first. Prefer items with a visible price.
  - name: short, brand + item type, the way a buyer would search it (e.g. "Supreme x Ducati Jacket").
  - price: exactly as shown on screen next to that item, keeping the currency (e.g. "$33", "149 zł", "¥199").
    If no price is visible for the item, use "". Never guess or convert a price.
  - emoji: one emoji that fits the item.
Only include items that really appear in the post, each item once (the same item seen in several frames is one item). Write headline, summary and names in ${LANG_NAME[lang]}
(brand names stay as they are).`;

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { timeout: 120000 }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
    });
}

async function download(url, headers) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_VIDEO_BYTES) throw new Error('video too large');
    return buf;
}

async function extractFrames(post) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repbot-frames-'));
    try {
        const video = path.join(dir, 'video.mp4');
        fs.writeFileSync(video, await download(post.videoUrl, post.requestHeaders));
        await run(ffmpegPath, ['-loglevel', 'error', '-i', video, '-vf', 'fps=1/2,scale=480:-2', '-q:v', '6', path.join(dir, 'f%03d.jpg')]);
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort();
        const step = Math.max(1, files.length / MAX_FRAMES);
        const picked = [];
        for (let i = 0; i < files.length && picked.length < MAX_FRAMES; i += step) picked.push(files[Math.floor(i)]);
        return picked.map(f => fs.readFileSync(path.join(dir, f)));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const toFrame = (buf) => sharp(buf).resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();

async function getFrames(post) {
    // TikTok w trybie zdjęć (slajdy) - zdjęcia zamiast klatek wideo
    if (post.imageUrls.length) {
        const urls = post.imageUrls.slice(0, MAX_FRAMES);
        const frames = await Promise.all(urls.map(u => download(u, post.requestHeaders).then(toFrame).catch(() => null)));
        if (frames.some(Boolean)) return frames.filter(Boolean);
    }
    if (post.videoUrl) {
        try {
            const frames = await extractFrames(post);
            if (frames.length) return frames;
        } catch (err) {
            console.error('[social] klatki z wideo nieudane:', err.message);
        }
    }
    if (post.coverUrl) {
        try { return [await toFrame(await download(post.coverUrl, post.requestHeaders))]; } catch {}
    }
    return [];
}

// Zwraca { headline, summary, items[] } albo null, gdy AI jest niedostępne.
async function describe(post, lang, transcript) {
    if (!client) return null;
    const frames = await getFrames(post);

    const content = frames.map(buf => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') },
    }));
    content.push({
        type: 'text',
        text: `Caption:\n${post.caption || '(none)'}\n\nAuto-transcript:\n${transcript || '(none)'}`,
    });

    const params = {
        model: MODEL,
        max_tokens: 16000,
        system: systemPrompt(lang),
        messages: [{ role: 'user', content }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    };
    // server-side fallback przy odmowie - tylko modele, które go obsługują
    if (/opus|fable|sonnet-5-5/.test(MODEL)) {
        params.betas = ['server-side-fallback-2026-07-01'];
        params.fallbacks = 'default';
    }

    try {
        const response = await client.beta.messages.create(params);
        if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
            console.error('[social] AI stop_reason:', response.stop_reason);
            return null;
        }
        const text = response.content.find(b => b.type === 'text')?.text;
        const out = JSON.parse(text);
        const names = new Set();
        out.items = (out.items || [])
            .filter(i => i.name && !names.has(i.name.toLowerCase()) && names.add(i.name.toLowerCase()))
            .sort((a, b) => Boolean(b.price) - Boolean(a.price))
            .slice(0, 5);
        // przedmiot + cena: bez ceny tylko wtedy, gdy z cenami są mniej niż 3
        if (out.items.filter(i => i.price).length >= 3) out.items = out.items.filter(i => i.price);
        console.log(`[social] opis AI ${post.id}: ${frames.length} klatek, in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);
        return out;
    } catch (err) {
        if (err instanceof Anthropic.APIError) console.error(`[social] Claude API ${err.status}:`, err.message);
        else console.error('[social] opis AI nieudany:', err.message);
        return null;
    }
}

module.exports = { describe };
