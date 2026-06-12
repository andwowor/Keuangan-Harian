/**
 * Dashboard Pengisian Biaya Harian — Keuangan Harian
 * --------------------------------------------------
 * Alur: upload screenshot / bukti transfer  ->  dibaca otomatis oleh Claude Vision
 *       ->  ditinjau & dikoreksi pada form  ->  disimpan ke sheet TRANSAKSI.
 *
 * Sheet TRANSAKSI memakai 10 kolom:
 *   A POS BIAYA | B KETERANGAN | C NOMINAL | D TANGGAL | E BIAYA BULAN
 *   F TAHUN BIAYA | G SUMBER DANA | H BUDGET BULAN | I TAHUN BUDGET | J Rekening
 *
 * Sebelum dipakai, set Script Property "ANTHROPIC_API_KEY" (lihat README.md).
 */

// ====================== KONFIGURASI ======================

var SPREADSHEET_ID = '1IsRwEzQ7xJdd0jpzxpGmvhBvx34CVuOElPFfyRs-5fM';
var SHEET_NAME = 'TRANSAKSI';
var TIMEZONE = 'Asia/Jakarta';

// Model Claude untuk membaca gambar. Ganti ke 'claude-haiku-4-5' atau
// 'claude-sonnet-4-6' bila ingin lebih hemat biaya.
var CLAUDE_MODEL = 'claude-opus-4-8';

// Daftar kategori POS BIAYA yang valid (gabungan dari seluruh pos di spreadsheet).
var POS_BIAYA = [
  'BIAYA KULIAH CHINA', 'BIAYA PULANG', 'DAILY DRIVER',
  'Pembelian Barang', 'Acara', 'Liburan', 'Kesehatan', 'Perjalanan',
  'Perbaikan/Pemeliharaan', 'Dokumen', 'Pendidikan', 'Tambahan Modal Usaha',
  'Pengeluaran Tidak Terduga',
  'Pulsa', 'XL Home', 'Token Listrik', 'Rantang Bulanan', 'Belanja Bulanan',
  'Isi Bensin', 'Sabun Cuci Baju', 'Retribusi Sampah', 'Beras', 'Air Galon',
  'Gaji ART', 'Tagihan PDAM',
  'SPP Colin', 'SPP Darlene', 'Les Colin Darlene',
  'Cicilan KTA Flexy', 'Cicilan KPR', 'Bayar Kredit',
  'Tagihan Kredivo', 'Tagihan Shopee Paylater', 'Paylater Traveloka',
  'Tagihan Indodana', 'Tagihan Ada Kami', 'Tagihan Allo Paylater',
  'Tagihan OVO Paylater', 'Tagihan Gojek Paylater',
  'BNI Platinum AMEX Card', 'BNI Platinum Card', 'BNI Corporate Card',
  'BRI Card Mega',
  'Parkir', 'Biaya Admin dan Biaya Transfer'
];

