/**
 * ADAPTER OUTBOUND - membaca & menulis ISI PROYEK APPS SCRIPT INI SENDIRI.
 *
 * Dua jalur, keduanya memakai ScriptApp.getOAuthToken() sehingga TIDAK ADA kredensial
 * yang perlu disimpan di mana pun:
 *
 *   1. Drive API - JALUR UTAMA. Proyek Apps Script sebenarnya berkas Drive bertipe
 *      application/vnd.google-apps.script; isinya diekspor & ditimpa sebagai
 *      application/vnd.google-apps.script+json. Butuh scope drive.scripts (menulis)
 *      selain drive (membaca).
 *   2. Apps Script API (script.googleapis.com) - CADANGAN. Jalur resmi dan satu-satunya
 *      yang bisa membuat VERSI proyek, tetapi menolak pada proyek yang memakai Cloud
 *      project bawaan karena API itu tidak aktif di sana.
 *
 * Urutannya sengaja begitu: mengaktifkan jalur 2 menuntut pemasangan Google Cloud project
 * standar, yang memunculkan OAuth consent screen berstatus "Testing" - dan di situlah
 * otorisasi kedaluwarsa tiap 7 hari. Justru itu yang harus dihindari.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

function scriptApiHeaders_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

/**
 * Bungkus galat TANPA membuang pesan asli Google. Versi pertama adapter ini menelan teks
 * asli dan hanya menampilkan dugaan; akibatnya "API belum aktif" tak dapat dibedakan dari
 * "scope kurang" - dua hal dengan penanganan yang sama sekali berbeda. Saran hanya
 * ditambahkan bila pesan Google memang menunjuk penyebab yang dikenali.
 */
function galatProyek_(aksi, code, text) {
  var asli = String(text || '').replace(/\s+/g, ' ').slice(0, 400);
  var saran = '';
  if (/drive\.scripts/.test(asli)) {
    saran = ' — Tambahkan scope https://www.googleapis.com/auth/drive.scripts pada ' +
      'appsscript.json, lalu jalankan sekali fungsi apa pun di editor untuk menyetujui ulang.';
  } else if (/has not been used in project|SERVICE_DISABLED/i.test(asli)) {
    saran = ' — Apps Script API tidak aktif pada Cloud project bawaan proyek ini. JANGAN ' +
      'memasang Cloud project standar untuk mengaktifkannya; jalur Drive dipakai sebagai ganti.';
  }
  return new Error('Gagal ' + aksi + ' (HTTP ' + code + ').' + saran + '\nPesan Google: ' + asli);
}

/** Samakan penulisan jenis berkas: Apps Script API memakai HURUF BESAR, Drive huruf kecil. */
function normalTipe_(t) { return String(t || '').toUpperCase(); }

// ---------------------------------------------------------------- JALUR 1: Apps Script API

function apiUrl_(sisa) {
  return 'https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + sisa;
}

function apiBaca_() {
  return UrlFetchApp.fetch(apiUrl_('/content'),
    { headers: scriptApiHeaders_(), muteHttpExceptions: true });
}

function apiTulis_(files) {
  return UrlFetchApp.fetch(apiUrl_('/content'), {
    method: 'put', contentType: 'application/json', headers: scriptApiHeaders_(),
    payload: JSON.stringify({ files: files }), muteHttpExceptions: true
  });
}

// ---------------------------------------------------------------- JALUR 2: Drive API

var MIME_SCRIPT_JSON = 'application/vnd.google-apps.script+json';

function driveBaca_() {
  var url = 'https://www.googleapis.com/drive/v3/files/' + ScriptApp.getScriptId() +
    '/export?mimeType=' + encodeURIComponent(MIME_SCRIPT_JSON);
  return UrlFetchApp.fetch(url, { headers: scriptApiHeaders_(), muteHttpExceptions: true });
}

/** Isi proyek hasil baca terakhir + teks mentahnya (untuk memetakan nama -> id & uji ulang). */
var KONTEN_LAMA_ = null;
var DRIVE_MENTAH_ = '';

/**
 * Kirim muatan mentah ke endpoint unggah Drive. `versi` = 3 (PATCH) atau 2 (PUT).
 * Format script+json adalah jalur lama yang dulu didokumentasikan pada Drive v2, jadi v2
 * disediakan sebagai cadangan bila v3 menolak.
 */
function driveKirim_(versi, muatanTeks) {
  var url = 'https://www.googleapis.com/upload/drive/v' + versi + '/files/' +
    ScriptApp.getScriptId() + '?uploadType=media';
  return UrlFetchApp.fetch(url, {
    method: versi === 2 ? 'put' : 'patch',
    contentType: MIME_SCRIPT_JSON, headers: scriptApiHeaders_(),
    payload: muatanTeks, muteHttpExceptions: true
  });
}

