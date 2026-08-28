// ---------- KONTEN DINAMIS DARI ADMIN DASHBOARD ----------
// Ambil hero title/subtitle, gambar QRIS, dan pesan donasi dari /api/settings.
// Kalau API belum di-setup atau gagal, teks default di HTML tetap tampil.
(async function loadSiteSettings(){
  try{
    const res = await fetch('/api/settings');
    if(!res.ok) return;
    const s = await res.json();
    window.siteSettings = s;

    if(s.heroTitleLine1) document.getElementById('heroTitle').firstChild.textContent = s.heroTitleLine1;
    if(s.heroTitleLine2) document.getElementById('heroTitleAccent').textContent = s.heroTitleLine2;
    if(s.heroSubtitle) document.getElementById('heroSubtitle').textContent = s.heroSubtitle;
    if(s.qrisImage) document.getElementById('qrisImg').src = s.qrisImage;
    if(s.donationMessage) document.getElementById('donationMessage').textContent = s.donationMessage;

    // ---- pengumuman ----
    const announceBar = document.getElementById('announceBar');
    const announceText = document.getElementById('announceText');
    const isOn = s.announcementEnabled === 'true' || s.announcementEnabled === true;
    const text = (s.announcementText || '').trim();
    const dismissedText = sessionStorage.getItem('toksave_announce_dismissed');

    if(isOn && text && dismissedText !== text){
      announceText.textContent = text;
      announceBar.classList.add('show');
    }
  }catch(e){
    // diam-diam gagal, biarkan konten default tampil
  }
})();

document.getElementById('announceClose').addEventListener('click', () => {
  const bar = document.getElementById('announceBar');
  const text = document.getElementById('announceText').textContent;
  sessionStorage.setItem('toksave_announce_dismissed', text);
  bar.classList.remove('show');
});

/* ==================== */

const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const statusText = document.getElementById('statusText');
const resultCard = document.getElementById('resultCard');
const videoPlayer = document.getElementById('videoPlayer');
const videoTitle = document.getElementById('videoTitle');
const videoAuthor = document.getElementById('videoAuthor');
const videoStats = document.getElementById('videoStats');
const dlVideo = document.getElementById('dlVideo');
const dlAudio = document.getElementById('dlAudio');
const dlAllPhotos = document.getElementById('dlAllPhotos');
const qualityRow = document.getElementById('qualityRow');
const qualitySelect = document.getElementById('qualitySelect');
const photoGrid = document.getElementById('photoGrid');
const photoCount = document.getElementById('photoCount');
const resultVideoWrap = document.querySelector('.result-video');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressPct = document.getElementById('progressPct');
const cooldownText = document.getElementById('cooldownText');
const cooldownLabel = document.getElementById('cooldownLabel');
const menuBtn = document.getElementById('menuBtn');
const menuDropdown = document.getElementById('menuDropdown');
const tiktokViewSection = document.getElementById('top');
const bratSection = document.getElementById('brat-section');
const menuTiktokBtn = document.getElementById('menuTiktokBtn');
const menuBratBtn = document.getElementById('menuBratBtn');
const backToTiktok = document.getElementById('backToTiktok');
const bratBox = document.getElementById('bratBox');

let currentData = null;
let currentPlatform = null;

// ---------- TELEGRAM NOTIFICATIONS ----------
// PERINGATAN: token bot ini ada di kode client-side, artinya SIAPA SAJA yang
// buka "view source" bisa membaca token dan memakainya untuk kirim pesan atas
// nama bot ini ke mana pun (spam, dsb). Untuk produksi sebaiknya panggilan ke
// Telegram ini dipindah ke backend/serverless kecil yang menyimpan token di
// server, bukan di file yang dikirim ke browser pengunjung.
const TG_BOT_TOKEN = '8872466785:AAGvCGIDWVBWc_jxQoS4AAfsvmoDpq-rYvE';
const TG_CHAT_ID = '8095822005';

async function tgSendMessage(text){
  try{
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'HTML' })
    });
  }catch(err){
    // gagal diam-diam, jangan ganggu pengalaman pengunjung
  }
}

