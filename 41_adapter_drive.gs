/**
 * ADAPTER OUTBOUND - Google Drive (folder penyimpanan bukti).
 * SATU-SATUNYA modul yang boleh memanggil DriveApp.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

function getInboxFolder_() {
  try { return DriveApp.getFolderById(INBOX_FOLDER_ID); }
  catch (e) {
    throw new Error('Folder penyimpanan tidak bisa dibuka. Pastikan folder masih ada dan ' +
      'dapat diakses akun pemilik dashboard.');
  }
}

/**
 * Ambil berkas HANYA bila berada di folder penyimpanan. Mencegah berkas Drive lain
 * ikut terbaca lewat ID dari sisi klien.
 */
function getInboxFile_(fileId) {
  var f = DriveApp.getFileById(fileId);
  var parents = f.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === INBOX_FOLDER_ID) return f;
  }
  throw new Error('Berkas tidak berada di folder penyimpanan.');
}

/**
 * Blob gambar untuk dibaca/ditampilkan. Bila file terlalu besar (mis. foto kamera
 * langsung dari Drive), ambil versi beresolusi lebih kecil agar muat di batas API.
 */
function inboxImageBlob_(file) {
  var blob = file.getBlob();
  if (blob.getBytes().length <= INBOX_MAX_BYTES) return blob;
  try {
    var r = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (r.getResponseCode() === 200) {
      var tb = r.getBlob();
      if (tb.getBytes().length > 0) return tb;
    }
  } catch (e) {}
  return blob;
}

function inboxThumb_(file, size) {
  try {
    var t = null;
    try { t = file.getThumbnail(); } catch (e) {}
    // File yang baru diunggah kadang belum punya thumbnail; pakai gambarnya langsung bila kecil.
    if (!t && size && size < 400000) t = file.getBlob();
    if (!t) return '';
    return 'data:' + t.getContentType() + ';base64,' + Utilities.base64Encode(t.getBytes());
  } catch (e) { return ''; }
}

/** Ambil sidik jari yang tersimpan di deskripsi berkas, atau '' bila belum ada. */
function inboxStoredHash_(file) {
  var h = descGetLine_(file.getDescription(), 'kh-md5:');
  return /^[0-9a-f]{32}$/.test(h) ? h : '';
}
/** Simpan/perbarui sidik jari TANPA menghapus metadata AI. */
function inboxSetHash_(file, hash) {
  file.setDescription(descSetLine_(file.getDescription(), 'kh-md5:', hash));
}

// --- Hasil baca AI yang tersimpan di deskripsi berkas ---
function inboxGetAi_(file) {
  var s = descGetLine_(file.getDescription(), 'kh-ai:');
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
function inboxMarkReading_(file) {
  var d = file.getDescription();
  d = descSetLine_(d, 'kh-aistate:', 'reading');
  d = descSetLine_(d, 'kh-aits:', String(new Date().getTime()));
  d = descSetLine_(d, 'kh-aierr:', null);
  file.setDescription(d);
}
function inboxSaveAi_(file, dataObj) {
  var d = file.getDescription();
  d = descSetLine_(d, 'kh-aistate:', 'done');
  d = descSetLine_(d, 'kh-aits:', null);
  d = descSetLine_(d, 'kh-aierr:', null);
  d = descSetLine_(d, 'kh-ai:', JSON.stringify(dataObj));
  file.setDescription(d);
}
function inboxMarkError_(file, msg) {
  var d = file.getDescription();
  d = descSetLine_(d, 'kh-aistate:', 'error');
  d = descSetLine_(d, 'kh-aits:', null);
  d = descSetLine_(d, 'kh-aierr:', String(msg || '').replace(/\s+/g, ' ').slice(0, 180));
  file.setDescription(d);
}
