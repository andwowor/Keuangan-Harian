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
      // Utama: kenali baris POS dari STRUKTUR sheet (tahan sisip/hapus baris).
      var n = Math.min(sh.getLastRow(), POS_SCAN_MAX_ROWS);
      if (n > 0) {
        var grid = sh.getRange(1, 1, n, 2).getValues();   // kolom A & B
        var hasil = posDariGrid_(grid);                   // aturan domain
        if (hasil && hasil.length) out = hasil;
      }
      // Cadangan: rentang baris tetap, bila penanda batas tidak ditemukan.
      if (!out.length) out = posDariRentang_(sh);
    }
  } catch (e) {}
  if (!out.length) out = POS_BIAYA;
  cache.put('poslist', JSON.stringify(out), 300);
  return out;
}

/** Cadangan lama: baca POS dari rentang baris tetap POS_SOURCE_ROWS. */
function posDariRentang_(sh) {
  var out = [], seen = {};
  POS_SOURCE_ROWS.forEach(function (rg) {
    var vals = sh.getRange(rg[0], POS_SOURCE_COL, rg[1] - rg[0] + 1, 1).getValues();
    vals.forEach(function (row) {
      var v = String(row[0]).trim();
      if (v && v.toUpperCase() !== 'TOTAL' && !seen[v]) { seen[v] = 1; out.push(v); }
    });
  });
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

/**
 * Tulis satu baris ke sheet INPUT PENGGUNAAN BIAYA pada spreadsheet CASHFLOW.
 * `ssId` opsional: kosong = link aktif di Setelan (input harian); diisi = spreadsheet
 * bulan tertentu (melengkapi Setoran Owner bulan lampau).
 */
function writeCashflow_(payload, ssId) {
  var cf = getCashflowSheet_(ssId);
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

function getCashflowSheet_(ssId) {
  var id = ssId;
  if (!id) {
    var url = PropertiesService.getScriptProperties().getProperty('CASHFLOW_URL');
    if (!url) throw new Error('Spreadsheet CASHFLOW belum diatur. Buka menu Pengaturan dan isi linknya.');
    id = extractSpreadsheetId_(url);
  }
  var ss = SpreadsheetApp.openById(id);
  var sheet = ss.getSheetByName(CASHFLOW_SHEET);
  if (!sheet) throw new Error('Sheet "' + CASHFLOW_SHEET + '" tidak ada di spreadsheet CASHFLOW.');
  return { ss: ss, sheet: sheet };
}

/** Judul & baris tujuan berikutnya pada sheet CASHFLOW target (untuk pratinjau, tanpa menulis). */
function sheetsCashflowInfo_(ssId) {
  var cf = getCashflowSheet_(ssId);
  return { id: cf.ss.getId(), title: cf.ss.getName(), nextRow: cashflowLastRow_(cf.sheet) + 1 };
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
  var n = nCol || TRANSAKSI_NCOL, ada = Math.min(n, sheet.getMaxColumns());
  var rows = (last > hdr) ? sheet.getRange(hdr + 1, 1, last - hdr, ada).getValues() : [];
  // Sheet yang kolomnya lebih sedikit dari yang diminta (mis. belum ada kolom L..O) tidak boleh
  // membuat seluruh laporan gagal: kolom yang tidak ada dibaca sebagai kosong.
  if (ada < n) rows = rows.map(function (r) { while (r.length < n) r.push(''); return r; });
  return { hdr: hdr, last: last, tz: tz, rows: rows };
}

/** Isi satu baris TRANSAKSI (nilai + formula) sebagai data biasa. */
function sheetsBacaBarisTransaksi_(row, nCol) {
  var sheet = getSheet_();
  var n = nCol || TRANSAKSI_NCOL, ada = Math.min(n, sheet.getMaxColumns());
  var rng = sheet.getRange(row, 1, 1, ada);
  var v = rng.getValues()[0], f = rng.getFormulas()[0];
  while (v.length < n) { v.push(''); f.push(''); }
  return { values: v, formulas: f, tz: sheet.getParent().getSpreadsheetTimeZone() };
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
  var prevRange = sheet.getRange(prevRow, 1, 1, TRANSAKSI_NCOL);
  var newRange = sheet.getRange(newRow, 1, 1, TRANSAKSI_NCOL);
  prevRange.copyTo(newRange, { formatOnly: true });
  try { newRange.setDataValidations(prevRange.getDataValidations()); } catch (e) {}
  return {
    row: newRow,
    nominalLama: sheet.getRange(prevRow, 3).getValue(),
    tanggalLama: sheet.getRange(prevRow, 4).getValue(),
    tz: sheet.getParent().getSpreadsheetTimeZone()
  };
}

/** Tulis satu baris TRANSAKSI (A..K) lalu paksa simpan. */
function sheetsTulisBarisTransaksi_(row, values) {
  var sheet = getSheet_();
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
  SpreadsheetApp.flush();
}

/**
 * Daftar KATEGORI BIAYA: [{ nama, cakupan }].
 *
 * Diambil dari ATURAN DROPDOWN kolom K (KOLOM_KATEGORI) pada baris data pertama sheet
 * TRANSAKSI - jadi pilihan di dashboard selalu sama persis dengan pilihan di sheet, dan ikut
 * berubah sendiri bila pemilik menambah/mengganti kategori atau memindahkan daftarnya.
 * `cakupan` = isi kolom di sebelah kanan daftar (penjelasan kategori) bila ada.
 * Cadangan: sheet KATEGORI_SHEET_CADANGAN kolom A..B mulai baris 2.
 */
function sheetsDaftarKategori_() {
  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var nama = [], cakupan = [];
  try {
    var dv = sheet.getRange(hdr + 1, KOLOM_KATEGORI).getDataValidation();
    if (dv) {
      var tipe = dv.getCriteriaType(), nilai = dv.getCriteriaValues();
      if (tipe === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE && nilai[0]) {
        var src = nilai[0], sh = src.getSheet();
        var akhir = Math.min(src.getLastRow(), sh.getLastRow());
        if (akhir >= src.getRow()) {
          var lebar = src.getColumn() < sh.getMaxColumns() ? 2 : 1;
          var v = sh.getRange(src.getRow(), src.getColumn(), akhir - src.getRow() + 1, lebar).getValues();
          for (var i = 0; i < v.length; i++) { nama.push(v[i][0]); cakupan.push(lebar > 1 ? v[i][1] : ''); }
        }
      } else if (tipe === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST && nilai[0]) {
        nama = nilai[0].slice();
      }
    }
  } catch (e) {}
  if (!nama.length) {
    var cad = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(KATEGORI_SHEET_CADANGAN);
    if (cad && cad.getLastRow() >= 2) {
      var w = cad.getRange(2, 1, cad.getLastRow() - 1, 2).getValues();
      for (var j = 0; j < w.length; j++) { nama.push(w[j][0]); cakupan.push(w[j][1]); }
    }
  }
  var out = [], ada = {};
  for (var k = 0; k < nama.length; k++) {
    var n = String(nama[k] || '').trim();
    if (!n || ada[n]) continue;
    ada[n] = true;
    out.push({ nama: n, cakupan: String(cakupan[k] || '').trim() });
  }
  return out;
}

// ============ PENGGANTIAN (kolom L..O sheet TRANSAKSI) - ADR-0015 ============

/** Huruf kolom dari nomor (12 -> "L"). */
function hurufKolom_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Pastikan judul kolom L..O ada. Hanya mengisi sel judul yang KOSONG; bila sudah berisi
 * judul lain, berhenti dengan pesan - tidak pernah menimpa isi sheet milik pemilik.
 */
function sheetsPastikanHeaderPenggantian_() {
  var sheet = getSheet_(), hdr = findHeaderRow_(sheet);
  var butuh = KOLOM_PENGGANTIAN + HEADER_PENGGANTIAN.length - 1;
  if (sheet.getMaxColumns() < butuh) sheet.insertColumnsAfter(sheet.getMaxColumns(), butuh - sheet.getMaxColumns());
  var rng = sheet.getRange(hdr, KOLOM_PENGGANTIAN, 1, HEADER_PENGGANTIAN.length);
  var isi = rng.getValues()[0], perlu = false;
  for (var i = 0; i < isi.length; i++) {
    var v = String(isi[i] == null ? '' : isi[i]).trim();
    if (!v) { perlu = true; continue; }
    if (v.toUpperCase() !== HEADER_PENGGANTIAN[i]) {
      throw new Error('Kolom ' + hurufKolom_(KOLOM_PENGGANTIAN + i) + ' sheet TRANSAKSI sudah berisi "' + v +
        '". Fitur penggantian memakai kolom L sampai O - pindahkan isi itu dulu.');
    }
  }
  if (perlu) rng.setValues([HEADER_PENGGANTIAN]);
}

/** Satu baris TRANSAKSI A..O (nilai + formula) sebagai data biasa. */
function sheetsBacaBarisPenuh_(row) {
  return sheetsBacaBarisTransaksi_(row, TRANSAKSI_NCOL_PENUH);
}

/**
 * Salin isi satu sel ke sel lain pada baris yang sama, PERSIS: formula berisi angka saja
 * (mis. kurs RMB "=85,06*2747,43") ikut tersalin sebagai formula. Formula yang merujuk sel
 * lain disalin sebagai NILAINYA, karena menyalin akan menggeser rujukannya ke kolom lain.
 */
function salinIsiSel_(sheet, row, dariKol, keKol) {
  var dari = sheet.getRange(row, dariKol), ke = sheet.getRange(row, keKol);
  var f = dari.getFormula();
  if (f && /[A-Za-z]{1,3}\$?\d/.test(f.replace(/^=/, ''))) ke.setValue(dari.getValue());
  else dari.copyTo(ke, { contentsOnly: true });
}

/** Tandai menunggu penggantian: NOMINAL (C) disalin apa adanya ke NOMINAL AWAL (M). */
function sheetsTandaiPenggantian_(row) {
  sheetsPastikanHeaderPenggantian_();
  var sheet = getSheet_();
  salinIsiSel_(sheet, row, 3, KOLOM_NOMINAL_AWAL);
  sheet.getRange(row, KOLOM_PENGGANTIAN).setValue(PENGGANTIAN_MENUNGGU);
  sheet.getRange(row, KOLOM_TOTAL_PENGGANTIAN, 1, 2).setValues([[0, '']]);
  SpreadsheetApp.flush();
}

/**
 * Tulis hasil penggantian: NOMINAL (C) dan kolom L, N, O.
 * nominalBersih null = kembalikan NOMINAL dari NOMINAL AWAL apa adanya (total penggantian 0),
 * termasuk formulanya.
 */
function sheetsTulisPenggantian_(row, status, total, rincian, nominalBersih) {
  var sheet = getSheet_();
  if (nominalBersih === null) salinIsiSel_(sheet, row, KOLOM_NOMINAL_AWAL, 3);
  else sheet.getRange(row, 3).setValue(nominalBersih);
  sheet.getRange(row, KOLOM_PENGGANTIAN).setValue(status);
  sheet.getRange(row, KOLOM_TOTAL_PENGGANTIAN, 1, 2).setValues([[total, rincian]]);
  SpreadsheetApp.flush();
}

/** Tulis NOMINAL AWAL (M) - saat nominal transaksi bertanda diedit. */
function sheetsTulisNominalAwal_(row, nilai) {
  getSheet_().getRange(row, KOLOM_NOMINAL_AWAL).setValue(nilai);
}

/** Lepas tanda penggantian: kosongkan L..O. NOMINAL (C) tidak disentuh di sini. */
function sheetsLepasPenggantian_(row) {
  getSheet_().getRange(row, KOLOM_PENGGANTIAN, 1, HEADER_PENGGANTIAN.length).clearContent();
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

/**
 * Isi sheet INPUT PENGGUNAAN BIAYA sebagai data biasa, kolom A..D
 * (SUBJEK, KETERANGAN, NOMINAL, TANGGAL). `ssId` opsional seperti writeCashflow_.
 */
function sheetsBacaCashflowSetoran_(ssId) {
  var cf = getCashflowSheet_(ssId);
  var last = cf.sheet.getLastRow();
  return {
    id: cf.ss.getId(),
    tz: cf.ss.getSpreadsheetTimeZone(),
    title: cf.ss.getName(),
    rows: last >= 1 ? cf.sheet.getRange(1, 1, last, 4).getValues() : []
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

/**
 * Blok BUDGET dari sheet REKAP pada kolom bulan yang sama dengan REAL.
 * Tata letak REKAP sejajar REAL (baris POS & kolom bulan sama), jadi pemanggil
 * memakai nomor baris + kolom yang sama. Mengembalikan [] bila sheet tidak ada,
 * supaya menu Budget tetap tampil (tanpa angka budget) alih-alih gagal total.
 */
function sheetsBacaRekap_(barisAwal, jumlahBaris, kolomNilai) {
  try {
    var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REKAP_SHEET);
    if (!sh || !barisAwal || !jumlahBaris || !kolomNilai) return [];
    var nBaris = Math.min(jumlahBaris, Math.max(0, sh.getLastRow() - barisAwal + 1));
    if (nBaris <= 0 || kolomNilai > sh.getLastColumn()) return [];
    return sh.getRange(barisAwal, kolomNilai, nBaris, 1).getValues();
  } catch (e) { return []; }
}

/** Satu baris penuh sheet REAL (seluruh kolom) sebagai data biasa. */
function sheetsBacaBarisReal_(baris) {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REAL_SHEET);
  if (!sh || baris < 1 || baris > sh.getLastRow()) return [];
  return sh.getRange(baris, 1, 1, sh.getLastColumn()).getValues()[0];
}

/** Nomor baris pertama pada sheet REAL yang kolom B-nya sama persis dengan `label`. -1 bila tak ada. */
function sheetsCariBarisReal_(label, sampaiBaris) {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REAL_SHEET);
  if (!sh) return -1;
  var n = Math.min(sampaiBaris || 120, sh.getLastRow());
  if (n < 1) return -1;
  var kol = sh.getRange(1, 2, n, 1).getValues();
  var cari = String(label || '').trim().toUpperCase();
  for (var i = 0; i < kol.length; i++) {
    if (String(kol[i][0]).trim().toUpperCase() === cari) return i + 1;
  }
  return -1;
}