/**
 * Susun muatan tulis. `id` berkas lama DIPERTAHANKAN: format script+json memakai id itu
 * untuk mengenali berkas yang sudah ada; tanpa id, permintaan bisa terbaca sebagai
 * "buat semua berkas baru dengan nama yang sudah dipakai".
 */
function driveMuatan_(files) {
  var idPerNama = {};
  (KONTEN_LAMA_ || []).forEach(function (f) { if (f.id) idPerNama[f.name] = f.id; });
  return JSON.stringify({ files: files.map(function (f) {
    var o = { name: f.name, type: String(f.type || '').toLowerCase(), source: f.source };
    if (idPerNama[f.name]) o.id = idPerNama[f.name];
    return o;
  }) });
}

function driveTulis_(files) {
  // Urutan dari hasil uji bolak-balik pada proyek nyata (cekTulisDrive, 29 Agu 2026):
  // muatan susunan kita -> v2 = 200, v3 = 500 Internal Error (muatan mentah diterima
  // keduanya). Jadi v2 dicoba PERTAMA; v3 tinggal cadangan bila Google menutup v2 kelak.
  var muatan = driveMuatan_(files);
  var a = driveKirim_(2, muatan);
  if (a.getResponseCode() === 200) return a;
  var b = driveKirim_(3, muatan);
  if (b.getResponseCode() === 200) return b;
  throw new Error(
    galatProyek_('menulis isi proyek lewat Drive v2', a.getResponseCode(), a.getContentText()).message +
    '\n\nDrive v3 juga gagal:\n' +
    galatProyek_('menulis isi proyek lewat Drive v3', b.getResponseCode(), b.getContentText()).message);
}

// ---------------------------------------------------------------- API yang dipakai application

/**
 * Isi proyek saat ini: [{ name, type, source }].
 * Jalur yang berhasil disimpan di JALUR_PROYEK_ supaya penulisan memakai jalur yang sama.
 */
var JALUR_PROYEK_ = '';

function scriptBacaKonten_() {
  // Drive DULU: pada proyek dengan Cloud project bawaan, script.googleapis.com selalu
  // menolak, jadi mencobanya lebih dulu hanya menambah satu permintaan gagal tiap sinkron.
  var d = driveBaca_();
  if (d.getResponseCode() === 200) {
    JALUR_PROYEK_ = 'drive';
    DRIVE_MENTAH_ = d.getContentText();
    KONTEN_LAMA_ = bakuKonten_(JSON.parse(DRIVE_MENTAH_).files);
    return KONTEN_LAMA_;
  }
  var galatDrive = galatProyek_('mengekspor proyek lewat Drive',
    d.getResponseCode(), d.getContentText());

  var r = apiBaca_();
  if (r.getResponseCode() === 200) {
    JALUR_PROYEK_ = 'api';
    return bakuKonten_(JSON.parse(r.getContentText()).files);
  }
  throw new Error(galatDrive.message + '\n\nJalur Apps Script API juga gagal:\n' +
    galatProyek_('membaca isi proyek lewat Apps Script API',
      r.getResponseCode(), r.getContentText()).message);
}

function bakuKonten_(files) {
  return (files || []).map(function (f) {
    return { id: f.id || '', name: f.name, type: normalTipe_(f.type), source: f.source || '' };
  });
}

/** Timpa isi proyek. `files` WAJIB memuat SELURUH berkas - ini mengganti, bukan menambah. */
function scriptTulisKonten_(files) {
  if (JALUR_PROYEK_ !== 'api') {
    var d = driveTulis_(files);                      // melempar sendiri bila kedua versi gagal
    return JSON.parse(d.getContentText() || '{}');
  }
  var r = apiTulis_(files);
  if (r.getResponseCode() === 200) return JSON.parse(r.getContentText() || '{}');
  throw galatProyek_('menulis isi proyek lewat Apps Script API',
    r.getResponseCode(), r.getContentText());
}

/**
 * Titik pulih sebelum menimpa. Lewat Apps Script API dibuat VERSI proyek; lewat Drive
 * tidak ada mekanisme versi, jadi isi lama disimpan sebagai berkas JSON di folder
 * Simpanan. Keduanya mengembalikan keterangan yang bisa dibaca pemilik.
 */
