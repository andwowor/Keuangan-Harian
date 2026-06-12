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
var TIMEZONE = 'Asia/Jakarta';

// Model Claude untuk membaca gambar. Ganti ke 'claude-haiku-4-5' atau
// 'claude-sonnet-4-6' bila ingin lebih hemat biaya.
var CLAUDE_MODEL = 'claude-opus-4-8';

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

// ====================== EKSTRAKSI GAMBAR (CLAUDE VISION) ======================

/**
 * Membaca satu gambar (data URL). Mengembalikan field yang BISA dibaca dari bukti:
 * nominal, tanggal, pos_biaya, keterangan (+rekomendasi), deteksi BOC, dan bank rekening.
 * Field yang HARUS dipilih pemilik (sumber dana, bulan/tahun) TIDAK ditebak di sini.
 */
function analyzeImage(dataUrl) {
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
    '- pos_biaya: pilih kategori paling sesuai dari daftar enum.\n' +
    '- keterangan: label SINGKAT gaya pencatatan pemilik untuk transaksi ini ' +
    '(nama merchant/barang/keperluan). Contoh gaya: "Makanan", "Snack", "Starbucks", ' +
    '"Kopi", "Kebutuhan harian", "Sepeda", "Transport", "Refill galon", "Tarik tunai", ' +
    '"Oleh-oleh", "Internet", "Bensin Manado". Jika tidak yakin, isi "" dan ' +
    'keterangan_yakin=false.\n' +
    '- keterangan_yakin: true hanya jika Anda cukup yakin keterangan-nya tepat.\n' +
    '- keterangan_opsi: hingga 4 usulan label singkat yang cocok (boleh kosong array).\n' +
    '- is_boc_1201: true bila pada bukti tertulis "BOC Debit Card (1201)".\n' +
    '- bank_rekening: bila bukti adalah transfer dari rekening bank, petakan bank pengirim ' +
    'ke salah satu dari Mandiri/BNI/BRI/BCA. Jika tidak ada/tidak jelas, isi "". ' +
    '(Hanya dipakai bila sumber dana = PENDAPATAN USAHA.)\n' +
    '- confidence: keyakinan keseluruhan.\n' +
    '- catatan: catatan singkat bila ada yang ambigu, selain itu "".';

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
      is_boc_1201: { type: 'boolean' },
      bank_rekening: { type: 'string', enum: ['Mandiri', 'BNI', 'BRI', 'BCA', 'Kas Tunai Maumbi', ''] },
      confidence: { type: 'string', enum: ['tinggi', 'sedang', 'rendah'] },
      catatan: { type: 'string' }
    },
    required: ['nominal_asli', 'mata_uang', 'tanggal', 'pos_biaya', 'keterangan', 'keterangan_yakin',
      'keterangan_opsi', 'is_boc_1201', 'bank_rekening', 'confidence', 'catatan'],
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

  var tanggalDate = parseIsoDate_(payload.tanggal);

  // NOMINAL (C) & TANGGAL (D) mengikuti tipe baris sebelumnya (angka/teks, date/teks).
  var prevNominal = sheet.getRange(prevRow, 3).getValue();
  var nominalValue = (typeof prevNominal === 'number' || prevNominal === '' || prevNominal == null)
    ? Number(payload.nominal) : formatRupiah_(payload.nominal);

  var prevTanggal = sheet.getRange(prevRow, 4).getValue();
  var tanggalValue = (prevTanggal instanceof Date || prevTanggal === '' || prevTanggal == null)
    ? tanggalDate : formatTanggalId_(tanggalDate);

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
  try { CacheService.getScriptCache().remove('histctx'); } catch (e) {} // agar pola history ter-update
  return { ok: true, row: newRow };
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
  var s = String(Math.abs(n)), out = '';
  while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
  out = s + out;
  return 'Rp' + (n < 0 ? '-' : '') + out;
}
