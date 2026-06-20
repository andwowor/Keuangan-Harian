/**
 * Dashboard Pengisian Biaya Harian — Keuangan Harian
 * --------------------------------------------------
 * Alur: upload screenshot / bukti transfer  ->  dibaca otomatis oleh Claude Vision
 *       ->  ditinjau & dikonfirmasi pada form  ->  disimpan ke sheet TRANSAKSI.
 *
 * Sheet TRANSAKSI memakai 10 kolom:
 *   A POS BIAYA | B KETERANGAN | C NOMINAL | D TANGGAL | E BIAYA BULAN
 *   F TAHUN BIAYA | G SUMBER DANA | H BUDGET BULAN | I TAHUN BUDGET | J Rekening
 *
 * Aturan pengisian (sesuai permintaan pemilik):
 *  - POS BIAYA   : hanya pilih dari daftar (dropdown), tidak boleh diketik.
 *  - KETERANGAN  : ditebak dari isi bukti + dipandu history pengisian per POS.
 *  - TANGGAL     : selalu dari tanggal pada bukti transaksi.
 *  - BIAYA BULAN, TAHUN BIAYA, SUMBER DANA, BUDGET BULAN, TAHUN BUDGET:
 *                  selalu ditanyakan/dipilih oleh pemilik (tidak ditebak otomatis).
 *  - Rekening    : hanya diisi bila SUMBER DANA = PENDAPATAN USAHA, berisi nama bank
 *                  pada bukti transfer. Kosong (PENDAPATAN USAHA) = kas tunai usaha.
 *                  Jika bukti menampilkan "BOC Debit Card (1201)" -> SUMBER DANA = UANG SAKU.
 *  - Baris baru selalu ditulis di baris kosong terbawah setelah baris terbawah berisi data.
 *
 * Sebelum dipakai, set Script Property "ANTHROPIC_API_KEY" (lihat README.md).
 */

// ====================== KONFIGURASI ======================

var SPREADSHEET_ID = '1IsRwEzQ7xJdd0jpzxpGmvhBvx34CVuOElPFfyRs-5fM';
var SHEET_NAME = 'TRANSAKSI';
var MEMORY_SHEET = 'AI_MEMORY'; // sheet tersembunyi: catatan pembelajaran (bukti + saran AI + pilihan akhir)
var TIMEZONE = 'Asia/Jakarta';

// Model Claude untuk membaca gambar. Ganti ke 'claude-opus-4-8' (lebih akurat) atau
// 'claude-haiku-4-5' (lebih hemat) bila perlu.
var CLAUDE_MODEL = 'claude-sonnet-4-6';

// Daftar kategori POS BIAYA yang valid (urut perkiraan frekuensi pemakaian).
var POS_BIAYA = [
  'DAILY DRIVER', 'BIAYA KULIAH CHINA', 'Pengeluaran Tidak Terduga', 'Acara',
  'Liburan', 'Pembelian Barang', 'Isi Bensin', 'BIAYA PULANG', 'Perjalanan',
  'Les Colin Darlene', 'Pulsa', 'Belanja Bulanan', 'Cicilan KPR', 'Gaji ART',
  'Cicilan KTA Flexy', 'XL Home', 'Token Listrik', 'Tagihan PDAM',
  'SPP Colin', 'SPP Darlene', 'Kesehatan', 'Perbaikan/Pemeliharaan',
  'Tambahan Modal Usaha', 'Rantang Bulanan', 'Sabun Cuci Baju',
  'Retribusi Sampah', 'Beras', 'Air Galon', 'Bayar Kredit',
  'Tagihan Kredivo', 'Tagihan Shopee Paylater', 'Paylater Traveloka',
  'Tagihan Indodana', 'Tagihan Ada Kami', 'Tagihan Allo Paylater',
  'Tagihan OVO Paylater', 'Tagihan Gojek Paylater',
  'BNI Platinum AMEX Card', 'BNI Platinum Card', 'BNI Corporate Card',
  'BRI Card Mega', 'Parkir', 'Biaya Admin dan Biaya Transfer'
];

// Daftar SUMBER DANA yang valid.
var SUMBER_DANA = [
  'PENDAPATAN USAHA', 'UANG SAKU', 'THR/CUTI (SALDO BERGERAK)', 'KARTU KREDIT',
  'GAJI', 'PINJAMAN LAIN', 'KAS LAIN USAHA', 'PENGEMBALIAN USAHA',
  'KK', 'IKS', 'BONUS', 'SPPD', 'LAIN-LAIN'
];

// Nilai SUMBER DANA yang mengaktifkan kolom Rekening.
var SUMBER_DANA_REKENING = 'PENDAPATAN USAHA';

// Daftar bank/rekening (dipelajari dari history kolom Rekening).
var BANK_REKENING = ['Mandiri', 'BNI', 'BRI', 'BCA', 'Kas Tunai Maumbi'];

