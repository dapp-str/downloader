// /api/v1/register.js
// POST { email } -> { apiKey }
//
// Bikin API key GRATIS buat developer yang mau pakai unified download
// endpoint TokSave (/api/v1/media). Key ini BUKAN key FastSaverAPI — cuma
// buat identifikasi & rate limit ke endpoint TokSave sendiri.
//
// Untuk platform Instagram & YouTube, developer WAJIB bawa API key
// FastSaverAPI miliknya sendiri di setiap request (lihat /api/v1/media.js)
// — TokSave tidak pernah meneruskan/menjual akses key FastSaverAPI
// miliknya sendiri ke pihak ketiga manapun.

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

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function generateKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = 'tsk_';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }
  if (!kvReady()) {
    return res.status(500).json({ error: 'Layanan belum siap, coba lagi nanti.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email tidak valid.' });
  }

  // batasi pendaftaran spam: maks 3x per IP per hari
  const ip = getClientIp(req);
  const today = new Date().toISOString().slice(0, 10);
  const regKey = `regrate:${ip}:${today}`;
  try {
    const count = Number(await kvCommand(['incr', regKey])) || 1;
    if (count === 1) await kvCommand(['expire', regKey, '172800']);
    if (count > 3) {
      return res.status(429).json({ error: 'Terlalu banyak pendaftaran dari perangkatmu hari ini. Coba lagi besok.' });
    }
  } catch {
    // kalau pengecekan rate limit gagal, tetap lanjutkan (jangan blokir orang)
  }

  const apiKey = generateKey();
  try {
    await kvSetRaw(`devkey:${apiKey}`, JSON.stringify({ email, createdAt: Date.now() }));
  } catch (e) {
    return res.status(500).json({ error: 'Gagal membuat API key, coba lagi.' });
  }

  return res.status(200).json({
    success: true,
    apiKey,
    dailyLimit: 100,
    note: 'Simpan key ini baik-baik — tidak akan ditampilkan lagi setelah halaman ini ditutup.'
  });
};
