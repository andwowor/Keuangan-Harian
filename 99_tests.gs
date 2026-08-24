/**
 * TEST - uji unit DOMAIN (murni) + diagnostik integrasi.
 *
 * Sesuai Standar Arsitektur §6 (piramida: unit >> integration >> e2e) dan §5.8
 * (setiap perbaikan bug didahului satu test yang gagal).
 *
 * Cara pakai: buka editor Apps Script, pilih fungsi `jalankanSemuaTest` -> Run,
 * lalu lihat hasilnya di Execution log.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

// ====================== KERANGKA UJI MINIMAL ======================

var _tesGagal = [], _tesJumlah = 0;

function _cek_(nama, aktual, harapan) {
  _tesJumlah++;
  var a = JSON.stringify(aktual), h = JSON.stringify(harapan);
  if (a !== h) _tesGagal.push(nama + '\n      dapat  : ' + a + '\n      harusnya: ' + h);
}

function _cekLempar_(nama, fn) {
  _tesJumlah++;
  try { fn(); _tesGagal.push(nama + ' -> seharusnya melempar galat, tetapi tidak'); }
  catch (e) { /* sesuai harapan */ }
}

/** Jalankan seluruh test domain. Kembalikan ringkasan (juga ditulis ke Logger). */
function jalankanSemuaTest() {
  _tesGagal = []; _tesJumlah = 0;
  testDomainRekening();
  testDomainKartuKredit();
  testDomainTransaksi();
  testDomainPos();
  testDomainCashflow();
  testDomainInbox();
  var pesan = _tesGagal.length
    ? ('GAGAL ' + _tesGagal.length + '/' + _tesJumlah + ':\n  - ' + _tesGagal.join('\n  - '))
    : ('LULUS semua ' + _tesJumlah + ' test domain.');
  Logger.log(pesan);
  return pesan;
}

// ====================== DOMAIN: PEMETAAN SUMBER DANA ======================

function testDomainRekening() {
  var sd = function (ak, nm) { var r = detectAccount_(ak, nm, []); return r ? r.sumberDana : null; };
  var bk = function (ak, nm) { var r = detectAccount_(ak, nm, []); return r ? r.bank : null; };

  // Nomor utuh
  _cek_('BRI utuh -> Pendapatan Usaha', sd('154301003768507', 'BRI'), 'PENDAPATAN USAHA');
  _cek_('BCA 5851 -> Kas Lain Usaha', sd('0263935851', 'BCA'), 'KAS LAIN USAHA');
  _cek_('Mandiri berspasi', sd('1500 0344 9562 0', 'Mandiri'), 'PENDAPATAN USAHA');

  // Nomor disamarkan (kasus nyata dari bukti transfer)
  _cek_('BCA tersamar tanpa nama bank', sd('026 - 3** - **85', ''), 'PENDAPATAN USAHA');
  _cek_('BCA tersamar -> Rekening BCA', bk('026 - 3** - **85', ''), 'BCA');
  _cek_('Mandiri tersamar', sd('Bank Mandiri - •••••5620', 'ANDRE STEFANO WOWOR'), 'PENDAPATAN USAHA');
  _cek_('BRI tersamar', sd('1543 **** **** 507', 'ANDRE STEFANO WOWOR BANK BRI'), 'PENDAPATAN USAHA');
  _cek_('BNI 055 tersamar', sd('*******055', 'ANDRE STEFANO WOWOR'), 'PENDAPATAN USAHA');
  _cek_('BNI 708 tersamar -> THR', sd('*******708', 'ANDRE STEFANO WOWOR'), 'THR/CUTI (SALDO BERGERAK)');

  // blu dikenali lewat nama aplikasi, BUKAN nama pemilik
  _cek_('blu -> THR', sd('', 'blu ANDRE STEFANO WOWOR'), 'THR/CUTI (SALDO BERGERAK)');
  _cek_('nama pemilik saja -> tidak menebak', sd('', 'ANDRE STEFANO WOWOR'), null);

  // Tidak dikenal -> jangan menebak
  _cek_('tersamar tak dikenal -> null', sd('****999', 'Bank X'), null);
  _cek_('kosong -> null', sd('', ''), null);
}