// Pemetaan nomor rekening/akun SUMBER DANA (rekening pengirim pada bukti) -> SUMBER DANA.
// 'bank' hanya diisi untuk PENDAPATAN USAHA (akan dimasukkan ke kolom Rekening).
var ACCOUNTS = [
  { no: '154301003768507', label: 'BRI 154301003768507', sumberDana: 'PENDAPATAN USAHA', bank: 'BRI' },
  { no: '1860031055', label: 'BNI 1860031055', sumberDana: 'PENDAPATAN USAHA', bank: 'BNI' },
  { no: '0263632785', label: 'BCA 0263632785', sumberDana: 'PENDAPATAN USAHA', bank: 'BCA' },
  { no: '1500034495620', label: 'Mandiri 1500034495620', sumberDana: 'PENDAPATAN USAHA', bank: 'Mandiri' },
  { no: '0263935851', label: 'BCA 0263935851', sumberDana: 'KAS LAIN USAHA', bank: '' },
  { no: '002929331804', label: 'BLU BCA Digital 002929331804', sumberDana: 'THR/CUTI (SALDO BERGERAK)', bank: '' },
  { no: '085242081620', label: 'Allo 085242081620', sumberDana: 'THR/CUTI (SALDO BERGERAK)', bank: '' },
  { no: '1966320708', label: 'BNI Multicurrency 1966320708', sumberDana: 'THR/CUTI (SALDO BERGERAK)', bank: '' },
  { no: '005401232138503', label: 'BRI 005401232138503', sumberDana: 'THR/CUTI (SALDO BERGERAK)', bank: '' }
];

// Spreadsheet CASHFLOW (diatur via menu Pengaturan; diganti tiap awal bulan).
var CASHFLOW_SHEET = 'INPUT PENGGUNAAN BIAYA';
var CASHFLOW_SUMBER_OPTIONS = ['KAS TUNAI MAUMBI', 'KAS TUNAI PERKAMIL', 'BCA', 'BRI', 'BNI',
  'MANDIRI', 'BCA MEGA', 'BRI MEGA', 'MANDIRI MEGA', 'KAS SEWA GEDUNG',
  'KAS BIAYA DITAHAN TUNAI', 'KAS BIAYA DITAHAN BANK'];

// Nama bulan (HURUF BESAR seperti format di sheet) dan Title Case (untuk teks tanggal).
var BULAN_UPPER = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
var BULAN_TITLE = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// ====================== WEB APP ======================

/** Entry point web app — menampilkan dashboard. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Keuangan Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Menyisipkan file HTML lain ke dalam template (dipakai bila perlu). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Cek PIN untuk gate UI. True bila cocok ATAU bila APP_PIN belum diset (tanpa gate). */
function checkPin(pin) {
  var p = PropertiesService.getScriptProperties().getProperty('APP_PIN');
  if (!p) return true;
  return String(pin) === String(p);
}

/** Lempar error bila PIN tidak valid (dipakai pada fungsi mahal/menulis). */
function verifyPin_(pin) {
  var p = PropertiesService.getScriptProperties().getProperty('APP_PIN');
  if (p && String(pin) !== String(p)) throw new Error('PIN salah / akses ditolak.');
}

/** Data untuk mengisi dropdown & nilai default di form. */
function getConfig() {
  var now = new Date();
  var year = Number(Utilities.formatDate(now, TIMEZONE, 'yyyy'));
  return {
    posBiaya: POS_BIAYA,
    sumberDana: SUMBER_DANA,
    sumberDanaRekening: SUMBER_DANA_REKENING,
    bankRekening: BANK_REKENING,
    bulan: BULAN_UPPER,
    tahun: [year - 1, year, year + 1],
    today: Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd'),
    tahunIni: year
  };
}

/** Posisi baris kosong terbawah (target penulisan) pada sheet TRANSAKSI. */
function getNextRowInfo() {
  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var last = findLastDataRow_(sheet, hdr);
  return { targetRow: last + 1, lastRow: last };
}

// ====================== MENU SISA BUDGET (sheet REAL) ======================

var REAL_SHEET = 'REAL';

/** Daftar bulan (label "BULAN YYYY" pada baris 1 sheet REAL) + label bulan berjalan. */
function getBudgetMonths() {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REAL_SHEET);
  if (!sh) throw new Error('Sheet "' + REAL_SHEET + '" tidak ditemukan.');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var months = [];
  for (var i = 0; i < header.length; i++) {
    var h = String(header[i]).trim();
    if (/^[A-Za-z]+\s+\d{4}$/.test(h)) months.push(h);
  }
  var now = new Date();
  var cur = BULAN_UPPER[Number(Utilities.formatDate(now, TIMEZONE, 'MM')) - 1] +
    ' ' + Utilities.formatDate(now, TIMEZONE, 'yyyy');
  return { months: months, current: cur };
}

/** Data biaya (per kategori), pemasukan (per kantong), & saldo untuk satu bulan dari sheet REAL. */
function getBudget(monthLabel) {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REAL_SHEET);
  if (!sh) throw new Error('Sheet "' + REAL_SHEET + '" tidak ditemukan.');
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = -1;
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim().toUpperCase() === String(monthLabel).trim().toUpperCase()) { col = i + 1; break; }
  }
  if (col < 0) throw new Error('Bulan "' + monthLabel + '" tidak ada di sheet REAL.');

  var labels = sh.getRange(3, 1, 88, 2).getValues();  // kolom A,B untuk baris 3..90
  var vals = sh.getRange(3, col, 88, 1).getValues();  // kolom bulan untuk baris 3..90
  function row(r) {
    var x = r - 3;
    return { a: String(labels[x][0]).trim(), b: String(labels[x][1]).trim(), v: toNum_(vals[x][0]) };
  }
  var biaya = [], pemasukan = [], r, o;
  for (r = 3; r <= 64; r++) { o = row(r); if (o.b === '') continue; biaya.push(o); }   // kategori + subtotal
  for (r = 69; r <= 86; r++) { pemasukan.push(row(r)); }                               // kantong (semua, termasuk 0)

  return {
    month: String(header[col - 1]).trim(),
    biaya: biaya,
    pemasukan: pemasukan,
    totalPengeluaran: row(66).v,
    totalIncome: row(87).v,
    saldo: row(88).v,
    saldoBulanSebelumnya: row(89).v,
    saldoReal: row(90).v
  };
}

