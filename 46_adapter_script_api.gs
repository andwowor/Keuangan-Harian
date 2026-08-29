/**
 * ADAPTER OUTBOUND - membaca & menulis ISI PROYEK APPS SCRIPT INI SENDIRI.
 *
 * Dua jalur, dicoba berurutan, keduanya memakai ScriptApp.getOAuthToken() sehingga
 * TIDAK ADA kredensial yang perlu disimpan di mana pun:
 *
 *   1. Apps Script API (script.googleapis.com) - jalur resmi, bisa membuat VERSI proyek
 *      sebagai titik pulih. Sering tidak tersedia bila proyek memakai Cloud project
 *      bawaan, karena script.googleapis.com tidak aktif di sana.
 *   2. Drive API (googleapis.com/drive) - proyek Apps Script sebenarnya berkas Drive
 *      bertipe application/vnd.google-apps.script; isinya bisa diekspor & ditimpa sebagai
 *      application/vnd.google-apps.script+json. Memakai scope drive yang SUDAH dipakai
 *      fitur Simpanan, jadi tidak menambah izin apa pun.
 *
 * Jalur 2 sengaja disediakan supaya pemilik TIDAK PERLU memasang Google Cloud project
 * sendiri. Memasangnya akan memunculkan OAuth consent screen berstatus "Testing", dan
 * di situlah otorisasi kedaluwarsa tiap 7 hari - persis yang harus dihindari.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

function scriptApiHeaders_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

/**
 * Bungkus galat TANPA membuang pesan asli Google. Versi sebelumnya menelan teks asli
 * dan hanya menampilkan dugaan; akibatnya "API belum aktif" tidak bisa dibedakan dari
 * "API perlu Cloud project" - dua hal dengan penanganan yang sama sekali berbeda.
 */
function galatProyek_(aksi, code, text) {
  var asli = String(text || '').replace(/\s+/g, ' ').slice(0, 400);
  var saran = '';
  if (code === 401 || code === 403) {
    saran = ' — Periksa: (a) Apps Script API aktif di ' +
      'https://script.google.com/home/usersettings, (b) scope script.projects ada di ' +
      'appsscript.json dan sudah disetujui ulang.';
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

function driveTulis_(files) {
  var url = 'https://www.googleapis.com/upload/drive/v3/files/' + ScriptApp.getScriptId() +
    '?uploadType=media';
  var muatan = { files: files.map(function (f) {
    return { name: f.name, type: String(f.type || '').toLowerCase(), source: f.source };
  }) };
  return UrlFetchApp.fetch(url, {
    method: 'patch', contentType: MIME_SCRIPT_JSON, headers: scriptApiHeaders_(),
    payload: JSON.stringify(muatan), muteHttpExceptions: true
  });
}

// ---------------------------------------------------------------- API yang dipakai application

/**
 * Isi proyek saat ini: [{ name, type, source }].
 * Jalur yang berhasil disimpan di JALUR_PROYEK_ supaya penulisan memakai jalur yang sama.
 */
var JALUR_PROYEK_ = '';

function scriptBacaKonten_() {
  var r = apiBaca_();
  if (r.getResponseCode() === 200) {
    JALUR_PROYEK_ = 'api';
    return bakuKonten_(JSON.parse(r.getContentText()).files);
  }
  var galatApi = galatProyek_('membaca isi proyek lewat Apps Script API',
    r.getResponseCode(), r.getContentText());

  var d = driveBaca_();
  if (d.getResponseCode() === 200) {
    JALUR_PROYEK_ = 'drive';
    return bakuKonten_(JSON.parse(d.getContentText()).files);
  }
  throw new Error(galatApi.message + '\n\nJalur cadangan Drive juga gagal:\n' +
    galatProyek_('mengekspor proyek lewat Drive', d.getResponseCode(), d.getContentText()).message);
}

function bakuKonten_(files) {
  return (files || []).map(function (f) {
    return { name: f.name, type: normalTipe_(f.type), source: f.source || '' };
  });
}

/** Timpa isi proyek. `files` WAJIB memuat SELURUH berkas - ini mengganti, bukan menambah. */
function scriptTulisKonten_(files) {
  var pakaiDrive = (JALUR_PROYEK_ === 'drive');
  var r = pakaiDrive ? driveTulis_(files) : apiTulis_(files);
  if (r.getResponseCode() === 200) return JSON.parse(r.getContentText() || '{}');
  throw galatProyek_('menulis isi proyek lewat ' + (pakaiDrive ? 'Drive' : 'Apps Script API'),
    r.getResponseCode(), r.getContentText());
}

/**
 * Titik pulih sebelum menimpa. Lewat Apps Script API dibuat VERSI proyek; lewat Drive
 * tidak ada mekanisme versi, jadi isi lama disimpan sebagai berkas JSON di folder
 * Simpanan. Keduanya mengembalikan keterangan yang bisa dibaca pemilik.
 */
function scriptBuatVersi_(keterangan) {
  if (JALUR_PROYEK_ !== 'drive') {
    var r = UrlFetchApp.fetch(apiUrl_('/versions'), {
      method: 'post', contentType: 'application/json', headers: scriptApiHeaders_(),
      payload: JSON.stringify({ description: String(keterangan || '') }), muteHttpExceptions: true
    });
    if (r.getResponseCode() === 200) return 'versi ' + JSON.parse(r.getContentText()).versionNumber;
    throw galatProyek_('membuat versi cadangan', r.getResponseCode(), r.getContentText());
  }
  var lama = scriptBacaKonten_();
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

  if (a.getResponseCode() === 200) out.push('HASIL: jalur Apps Script API BISA dipakai.');
  else if (d.getResponseCode() === 200) out.push('HASIL: Apps Script API tertutup, tetapi jalur Drive BISA dipakai. Sinkron akan otomatis memakai Drive.');
  else out.push('HASIL: kedua jalur tertutup. Kirim seluruh keluaran ini.');

  var pesan = out.join('\n');
  Logger.log(pesan);
  return pesan;
}