function testDomainKartuKredit() {
  var sd = function (ak, nm) { var r = detectAccount_(ak, nm, []); return r ? r.sumberDana : null; };
  _cek_('Visa -> Kartu Kredit', sd('4512 49** **** 6010', 'BNI Visa Affinity Platinum'), 'KARTU KREDIT');
  _cek_('Amex -> Kartu Kredit', sd('3799 91**** *2685', 'BNI American Express'), 'KARTU KREDIT');
  _cek_('Mastercard -> Kartu Kredit', sd('Mastercard **** 1234', ''), 'KARTU KREDIT');
  _cek_('kartu DEBIT bukan kartu kredit', isCreditCard_('boc debit card (1201)'), false);
  _cek_('visa debit bukan kartu kredit', isCreditCard_('visa debit bni'), false);
  _cek_('deteksi mask bullet', isMaskedNumber_('•••5620'), true);
  _cek_('angka biasa bukan mask', isMaskedNumber_('1500034495620'), false);
}

// ====================== DOMAIN: ATURAN TRANSAKSI ======================

function _payloadUji_() {
  return { posBiaya: 'DAILY DRIVER', keterangan: 'Kopi', nominal: 25000, tanggal: '2026-07-14',
    biayaBulan: 'JULI', tahunBiaya: 2026, sumberDana: 'UANG SAKU',
    budgetBulan: 'JULI', tahunBudget: 2026, rekening: '' };
}

function testDomainTransaksi() {
  var p = _payloadUji_();
  validasiTransaksi_(p);  // tidak boleh melempar
  _cek_('validasi payload lengkap', true, true);

  _cekLempar_('nominal 0 ditolak', function () { var q = _payloadUji_(); q.nominal = 0; validasiTransaksi_(q); });
  _cekLempar_('tanggal kosong ditolak', function () { var q = _payloadUji_(); q.tanggal = ''; validasiTransaksi_(q); });
  _cekLempar_('POS kosong ditolak', function () { var q = _payloadUji_(); q.posBiaya = ''; validasiTransaksi_(q); });

  // Aturan Rekening
  _cek_('rekening dipaksa kosong utk non-Pendapatan Usaha', rekeningTransaksi_('UANG SAKU', 'BCA'), '');
  _cek_('rekening boleh utk Pendapatan Usaha', rekeningTransaksi_('PENDAPATAN USAHA', 'BCA'), 'BCA');
  _cek_('rekening kosong = kas tunai usaha', rekeningTransaksi_('PENDAPATAN USAHA', ''), '');
  _cekLempar_('rekening tak dikenal ditolak', function () { rekeningTransaksi_('PENDAPATAN USAHA', 'SEABANK'); });

  // NOMINAL: formula hanya utk BIAYA KULIAH CHINA + mata uang asing
  var q = _payloadUji_();
  q.posBiaya = 'BIAYA KULIAH CHINA'; q.mataUang = 'CNY'; q.nominalAsli = 85.5; q.kurs = 2200.75;
  _cek_('pakai formula utk kuliah china + valas', pakaiFormulaNominal_(q), true);
  _cek_('formula pakai koma desimal', formulaNominal_(85.5, 2200.75), '=85,5*2200,75');
  _cek_('nilai nominal = formula', nilaiNominal_(q, 0), '=85,5*2200,75');

  var r = _payloadUji_(); r.mataUang = 'CNY'; r.nominalAsli = 10; r.kurs = 2200;
  _cek_('POS lain tetap angka biasa', pakaiFormulaNominal_(r), false);
  _cek_('nominal angka saat sel angka', nilaiNominal_(r, 123), 25000);
  _cek_('nominal teks saat sel teks', typeof nilaiNominal_(r, 'Rp1.000'), 'string');

  // TANGGAL mengikuti tipe sel
  var d = new Date(2026, 6, 14);
  _cek_('tanggal Date saat sel Date', nilaiTanggal_('2026-07-14', new Date(), d), d);
  _cek_('tanggal teks saat sel teks', nilaiTanggal_('2026-07-14', '14 Juli 2026', d), '14 Juli 2026');

  // Susunan baris A..J
  var baris = barisTransaksi_(p, '', 25000, d);
  _cek_('baris punya 10 kolom', baris.length, 10);
  _cek_('kolom A = POS', baris[0], 'DAILY DRIVER');
  _cek_('kolom F = tahun angka', baris[5], 2026);
  _cek_('kolom J = rekening', baris[9], '');
}