function toNum_(x) {
  if (typeof x === 'number') return x;
  if (x === '' || x == null) return 0;
  var n = parseFloat(String(x).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ====================== DAFTAR BIAYA (sheet TRANSAKSI) ======================

/** Opsi filter: bulan (tetap) + daftar tahun yang ada di kolom TAHUN BIAYA + default berjalan. */
function getTransaksiFilters() {
  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var last = findLastDataRow_(sheet, hdr);
  var years = {};
  if (last > hdr) {
    var vals = sheet.getRange(hdr + 1, 6, last - hdr, 1).getValues(); // F TAHUN BIAYA
    for (var i = 0; i < vals.length; i++) {
      var y = String(vals[i][0]).trim().replace(/\.0$/, '');
      if (y) years[y] = 1;
    }
  }
  var arr = Object.keys(years).map(Number).filter(function (n) { return !isNaN(n); });
  arr.sort(function (a, b) { return b - a; });
  var now = new Date();
  return {
    bulan: BULAN_UPPER,
    tahun: arr,
    current: {
      bulan: BULAN_UPPER[Number(Utilities.formatDate(now, TIMEZONE, 'MM')) - 1],
      tahun: Number(Utilities.formatDate(now, TIMEZONE, 'yyyy'))
    }
  };
}

/** Daftar biaya dengan filter gabungan (semua opsional). filter = {bulan,tahun,tanggal,pos,keterangan,sumber}. */
function getTransaksiList(filter) {
  filter = filter || {};
  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var last = findLastDataRow_(sheet, hdr);
  var out = [], total = 0;
  var bU = String(filter.bulan || '').trim().toUpperCase();          // E BIAYA BULAN
  var tY = String(filter.tahun || '').trim().replace(/\.0$/, '');    // F TAHUN BIAYA
  var fTgl = String(filter.tanggal || '').trim();                    // D TANGGAL (yyyy-MM-dd)
  var fPos = String(filter.pos || '').trim();                        // A POS BIAYA
  var fKet = String(filter.keterangan || '').trim().toLowerCase();   // B KETERANGAN (mengandung)
  var fSum = String(filter.sumber || '').trim();                     // G SUMBER DANA
  if (last > hdr) {
    var rng = sheet.getRange(hdr + 1, 1, last - hdr, 7).getValues(); // A..G
    var tz = sheet.getParent().getSpreadsheetTimeZone();
    for (var i = 0; i < rng.length; i++) {
      var r = rng[i];
      if (bU && String(r[4]).trim().toUpperCase() !== bU) continue;
      if (tY && String(r[5]).trim().replace(/\.0$/, '') !== tY) continue;
      var tglIso = r[3] instanceof Date ? Utilities.formatDate(r[3], tz, 'yyyy-MM-dd') : String(r[3]).trim();
      if (fTgl && tglIso !== fTgl) continue;
      if (fPos && String(r[0]).trim() !== fPos) continue;
      if (fKet && String(r[1]).toLowerCase().indexOf(fKet) < 0) continue;
      if (fSum && String(r[6]).trim() !== fSum) continue;
      var nom = Number(r[2]) || 0;                                   // C NOMINAL
      total += nom;
      out.push({
        pos: String(r[0]).trim(),
        ket: String(r[1]).trim(),
        nominal: nom,
        tgl: tglIso,
        sumber: String(r[6]).trim()
      });
    }
  }
  out.sort(function (a, b) { return a.tgl < b.tgl ? 1 : (a.tgl > b.tgl ? -1 : 0); }); // terbaru -> terlama
  return { count: out.length, total: total, items: out };
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

function extractSpreadsheetId_(url) {
  var s = String(url || '').trim();
  var m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  throw new Error('Link spreadsheet tidak valid.');
}

function getCashflowSheet_() {
  var url = PropertiesService.getScriptProperties().getProperty('CASHFLOW_URL');
  if (!url) throw new Error('Spreadsheet CASHFLOW belum diatur. Buka menu Pengaturan dan isi linknya.');
  var ss = SpreadsheetApp.openById(extractSpreadsheetId_(url));
  var sheet = ss.getSheetByName(CASHFLOW_SHEET);
  if (!sheet) throw new Error('Sheet "' + CASHFLOW_SHEET + '" tidak ada di spreadsheet CASHFLOW.');
  return { ss: ss, sheet: sheet };
}

/** Baris terisi terbawah pada kolom A (SUBJEK BIAYA) sheet INPUT PENGGUNAAN BIAYA. */
function cashflowLastRow_(sheet) {
  var last = sheet.getLastRow();
  if (last < 1) return 1;
  var colA = sheet.getRange(1, 1, last, 1).getValues();
  var maxFilled = 1;
  for (var i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() !== '') maxFilled = i + 1;
  }
  return maxFilled;
}

/** Petakan Rekening (TRANSAKSI) -> opsi SUMBER DANA pada dropdown CASHFLOW. */
function mapBankCashflow_(rek) {
  var r = String(rek || '').trim().toUpperCase();
  if (!r || r === 'MAUMBI') return 'KAS TUNAI MAUMBI';
  if (CASHFLOW_SUMBER_OPTIONS.indexOf(r) >= 0) return r;
  return 'KAS TUNAI MAUMBI';
}

/** Nilai-nilai baris CASHFLOW yang akan ditulis (untuk pratinjau & penulisan). */
function buildCashflowRow_(payload) {
  return {
    subjek: 'Setoran Owner',
    keterangan: 'Setoran Owner',
    nominal: Number(payload.nominal),
    tanggal: payload.tanggal,
    outlet: 'MAUMBI',
    status: 'BELUM INPUT',
    sumberDana: mapBankCashflow_(payload.rekening)
  };
}

/** Pratinjau entri CASHFLOW (tanpa menulis). */
function previewCashflow(payload, pin) {
  verifyPin_(pin);
  var cf = getCashflowSheet_();
  return {
    ok: true,
    title: cf.ss.getName(),
    sheet: CASHFLOW_SHEET,
    targetRow: cashflowLastRow_(cf.sheet) + 1,
    row: buildCashflowRow_(payload)
  };
}

/** Tulis satu baris ke sheet INPUT PENGGUNAAN BIAYA pada spreadsheet CASHFLOW. */
function writeCashflow_(payload) {
  var cf = getCashflowSheet_();
  var sheet = cf.sheet;
  var maxFilled = cashflowLastRow_(sheet);
  var prevRow = maxFilled > 1 ? maxFilled : 1;
  var newRow = maxFilled + 1;

  var prevRange = sheet.getRange(prevRow, 1, 1, 8);   // A..H
  var newRange = sheet.getRange(newRow, 1, 1, 8);
  prevRange.copyTo(newRange, { formatOnly: true });

  var r = buildCashflowRow_(payload);
  var tgl = parseIsoDate_(payload.tanggal, cf.ss.getSpreadsheetTimeZone());
  newRange.setValues([[r.subjek, r.keterangan, r.nominal, tgl, r.outlet, r.status, r.sumberDana, '']]);
  SpreadsheetApp.flush();
  return { row: newRow, sumberDana: r.sumberDana, title: cf.ss.getName() };
}


/** Rekomendasi KETERANGAN (dari history sheet) untuk POS BIAYA tertentu. */
function getKeteranganOptions(posBiaya) {
  if (!posBiaya) return [];
  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var last = findLastDataRow_(sheet, hdr);
  if (last <= hdr) return [];
  var vals = sheet.getRange(hdr + 1, 1, last - hdr, 2).getValues(); // kolom A & B
  var freq = {};
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === posBiaya) {
      var k = String(vals[i][1]).trim();
      if (k) freq[k] = (freq[k] || 0) + 1;
    }
  }
  var arr = Object.keys(freq).map(function (k) { return [k, freq[k]]; });
  arr.sort(function (a, b) { return b[1] - a[1]; });
  return arr.slice(0, 12).map(function (x) { return x[0]; });
}

