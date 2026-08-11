/**
 * ADAPTER OUTBOUND - Google Sheets.
 * SATU-SATUNYA modul yang boleh memanggil SpreadsheetApp.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

// ====================== HELPER ======================

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" tidak ditemukan.');
  return sheet;
}

/** Baris header (memuat "POS BIAYA" di kolom A). */
function findHeaderRow_(sheet) {
  var n = Math.min(sheet.getLastRow(), 50);
  if (n === 0) return 1;
  var colA = sheet.getRange(1, 1, n, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim().toUpperCase() === 'POS BIAYA') return i + 1;
  }
  return 1;
}

/**
 * Baris terisi terbawah dari BLOK KONTIGU yang dimulai tepat di bawah header
 * (kolom A). Berhenti di baris kosong pertama, sehingga baris "nyasar" yang
 * terpisah jauh di bawah (akibat celah) tidak ikut terhitung. Penulisan baru
 * selalu di baris kosong pertama setelah blok ini.
 */
function findLastDataRow_(sheet, headerRow) {
  var lastSheetRow = sheet.getLastRow();
  if (lastSheetRow <= headerRow) return headerRow;
  var colA = sheet.getRange(headerRow + 1, 1, lastSheetRow - headerRow, 1).getValues();
  var last = headerRow;
  for (var i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() === '') break; // baris kosong pertama -> akhir blok kontigu
    last = headerRow + 1 + i;
  }
  return last;
}

/** Daftar POS BIAYA — dari sheet REAL kolom B (baris item), fallback ke daftar bawaan. */
function getPosList_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('poslist');
  if (hit) return JSON.parse(hit);
  var out = [];
  try {
    var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(POS_SOURCE_SHEET);
    if (sh) {
      var seen = {};
      POS_SOURCE_ROWS.forEach(function (rg) {
        var vals = sh.getRange(rg[0], POS_SOURCE_COL, rg[1] - rg[0] + 1, 1).getValues();
        vals.forEach(function (row) {
          var v = String(row[0]).trim();
          if (v && v.toUpperCase() !== 'TOTAL' && !seen[v]) { seen[v] = 1; out.push(v); }
        });
      });
    }
  } catch (e) {}
  if (!out.length) out = POS_BIAYA;
  cache.put('poslist', JSON.stringify(out), 300);
  return out;
}

/** Daftar SUMBER DANA (dari daftar bawaan yang lengkap). */
function getSumberList_() { return SUMBER_DANA; }

/** Posisi baris kosong terbawah (target penulisan) pada sheet TRANSAKSI. */
function getNextRowInfo() {
  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var last = findLastDataRow_(sheet, hdr);
  return { targetRow: last + 1, lastRow: last };
}

/** Catat satu transaksi (bukti + saran AI + pilihan akhir) ke sheet AI_MEMORY untuk pembelajaran. */
function logMemory_(m) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(MEMORY_SHEET);
  var header = ['waktu', 'tanggal', 'pos_final', 'keterangan_final', 'nominal', 'sumber_dana_final',
    'rekening_final', 'akun_sumber', 'mata_uang', 'merchant',
    'pos_saran', 'sumber_dana_saran', 'keterangan_saran', 'dikoreksi'];
  if (!sh) { sh = ss.insertSheet(MEMORY_SHEET); sh.appendRow(header); try { sh.hideSheet(); } catch (e) {} }
  else if (sh.getLastRow() === 0) { sh.appendRow(header); }
  sh.appendRow([
    new Date(), m.tanggal || '', m.pos || '', m.keterangan || '', m.nominal || '', m.sumberDana || '',
    m.rekening || '', m.akunSumber || '', m.mataUang || '', m.merchant || '',
    m.sugPos || '', m.sugSumber || '', m.sugKeterangan || '', m.dikoreksi ? 'ya' : ''
  ]);
}