// ====================== DOMAIN: POS DARI PENERIMA ======================

function testDomainPos() {
  var posSheet = ['DAILY DRIVER', 'Retribusi Sampah', 'Isi Bensin', 'Pendidikan'];
  var pos = function (merchant, ket) {
    var a = posDariPenerima_(merchant, ket);
    return a ? samakanPos_(a.pos, posSheet) : null;
  };

  // Aturan: penerima "Kairagi Dua 009" -> Retribusi Sampah
  _cek_('Kairagi Dua 009 -> Retribusi Sampah', pos('Kairagi Dua 009', ''), 'Retribusi Sampah');
  _cek_('huruf besar-kecil bebas', pos('KAIRAGI DUA 009', ''), 'Retribusi Sampah');
  _cek_('spasi rangkap tetap cocok', pos('Kairagi   Dua  009', ''), 'Retribusi Sampah');
  _cek_('nama panjang mengandung kunci', pos('TRF KAIRAGI DUA 009 - IURAN', ''), 'Retribusi Sampah');
  _cek_('kunci pada keterangan juga terbaca', pos('', 'bayar kairagi dua 009'), 'Retribusi Sampah');

  // Jangan salah tangkap
  _cek_('penerima lain -> tidak diatur', pos('Kairagi Satu 010', ''), null);
  _cek_('Kairagi saja -> tidak diatur', pos('Kairagi Dua', ''), null);
  _cek_('kosong -> tidak diatur', pos('', ''), null);

  // Penyelarasan ejaan ke daftar POS sheet
  _cek_('samakan ejaan ke daftar sheet', samakanPos_('RETRIBUSI SAMPAH', posSheet), 'Retribusi Sampah');
  _cek_('POS di luar daftar -> kosong', samakanPos_('Retribusi Sampah', ['DAILY DRIVER']), '');
  _cek_('alasan tersedia utk transparansi',
    posDariPenerima_('Kairagi Dua 009', '').alasan.indexOf('Kairagi Dua 009') >= 0, true);
}

// ====================== DOMAIN: CASHFLOW ======================

function testDomainCashflow() {
  _cek_('bank -> uppercase', mapBankCashflow_('BCA'), 'BCA');
  _cek_('kosong -> kas tunai maumbi', mapBankCashflow_(''), 'KAS TUNAI MAUMBI');
  _cek_('tak dikenal -> kas tunai maumbi', mapBankCashflow_('SEABANK'), 'KAS TUNAI MAUMBI');

  var row = buildCashflowRow_({ nominal: 445000, tanggal: '2026-07-10', rekening: 'Mandiri' });
  _cek_('keterangan Setoran Owner', row.keterangan, 'Setoran Owner');
  _cek_('outlet MAUMBI', row.outlet, 'MAUMBI');
  _cek_('status belum input', row.status, 'BELUM INPUT');
  _cek_('sumber dana ikut rekening', row.sumberDana, 'MANDIRI');
  _cek_('nominal diteruskan', row.nominal, 445000);
}