/**
 * Konteks pembelajaran dari history sheet (di-cache 5 menit, di-refresh tiap simpan).
 * - sumberDanaByPos: SUMBER DANA paling sering dipakai untuk tiap POS BIAYA.
 */
function getHistoryContext() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('histctx');
  if (cached) return JSON.parse(cached);

  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var last = findLastDataRow_(sheet, hdr);
  var ctx = { sumberDanaByPos: {} };

  if (last > hdr) {
    var vals = sheet.getRange(hdr + 1, 1, last - hdr, 7).getValues(); // kolom A..G
    var freq = {}; // pos -> { sumberDana: jumlah }
    for (var i = 0; i < vals.length; i++) {
      var pos = String(vals[i][0]).trim();   // A POS BIAYA
      var sd = String(vals[i][6]).trim();    // G SUMBER DANA
      if (!pos || !sd) continue;
      (freq[pos] = freq[pos] || {})[sd] = (freq[pos][sd] || 0) + 1;
    }
    for (var p in freq) {
      var best = '', bc = -1;
      for (var s in freq[p]) { if (freq[p][s] > bc) { bc = freq[p][s]; best = s; } }
      ctx.sumberDanaByPos[p] = best;
    }
  }
  cache.put('histctx', JSON.stringify(ctx), 300);
  return ctx;
}

/**
 * Contoh keterangan/merchant per POS BIAYA dari history (untuk memandu pemilihan POS).
 * Dipakai sebagai "panduan kategorisasi" pada prompt analyzeImage. Cache 5 menit.
 */
function getPosExamples() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('posex');
  if (hit) return JSON.parse(hit);

  var sheet = getSheet_();
  var hdr = findHeaderRow_(sheet);
  var last = findLastDataRow_(sheet, hdr);
  var map = {};
  if (last > hdr) {
    var vals = sheet.getRange(hdr + 1, 1, last - hdr, 2).getValues(); // A POS, B KETERANGAN
    var freq = {};
    for (var i = 0; i < vals.length; i++) {
      var p = String(vals[i][0]).trim(), k = String(vals[i][1]).trim();
      if (!p) continue;
      freq[p] = freq[p] || {};
      if (k) freq[p][k] = (freq[p][k] || 0) + 1;
    }
    for (var pp in freq) {
      var arr = Object.keys(freq[pp]).map(function (k) { return [k, freq[pp][k]]; });
      arr.sort(function (a, b) { return b[1] - a[1]; });
      map[pp] = arr.slice(0, 8).map(function (x) { return x[0]; });
    }
  }
  cache.put('posex', JSON.stringify(map), 300);
  return map;
}

// ====================== EKSTRAKSI GAMBAR (CLAUDE VISION) ======================

