const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Referer: 'https://www.tiktok.com/' };

const secUidCache = new Map();

async function getSecUid(username) {
    if (secUidCache.has(username)) return secUidCache.get(username);
    const res = await fetch(`https://www.tiktok.com/@${username}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`TikTok profile HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(/"secUid":"(MS4w[^"]+)"/);
    if (!m) throw new Error('TikTok profile: secUid not found');
    secUidCache.set(username, m[1]);
    return m[1];
}

function cookieHeader(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    return list.map(c => c.split(';')[0]).join('; ');
}

function pickSubtitle(video, lang) {
    const subs = video.subtitleInfos || [];
    const want = lang === 'pl' ? 'pol' : 'eng';
    const sub = subs.find(s => (s.LanguageCodeName || '').startsWith(want)) || subs[0];
    return sub ? sub.Url : null;
}

// Newest videos of a profile, newest first.
async function fetchLatest(source, count = 15) {
    const secUid = await getSecUid(source.username);
    const url = `https://www.tiktok.com/api/creator/item_list/?aid=1988&count=${count}&cursor=0&type=1&secUid=${encodeURIComponent(secUid)}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`TikTok item_list HTTP ${res.status}`);
    const text = await res.text();
    if (!text) throw new Error('TikTok item_list: empty response (blocked?)');
    const data = JSON.parse(text);
    const cookie = cookieHeader(res);

    return (data.itemList || [])
        .filter(it => !it.privateItem && !it.secret)
        .map(it => ({
            id: it.id,
            url: `https://www.tiktok.com/@${source.username}/${it.imagePost ? 'photo' : 'video'}/${it.id}`,
            createdAt: it.createTime * 1000,
            caption: it.desc || '',
            videoUrl: it.video?.playAddr || it.video?.downloadAddr || null,
            coverUrl: it.video?.cover || null,
            imageUrls: (it.imagePost?.images || []).map(im => im.imageURL?.urlList?.[0]).filter(Boolean),
            transcriptUrl: pickSubtitle(it.video || {}, source.lang),
            requestHeaders: cookie ? { ...HEADERS, Cookie: cookie } : HEADERS,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
}

async function fetchTranscript(post) {
    if (!post.transcriptUrl) return '';
    const res = await fetch(post.transcriptUrl, { headers: post.requestHeaders });
    if (!res.ok) return '';
    const vtt = await res.text();
    return vtt
        .split(/\r?\n/)
        .filter(l => l && l !== 'WEBVTT' && !l.includes('-->') && !/^\d+$/.test(l))
        .join(' ');
}

module.exports = { fetchLatest, fetchTranscript };