// Daftar SUMBER DANA yang valid.
var SUMBER_DANA = [
  'UANG SAKU', 'GAJI', 'PENDAPATAN USAHA', 'PENGEMBALIAN USAHA',
  'THR/CUTI (SALDO BERGERAK)', 'KK', 'IKS', 'BONUS', 'SPPD',
  'KARTU KREDIT', 'PINJAMAN LAIN', 'LAIN-LAIN'
];

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
    .setTitle('Dashboard Biaya Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Menyisipkan file HTML lain ke dalam template (dipakai bila perlu). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Data untuk mengisi dropdown & nilai default di form. */
function getConfig() {
  var now = new Date();
  var year = Number(Utilities.formatDate(now, TIMEZONE, 'yyyy'));
  var monthIdx = Number(Utilities.formatDate(now, TIMEZONE, 'MM')) - 1;
  return {
    posBiaya: POS_BIAYA,
    sumberDana: SUMBER_DANA,
    bulan: BULAN_UPPER,
    tahun: [year - 1, year, year + 1],
    today: Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd'),
    bulanIni: BULAN_UPPER[monthIdx],
    tahunIni: year
  };
}

// ====================== EKSTRAKSI GAMBAR (CLAUDE VISION) ======================

/**
 * Membaca satu gambar (data URL) dan mengembalikan field transaksi hasil baca.
 * Dipanggil dari front-end via google.script.run.analyzeImage(dataUrl).
 */
function analyzeImage(dataUrl) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY belum diset. Buka Project Settings > Script Properties.');
  }

  var img = parseDataUrl_(dataUrl);
  var cfg = getConfig();

  var systemPrompt =
    'Anda asisten pencatat keuangan. Anda menerima screenshot atau bukti transfer ' +
    'pengeluaran (umumnya dari aplikasi bank / e-wallet Indonesia). Baca gambar dan ' +
    'ekstrak data pengeluaran ke dalam skema yang diminta.\n\n' +
    'Aturan:\n' +
    '- nominal: total uang yang KELUAR, sebagai angka bulat Rupiah tanpa titik/koma/simbol ' +
    '(contoh "Rp2.392.144" -> 2392144). Abaikan biaya admin kecuali memang itu transaksinya.\n' +
    '- tanggal: tanggal transaksi pada bukti, format ISO YYYY-MM-DD. Jika tahun tidak tertera, ' +
    'gunakan tahun ' + cfg.tahunIni + '. Jika tanggal tidak terbaca sama sekali, gunakan ' + cfg.today + '.\n' +
    '- pos_biaya: pilih kategori paling sesuai dari daftar enum.\n' +
    '- sumber_dana: pilih dari daftar enum; jika sumber dana/rekening tidak jelas gunakan "UANG SAKU".\n' +
    '- keterangan: deskripsi singkat (penerima/merchant/keperluan), boleh string kosong.\n' +
    '- biaya_bulan & budget_bulan: default ke nama bulan dari tanggal transaksi (HURUF BESAR Bahasa Indonesia).\n' +
    '- tahun_biaya & tahun_budget: default ke tahun dari tanggal transaksi.\n' +
    '- confidence: seberapa yakin Anda terhadap hasil baca.\n' +
    '- catatan: catatan singkat bila ada yang tidak yakin/ambigu, selain itu kosong.';

  var schema = {
    type: 'object',
    properties: {
      nominal: { type: 'integer', description: 'Jumlah pengeluaran dalam Rupiah, angka bulat' },
      tanggal: { type: 'string', description: 'Tanggal transaksi, format YYYY-MM-DD' },
      pos_biaya: { type: 'string', enum: POS_BIAYA },
      keterangan: { type: 'string' },
      sumber_dana: { type: 'string', enum: SUMBER_DANA },
      biaya_bulan: { type: 'string', enum: BULAN_UPPER },
      tahun_biaya: { type: 'integer' },
      budget_bulan: { type: 'string', enum: BULAN_UPPER },
      tahun_budget: { type: 'integer' },
      confidence: { type: 'string', enum: ['tinggi', 'sedang', 'rendah'] },
      catatan: { type: 'string' }
    },
    required: ['nominal', 'tanggal', 'pos_biaya', 'keterangan', 'sumber_dana',
      'biaya_bulan', 'tahun_biaya', 'budget_bulan', 'tahun_budget', 'confidence', 'catatan'],
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
  if (code !== 200) {
    throw new Error('Claude API error ' + code + ': ' + text);
  }

  var json = JSON.parse(text);
  if (json.stop_reason === 'refusal') {
    throw new Error('Permintaan ditolak oleh model (refusal). Coba gambar lain.');
  }

  var raw = '';
  for (var i = 0; i < json.content.length; i++) {
    if (json.content[i].type === 'text') { raw += json.content[i].text; }
  }

  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('Gagal membaca hasil dari model: ' + raw);
  }

  data.nominalFormatted = formatRupiah_(data.nominal);
  return data;
}

// ====================== SIMPAN KE SHEET ======================