// ====================== DOMAIN: STATUS BACA BUKTI (INBOX) ======================

function testDomainInbox() {
  // Metadata deskripsi berkas: tag tidak boleh saling menimpa
  var d = descSetLine_('', 'kh-md5:', 'abc');
  d = descSetLine_(d, 'kh-aistate:', 'pending');
  _cek_('md5 tersimpan', descGetLine_(d, 'kh-md5:'), 'abc');
  _cek_('state tersimpan', descGetLine_(d, 'kh-aistate:'), 'pending');
  d = descSetLine_(d, 'kh-aistate:', 'done');
  _cek_('ganti state tak hapus md5', descGetLine_(d, 'kh-md5:'), 'abc');
  _cek_('state terbarui', descGetLine_(d, 'kh-aistate:'), 'done');

  // Mesin status: yang sudah dibaca / gagal TIDAK dibaca ulang
  var now = new Date().getTime();
  _cek_('sudah ada hasil -> jangan baca', inboxNeedsRead_('kh-ai:{"a":1}'), false);
  _cek_('status done -> jangan baca', inboxNeedsRead_('kh-aistate:done'), false);
  _cek_('status error -> jangan baca ulang', inboxNeedsRead_('kh-aistate:error'), false);
  _cek_('baru (pending) -> baca', inboxNeedsRead_('kh-aistate:pending'), true);
  _cek_('berkas lama tanpa tag -> baca', inboxNeedsRead_('kh-md5:abc'), true);
  _cek_('sedang dibaca -> jangan ganggu', inboxNeedsRead_('kh-aistate:reading\nkh-aits:' + now), false);
  _cek_('reading macet -> baca ulang', inboxNeedsRead_('kh-aistate:reading\nkh-aits:' + (now - 700000)), true);

  _cek_('label state dari deskripsi', inboxAiState_('kh-ai:{"a":1}'), 'done');
  _cek_('label state default', inboxAiState_(''), 'pending');
}

// ====================== DIAGNOSTIK INTEGRASI (butuh izin & jaringan) ======================

/**
 * Uji cepat dari editor: memastikan izin Google Drive sudah diberikan dan folder
 * penyimpanan bisa dibuka. Hasilnya muncul di Execution log.
 */
function cekFolderPenyimpanan() {
  var folder = getInboxFolder_();
  var files = folder.getFiles();
  var n = 0;
  while (files.hasNext()) { files.next(); n++; }
  var pesan = 'OK - folder "' + folder.getName() + '" terbaca, berisi ' + n + ' berkas.';
  Logger.log(pesan);
  return pesan;
}

/**
 * Uji aturan deteksi rekening memakai contoh bukti nyata (termasuk yang dipelajari
 * dari sheet AI_MEMORY). Berbeda dari testDomainRekening yang murni tanpa I/O.
 */
function cekDeteksiRekening() {
  var kasus = [
    { ak: '026 - 3** - **85', nm: '' },                                   // BCA (tanpa nama bank)
    { ak: 'Bank Mandiri - •••••••••5620', nm: 'ANDRE STEFANO WOWOR' },
    { ak: '1543 **** **** 507', nm: 'ANDRE STEFANO WOWOR BANK BRI' },     // BRI
    { ak: '*******055', nm: 'ANDRE STEFANO WOWOR' },                      // BNI (watermark)
    { ak: '*******708', nm: 'ANDRE STEFANO WOWOR' },                      // BNI Multicurrency -> THR
    { ak: '4512 49** **** 6010', nm: 'ANDRE STEFANO WOWOR BNI Visa Affinity Platinum' }
  ];
  var learned = getLearnedAccounts_();
  var out = [];
  for (var i = 0; i < kasus.length; i++) {
    var r = detectAccount_(kasus[i].ak, kasus[i].nm, learned);
    out.push('"' + kasus[i].ak + '" (' + kasus[i].nm + ')  ->  ' +
      (r ? (r.sumberDana + (r.bank ? ' [Rekening ' + r.bank + ']' : '')) : 'TIDAK TERDETEKSI'));
  }
  var pesan = out.join('\n');
  Logger.log(pesan);
  return pesan;
}

