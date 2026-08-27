// /api/download-proxy.js
// GET /api/download-proxy?url=<file_url>&filename=<nama_file>
//
// Mengambil file (video/foto/audio) dari URL sumber di SISI SERVER, lalu
// mengirimkannya ke browser sebagai unduhan langsung (Content-Disposition:
// attachment). Ini dipakai sebagai fallback ketika fetch langsung dari
// browser gagal karena CORS — kasus umum untuk CDN Instagram/Facebook
// (fbcdn.net, cdninstagram.com) yang tidak mengizinkan fetch lintas-origin
// dari domain lain. Karena permintaan CORS hanya berlaku di browser, server
// tidak kena batasan itu.

function sanitizeFilename(name) {
  const fallback = 'download';
  if (!name) return fallback;
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return cleaned || fallback;
}

// ---------- proteksi: tolak request yang bukan dari situs sendiri ----------
// Tanpa ini, endpoint bisa disalahgunakan orang lain sebagai "proxy download
// gratis" buat file apa saja lewat server/bandwidth kita, bukan cuma untuk
// video dari situs ini.
function isAllowedOrigin(req) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (!host || (!origin && !referer)) return false;
  try {
    if (origin && new URL(origin).host === host) return true;
    if (referer && new URL(referer).host === host) return true;
  } catch {
    return false;
  }
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Akses ditolak. Endpoint ini hanya bisa dipanggil dari situs TokSave.' });
  }

  const sourceUrl = req.query && req.query.url;
  const filename = sanitizeFilename(req.query && req.query.filename);

  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return res.status(400).json({ error: 'URL sumber tidak valid.' });
  }

  try {
    const upstream = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: 'Gagal mengambil file dari sumber (status ' + upstream.status + ').' });
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gagal memproses unduhan di server.' });
    } else {
      res.end();
    }
  }
};