/**
 * Menambahkan satu baris transaksi ke sheet TRANSAKSI.
 * payload: {posBiaya, keterangan, nominal, tanggal(YYYY-MM-DD),
 *           biayaBulan, tahunBiaya, sumberDana, budgetBulan, tahunBudget, rekening}
 */
function appendTransaction(payload) {
  if (!payload || !payload.posBiaya) throw new Error('POS BIAYA wajib diisi.');
  if (!(payload.nominal > 0)) throw new Error('NOMINAL harus berupa angka lebih dari 0.');

  var sheet = getSheet_();
  var headerRow = findHeaderRow_(sheet);
  var lastRow = sheet.getLastRow();
  var prevRow = lastRow >= headerRow + 1 ? lastRow : headerRow; // baris contoh format
  var newRow = lastRow + 1;

  // Salin format & data validation dari baris transaksi terakhir agar tampilan konsisten.
  var prevRange = sheet.getRange(prevRow, 1, 1, 10);
  var newRange = sheet.getRange(newRow, 1, 1, 10);
  prevRange.copyTo(newRange, { formatOnly: true });
  try {
    newRange.setDataValidations(prevRange.getDataValidations());
  } catch (e) { /* abaikan bila tidak ada validasi */ }

  var tanggalDate = parseIsoDate_(payload.tanggal);

  // Kolom C (NOMINAL) & D (TANGGAL) mengikuti tipe baris sebelumnya (angka/teks, date/teks).
  var prevNominal = sheet.getRange(prevRow, 3).getValue();
  var nominalValue = (typeof prevNominal === 'number' || prevNominal === '' || prevNominal == null)
    ? Number(payload.nominal)
    : formatRupiah_(payload.nominal);

  var prevTanggal = sheet.getRange(prevRow, 4).getValue();
  var tanggalValue = (prevTanggal instanceof Date || prevTanggal === '' || prevTanggal == null)
    ? tanggalDate
    : formatTanggalId_(tanggalDate);

  var row = [
    payload.posBiaya,                       // A POS BIAYA
    payload.keterangan || '',               // B KETERANGAN
    nominalValue,                           // C NOMINAL
    tanggalValue,                           // D TANGGAL
    payload.biayaBulan,                     // E BIAYA BULAN
    Number(payload.tahunBiaya),             // F TAHUN BIAYA
    payload.sumberDana,                     // G SUMBER DANA
    payload.budgetBulan,                    // H BUDGET BULAN
    Number(payload.tahunBudget),            // I TAHUN BUDGET
    payload.rekening || ''                  // J Rekening
  ];

  newRange.setValues([row]);
  SpreadsheetApp.flush();

  return { ok: true, row: newRow };
}

// ====================== HELPER ======================

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" tidak ditemukan.');
  return sheet;
}

/** Mencari baris header (yang memuat "POS BIAYA" di kolom A). */
function findHeaderRow_(sheet) {
  var n = Math.min(sheet.getLastRow(), 50);
  if (n === 0) return 1;
  var colA = sheet.getRange(1, 1, n, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    var v = String(colA[i][0]).trim().toUpperCase();
    if (v === 'POS BIAYA') return i + 1;
  }
  return 1; // fallback
}

function parseDataUrl_(dataUrl) {
  var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw new Error('Format gambar tidak dikenali.');
  var mediaType = m[1];
  if (['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].indexOf(mediaType) === -1) {
    // Claude menerima png/jpeg/gif/webp; jpg dipetakan ke jpeg.
    if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
    else throw new Error('Tipe gambar tidak didukung: ' + mediaType);
  }
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
  return { mediaType: mediaType, data: m[2] };
}

function parseIsoDate_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatTanggalId_(d) {
  return d.getDate() + ' ' + BULAN_TITLE[d.getMonth()] + ' ' + d.getFullYear();
}

function formatRupiah_(n) {
  n = Math.round(Number(n) || 0);
  var s = String(Math.abs(n));
  var out = '';
  while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
  out = s + out;
  return 'Rp' + (n < 0 ? '-' : '') + out;
}
