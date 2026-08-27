// /api/api-keys.js
// GET  (butuh header x-admin-password) -> tampilkan versi DISAMARKAN dari
//      key yang sedang aktif (bukan key asli), supaya admin tahu key mana
//      yang lagi dipakai tanpa key-nya pernah terkirim balik lewat internet.
// POST (butuh header x-admin-password) -> ganti key Instagram dan/atau
//      YouTube. Field yang dikosongkan artinya "jangan ubah, tetap pakai
//      yang sekarang".
//
// PENTING: endpoint ini SENGAJA dipisah dari /api/settings.js supaya key
// API tidak pernah ikut ke response publik yang dibaca semua pengunjung.

// Password admin — HARUS SAMA dengan ADMIN_PASSWORD di api/settings.js.
// Kalau kamu ganti password di salah satu file, ganti juga di file ini.
const ADMIN_PASSWORD = 'Owner1121';

const KEY = 'toksave:api-keys';

function kvReady() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvGet() {
  if (!kvReady()) return null;
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
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
  if (!kvReady()) throw new Error('KV belum dikonfigurasi (KV_REST_API_URL/KV_REST_API_TOKEN kosong).');
  const r = await fetch(`${KV_REST_API_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
    body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error('Gagal menyimpan ke KV.');
}

function mask(key) {
  if (!key || key.length < 8) return null;
  return key.slice(0, 6) + '••••' + key.slice(-4);
}

module.exports = async function handler(req, res) {
  const password = req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Password admin salah.' });
  }

  if (req.method === 'GET') {
    const stored = (await kvGet().catch(() => null)) || {};
    return res.status(200).json({
      instagramApiKeyMasked: mask(stored.instagramApiKey) || 'Pakai key default di kode (belum di-override)',
      youtubeApiKeyMasked: mask(stored.youtubeApiKey) || 'Pakai key default di kode (belum di-override)'
    });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const current = (await kvGet().catch(() => null)) || {};
    const next = { ...current };

    if (typeof body.instagramApiKey === 'string' && body.instagramApiKey.trim()) {
      next.instagramApiKey = body.instagramApiKey.trim();
    }
    if (typeof body.youtubeApiKey === 'string' && body.youtubeApiKey.trim()) {
      next.youtubeApiKey = body.youtubeApiKey.trim();
    }
    // reset ke default kode (hapus override)
    if (body.resetInstagram === true) delete next.instagramApiKey;
    if (body.resetYoutube === true) delete next.youtubeApiKey;

    try {
      await kvSet(next);
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Gagal menyimpan.' });
    }

    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method tidak diizinkan.' });
};