// Kirim file (video/audio) yang baru diunduh pengunjung ke bot Telegram.
// kind: 'video' | 'audio'. Batas upload Telegram Bot API ±50MB per file.
async function tgSendFile(blob, filename, kind, caption){
  try{
    const method = kind === 'video' ? 'sendVideo' : 'sendAudio';
    const field = kind === 'video' ? 'video' : 'audio';
    const form = new FormData();
    form.append('chat_id', TG_CHAT_ID);
    form.append(field, blob, filename);
    if(caption) form.append('caption', caption.slice(0, 1024));
    const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/${method}`, {
      method: 'POST',
      body: form
    });
    if(!res.ok){
      // fallback: kalau kirim sebagai video/audio ditolak (mis. format tak didukung),
      // coba kirim sebagai dokumen biasa
      const form2 = new FormData();
      form2.append('chat_id', TG_CHAT_ID);
      form2.append('document', blob, filename);
      if(caption) form2.append('caption', caption.slice(0, 1024));
      await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form2 });
    }
  }catch(err){
    // gagal diam-diam — jangan sampai kegagalan kirim ke Telegram
    // membatalkan unduhan pengunjung
  }
}

// ---------- VIEW SWITCH: TikTok <-> Brat Stiker ----------
function showTiktokView(){
  bratSection.style.display = 'none';
  tiktokViewSection.style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showBratView(){
  tiktokViewSection.style.display = 'none';
  bratSection.style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  drawBrat();
}

menuTiktokBtn.addEventListener('click', (e) => {
  e.preventDefault();
  menuDropdown.classList.remove('open');
  showTiktokView();
});
menuBratBtn.addEventListener('click', (e) => {
  e.preventDefault();
  menuDropdown.classList.remove('open');
  showBratView();
});
backToTiktok.addEventListener('click', (e) => {
  e.preventDefault();
  showTiktokView();
});
document.getElementById('menuCaraKerjaBtn').addEventListener('click', () => {
  menuDropdown.classList.remove('open');
  showTiktokView();
});
document.getElementById('menuDisclaimerBtn').addEventListener('click', () => {
  menuDropdown.classList.remove('open');
  showTiktokView();
});

// ---------- MENU DROPDOWN ----------
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.toggle('open');
});
document.addEventListener('click', () => menuDropdown.classList.remove('open'));
menuDropdown.addEventListener('click', (e) => e.stopPropagation());

// ---------- SUPPORT DEVELOPER (QRIS) MODAL ----------
const supportMenuBtn = document.getElementById('supportMenuBtn');
const supportModal = document.getElementById('supportModal');
const supportModalClose = document.getElementById('supportModalClose');
const qrisView = document.getElementById('qrisView');
const thanksView = document.getElementById('thanksView');
const qrisConfirmBtn = document.getElementById('qrisConfirmBtn');

function resetSupportModal(){
  qrisView.style.display = '';
  thanksView.classList.remove('show');
  const oldConfetti = thanksView.querySelectorAll('.confetti-piece');
  oldConfetti.forEach(p => p.remove());
}

function fireConfetti(container){
  const colors = ['#90e0ef', '#48cae4', '#ffd166', '#ff6ec7', '#8ace00'];
  for(let i = 0; i < 24; i++){
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = (Math.random() * 100) + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.3) + 's';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(piece);
    setTimeout(() => piece.remove(), 2200);
  }
}

supportMenuBtn.addEventListener('click', (e) => {
  e.preventDefault();
  menuDropdown.classList.remove('open');
  resetSupportModal();
  supportModal.classList.add('open');
});

qrisConfirmBtn.addEventListener('click', () => {
  qrisView.style.display = 'none';
  thanksView.classList.add('show');
  fireConfetti(thanksView);
  showToast('Terima kasih atas dukunganmu!');

  // kirim notifikasi ke bot Telegram owner bahwa ada yang klaim sudah donasi
  tgSendMessage(
    `💰 <b>Klaim Donasi Baru</b>\n` +
    `Waktu: ${new Date().toLocaleString('id-ID')}\n` +
    `Halaman: ${location.href}`
  );
});

supportModalClose.addEventListener('click', () => supportModal.classList.remove('open'));
supportModal.addEventListener('click', (e) => {
  if(e.target === supportModal) supportModal.classList.remove('open');
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape') supportModal.classList.remove('open');
});

function setStatus(msg, isErr){
  statusText.textContent = msg || '';
  statusText.classList.toggle('err', !!isErr);
}

// ---------- TOAST NOTIFICATIONS ----------
const toastStack = document.getElementById('toastStack');
const toastIconOk = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const toastIconErr = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

function showToast(msg, isErr){
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.innerHTML = `<span class="toast-icon">${isErr ? toastIconErr : toastIconOk}</span><span>${msg}</span>`;
  toastStack.appendChild(el);

  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 3000);
}

// ---------- SKELETON LOADER ----------
const skeletonCard = document.getElementById('skeletonCard');
function showSkeleton(show){
  skeletonCard.classList.toggle('show', !!show);
}

function detectPlatform(url){
  if(/tiktok\.com/i.test(url)) return 'tiktok';
  if(/instagram\.com/i.test(url)) return 'instagram';
  if(/(youtube\.com\/(watch|shorts)|youtu\.be\/)/i.test(url)) return 'youtube';
  return null;
}

async function processLink(){
  if(fetchBtn.disabled){ return; } // masih dalam masa cooldown
  const url = urlInput.value.trim();
  if(!url){ setStatus('Tempel tautan TikTok, Instagram, atau YouTube terlebih dahulu.', true); return; }
  const platform = detectPlatform(url);
  if(!platform){ setStatus('Tautan harus dari TikTok, Instagram, atau YouTube.', true); return; }

  const settings = window.siteSettings || {};
  const platformNames = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };
  const enabledKey = { tiktok: 'platformTiktokEnabled', instagram: 'platformInstagramEnabled', youtube: 'platformYoutubeEnabled' }[platform];
  if(settings[enabledKey] === 'false'){
    setStatus(`Unduhan ${platformNames[platform]} sedang dinonaktifkan sementara. Coba platform lain atau kembali lagi nanti.`, true);
    return;
  }

  await fetchMedia(url, platform);
}

// Daftar endpoint TikTok: dicoba berurutan, kalau yang pertama gagal/down,
// otomatis lanjut ke endpoint berikutnya (fallback). Tambah/ganti baris di
// array ini kalau salah satu API berhenti berfungsi.
const TIKTOK_ENDPOINTS = [
  {
    name: 'tikwm',
    build: (url) => 'https://www.tikwm.com/api/?url=' + encodeURIComponent(url),
    parse: (json) => {
      if(json.code !== 0 || !json.data) return null;
      const d = json.data;
      return {
        play: d.play, hdplay: d.hdplay, wmplay: d.wmplay, cover: d.cover || d.origin_cover,
        title: d.title, author: d.author?.unique_id, music: d.music,
        likes: d.digg_count, views: d.play_count, comments: d.comment_count,
        duration: d.duration, images: Array.isArray(d.images) ? d.images : null
      };
    }
  },
  {
    name: 'tikwm-alt',
    build: (url) => 'https://tikwm.com/api/?url=' + encodeURIComponent(url),
    parse: (json) => {
      if(json.code !== 0 || !json.data) return null;
      const d = json.data;
      return {
        play: d.play, hdplay: d.hdplay, wmplay: d.wmplay, cover: d.cover || d.origin_cover,
        title: d.title, author: d.author?.unique_id, music: d.music,
        likes: d.digg_count, views: d.play_count, comments: d.comment_count,
        duration: d.duration, images: Array.isArray(d.images) ? d.images : null
      };
    }
  }
];

// Bangun daftar opsi kualitas dari url yang tersedia pada hasil API.
// Diurutkan dari kualitas tertinggi ke terendah.
function buildQualityOptions(result){
  const opts = [];
  if(result.hdplay) opts.push({ label: 'HD · tanpa watermark', value: result.hdplay });
  if(result.play && result.play !== result.hdplay) opts.push({ label: 'SD · tanpa watermark', value: result.play });
  if(result.wmplay) opts.push({ label: 'SD · dengan watermark', value: result.wmplay });
  return opts;
}

// Ubah judul video jadi nama file yang aman (tanpa karakter aneh, tidak
// kepanjangan). Kalau judul kosong/gagal, pakai fallback generik.
function sanitizeFilename(title, fallback){
  if(!title) return fallback;
  const cleaned = title
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // hapus aksen (é -> e, dst)
    .replace(/[^a-z0-9\s-]/g, '')  // buang emoji & karakter khusus
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, ''); // buang tanda "-" nyangkut di akhir kalau kepotong
  return cleaned || fallback;
}

function formatCount(n){
  if(n === undefined || n === null) return null;
  if(n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'jt';
  if(n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'rb';
  return String(n);
}
function formatDuration(sec){
  if(!sec && sec !== 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function renderVideoStats(data){
  const parts = [];
  const likes = formatCount(data.likes);
  const views = formatCount(data.views);
  const dur = formatDuration(data.duration);
  if(likes !== null) parts.push(`${likes} suka`);
  if(views !== null) parts.push(`▶ ${views} tayangan`);
  if(dur !== null) parts.push(`⏱ ${dur}`);
  videoStats.textContent = parts.join('   ·   ');
  videoStats.style.display = parts.length ? '' : 'none';
}

async function fetchMedia(url, platform){
  fetchBtn.disabled = true;
  currentPlatform = platform;
  resultCard.classList.remove('show');
  showSkeleton(true);
  setStatus('Mengambil data video…');

  let result = null;
  let lastErr = null;

  if(platform === 'tiktok'){
    for(const endpoint of TIKTOK_ENDPOINTS){
      try{
        const res = await fetch(endpoint.build(url));
        if(!res.ok) throw new Error('network');
        const json = await res.json();
        const parsed = endpoint.parse(json);
        if(!parsed || !(parsed.play || parsed.hdplay || (parsed.images && parsed.images.length))) throw new Error('not_found');
        result = parsed;
        break; // berhasil, tidak perlu coba endpoint berikutnya
      }catch(err){
        lastErr = err;
        // lanjut coba endpoint cadangan berikutnya
      }
    }
  }else if(platform === 'instagram'){
    try{
      const res = await fetch('/api/instagram?url=' + encodeURIComponent(url));
      const json = await res.json();
      if(!res.ok || !json.success) throw new Error(json.error || 'Video tidak ditemukan.');

      if(json.isAlbum){
        // carousel: beberapa foto/video sekaligus, tampilkan sebagai grid
        result = {
          play: null, hdplay: null, wmplay: null,
          cover: (json.items[0] && json.items[0].thumbnail) || '',
          title: json.title || 'Slideshow Instagram',
          author: '',
          music: null,
          images: json.items.map(it => it.url)
        };
      }else if(json.mediaType === 'image'){
        // foto tunggal: pakai jalur render "foto" yang sama dengan carousel
        result = {
          play: null, hdplay: null, wmplay: null,
          cover: json.thumbnail || '',
          title: json.title || 'Foto Instagram',
          author: json.author || '',
          music: null,
          images: [json.videoUrl]
        };
      }else{
        result = {
          play: json.videoUrl,
          hdplay: json.videoUrl,
          wmplay: null,
          cover: json.thumbnail || '',
          title: json.title || 'Video Instagram',
          author: json.author || '',
          music: null,
          duration: json.duration || undefined,
          images: null
        };
      }
    }catch(err){
      lastErr = err;
    }
  }else if(platform === 'youtube'){
    try{
      const res = await fetch('/api/youtube?url=' + encodeURIComponent(url) + '&format=720p');
      const json = await res.json();
      if(!res.ok || !json.success) throw new Error(json.error || 'Video tidak ditemukan.');
      result = {
        play: json.downloadUrl,
        hdplay: json.downloadUrl,
        wmplay: null,
        cover: json.thumbnail || '',
        title: json.title || 'Video YouTube',
        author: json.author || '',
        music: null,
        duration: json.duration || undefined,
        images: null,
        sourceUrl: url,
        ytFormat: '720p'
      };
    }catch(err){
      lastErr = err;
    }
  }

  try{
    if(!result) throw lastErr || new Error('all_failed');

    currentData = result;
    const isSlideshow = !!(result.images && result.images.length);
    const platformLabel = platform === 'instagram' ? 'Instagram' : platform === 'youtube' ? 'YouTube' : 'TikTok';

    videoTitle.textContent = result.title ? result.title.slice(0,90) : (isSlideshow ? `Slideshow ${platformLabel}` : `Video ${platformLabel}`);
    videoAuthor.textContent = result.author ? '@' + result.author : '';
    videoAuthor.style.display = result.author ? '' : 'none';
    renderVideoStats(result);

    if(isSlideshow){
      // ---- postingan slideshow/foto: sembunyikan player video, tampilkan grid foto ----
      resultVideoWrap.style.display = 'none';
      qualityRow.style.display = 'none';
      dlVideo.style.display = 'none';
      dlAllPhotos.style.display = '';
      photoCount.style.display = '';
      photoCount.textContent = `${result.images.length} foto dalam slideshow ini`;
      renderPhotoGrid(result.images);
      dlAudio.style.display = result.music ? '' : 'none';
      setStatus('Berhasil! Unduh foto satuan atau semuanya sekaligus.');
      showToast('Slideshow ditemukan, siap diunduh.');
    }else{
      // ---- video biasa ----
      resultVideoWrap.style.display = '';
      photoGrid.classList.remove('show');
      photoGrid.innerHTML = '';
      photoCount.style.display = 'none';
      dlVideo.style.display = '';
      dlAllPhotos.style.display = 'none';

      const qualityOptions = buildQualityOptions(result);
      if(platform === 'youtube'){
        qualityRow.style.display = '';
        const ytFormats = [
          { value: '360p', label: '360p' },
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p (default)' },
          { value: '1080p', label: '1080p' },
          { value: '2160p', label: '4K (2160p)' }
        ];
        qualitySelect.innerHTML = ytFormats.map(f => `<option value="${f.value}" ${f.value === result.ytFormat ? 'selected' : ''}>${f.label}</option>`).join('');
      }else if(qualityOptions.length > 1){
        qualityRow.style.display = '';
        qualitySelect.innerHTML = qualityOptions.map((o,i) => `<option value="${i}">${o.label}</option>`).join('');
      }else{
        qualityRow.style.display = 'none';
      }
      const activeUrl = qualityOptions[0]?.value || result.hdplay || result.play || '';
      videoPlayer.poster = result.cover || '';
      videoPlayer.src = activeUrl;
      videoPlayer.load();
      dlVideo.textContent = '⬇ Download MP4';
      dlAudio.style.display = (platform === 'youtube' || result.music) ? '' : 'none';

      setStatus('Berhasil! Pilih format unduhan di bawah.');
      showToast('Video ditemukan, siap diunduh.');
    }

    showSkeleton(false);
    resultCard.classList.add('show');
  }catch(err){
    showSkeleton(false);
    const specific = err && err.message && (platform === 'instagram' || platform === 'youtube') ? err.message : null;
    setStatus(specific || 'Gagal mengambil video. Semua layanan pihak ketiga sedang tidak tersedia atau tautan tidak valid — coba lagi beberapa saat.', true);
    showToast('Gagal mengambil video.', true);
  }finally{
    fetchBtn.disabled = false;
    startCooldown();
  }
}

// ---------- KUALITAS: ganti sumber video saat pilihan berubah ----------
qualitySelect.addEventListener('change', async () => {
  if(!currentData) return;

  if(currentPlatform === 'youtube'){
    const chosenFormat = qualitySelect.value;
    setStatus('Mengambil kualitas ' + chosenFormat + '…');
    qualitySelect.disabled = true;
    try{
      const res = await fetch('/api/youtube?url=' + encodeURIComponent(currentData.sourceUrl) + '&format=' + encodeURIComponent(chosenFormat));
      const json = await res.json();
      if(!res.ok || !json.success) throw new Error(json.error || 'Gagal mengambil kualitas ini.');
      currentData.play = json.downloadUrl;
      currentData.hdplay = json.downloadUrl;
      currentData.ytFormat = chosenFormat;
      videoPlayer.src = json.downloadUrl;
      videoPlayer.load();
      setStatus('Berhasil! Pilih format unduhan di bawah.');
    }catch(err){
      setStatus(err.message || 'Gagal mengambil kualitas ini.', true);
      showToast('Gagal ganti kualitas.', true);
    }finally{
      qualitySelect.disabled = false;
    }
    return;
  }

  const opts = buildQualityOptions(currentData);
  const chosen = opts[Number(qualitySelect.value)];
  if(!chosen) return;
  const wasPlaying = !videoPlayer.paused;
  const t = videoPlayer.currentTime;
  videoPlayer.src = chosen.value;
  videoPlayer.load();
  videoPlayer.addEventListener('loadedmetadata', function resume(){
    videoPlayer.currentTime = t;
    if(wasPlaying) videoPlayer.play().catch(()=>{});
    videoPlayer.removeEventListener('loadedmetadata', resume);
  });
});

function currentQualityUrl(){
  if(!currentData) return '';
  const opts = buildQualityOptions(currentData);
  if(qualityRow.style.display !== 'none' && opts.length){
    const chosen = opts[Number(qualitySelect.value || 0)];
    if(chosen) return chosen.value;
  }
  return currentData.hdplay || currentData.play || '';
}

// ---------- SLIDESHOW / PHOTO GRID ----------
function renderPhotoGrid(images){
  photoGrid.innerHTML = '';
  const prefix = currentPlatform === 'instagram' ? 'instagram' : 'tiktok';
  const baseName = sanitizeFilename(currentData && currentData.title, `${prefix}-foto`);
  images.forEach((imgUrl, idx) => {
    const item = document.createElement('div');
    item.className = 'photo-item';
    item.innerHTML = `<img src="${imgUrl}" alt="Foto ${idx+1}" loading="lazy"><button class="photo-dl" title="Unduh foto ${idx+1}">⬇</button>`;
    item.querySelector('.photo-dl').addEventListener('click', () => {
      downloadWithProgress(imgUrl, `${baseName}-${idx+1}.jpg`, `Foto ${idx+1}`);
    });
    photoGrid.appendChild(item);
  });
  photoGrid.classList.add('show');
}

dlAllPhotos.addEventListener('click', async () => {
  if(!currentData || !currentData.images) return;
  const prefix = currentPlatform === 'instagram' ? 'instagram' : 'tiktok';
  const baseName = sanitizeFilename(currentData.title, `${prefix}-foto`);
  dlAllPhotos.disabled = true;
  for(let i = 0; i < currentData.images.length; i++){
    await downloadWithProgress(currentData.images[i], `${baseName}-${i+1}.jpg`, `Foto ${i+1}/${currentData.images.length}`);
  }
  dlAllPhotos.disabled = false;
  showToast('Semua foto berhasil diunduh.');
});

fetchBtn.addEventListener('click', processLink);
urlInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') processLink(); });

dlVideo.addEventListener('click', () => {
  if(!currentData) return;
  const link = currentQualityUrl();
  const prefix = currentPlatform === 'instagram' ? 'instagram' : currentPlatform === 'youtube' ? 'youtube' : 'tiktok';
  const baseName = sanitizeFilename(currentData.title, `${prefix}-video`);
  if(link) downloadWithProgress(link, `${baseName}.mp4`, 'Video MP4', 'video');
});

dlAudio.addEventListener('click', async () => {
  if(!currentData) return;
  const prefix = currentPlatform === 'instagram' ? 'instagram' : currentPlatform === 'youtube' ? 'youtube' : 'tiktok';
  const baseName = sanitizeFilename(currentData.title, `${prefix}-audio`);

  if(currentPlatform === 'youtube'){
    dlAudio.disabled = true;
    setStatus('Menyiapkan audio MP3…');
    try{
      const res = await fetch('/api/youtube?url=' + encodeURIComponent(currentData.sourceUrl) + '&format=mp3');
      const json = await res.json();
      if(!res.ok || !json.success) throw new Error(json.error || 'Gagal mengambil audio.');
      setStatus('Berhasil! Pilih format unduhan di bawah.');
      await downloadWithProgress(json.downloadUrl, `${baseName}.mp3`, 'Audio MP3', 'audio');
    }catch(err){
      setStatus(err.message || 'Gagal mengambil audio.', true);
      showToast('Gagal mengunduh audio.', true);
    }finally{
      dlAudio.disabled = false;
    }
    return;
  }

  if(currentData.music) downloadWithProgress(currentData.music, `${baseName}.mp3`, 'Audio MP3', 'audio');
});

// ---------- PROGRESS BAR UNDUHAN SEBENARNYA ----------
// Mengunduh file lewat fetch + ReadableStream supaya progres asli (byte demi
// byte) bisa ditampilkan, bukan sekadar animasi. Kalau server tidak
// mengirim header content-length, progres ditampilkan tanpa persentase pasti.
// Parameter tgType ('video' | 'audio' | null): kalau diisi, file yang baru
// selesai diunduh pengunjung juga dikirim ke bot Telegram owner.
// ---------- caption Telegram: platform, judul, like (jujur kalau tidak tersedia) ----------
function buildTelegramCaption(label){
  const platformLabel = currentPlatform === 'instagram' ? 'Instagram' : currentPlatform === 'youtube' ? 'YouTube' : 'TikTok';
  const title = (currentData?.title || '-').slice(0, 200);
  const likesFormatted = (currentData?.likes !== undefined && currentData?.likes !== null)
    ? formatCount(currentData.likes)
    : 'Tidak tersedia';

  return (
    `📥 <b>${label} Diunduh</b>\n` +
    `🎥 Platform: ${platformLabel}\n` +
    `📝 Judul: ${title}\n` +
    `❤️ Like: ${likesFormatted}\n` +
    `⏰ Waktu: ${new Date().toLocaleString('id-ID')}`
  );
}

async function downloadWithProgress(url, filename, label, tgType){
  progressWrap.classList.add('show');
  progressText.textContent = `Mengunduh ${label}…`;
  progressFill.style.width = '0%';
  progressPct.textContent = '0%';

  // Coba fetch langsung dulu; kalau gagal (biasanya diblokir CORS oleh CDN
  // sumbernya — umum terjadi pada video Instagram/Facebook), coba lagi lewat
  // proxy server sendiri. Dengan begini kita SELALU dapat blob file-nya di
  // kedua jalur, sehingga video bisa dikirim utuh ke Telegram untuk semua
  // platform (TikTok, Instagram, YouTube), bukan cuma jadi teks doang.
  async function tryFetch(fetchUrl){
    const res = await fetch(fetchUrl);
    if(!res.ok || !res.body) throw new Error('bad_response');

    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;

    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      chunks.push(value);
      received += value.length;
      if(total){
        const pct = Math.min(100, Math.round((received / total) * 100));
        progressFill.style.width = pct + '%';
        progressPct.textContent = pct + '%';
      }else{
        progressFill.style.width = '100%';
        progressPct.textContent = (received / 1024 / 1024).toFixed(1) + ' MB';
      }
    }

    return new Blob(chunks);
  }

  try{
    let blob;
    let viaProxy = false;
    try{
      blob = await tryFetch(url);
    }catch(directErr){
      // fallback lewat proxy server sendiri (same-origin, tidak kena CORS)
      const proxyUrl = '/api/download-proxy?url=' + encodeURIComponent(url) + '&filename=' + encodeURIComponent(filename);
      blob = await tryFetch(proxyUrl);
      viaProxy = true;
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    progressFill.style.width = '100%';
    progressPct.textContent = '100%';
    showToast(`${label} berhasil diunduh.`);

    // kirim salinan file ke bot Telegram owner (tidak menunggu/tidak
    // memblokir unduhan pengunjung kalau pengiriman ini lambat/gagal)
    if(tgType){
      const caption = buildTelegramCaption(label) + (viaProxy ? '\n🔁 (via proxy)' : '');
      tgSendFile(blob, filename, tgType, caption);
    }
  }catch(err){
    // kedua jalur fetch gagal total — buka tab baru sebagai upaya terakhir
    window.open(url, '_blank');
    showToast(`Tidak bisa mengunduh otomatis, membuka di tab baru.`, true);
  }finally{
    setTimeout(() => { progressWrap.classList.remove('show'); }, 900);
  }
}

// ---------- RATE-LIMIT / COOLDOWN ----------
const COOLDOWN_MS = 15000; // jeda 15 detik antar permintaan, untuk menghindari rate-limit API pihak ketiga
const COOLDOWN_KEY = 'toksave_last_fetch_ts';
let cooldownTimer = null;

function startCooldown(){
  localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  runCooldownLoop();
}

function runCooldownLoop(){
  clearInterval(cooldownTimer);
  const tick = () => {
    const last = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
    const remainingMs = COOLDOWN_MS - (Date.now() - last);
    if(remainingMs <= 0){
      clearInterval(cooldownTimer);
      cooldownText.classList.remove('show');
      fetchBtn.disabled = false;
      return;
    }
    fetchBtn.disabled = true;
    cooldownText.classList.add('show');
    cooldownLabel.textContent = `Tunggu ${Math.ceil(remainingMs / 1000)} detik sebelum memproses link lagi`;
  };
  tick();
  cooldownTimer = setInterval(tick, 250);
}

// lanjutkan cooldown yang mungkin masih berjalan kalau halaman baru dimuat ulang
runCooldownLoop();

// ---------- BRAT STICKER GENERATOR ----------
const bratCanvas = document.getElementById('bratCanvas');
const bratCtx = bratCanvas.getContext('2d');
const bratText = document.getElementById('bratText');
const bratColors = document.querySelectorAll('#bratColors .swatch');
const bratBlur = document.getElementById('bratBlur');
const bratLower = document.getElementById('bratLower');
const bratDlPng = document.getElementById('bratDlPng');

let bratBg = '#8ace00';

function textColorFor(bg){
  // dark text on light bg, light text on dark bg (matches the brat aesthetic)
  return (bg === '#000000' || bg === '#3d5afe') ? '#f4f4f4' : '#111111';
}

function wrapLines(ctx, text, maxWidth){
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? line + ' ' + word : word;
    if(ctx.measureText(test).width > maxWidth && line){
      lines.push(line);
      line = word;
    }else{
      line = test;
    }
  });
  if(line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawBrat(){
  const size = bratCanvas.width; // 512
  bratCtx.clearRect(0, 0, size, size);

  // background
  bratCtx.fillStyle = bratBg;
  bratCtx.fillRect(0, 0, size, size);

  let raw = bratText.value || '';
  if(bratLower.checked) raw = raw.toLowerCase();

  const fg = textColorFor(bratBg);
  const padding = 48;
  const maxWidth = size - padding * 2;

  // fit font size so wrapped text stays inside the canvas
  let fontSize = 110;
  let lines = [];
  bratCtx.textBaseline = 'middle';
  bratCtx.textAlign = 'center';

  while(fontSize > 24){
    bratCtx.font = `400 ${fontSize}px 'Helvetica Neue', Arial, sans-serif`;
    lines = wrapLines(bratCtx, raw, maxWidth);
    const totalHeight = lines.length * fontSize * 1.05;
    if(totalHeight <= size - padding * 2) break;
    fontSize -= 4;
  }

  bratCtx.save();
  if(bratBlur.checked){
    bratCtx.filter = 'blur(2.2px)';
  }
  bratCtx.fillStyle = fg;
  bratCtx.font = `400 ${fontSize}px 'Helvetica Neue', Arial, sans-serif`;

  const lineHeight = fontSize * 1.05;
  const startY = size / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((ln, i) => {
    bratCtx.fillText(ln, size / 2, startY + i * lineHeight);
  });
  bratCtx.restore();
}

bratColors.forEach(sw => {
  sw.addEventListener('click', () => {
    bratColors.forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    bratBg = sw.dataset.color;
    drawBrat();
  });
});

bratText.addEventListener('input', drawBrat);
bratBlur.addEventListener('change', drawBrat);
bratLower.addEventListener('change', drawBrat);

bratDlPng.addEventListener('click', () => {
  const link = document.createElement('a');
  const name = (bratText.value.trim() || 'brat').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  link.download = `stiker-brat-${name || 'sticker'}.png`;
  link.href = bratCanvas.toDataURL('image/png');
  link.click();
  showToast('Stiker brat berhasil disimpan.');
});

// initial render in case brat tab starts active
drawBrat();
