// /api/youtube.js
// GET /api/youtube?url=https://youtu.be/xxxxx&format=720p
//
// format bisa salah satu dari: 2160p, 1080p, 720p, 480p, 360p, atau mp3
// (mp3 = audio saja, tanpa video).
//
// Mengambil file lewat FastSaverAPI, dan judul/thumbnail lewat oEmbed resmi
// YouTube (gratis, tanpa key).
//
// PERLINDUNGAN CREDIT (pakai Vercel KV yang sudah tersambung):
// 1. Rate limit per IP pengunjung — mencegah satu orang menghabiskan
//    seluruh kuota dengan spam request (YouTube paling boros credit,
//    apalagi kualitas tinggi).
// 2. Cache hasil per link+kualitas selama 5 menit. TTL sengaja dibuat
//    pendek (bukan 15 menit seperti Instagram) karena link unduhan YouTube
//    dari FastSaverAPI berbentuk "tunnel" yang bisa kedaluwarsa.

// Key default (fallback) — dipakai kalau admin belum set key override lewat
// dashboard admin. Kalau admin sudah isi key baru di dashboard, key itu yang
// dipakai (lihat getActiveApiKey di bawah), bukan yang di sini.
const DEFAULT_FASTSAVER_API_KEY = 'fs_sk_1a9y0r5n2l4h6p9z2h6l2v5e9q6l';
const FASTSAVER_YT_ENDPOINT = 'https://api.fastsaver.io/v1/youtube/download';

const ALLOWED_FORMATS = new Set(['2160p', '1080p', '720p', '480p', '360p', 'mp3']);

const RATE_LIMIT_MAX = 5;              // maksimal request
const RATE_LIMIT_WINDOW_SECONDS = 120; // per 2 menit
const CACHE_TTL_SECONDS = 300;         // cache hasil 5 menit

// ---------- notif Telegram saat credit FastSaverAPI benar-benar habis ----------
// Dideteksi dari respons ASLI FastSaverAPI (status 402, atau pesan error yang
// menyebut credit/quota/balance/insufficient) — bukan tebakan/estimasi.
// Notif dikirim sekali per 30 menit (bukan tiap request) supaya tidak spam
// selama credit belum diisi ulang.
const TG_BOT_TOKEN = '8872466785:AAGvCGIDWVBWc_jxQoS4AAfsvmoDpq-rYvE';
const TG_CHAT_ID = '8095822005';
const ALERT_COOLDOWN_SECONDS = 1800; // 30 menit

async function sendTelegramAlert(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'HTML' })
    });
  } catch {
    // gagal kirim notif bukan hal fatal, abaikan saja
  }
}

function isCreditExhausted(status, data) {
  if (status === 402) return true;
  const text = JSON.stringify(data || {}).toLowerCase();
  return /insufficient|credit|quota|balance|out of credit|limit exceeded/.test(text);
}

async function alertCreditExhausted(platformName, rawDetail) {
  if (!kvReady()) {
    await sendTelegramAlert(
      `🚨 <b>Limit FastSaverAPI ${platformName} habis</b>\n` +
      `Harap isi ulang limit API ${platformName} Anda di dashboard api.fastsaver.io.\n` +
      (rawDetail ? `Detail: ${String(rawDetail).slice(0, 200)}` : '')
    );
    return;
  }
  try {
    const cooldownKey = `credit:exhausted-alert:${platformName.toLowerCase()}`;
    const alreadySent = await kvCommand(['get', cooldownKey]);
    if (alreadySent) return;
    await kvSetRaw(cooldownKey, '1');
    await kvCommand(['expire', cooldownKey, String(ALERT_COOLDOWN_SECONDS)]);
    await sendTelegramAlert(
      `🚨 <b>Limit FastSaverAPI ${platformName} habis</b>\n` +
      `Harap isi ulang limit API ${platformName} Anda di dashboard api.fastsaver.io.\n` +
      (rawDetail ? `Detail: ${String(rawDetail).slice(0, 200)}` : '')
    );
  } catch {
    // gagal tracking bukan hal fatal
  }
}