/** Tulis satu baris ke sheet INPUT PENGGUNAAN BIAYA pada spreadsheet CASHFLOW. */
function writeCashflow_(payload) {
  var cf = getCashflowSheet_();
  var sheet = cf.sheet;
  var maxFilled = cashflowLastRow_(sheet);
  var prevRow = maxFilled > 1 ? maxFilled : 1;
  var newRow = maxFilled + 1;

  // Kolom A (SUBJEK BIAYA) sengaja TIDAK ditulis — terisi otomatis dari KETERANGAN.
  // Hanya tulis B..G (KETERANGAN, NOMINAL, TANGGAL, OUTLET, STATUS, SUMBER DANA).
  var prevRange = sheet.getRange(prevRow, 2, 1, 6);
  var newRange = sheet.getRange(newRow, 2, 1, 6);
  prevRange.copyTo(newRange, { formatOnly: true });

  var r = buildCashflowRow_(payload);
  var tgl = parseIsoDate_(payload.tanggal, cf.ss.getSpreadsheetTimeZone());
  newRange.setValues([[r.keterangan, r.nominal, tgl, r.outlet, r.status, r.sumberDana]]);
  SpreadsheetApp.flush();
  return { row: newRow, sumberDana: r.sumberDana, title: cf.ss.getName() };
}

function getCashflowSheet_() {
  var url = PropertiesService.getScriptProperties().getProperty('CASHFLOW_URL');
  if (!url) throw new Error('Spreadsheet CASHFLOW belum diatur. Buka menu Pengaturan dan isi linknya.');
  var ss = SpreadsheetApp.openById(extractSpreadsheetId_(url));
  var sheet = ss.getSheetByName(CASHFLOW_SHEET);
  if (!sheet) throw new Error('Sheet "' + CASHFLOW_SHEET + '" tidak ada di spreadsheet CASHFLOW.');
  return { ss: ss, sheet: sheet };
}

/** Baris terisi terbawah pada kolom B (KETERANGAN) sheet INPUT PENGGUNAAN BIAYA.
 *  Memakai kolom B (yang selalu kita tulis), bukan A, karena SUBJEK BIAYA (A) terisi
 *  otomatis dari KETERANGAN dan bisa belum terisi saat append. */
function cashflowLastRow_(sheet) {
  var last = sheet.getLastRow();
  if (last < 1) return 1;
  var colB = sheet.getRange(1, 2, last, 1).getValues(); // B KETERANGAN
  var maxFilled = 1;
  for (var i = 0; i < colB.length; i++) {
    if (String(colB[i][0]).trim() !== '') maxFilled = i + 1;
  }
  return maxFilled;
}

/** Simpan link spreadsheet CASHFLOW (divalidasi & dicek aksesnya). */
function setCashflowUrl(url, pin) {
  verifyPin_(pin);
  var id = extractSpreadsheetId_(url);
  var ss = SpreadsheetApp.openById(id); // melempar bila tak ada akses
  var name = ss.getName();
  if (!ss.getSheetByName(CASHFLOW_SHEET)) {
    throw new Error('Sheet "' + CASHFLOW_SHEET + '" tidak ditemukan di spreadsheet itu.');
  }
  PropertiesService.getScriptProperties().setProperty('CASHFLOW_URL', String(url).trim());
  return { ok: true, title: name };
}

// ====================== PENGATURAN & AUTO-ISI CASHFLOW ======================

/** Setelan saat ini (link spreadsheet CASHFLOW bulan berjalan). */
function getSettings() {
  var url = PropertiesService.getScriptProperties().getProperty('CASHFLOW_URL') || '';
  var title = '';
  if (url) {
    try { title = SpreadsheetApp.openById(extractSpreadsheetId_(url)).getName(); }
    catch (e) { title = '(tidak bisa diakses: ' + (e.message || e) + ')'; }
  }
  return { cashflowUrl: url, cashflowTitle: title };
}

// ============ PRIMITIF SHEETS UNTUK LAPISAN APPLICATION ============
// Lapisan application TIDAK BOLEH memanggil SpreadsheetApp langsung (Standar §5.2/§5.3).
// Semua akses baca/tulis TRANSAKSI & REAL melewati fungsi-fungsi di bawah ini,
// yang selalu mengembalikan DATA BIASA (array/objek), bukan objek Range/Sheet.

