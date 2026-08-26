// /api/youtube.js
// GET /api/youtube?url=https://youtu.be/xxxxx&format=720p
//
// format bisa salah satu dari: 2160p, 1080p, 720p, 480p, 360p, atau mp3
// (mp3 = audio saja, tanpa video).
//
// Mengambil file lewat FastSaverAPI (sama seperti fitur Instagram), dan
// mengambil judul/thumbnail lewat oEmbed resmi YouTube (gratis, tanpa key).

// API key FastSaverAPI khusus untuk YouTube — sengaja dipisah dari key yang
// dipakai Instagram (lihat api/instagram.js) supaya kuota masing-masing
// platform terpisah dan tidak saling mengurangi.
const FASTSAVER_API_KEY = 'fs_sk_1a9y0r5n2l4h6p9z2h6l2v5e9q6l';
const FASTSAVER_YT_ENDPOINT = 'https://api.fastsaver.io/v1/youtube/download';

const ALLOWED_FORMATS = new Set(['2160p', '1080p', '720p', '480p', '360p', 'mp3']);

async function getOembed(url) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json');
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
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

  try {
    const [oembed, fsRes] = await Promise.all([
      getOembed(rawUrl),
      fetch(FASTSAVER_YT_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-Api-Key': FASTSAVER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: rawUrl, format })
      })
    ]);

    const data = await fsRes.json();

    if (!fsRes.ok || !data.ok) {
      const detail = data && (data.detail || data.error);
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

    return res.status(200).json({
      success: true,
      format,
      videoId: data.video_id,
      duration: data.duration || null,
      downloadUrl: data.download_url,
      title: (oembed && oembed.title) || 'Video YouTube',
      author: (oembed && oembed.author_name) || '',
      thumbnail: (oembed && oembed.thumbnail_url) || ''
    });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal terhubung ke layanan pengunduh YouTube.' });
  }
};
