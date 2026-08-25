// /api/instagram.js
// GET /api/instagram?url=https://www.instagram.com/reel/xxxxx/
//
// Mengambil video/foto Instagram lewat FastSaverAPI (https://api.fastsaver.io),
// jauh lebih stabil daripada "mengintip" HTML halaman Instagram secara
// langsung, karena Instagram sering memblokir akses dari server.
//
// Kuota gratis: 1000 credit (≈660 reel), 1.5 credit per post/reel.
// Kalau kuota habis, perlu isi ulang / upgrade di dashboard FastSaverAPI.

// API key FastSaverAPI — diset langsung di sini (bukan di kode client),
// jadi tidak kelihatan lewat "view source" browser pengunjung.
// PERHATIAN: karena repo GitHub-mu public, siapa pun yang membuka file ini
// di GitHub tetap bisa melihat key ini. Kalau mau lebih aman, jadikan repo
// Private, atau pindahkan ini ke Environment Variables.
const FASTSAVER_API_KEY = 'fs_sk_5y5r7v1b7c0z9p3e8y4o8k9g0k1c';

const FASTSAVER_ENDPOINT = 'https://api.fastsaver.io/v1/fetch';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const rawUrl = req.query && req.query.url;
  if (!rawUrl || !/instagram\.com\/(p|reel|reels|tv|stories)\//i.test(rawUrl)) {
    return res.status(400).json({ error: 'URL Instagram tidak valid.' });
  }

  try {
    const apiUrl = `${FASTSAVER_ENDPOINT}?url=${encodeURIComponent(rawUrl)}`;
    const r = await fetch(apiUrl, {
      headers: { 'X-Api-Key': FASTSAVER_API_KEY }
    });
    const data = await r.json();

    if (!r.ok || !data.ok) {
      const detail = data && data.detail;
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

    // Carousel/album: kirim semua slide sebagai array gambar/video.
    if (data.type === 'album' && Array.isArray(data.items)) {
      return res.status(200).json({
        success: true,
        isAlbum: true,
        items: data.items.map((it) => ({
          type: it.type,
          url: it.download_url,
          thumbnail: it.thumbnail_url || ''
        })),
        title: data.caption || 'Slideshow Instagram'
      });
    }

    // Post/reel biasa (video atau foto tunggal).
    return res.status(200).json({
      success: true,
      isAlbum: false,
      mediaType: data.type, // 'video' atau 'image'
      videoUrl: data.download_url,
      thumbnail: data.thumbnail_url || '',
      title: data.caption || 'Video Instagram',
      duration: data.duration || null
    });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal terhubung ke layanan pengunduh Instagram.' });
  }
};
