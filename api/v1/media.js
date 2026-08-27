// /api/v1/media.js
// GET /api/v1/media?url=<video_url>&format=720p
//
// Header WAJIB:
//   X-TokSave-Key: tsk_xxxx        (daftar gratis lewat POST /api/v1/register)
//
// Header TAMBAHAN (WAJIB hanya untuk platform Instagram & YouTube):
//   X-FastSaver-Key: <key milikmu sendiri dari api.fastsaver.io>
//
// TikTok tidak butuh X-FastSaver-Key sama sekali (pakai tikwm, gratis).
// Instagram & YouTube WAJIB developer bawa API key FastSaverAPI miliknya
// SENDIRI — TokSave tidak pernah meneruskan key FastSaverAPI milik TokSave
// sendiri ke pihak ketiga mana pun (supaya tidak melanggar ketentuan
// FastSaverAPI soal larangan berbagi/reseller akses API).

const DAILY_LIMIT = 100;

function kvReady() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvCommand(pathSegments) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  const url = KV_REST_API_URL + '/' + pathSegments.map(encodeURIComponent).join('/');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` } });
  if (!r.ok) return null;
  const data = await r.json();
  return data ? data.result : null;
}

function detectPlatform(url) {
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/(youtube\.com\/(watch|shorts)|youtu\.be\/)/i.test(url)) return 'youtube';
  return null;
}

async function fetchTikTok(url) {
  const r = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
  const json = await r.json();
  if (json.code !== 0 || !json.data) throw new Error('Video TikTok tidak ditemukan atau tautan tidak valid.');
  const d = json.data;
  const isAlbum = Array.isArray(d.images) && d.images.length > 0;
  return {
    platform: 'tiktok',
    type: isAlbum ? 'album' : 'video',
    videoUrl: isAlbum ? null : (d.hdplay || d.play),
    audioUrl: d.music || null,
    images: isAlbum ? d.images : null,
    thumbnail: d.cover || d.origin_cover,
    title: d.title,
    author: d.author && d.author.unique_id
  };
}

async function fetchInstagram(url, fastsaverKey) {
  const r = await fetch('https://api.fastsaver.io/v1/fetch?url=' + encodeURIComponent(url), {
    headers: { 'X-Api-Key': fastsaverKey }
  });
  const data = await r.json();
  if (!r.ok || !data.ok) {
    throw new Error((data && data.detail) || 'Gagal mengambil dari Instagram. Cek validitas API key FastSaverAPI-mu.');
  }
  if (data.type === 'album' && Array.isArray(data.items)) {
    return {
      platform: 'instagram',
      type: 'album',
      images: data.items.map((it) => it.download_url),
      thumbnail: (data.items[0] && data.items[0].thumbnail_url) || '',
      title: data.caption || 'Instagram'
    };
  }
  return {
    platform: 'instagram',
    type: data.type,
    videoUrl: data.download_url,
    thumbnail: data.thumbnail_url || '',
    title: data.caption || 'Instagram'
  };
}

async function fetchYoutube(url, format, fastsaverKey) {
  const r = await fetch('https://api.fastsaver.io/v1/youtube/download', {
    method: 'POST',
    headers: { 'X-Api-Key': fastsaverKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, format: format || '720p' })
  });
  const data = await r.json();
  if (!r.ok || !data.ok) {
    throw new Error((data && (data.detail || data.error)) || 'Gagal mengambil dari YouTube. Cek validitas API key FastSaverAPI-mu.');
  }
  return {
    platform: 'youtube',
    type: 'video',
    videoUrl: data.download_url,
    duration: data.duration || null,
    format: format || '720p'
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const tokSaveKey = req.headers['x-toksave-key'];
  if (!tokSaveKey || !String(tokSaveKey).startsWith('tsk_')) {
    return res.status(401).json({
      error: 'Header X-TokSave-Key wajib diisi. Daftar gratis lewat POST /api/v1/register (lihat /developer.html).'
    });
  }

  if (!kvReady()) {
    return res.status(500).json({ error: 'Layanan belum siap.' });
  }

  const keyData = await kvCommand(['get', `devkey:${tokSaveKey}`]);
  if (!keyData) {
    return res.status(401).json({ error: 'API key tidak dikenali. Cek kembali atau daftar ulang di /developer.html.' });
  }

  // rate limit harian per developer key
  const today = new Date().toISOString().slice(0, 10);
  const usageKey = `devkey-usage:${tokSaveKey}:${today}`;
  const count = Number(await kvCommand(['incr', usageKey])) || 1;
  if (count === 1) await kvCommand(['expire', usageKey, '172800']);
  if (count > DAILY_LIMIT) {
    return res.status(429).json({ error: `Limit harian (${DAILY_LIMIT} request) sudah tercapai. Coba lagi besok.` });
  }

  const url = req.query && req.query.url;
  const format = req.query && req.query.format;
  if (!url) {
    return res.status(400).json({ error: 'Parameter url wajib diisi.' });
  }

  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({ error: 'URL harus dari TikTok, Instagram, atau YouTube.' });
  }

  try {
    let result;
    if (platform === 'tiktok') {
      result = await fetchTikTok(url);
    } else {
      const fastsaverKey = req.headers['x-fastsaver-key'];
      if (!fastsaverKey) {
        return res.status(400).json({
          error: `Header X-FastSaver-Key wajib diisi untuk platform ${platform}. Daftar gratis di api.fastsaver.io lalu pakai API key milikmu sendiri — TokSave tidak menyediakan key ini untukmu.`
        });
      }
      result = platform === 'instagram'
        ? await fetchInstagram(url, fastsaverKey)
        : await fetchYoutube(url, format, fastsaverKey);
    }
    return res.status(200).json({
      success: true,
      ...result,
      meta: { requestsToday: count, dailyLimit: DAILY_LIMIT }
    });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Gagal memproses permintaan.' });
  }
};