function scriptBuatVersi_(keterangan, isiLama) {
  if (JALUR_PROYEK_ === 'api') {
    var r = UrlFetchApp.fetch(apiUrl_('/versions'), {
      method: 'post', contentType: 'application/json', headers: scriptApiHeaders_(),
      payload: JSON.stringify({ description: String(keterangan || '') }), muteHttpExceptions: true
    });
    if (r.getResponseCode() === 200) return 'versi ' + JSON.parse(r.getContentText()).versionNumber;
    throw galatProyek_('membuat versi cadangan', r.getResponseCode(), r.getContentText());
  }
  // Isi lama diterima dari pemanggil: membacanya ulang berarti satu 403 + satu ekspor
  // penuh lagi, dan menambah satu titik gagal tepat sebelum cadangan dibuat.
  var lama = isiLama || scriptBacaKonten_();
  var nama = 'cadangan-kode-' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmm') + '.json';
  var berkas = getInboxFolder_().createFile(nama, JSON.stringify({ files: lama }, null, 1),
    'application/json');
  return 'berkas ' + nama + ' di folder Simpanan';
}

// ---------------------------------------------------------------- DIAGNOSTIK

/**
 * Jalankan dari editor bila sinkron gagal. Mencetak APA ADANYA jawaban kedua jalur,
 * supaya penyebabnya tidak perlu ditebak.
 * Sengaja diletakkan di adapter ini (bukan 99_tests.gs) karena yang diuji adalah
 * konektivitas adapter ini sendiri - dan supaya cukup menyalin SATU berkas saat mendiagnosis.
 */
function cekSinkron() {
  var out = ['Script ID : ' + ScriptApp.getScriptId(), ''];

  var a = apiBaca_();
  out.push('[1] Apps Script API  -> HTTP ' + a.getResponseCode());
  out.push('    ' + String(a.getContentText()).replace(/\s+/g, ' ').slice(0, 320));
  out.push('');

  var d = driveBaca_();
  out.push('[2] Drive API export -> HTTP ' + d.getResponseCode());
  out.push('    ' + String(d.getContentText()).replace(/\s+/g, ' ').slice(0, 320));
  out.push('');

  if (d.getResponseCode() === 200) out.push('HASIL: jalur Drive BISA dipakai (jalur utama).');
  else if (a.getResponseCode() === 200) out.push('HASIL: Drive tertutup, tetapi Apps Script API BISA dipakai.');
  else out.push('HASIL: kedua jalur tertutup. Kirim seluruh keluaran ini.');

  var pesan = out.join('\n');
  Logger.log(pesan);
  return pesan;
}

/**
 * Uji BOLAK-BALIK jalur tulis Drive: membaca isi proyek, lalu mengirimkannya KEMBALI
 * APA ADANYA. Aman - isi yang ditulis identik dengan yang barusan dibaca, jadi proyek
 * tidak berubah walau berhasil.
 *
 * Gunanya memisahkan dua kemungkinan yang sama-sama memunculkan "400 Bad Request":
 *   (a) endpoint/versi Drive-nya yang salah  -> muatan mentah pun ditolak;
 *   (b) susunan muatan buatan kita yang salah -> muatan mentah diterima, muatan kita ditolak.
 */
function cekTulisDrive() {
  var out = [];
  var d = driveBaca_();
  out.push('Ekspor Drive -> HTTP ' + d.getResponseCode());
  if (d.getResponseCode() !== 200) {
    out.push('    ' + String(d.getContentText()).replace(/\s+/g, ' ').slice(0, 300));
    out.push('HASIL: membaca saja sudah gagal.');
    Logger.log(out.join('\n')); return out.join('\n');
  }
  var mentah = d.getContentText();
  KONTEN_LAMA_ = bakuKonten_(JSON.parse(mentah).files);
  out.push('Jumlah berkas: ' + KONTEN_LAMA_.length);
  out.push('');

  var uji = [
    ['A. muatan MENTAH ke Drive v3', 3, mentah],
    ['B. muatan MENTAH ke Drive v2', 2, mentah],
    ['C. muatan SUSUNAN KITA ke v3', 3, driveMuatan_(KONTEN_LAMA_)],
    ['D. muatan SUSUNAN KITA ke v2', 2, driveMuatan_(KONTEN_LAMA_)]
  ];
  var adaBerhasil = '';
  for (var i = 0; i < uji.length; i++) {
    var r = driveKirim_(uji[i][1], uji[i][2]);
    var kode = r.getResponseCode();
    out.push(uji[i][0] + ' -> HTTP ' + kode);
    if (kode !== 200) out.push('    ' + String(r.getContentText()).replace(/\s+/g, ' ').slice(0, 220));
    else if (!adaBerhasil) adaBerhasil = uji[i][0];
  }
  out.push('');
  out.push(adaBerhasil ? ('HASIL: jalur tulis yang BERHASIL -> ' + adaBerhasil)
                       : 'HASIL: keempat kombinasi ditolak. Kirim seluruh keluaran ini.');
  var pesan = out.join('\n');
  Logger.log(pesan);
  return pesan;
}
