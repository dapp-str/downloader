// /api/instagram.js
// GET /api/instagram?url=https://www.instagram.com/reel/xxxxx/
//
// Mengambil halaman post Instagram secara server-side (menghindari CORS),
// lalu mengekstrak URL video dari meta tag og:video / og:image / og:title
// yang disematkan Instagram di HTML untuk keperluan SEO/preview link.
// Hanya berfungsi untuk post PUBLIK (bukan akun private).
//
// Catatan: Instagram sewaktu-waktu bisa mengubah struktur HTML-nya, yang
// bisa membuat ekstraksi ini berhenti berfungsi. Tidak ada cara resmi
// (didukung Instagram) untuk mengunduh video lewat API publik.

function extract(html, regex) {
  const m = html.match(regex);
  return m ? m[1] : null;
}

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\\\//g, '/');
}

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!r.ok) {
    throw new Error('Gagal membuka halaman Instagram (status ' + r.status + ').');
  }
  return r.text();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const rawUrl = req.query && req.query.url;
  if (!rawUrl || !/instagram\.com\/(p|reel|reels|tv)\//i.test(rawUrl)) {
    return res.status(400).json({ error: 'URL Instagram tidak valid.' });
  }

  const cleanUrl = String(rawUrl).split('?')[0];

  try {
    const html = await fetchHtml(cleanUrl);

    // Sumber utama: meta tag og:video (paling stabil, dipakai Instagram
    // untuk preview link di platform lain).
    let videoUrl =
      extract(html, /<meta property="og:video:secure_url" content="([^"]+)"/) ||
      extract(html, /<meta property="og:video" content="([^"]+)"/);

    // Fallback: cari langsung di JSON tersemat kalau meta tag tidak ada.
    if (!videoUrl) {
      videoUrl = extract(html, /"video_url":"([^"]+)"/);
    }

    if (!videoUrl) {
      return res.status(404).json({
        error:
          'Video tidak ditemukan. Post mungkin bersifat privat, berupa carousel foto, atau Instagram sedang membatasi akses.'
      });
    }

    const thumbnail =
      extract(html, /<meta property="og:image" content="([^"]+)"/) || '';
    const ogTitle =
      extract(html, /<meta property="og:title" content="([^"]+)"/) || '';

    // og:title Instagram biasanya berformat: `username on Instagram: "caption"`
    let author = '';
    let caption = ogTitle;
    const match = ogTitle.match(/^(.*?)\s+on Instagram(?::\s*"?(.*?)"?)?$/i);
    if (match) {
      author = match[1] || '';
      caption = match[2] || '';
    }

    return res.status(200).json({
      success: true,
      videoUrl: decodeEntities(videoUrl),
      thumbnail: decodeEntities(thumbnail),
      title: decodeEntities(caption) || 'Video Instagram',
      author: decodeEntities(author)
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Gagal mengambil data dari Instagram.' });
  }
};