// ---------- helper Vercel KV (Upstash REST) ----------
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

async function kvSetRaw(key, value) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
    body: value
  });
}

// ---------- rate limit per IP ----------
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

async function checkRateLimit(ip, bucket) {
  if (!kvReady()) return { allowed: true };

  const windowId = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `ratelimit:${bucket}:${ip}:${windowId}`;

  try {
    const countRaw = await kvCommand(['incr', key]);
    const count = Number(countRaw) || 1;
    if (count === 1) {
      await kvCommand(['expire', key, String(RATE_LIMIT_WINDOW_SECONDS + 5)]);
    }
    if (count > RATE_LIMIT_MAX) {
      return { allowed: false, retryAfter: RATE_LIMIT_WINDOW_SECONDS };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

// ---------- cache hasil per link+kualitas ----------
async function getCached(cacheKey) {
  if (!kvReady()) return null;
  try {
    const raw = await kvCommand(['get', cacheKey]);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setCached(cacheKey, value) {
  if (!kvReady()) return;
  try {
    await kvSetRaw(cacheKey, JSON.stringify(value));
    await kvCommand(['expire', cacheKey, String(CACHE_TTL_SECONDS)]);
  } catch {
    // gagal cache bukan masalah fatal, abaikan saja
  }
}

async function getOembed(url) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json');
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ---------- ambil key aktif (override admin atau default) ----------
async function getActiveApiKey() {
  if (!kvReady()) return DEFAULT_FASTSAVER_API_KEY;
  try {
    const raw = await kvCommand(['get', 'toksave:api-keys']);
    if (!raw) return DEFAULT_FASTSAVER_API_KEY;
    const parsed = JSON.parse(raw);
    return (parsed && parsed.youtubeApiKey) || DEFAULT_FASTSAVER_API_KEY;
  } catch {
    return DEFAULT_FASTSAVER_API_KEY;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const rawUrl = req.query && req.query.url;
  const format = ALLOWED_FORMATS.has(req.query && req.query.format) ? req.query.format : '720p';

  if (!rawUrl || !/(youtube\.com\/(watch|shorts)|youtu\.be\/)/i.test(rawUrl)) {
    return res.status(400).json({ error: 'URL YouTube tidak valid.' });
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, 'youtube');
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Terlalu banyak permintaan dari perangkatmu. Coba lagi dalam ${rl.retryAfter} detik.`
    });
  }

  const cacheKey = 'cache:youtube:' + format + ':' + rawUrl.split('&')[0];
  const cached = await getCached(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  try {
    const apiKey = await getActiveApiKey();
    const [oembed, fsRes] = await Promise.all([
      getOembed(rawUrl),
      fetch(FASTSAVER_YT_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: rawUrl, format })
      })
    ]);

    const data = await fsRes.json();

    if (!fsRes.ok || !data.ok) {
      const detail = data && (data.detail || data.error);

      if (isCreditExhausted(fsRes.status, data)) {
        await alertCreditExhausted('YouTube', detail);
        return res.status(503).json({
          error: 'Layanan unduh YouTube sedang tidak tersedia (limit API habis). Coba lagi nanti.'
        });
      }

      let message = 'Gagal mengambil video dari YouTube.';
      if (fsRes.status === 429) {
        message = 'Terlalu banyak permintaan sekaligus, coba lagi sebentar lagi.';
      } else if (detail && /age|private|unavailable/i.test(detail)) {
        message = 'Video ini tidak bisa diakses (privat, dibatasi umur, atau sudah dihapus).';
      } else if (detail) {
        message = detail;
      }
      return res.status(fsRes.status === 200 ? 502 : fsRes.status).json({ error: message });
    }

    const payload = {
      success: true,
      format,
      videoId: data.video_id,
      duration: data.duration || null,
      downloadUrl: data.download_url,
      title: (oembed && oembed.title) || 'Video YouTube',
      author: (oembed && oembed.author_name) || '',
      thumbnail: (oembed && oembed.thumbnail_url) || ''
    };

    await setCached(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: 'Gagal terhubung ke layanan pengunduh YouTube.' });
  }
};
