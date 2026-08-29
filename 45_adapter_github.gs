/**
 * ADAPTER OUTBOUND - Repositori GitHub (raw.githubusercontent.com).
 *
 * Sengaja HANYA memakai raw.githubusercontent.com, tidak api.github.com: Apps Script
 * keluar lewat alamat IP milik Google yang dipakai bersama banyak pengguna, sehingga
 * batas 60 permintaan/jam per IP pada GitHub API bisa habis oleh orang lain. raw adalah
 * CDN statis tanpa batas semacam itu. Konsekuensinya daftar berkas tidak bisa ditanyakan
 * ke API - karena itu repositori menyimpan sync-manifest.json.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** URL mentah sebuah berkas pada cabang yang dikonfigurasi. */
function githubUrlMentah_(path) {
  return 'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/' +
    GITHUB_BRANCH + '/' + String(path || '');
}

/**
 * Unduh satu berkas sebagai teks. `nocache` menambahkan parameter unik agar CDN tidak
 * menyajikan versi lama - raw.githubusercontent menyimpan cache beberapa menit.
 */
function githubAmbilTeks_(path) {
  var url = githubUrlMentah_(path) + '?t=' + Date.now();
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  var code = resp.getResponseCode();
  if (code === 404) throw new Error('Berkas tidak ada di GitHub: ' + path);
  if (code !== 200) throw new Error('Gagal mengunduh ' + path + ' (HTTP ' + code + ')');
  return resp.getContentText();
}

/** Baca sync-manifest.json: { versi, cabang, dibuat, berkas:[...] }. */
function githubManifest_() {
  var teks = githubAmbilTeks_(GITHUB_MANIFEST);
  var m;
  try { m = JSON.parse(teks); }
  catch (e) { throw new Error(GITHUB_MANIFEST + ' bukan JSON yang sah.'); }
  if (!m || !m.berkas || !m.berkas.length) throw new Error(GITHUB_MANIFEST + ' tidak memuat daftar berkas.');
  return m;
}