/**
 * Membaca satu gambar (data URL). Mengembalikan field yang BISA dibaca dari bukti:
 * nominal, tanggal, pos_biaya, keterangan (+rekomendasi), deteksi BOC, dan bank rekening.
 * Field yang HARUS dipilih pemilik (sumber dana, bulan/tahun) TIDAK ditebak di sini.
 */
function analyzeImage(dataUrl, pin) {
  verifyPin_(pin);
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY belum diset. Buka Project Settings > Script Properties.');
  }

  var img = parseDataUrl_(dataUrl);

  var systemPrompt =
    'Anda asisten pencatat keuangan. Anda menerima screenshot atau bukti transfer ' +
    'pengeluaran (umumnya dari aplikasi bank / e-wallet Indonesia). Baca gambar dan ' +
    'ekstrak data sesuai skema. Jangan menebak field yang tidak terlihat pada bukti.\n\n' +
    'Aturan:\n' +
    '- nominal_asli: total uang yang KELUAR dalam MATA UANG ASLI pada bukti, sebagai angka ' +
    '(boleh desimal). Contoh "Rp2.392.144" -> 2392144 ; "¥85,50"/"RMB 85.50" -> 85.5.\n' +
    '- mata_uang: kode ISO 4217 mata uang pada bukti. Rupiah/Rp -> "IDR" ; RMB/¥/元/yuan -> "CNY" ; ' +
    'US$/USD -> "USD" ; S$/SGD -> "SGD" ; dst. Jika tidak jelas, gunakan "IDR".\n' +
    '- tanggal: tanggal transaksi PADA BUKTI, format ISO YYYY-MM-DD. WAJIB diambil dari ' +
    'bukti. Jika benar-benar tidak terbaca, isi string kosong "".\n' +
    '- pos_biaya: pilih dari daftar enum dengan MENCOCOKKAN nama merchant/toko/barang pada bukti ' +
    'ke PANDUAN KATEGORISASI di bawah (dibuat dari history pengisian pemilik). Sinyal kuat: bila ' +
    'mata uang CNY/RMB (belanja di China) -> umumnya "BIAYA KULIAH CHINA", kecuali tiket transportasi ' +
    'pulang ke Indonesia -> "BIAYA PULANG". Merchant kopi/makanan/hiburan domestik (mis. Starbucks, ' +
    'Fore, bioskop, restoran) -> "DAILY DRIVER".\n' +
    '- keterangan: label SINGKAT gaya pencatatan pemilik untuk transaksi ini ' +
    '(nama merchant/barang/keperluan). Contoh gaya: "Makanan", "Snack", "Starbucks", ' +
    '"Kopi", "Kebutuhan harian", "Sepeda", "Transport", "Refill galon", "Tarik tunai", ' +
    '"Oleh-oleh", "Internet", "Bensin Manado". Jika tidak yakin, isi "" dan ' +
    'keterangan_yakin=false.\n' +
    '- keterangan_yakin: true hanya jika Anda cukup yakin keterangan-nya tepat.\n' +
    '- keterangan_opsi: hingga 4 usulan label singkat yang cocok (boleh kosong array).\n' +
    '- merchant: nama merchant/toko/aplikasi/penerima pada bukti apa adanya (untuk pembelajaran), atau "".\n' +
    '- akun_sumber: nomor rekening/akun SUMBER DANA pada bukti, yaitu rekening PENGIRIM / yang ' +
    'DIDEBIT (biasanya berlabel "Sumber Dana", "Rekening Sumber", "Dari", "From"), tulis ANGKANYA ' +
    '(boleh sertakan nama bank). Bukan rekening tujuan/penerima. Bila tidak ada, isi "".\n' +
    '- is_boc_1201: true bila pada bukti tertulis "BOC Debit Card (1201)".\n' +
    '- bank_rekening: cadangan bila akun_sumber tidak terbaca — bila bukti transfer dari bank, ' +
    'petakan bank pengirim ke Mandiri/BNI/BRI/BCA; jika tidak jelas isi "". ' +
    '(Hanya dipakai bila sumber dana = PENDAPATAN USAHA.)\n' +
    '- confidence: keyakinan keseluruhan.\n' +
    '- catatan: catatan singkat bila ada yang ambigu, selain itu "".';

  // Tambahkan panduan kategorisasi POS dari history (belajar dari data yang sudah diisi).
  var posExamples = getPosExamples();
  var panduan = '';
  for (var pi = 0; pi < POS_BIAYA.length; pi++) {
    var pp = POS_BIAYA[pi], ex = posExamples[pp];
    panduan += '- ' + pp + (ex && ex.length ? ': ' + ex.join(', ') : '') + '\n';
  }
  systemPrompt += '\n\nPANDUAN KATEGORISASI POS BIAYA (dari history pengisian pemilik — ' +
    'cocokkan merchant/barang pada bukti dengan contoh POS terdekat):\n' + panduan;

  var schema = {
    type: 'object',
    properties: {
      nominal_asli: { type: 'number', description: 'Jumlah dalam mata uang asli pada bukti' },
      mata_uang: { type: 'string', description: 'Kode ISO 4217, mis. IDR/CNY/USD/SGD' },
      tanggal: { type: 'string', description: 'Tanggal transaksi YYYY-MM-DD, atau "" bila tak terbaca' },
      pos_biaya: { type: 'string', enum: POS_BIAYA },
      keterangan: { type: 'string' },
      keterangan_yakin: { type: 'boolean' },
      keterangan_opsi: { type: 'array', items: { type: 'string' } },
      merchant: { type: 'string', description: 'Nama merchant/toko/penerima pada bukti, atau ""' },
      akun_sumber: { type: 'string', description: 'Nomor rekening/akun sumber dana (pengirim) pada bukti, atau ""' },
      is_boc_1201: { type: 'boolean' },
      bank_rekening: { type: 'string', enum: ['Mandiri', 'BNI', 'BRI', 'BCA', 'Kas Tunai Maumbi', ''] },
      confidence: { type: 'string', enum: ['tinggi', 'sedang', 'rendah'] },
      catatan: { type: 'string' }
    },
    required: ['nominal_asli', 'mata_uang', 'tanggal', 'pos_biaya', 'keterangan', 'keterangan_yakin',
      'keterangan_opsi', 'merchant', 'akun_sumber', 'is_boc_1201', 'bank_rekening', 'confidence', 'catatan'],
    additionalProperties: false
  };

  var body = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    output_config: { format: { type: 'json_schema', schema: schema } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
        { type: 'text', text: 'Ekstrak data pengeluaran dari bukti ini sesuai skema.' }
      ]
    }]
  };

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code !== 200) throw new Error('Claude API error ' + code + ': ' + text);

  var json = JSON.parse(text);
  if (json.stop_reason === 'refusal') {
    throw new Error('Permintaan ditolak oleh model (refusal). Coba gambar lain.');
  }

  var raw = '';
  for (var i = 0; i < json.content.length; i++) {
    if (json.content[i].type === 'text') raw += json.content[i].text;
  }

  var data;
  try { data = JSON.parse(raw); }
  catch (e) { throw new Error('Gagal membaca hasil dari model: ' + raw); }

  // Konversi ke IDR memakai kurs tanggal transaksi bila mata uang asing (mis. RMB/CNY).
  var cur = normalizeCurrency_(data.mata_uang);
  var amt = Number(data.nominal_asli) || 0;
  data.mataUang = cur;
  data.nominalAsli = amt;
  if (cur === 'IDR' || cur === '') {
    data.nominal = Math.round(amt);
    data.konversi = null;
  } else {
    try {
      var conv = convertToIdr_(amt, cur, data.tanggal);
      data.nominal = Math.round(conv.idr);
      data.konversi = { mataUang: cur, nominalAsli: amt, rate: conv.rate, tanggalKurs: conv.date };
    } catch (e2) {
      data.nominal = 0;
      data.konversi = { error: true, mataUang: cur, nominalAsli: amt, message: String(e2) };
    }
  }
  // Saran SUMBER DANA & Rekening dari nomor rekening sumber (deterministik + dipelajari), lalu aturan BOC.
  var acct = detectAccount_(data.akun_sumber, getLearnedAccounts_());
  data.sumberDanaSaran = '';
  data.rekeningSaran = '';
  data.sumberDanaAlasan = '';
  if (acct) {
    data.sumberDanaSaran = acct.sumberDana;
    data.rekeningSaran = acct.bank || '';
    data.sumberDanaAlasan = 'Rekening ' + acct.label + ' → ' + acct.sumberDana;
  } else if (data.is_boc_1201) {
    data.sumberDanaSaran = 'UANG SAKU';
    data.sumberDanaAlasan = 'BOC Debit Card (1201) → Uang Saku';
  }

  data.nominalFormatted = formatRupiah_(data.nominal);
  return data;
}

