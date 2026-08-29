/**
 * ADAPTER OUTBOUND - Apps Script API (script.googleapis.com) untuk proyek INI SENDIRI.
 *
 * Memakai ScriptApp.getOAuthToken(), yaitu izin pemilik yang sedang menjalankan script -
 * TIDAK ADA kredensial yang perlu disimpan di repositori maupun di GitHub Actions.
 * Membutuhkan scope https://www.googleapis.com/auth/script.projects pada appsscript.json
 * dan Apps Script API dinyalakan di https://script.google.com/home/usersettings.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Kepala permintaan dengan token OAuth pemilik. */
function scriptApiHeaders_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

function scriptApiUrl_(sisa) {
  return 'https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + sisa;
}

/** Terjemahkan galat API menjadi pesan yang bisa ditindaklanjuti pemilik. */
function scriptApiGalat_(aksi, code, text) {
  if (code === 403 && /API has not been used|not enabled|SERVICE_DISABLED/i.test(text)) {
    return new Error('Apps Script API belum aktif. Buka ' +
      'https://script.google.com/home/usersettings lalu nyalakan "Google Apps Script API", ' +
      'tunggu ±1 menit, dan coba lagi.');
  }
  if (code === 403 || code === 401) {
    return new Error('Izin kurang untuk ' + aksi + '. Pastikan scope script.projects ada di ' +
      'appsscript.json, lalu jalankan sekali fungsi apa pun di editor untuk menyetujui ulang. ' +
      '(HTTP ' + code + ')');
  }
  return new Error('Gagal ' + aksi + ' (HTTP ' + code + '): ' + String(text).slice(0, 300));
}

/** Isi proyek saat ini: [{ name, type, source }]. */
function scriptBacaKonten_() {
  var resp = UrlFetchApp.fetch(scriptApiUrl_('/content'),
    { headers: scriptApiHeaders_(), muteHttpExceptions: true });
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code !== 200) throw scriptApiGalat_('membaca isi proyek', code, text);
  return (JSON.parse(text).files || []);
}

/** Timpa isi proyek. `files` WAJIB memuat SELURUH berkas - API ini mengganti, bukan menambah. */
function scriptTulisKonten_(files) {
  var resp = UrlFetchApp.fetch(scriptApiUrl_('/content'), {
    method: 'put',
    contentType: 'application/json',
    headers: scriptApiHeaders_(),
    payload: JSON.stringify({ files: files }),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code !== 200) throw scriptApiGalat_('menulis isi proyek', code, text);
  return JSON.parse(text);
}

/**
 * Buat VERSI proyek dari isi saat ini - dipakai sebagai titik pulih sebelum ditimpa.
 * Versi ini muncul di editor pada File > Version history / daftar versi deployment.
 */
function scriptBuatVersi_(keterangan) {
  var resp = UrlFetchApp.fetch(scriptApiUrl_('/versions'), {
    method: 'post',
    contentType: 'application/json',
    headers: scriptApiHeaders_(),
    payload: JSON.stringify({ description: String(keterangan || '') }),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code !== 200) throw scriptApiGalat_('membuat versi cadangan', code, text);
  return JSON.parse(text).versionNumber;
}
