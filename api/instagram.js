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
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!r.ok) {
    throw new Error('Gagal membuka halaman Instagram (status ' + r.status + ').');
  }
  return r.text();
}

function tryExtractVideo(html) {
  return (
    extract(html, /<meta property="og:video:secure_url" content="([^"]+)"/) ||
    extract(html, /<meta property="og:video" content="([^"]+)"/) ||
    extract(html, /"video_url":"([^"]+)"/) ||
    extract(html, /"video_versions":\[\{"type":\d+,"width":\d+,"height":\d+,"url":"([^"]+)"/) ||
    null
  );
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
    let html = await fetchHtml(cleanUrl);
    let videoUrl = tryExtractVideo(html);

    // Fallback: halaman "embed" Instagram lebih ringan dan sering tidak
    // diblokir walau halaman post utama gagal.
    if (!videoUrl) {
      try {
        const embedUrl = cleanUrl.replace(/\/?$/, '/') + 'embed/captioned/';
        const embedHtml = await fetchHtml(embedUrl);
        videoUrl = tryExtractVideo(embedHtml);
        if (videoUrl) html = embedHtml; // pakai html ini juga untuk ambil title/thumbnail
      } catch {
        // biarkan videoUrl tetap null, akan ditangani di bawah
      }
    }

    if (!videoUrl) {
      return res.status(404).json({
        error:
          'Video tidak ditemukan. Kemungkinan Instagram sedang membatasi akses dari server, post bersifat privat, atau berupa carousel foto. Coba lagi dalam beberapa saat.'
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