// ====================== KONVERSI MATA UANG ======================

/** Konversi nominal mata uang asing ke IDR memakai kurs tanggal tertentu (dipanggil UI). */
function convertCurrency(amount, currency, isoDate) {
  var cur = normalizeCurrency_(currency);
  var c = convertToIdr_(Number(amount) || 0, cur, isoDate);
  return { idr: Math.round(c.idr), rate: c.rate, date: c.date, currency: cur };
}

function convertToIdr_(amount, currency, isoDate) {
  if (!currency || currency === 'IDR') return { idr: amount, rate: 1, date: isoDate || '' };
  var info = getFxRate_(currency, isoDate);
  return { idr: amount * info.rate, rate: info.rate, date: info.date };
}

/** Normalisasi kode mata uang ke ISO 4217 yang dikenal Frankfurter/ECB. */
function normalizeCurrency_(c) {
  c = String(c || '').trim().toUpperCase();
  var map = {
    '': 'IDR', 'RP': 'IDR', 'IDR': 'IDR', 'RUPIAH': 'IDR',
    'RMB': 'CNY', 'CNH': 'CNY', 'CNY': 'CNY', 'YUAN': 'CNY', 'RENMINBI': 'CNY', '¥': 'CNY', '元': 'CNY', '￥': 'CNY',
    'US$': 'USD', 'USD': 'USD', '$': 'USD', 'US DOLLAR': 'USD', 'DOLLAR': 'USD',
    'S$': 'SGD', 'SGD': 'SGD', 'SG$': 'SGD',
    'JPY': 'JPY', 'YEN': 'JPY',
    'EUR': 'EUR', '€': 'EUR', 'AUD': 'AUD', 'A$': 'AUD', 'MYR': 'MYR', 'RM': 'MYR',
    'HKD': 'HKD', 'HK$': 'HKD', 'GBP': 'GBP', 'KRW': 'KRW', 'THB': 'THB'
  };
  return map[c] || c;
}

/**
 * Cocokkan teks akun sumber dari bukti ke daftar rekening. ACCOUNTS (manual) diprioritaskan,
 * lalu daftar yang DIPELAJARI dari memori. Mengembalikan entri atau null.
 */