/** Zona waktu spreadsheet TRANSAKSI (penulisan tanggal ikut zona ini agar tidak bergeser). */
function sheetsTz_() {
  return getSheet_().getParent().getSpreadsheetTimeZone();
}

/** Batas area data TRANSAKSI: baris header & baris data terbawah. */
function sheetsBatasTransaksi_() {
  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  return { hdr: hdr, last: findLastDataRow_(sheet, hdr) };
}

/**
 * Seluruh baris data TRANSAKSI sebagai array biasa (A..J) + metadata.
 * Dipakai bersama oleh semua laporan supaya pembacaan tidak diduplikasi.
 */
function sheetsBacaTransaksi_(nCol) {
  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var last = findLastDataRow_(sheet, hdr);
  var tz = sheet.getParent().getSpreadsheetTimeZone();
  var rows = (last > hdr) ? sheet.getRange(hdr + 1, 1, last - hdr, nCol || 10).getValues() : [];
  return { hdr: hdr, last: last, tz: tz, rows: rows };
}

/** Isi satu baris TRANSAKSI (nilai + formula) sebagai data biasa. */
function sheetsBacaBarisTransaksi_(row, nCol) {
  var sheet = getSheet_();
  var rng = sheet.getRange(row, 1, 1, nCol || 10);
  return { values: rng.getValues()[0], formulas: rng.getFormulas()[0],
    tz: sheet.getParent().getSpreadsheetTimeZone() };
}

/**
 * Siapkan baris kosong terbawah untuk penambahan: salin format & data-validation
 * dari baris terakhir, lalu kembalikan nomor baris + nilai sel acuan (untuk aturan tipe).
 */
function sheetsSiapkanBarisBaru_() {
  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var last = findLastDataRow_(sheet, hdr);
  var prevRow = last > hdr ? last : hdr;
  var newRow = last + 1;
  var prevRange = sheet.getRange(prevRow, 1, 1, 10);
  var newRange = sheet.getRange(newRow, 1, 1, 10);
  prevRange.copyTo(newRange, { formatOnly: true });
  try { newRange.setDataValidations(prevRange.getDataValidations()); } catch (e) {}
  return {
    row: newRow,
    nominalLama: sheet.getRange(prevRow, 3).getValue(),
    tanggalLama: sheet.getRange(prevRow, 4).getValue(),
    tz: sheet.getParent().getSpreadsheetTimeZone()
  };
}

/** Tulis satu baris TRANSAKSI (A..J) lalu paksa simpan. */
function sheetsTulisBarisTransaksi_(row, values) {
  var sheet = getSheet_();
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
  SpreadsheetApp.flush();
}

/** Sheet REAL: header baris 1 + blok label/nilai, sebagai data biasa. */
function sheetsBacaReal_(barisAwal, jumlahBaris, kolomNilai) {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REAL_SHEET);
  if (!sh) throw new Error('Sheet "' + REAL_SHEET + '" tidak ditemukan.');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var out = { header: header, labels: [], values: [] };
  if (barisAwal && jumlahBaris) {
    out.labels = sh.getRange(barisAwal, 1, jumlahBaris, 2).getValues();
    if (kolomNilai) out.values = sh.getRange(barisAwal, kolomNilai, jumlahBaris, 1).getValues();
  }
  return out;
}

/** Baris "Setoran Owner" pada sheet CASHFLOW aktif, sebagai data biasa (B..D). */
function sheetsBacaCashflowSetoran_() {
  var cf = getCashflowSheet_();
  var last = cf.sheet.getLastRow();
  return {
    tz: cf.ss.getSpreadsheetTimeZone(),
    title: cf.ss.getName(),
    rows: last >= 1 ? cf.sheet.getRange(1, 2, last, 3).getValues() : []
  };
}

/** Seluruh isi sheet AI_MEMORY sebagai data biasa ([] bila sheet belum ada / kosong). */
function sheetsBacaMemori_() {
  try {
    var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(MEMORY_SHEET);
    if (!sh || sh.getLastRow() <= 1) return [];
    return sh.getDataRange().getValues();
  } catch (e) { return []; }
}
