// /api/settings.js
// GET  -> returns the current editable site content (public, cached briefly)
// POST -> updates the content (requires header x-admin-password to match
//         the ADMIN_PASSWORD environment variable set in Vercel)
//
// Storage: Vercel KV (Upstash Redis REST API). Add "Vercel KV" from the
// Storage tab in your Vercel project — it auto-injects KV_REST_API_URL and
// KV_REST_API_TOKEN as environment variables, no extra setup needed.

const KEY = 'toksave:site-settings';

const DEFAULTS = {
  heroTitleLine1: 'Unduh video TikTok',
  heroTitleLine2: 'dalam hitungan detik.',
  heroSubtitle: 'Tempel tautan videonya. Kami ambil versi MP4 tanpa watermark dan audio MP3-nya sekaligus.',
  qrisImage: 'https://i.ibb.co.com/LXVDc8Tr/qr-ID1025444122473-29-06-26-1782730287-1782730287658.jpg',
  donationMessage: 'Kalau situs ini bermanfaat, boleh banget traktir developer kopi lewat scan QRIS di bawah ini.'
};

const ALLOWED_KEYS = Object.keys(DEFAULTS);

async function kvGet() {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return null;
  const r = await fetch(`${KV_REST_API_URL}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
  });
  if (!r.ok) return null;
  const data = await r.json();
  if (!data || !data.result) return null;
  try {
    return JSON.parse(data.result);
  } catch {
    return null;
  }
}

async function kvSet(value) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    throw new Error('KV belum dikonfigurasi (KV_REST_API_URL/KV_REST_API_TOKEN kosong).');
  }
  const r = await fetch(`${KV_REST_API_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
    body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error('Gagal menyimpan ke KV.');
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    let stored = null;
    try {
      stored = await kvGet();
    } catch {
      stored = null;
    }
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res.status(200).json({ ...DEFAULTS, ...(stored || {}) });
  }

  if (req.method === 'POST') {
    const password = req.headers['x-admin-password'];
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ error: 'ADMIN_PASSWORD belum diatur di server.' });
    }
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Password admin salah.' });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const current = (await kvGet().catch(() => null)) || {};
    const next = { ...DEFAULTS, ...current };
    for (const k of ALLOWED_KEYS) {
      if (typeof body[k] === 'string') next[k] = body[k].trim();
    }

    try {
      await kvSet(next);
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Gagal menyimpan.' });
    }

    return res.status(200).json({ ok: true, settings: next });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method tidak diizinkan.' });
};