/**
 * DIAGNOSTIK STRUKTUR SHEET REAL.
 * Membaca REAL apa adanya lalu melaporkan:
 *   1) baris mana yang memuat label bulan ("BULAN YYYY") - kode saat ini membaca BARIS 1;
 *   2) seluruh isi kolom B beserta NOMOR BARIS aslinya;
 *   3) POS yang TERLEWAT oleh rentang POS_SOURCE_ROWS saat ini, dan rentang yang menunjuk
 *      baris kosong/TOTAL.
 * Jalankan dari editor, lalu salin isi Execution log.
 */
function cekStrukturReal() {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REAL_SHEET);
  if (!sh) return 'Sheet "' + REAL_SHEET + '" tidak ditemukan.';
  var out = [];
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  out.push('REAL: ' + lastRow + ' baris x ' + lastCol + ' kolom');

  // 1) Cari baris yang memuat label bulan "BULAN YYYY"
  var pola = /^[A-Za-z]+\s+\d{4}$/;
  var atas = sh.getRange(1, 1, Math.min(6, lastRow), lastCol).getValues();
  for (var r = 0; r < atas.length; r++) {
    var contoh = [], jml = 0;
    for (var c = 0; c < atas[r].length; c++) {
      var v = String(atas[r][c]).trim();
      if (pola.test(v)) { jml++; if (contoh.length < 4) contoh.push(kolomKe_(c + 1) + '=' + v); }
    }
    if (jml) out.push('  label bulan di BARIS ' + (r + 1) + ' -> ' + jml + ' bulan, contoh: ' + contoh.join(', '));
  }
  out.push('  (kode saat ini membaca label bulan dari BARIS 1)');

  // 2) Isi kolom B + nomor baris
  var nScan = Math.min(lastRow, 120);
  var colB = sh.getRange(1, 2, nScan, 1).getValues();
  var colA = sh.getRange(1, 1, nScan, 1).getValues();
  var dalamRentang = {};
  for (var i = 0; i < POS_SOURCE_ROWS.length; i++) {
    for (var x = POS_SOURCE_ROWS[i][0]; x <= POS_SOURCE_ROWS[i][1]; x++) dalamRentang[x] = 1;
  }
  var terlewat = [], rentangKosong = [];
  out.push('');
  out.push('baris | cfg | KOLOM A | KOLOM B');
  for (var n = 1; n <= nScan; n++) {
    var b = String(colB[n - 1][0]).trim();
    var a = String(colA[n - 1][0]).trim();
    var ikut = !!dalamRentang[n];
    var pos = b && b.toUpperCase().indexOf('TOTAL') < 0;
    if (b || a) out.push('  ' + n + ' | ' + (ikut ? 'YA ' : '-  ') + ' | ' + a + ' | ' + b);
    if (pos && !ikut) terlewat.push(n + ':' + b);
    if (ikut && !pos) rentangKosong.push(n + ':' + (b || '(kosong)'));
  }
  out.push('');
  out.push('POS TERLEWAT oleh konfigurasi (' + terlewat.length + '): ' + (terlewat.join(' | ') || '-'));
  out.push('Rentang menunjuk kosong/TOTAL (' + rentangKosong.length + '): ' + (rentangKosong.join(' | ') || '-'));
  out.push('POS yang kini dipakai dashboard (' + getPosList_().length + '): ' + getPosList_().join(', '));

  var pesan = out.join('\n');
  Logger.log(pesan);
  return pesan;
}

/** Nomor kolom -> huruf kolom (1 -> A, 27 -> AA). */
function kolomKe_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}