function detectAccount_(text, learned) {
  var d = String(text || '').replace(/\D/g, '');
  if (d.length < 6) return null;
  var lists = [ACCOUNTS, learned || []];
  for (var L = 0; L < lists.length; L++) {
    for (var i = 0; i < lists[L].length; i++) {
      var k = lists[L][i].no;
      if (!k) continue;
      if (d.indexOf(k) >= 0 || k.indexOf(d) >= 0 || d.slice(-6) === k.slice(-6)) return lists[L][i];
    }
  }
  return null;
}

function topKey_(obj) {
  var best = '', bc = -1;
  for (var k in obj) { if (obj[k] > bc) { bc = obj[k]; best = k; } }
  return best;
}

/** Rekening yang DIPELAJARI dari sheet AI_MEMORY: nomor rekening -> sumber dana (+bank) tersering. */
function getLearnedAccounts_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('learnacct');
  if (hit) return JSON.parse(hit);
  var out = [];
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(MEMORY_SHEET);
    if (sh && sh.getLastRow() > 1) {
      var data = sh.getDataRange().getValues();
      var head = data[0];
      var iAk = head.indexOf('akun_sumber'), iSd = head.indexOf('sumber_dana_final'), iRek = head.indexOf('rekening_final');
      if (iAk >= 0 && iSd >= 0) {
        var agg = {};
        for (var r = 1; r < data.length; r++) {
          var dig = String(data[r][iAk] || '').replace(/\D/g, '');
          var sd = String(data[r][iSd] || '').trim();
          if (dig.length < 6 || !sd) continue;
          agg[dig] = agg[dig] || { sd: {}, bank: {} };
          agg[dig].sd[sd] = (agg[dig].sd[sd] || 0) + 1;
          var rk = iRek >= 0 ? String(data[r][iRek] || '').trim() : '';
          if (rk) agg[dig].bank[rk] = (agg[dig].bank[rk] || 0) + 1;
        }
        for (var dg in agg) {
          out.push({ no: dg, label: 'Rekening ' + dg + ' (dipelajari)', sumberDana: topKey_(agg[dg].sd), bank: topKey_(agg[dg].bank) });
        }
      }
    }
  } catch (e) {}
  cache.put('learnacct', JSON.stringify(out), 300);
  return out;
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

/** Kurs 1 unit `currency` -> IDR pada tanggal (sumber: Frankfurter/ECB), di-cache 6 jam. */
function getFxRate_(currency, isoDate) {
  var date = /^\d{4}-\d{2}-\d{2}/.test(isoDate || '')
    ? isoDate.slice(0, 10)
    : Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var key = 'fx_' + currency + '_' + date;
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var url = 'https://api.frankfurter.app/' + date + '?from=' + encodeURIComponent(currency) + '&to=IDR';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Gagal mengambil kurs ' + currency + '->IDR untuk ' + date);
  }
  var j = JSON.parse(resp.getContentText());
  if (!j.rates || !j.rates.IDR) {
    throw new Error('Kurs ' + currency + '->IDR tidak tersedia untuk ' + date);
  }
  var out = { rate: j.rates.IDR, date: j.date || date };
  cache.put(key, JSON.stringify(out), 21600);
  return out;
}

// ====================== SIMPAN KE SHEET ======================

/**
 * Menambahkan satu baris transaksi di baris kosong terbawah sheet TRANSAKSI.
 * payload: {posBiaya, keterangan, nominal, tanggal(YYYY-MM-DD),
 *           biayaBulan, tahunBiaya, sumberDana, budgetBulan, tahunBudget, rekening}
 */
