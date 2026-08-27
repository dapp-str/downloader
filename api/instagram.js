// /api/instagram.js
// GET /api/instagram?url=https://www.instagram.com/reel/xxxxx/
//
// Mengambil video/foto Instagram lewat FastSaverAPI (https://api.fastsaver.io).
//
// Kuota gratis: 1000 credit (≈660 reel), 1.5 credit per post/reel.
// Kalau kuota habis, perlu isi ulang / upgrade di dashboard FastSaverAPI.
//
// PERLINDUNGAN CREDIT (pakai Vercel KV yang sudah tersambung):
// 1. Rate limit per IP pengunjung — mencegah satu orang menghabiskan
//    seluruh kuota dengan spam request.
// 2. Cache hasil per link selama 15 menit — kalau link yang sama diproses
//    berkali-kali (video viral yang di-share ke banyak orang), permintaan
//    kedua dst tidak perlu memanggil FastSaverAPI lagi.

// Key default (fallback) — dipakai kalau admin belum set key override lewat
// dashboard admin. Kalau admin sudah isi key baru di dashboard, key itu yang
// dipakai (lihat getActiveApiKey di bawah), bukan yang di sini.
const DEFAULT_FASTSAVER_API_KEY = 'fs_sk_5y5r7v1b7c0z9p3e8y4o8k9g0k1c';
const FASTSAVER_ENDPOINT = 'https://api.fastsaver.io/v1/fetch';

const RATE_LIMIT_MAX = 6;           // maksimal request
const RATE_LIMIT_WINDOW_SECONDS = 120; // per 2 menit
const CACHE_TTL_SECONDS = 900;      // cache hasil 15 menit

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
    // KV belum siap, tetap kirim notif tanpa cooldown (lebih baik daripada diam)
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
  if (!kvReady()) return { allowed: true }; // KV belum di-setup, jangan blokir orang

  const windowId = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `ratelimit:${bucket}:${ip}:${windowId}`;

  try {
    const countRaw = await kvCommand(['incr', key]);
    const count = Number(countRaw) || 1;
    if (count === 1) {
      // set TTL supaya key ini otomatis hilang, tidak menumpuk selamanya
      await kvCommand(['expire', key, String(RATE_LIMIT_WINDOW_SECONDS + 5)]);
    }
    if (count > RATE_LIMIT_MAX) {
      return { allowed: false, retryAfter: RATE_LIMIT_WINDOW_SECONDS };
    }
    return { allowed: true };
  } catch {
    return { allowed: true }; // kalau KV error, tetap izinkan (jangan matikan situs)
  }
}

// ---------- cache hasil per link ----------
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

// ---------- ambil key aktif (override admin atau default) ----------
async function getActiveApiKey() {
  if (!kvReady()) return DEFAULT_FASTSAVER_API_KEY;
  try {
    const raw = await kvCommand(['get', 'toksave:api-keys']);
    if (!raw) return DEFAULT_FASTSAVER_API_KEY;
    const parsed = JSON.parse(raw);
    return (parsed && parsed.instagramApiKey) || DEFAULT_FASTSAVER_API_KEY;
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
  if (!rawUrl || !/instagram\.com\/(p|reel|reels|tv|stories)\//i.test(rawUrl)) {
    return res.status(400).json({ error: 'URL Instagram tidak valid.' });
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, 'instagram');
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Terlalu banyak permintaan dari perangkatmu. Coba lagi dalam ${rl.retryAfter} detik.`
    });
  }

  const cleanUrl = String(rawUrl).split('?')[0];
  const cacheKey = 'cache:instagram:' + cleanUrl;

  const cached = await getCached(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  try {
    const apiKey = await getActiveApiKey();
    const apiUrl = `${FASTSAVER_ENDPOINT}?url=${encodeURIComponent(rawUrl)}`;
    const r = await fetch(apiUrl, {
      headers: { 'X-Api-Key': apiKey }
    });
    const data = await r.json();

    if (!r.ok || !data.ok) {
      const detail = data && data.detail;

      if (isCreditExhausted(r.status, data)) {
        await alertCreditExhausted('Instagram', detail);
        return res.status(503).json({
          error: 'Layanan unduh Instagram sedang tidak tersedia (limit API habis). Coba lagi nanti.'
        });
      }

      let message = 'Gagal mengambil video dari Instagram.';
      if (detail && /private/i.test(detail)) {
        message = 'Post ini bersifat privat, tidak bisa diunduh.';
      } else if (r.status === 429) {
        message = 'Terlalu banyak permintaan sekaligus, coba lagi sebentar lagi.';
      } else if (detail) {
        message = detail;
      }
      return res.status(r.status === 200 ? 502 : r.status).json({ error: message });
    }

    let payload;

    // Carousel/album: kirim semua slide sebagai array gambar/video.
    if (data.type === 'album' && Array.isArray(data.items)) {
      payload = {
        success: true,
        isAlbum: true,
        items: data.items.map((it) => ({
          type: it.type,
          url: it.download_url,
          thumbnail: it.thumbnail_url || ''
        })),
        title: data.caption || 'Slideshow Instagram'
      };
    } else {
      // Post/reel biasa (video atau foto tunggal).
      payload = {
        success: true,
        isAlbum: false,
        mediaType: data.type, // 'video' atau 'image'
        videoUrl: data.download_url,
        thumbnail: data.thumbnail_url || '',
        title: data.caption || 'Video Instagram',
        duration: data.duration || null
      };
    }

    await setCached(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: 'Gagal terhubung ke layanan pengunduh Instagram.' });
  }
};