function appendTransaction(payload) {
  verifyPin_(payload && payload.pin);
  // Validasi field wajib.
  if (!payload || !payload.posBiaya) throw new Error('POS BIAYA wajib dipilih.');
  if (POS_BIAYA.indexOf(payload.posBiaya) === -1) throw new Error('POS BIAYA tidak valid.');
  if (!(payload.nominal > 0)) throw new Error('NOMINAL harus angka lebih dari 0.');
  if (!payload.tanggal) throw new Error('TANGGAL wajib diisi (dari bukti).');
  if (!payload.sumberDana) throw new Error('SUMBER DANA wajib dipilih.');
  if (SUMBER_DANA.indexOf(payload.sumberDana) === -1) throw new Error('SUMBER DANA tidak valid.');
  if (!payload.biayaBulan) throw new Error('BIAYA BULAN wajib dipilih.');
  if (!payload.tahunBiaya) throw new Error('TAHUN BIAYA wajib dipilih.');
  if (!payload.budgetBulan) throw new Error('BUDGET BULAN wajib dipilih.');
  if (!payload.tahunBudget) throw new Error('TAHUN BUDGET wajib dipilih.');

  // Aturan Rekening: hanya untuk PENDAPATAN USAHA; selain itu paksa kosong.
  var rekening = '';
  if (payload.sumberDana === SUMBER_DANA_REKENING) {
    rekening = (payload.rekening || '').trim(); // boleh kosong = kas tunai usaha
    if (rekening && BANK_REKENING.indexOf(rekening) === -1) {
      throw new Error('Rekening tidak valid: ' + rekening);
    }
  }

  var sheet = getSheet_();
  var headerRow = findHeaderRow_(sheet);
  var lastData = findLastDataRow_(sheet, headerRow);   // baris terbawah yang berisi data
  var prevRow = lastData > headerRow ? lastData : headerRow;
  var newRow = lastData + 1;                            // baris kosong terbawah

  // Salin format & data validation dari baris transaksi terakhir.
  var prevRange = sheet.getRange(prevRow, 1, 1, 10);
  var newRange = sheet.getRange(newRow, 1, 1, 10);
  prevRange.copyTo(newRange, { formatOnly: true });
  try { newRange.setDataValidations(prevRange.getDataValidations()); } catch (e) {}

  var tanggalDate = parseIsoDate_(payload.tanggal, sheet.getParent().getSpreadsheetTimeZone());

  // NOMINAL (C) & TANGGAL (D) mengikuti tipe baris sebelumnya (angka/teks, date/teks).
  var prevNominal = sheet.getRange(prevRow, 3).getValue();
  var nominalValue;
  if (payload.posBiaya === 'BIAYA KULIAH CHINA'
      && payload.mataUang && String(payload.mataUang).toUpperCase() !== 'IDR'
      && Number(payload.nominalAsli) > 0 && Number(payload.kurs) > 0) {
    // Tulis sebagai FORMULA: nominal asli (mata uang pada file) x kurs tanggal biaya.
    // Desimal memakai koma (,) sesuai lokal spreadsheet Indonesia.
    var asliStr = String(Number(payload.nominalAsli)).replace('.', ',');
    var kursStr = String(Number(payload.kurs)).replace('.', ',');
    nominalValue = '=' + asliStr + '*' + kursStr;
  } else {
    nominalValue = (typeof prevNominal === 'number' || prevNominal === '' || prevNominal == null)
      ? Number(payload.nominal) : formatRupiah_(payload.nominal);
  }

  var prevTanggal = sheet.getRange(prevRow, 4).getValue();
  var tanggalValue = (prevTanggal instanceof Date || prevTanggal === '' || prevTanggal == null)
    ? tanggalDate : formatTanggalIdFromIso_(payload.tanggal);

  var row = [
    payload.posBiaya,                 // A POS BIAYA
    payload.keterangan || '',         // B KETERANGAN
    nominalValue,                     // C NOMINAL
    tanggalValue,                     // D TANGGAL
    payload.biayaBulan,               // E BIAYA BULAN
    Number(payload.tahunBiaya),       // F TAHUN BIAYA
    payload.sumberDana,               // G SUMBER DANA
    payload.budgetBulan,              // H BUDGET BULAN
    Number(payload.tahunBudget),      // I TAHUN BUDGET
    rekening                          // J Rekening
  ];

  newRange.setValues([row]);
  SpreadsheetApp.flush();

  // Catat ke memori pembelajaran (bukti + saran AI + pilihan akhir). Jangan sampai menggagalkan simpan.
  try {
    var meta = payload.meta || {};
    logMemory_({
      tanggal: payload.tanggal, pos: payload.posBiaya, keterangan: payload.keterangan,
      nominal: payload.nominal, sumberDana: payload.sumberDana, rekening: rekening,
      akunSumber: meta.akunSumber, mataUang: meta.mataUang, merchant: meta.merchant,
      sugPos: meta.sugPos, sugSumber: meta.sugSumber, sugKeterangan: meta.sugKeterangan,
      dikoreksi: (meta.sugPos && meta.sugPos !== payload.posBiaya) ||
                 (meta.sugSumber && meta.sugSumber !== payload.sumberDana) ||
                 (meta.sugKeterangan && meta.sugKeterangan !== payload.keterangan)
    });
  } catch (e) {}

  try {
    var c = CacheService.getScriptCache();
    c.remove('histctx'); c.remove('posex'); c.remove('learnacct');
  } catch (e) {} // refresh pola history & rekening yang dipelajari

  // Auto-isi ke spreadsheet CASHFLOW bila sumber dana = PENDAPATAN USAHA.
  var cashflow = null;
  if (payload.sumberDana === SUMBER_DANA_REKENING) {
    try { cashflow = writeCashflow_(payload); }
    catch (e) { cashflow = { error: String(e && e.message || e) }; }
  }
  return { ok: true, row: newRow, cashflow: cashflow };
}

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

function parseDataUrl_(dataUrl) {
  var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw new Error('Format gambar tidak dikenali.');
  var mediaType = m[1];
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].indexOf(mediaType) === -1) {
    throw new Error('Tipe gambar tidak didukung: ' + mediaType);
  }
  return { mediaType: mediaType, data: m[2] };
}

/**
 * Bangun objek Date untuk tanggal (YYYY-MM-DD) sebagai tengah malam pada ZONA WAKTU
 * SPREADSHEET, supaya tanggal yang tersimpan tidak bergeser akibat beda zona waktu
 * antara project Apps Script dan spreadsheet.
 */
function parseIsoDate_(iso, tz) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return new Date();
  var date = iso.slice(0, 10);
  if (tz) {
    try { return Utilities.parseDate(date, tz, 'yyyy-MM-dd'); } catch (e) {}
  }
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format teks tanggal Indonesia langsung dari ISO (tanpa objek Date, bebas masalah zona waktu). */
function formatTanggalIdFromIso_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  return Number(m[3]) + ' ' + BULAN_TITLE[Number(m[2]) - 1] + ' ' + m[1];
}

function formatRupiah_(n) {
  n = Math.round(Number(n) || 0);
  var s = String(Math.abs(n)), out = '';
  while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
  out = s + out;
  return 'Rp' + (n < 0 ? '-' : '') + out;
}
