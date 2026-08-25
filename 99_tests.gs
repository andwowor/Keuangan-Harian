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
  testDomainDaftarPos();
  testDomainBudget();
  testDomainBudgetRekap();
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

// ============ DOMAIN: DAFTAR POS DARI GRID SHEET REAL ============
// Fixture = struktur NYATA sheet REAL (hasil cekStrukturReal, 24 Agustus 2026).

function _gridRealUji_() {
  var g = [];
  for (var i = 0; i < 113; i++) g.push(['', '']);          // indeks 0 = baris 1
  function set(baris, a, b) { g[baris - 1] = [a, b]; }
  set(3, 'Biaya Pinjaman', 'Cicilan KTA Flexy');
  ['Cicilan KPR','Bayar Kredit','Tagihan Kredivo','Tagihan Shopee Paylater','Paylater Traveloka',
   'Tagihan Indodana','Tagihan Ada Kami','Tagihan Allo Paylater','Tagihan OVO Paylater',
   'Tagihan Gojek Paylater'].forEach(function (v, i) { set(4 + i, '', v); });
  set(14, '', 'TOTAL');
  set(17, 'Kartu Kredit', 'BNI Platinum AMEX Card');
  ['BNI Platinum Card','BNI Corporate Card','BRI Card Mega'].forEach(function (v, i) { set(18 + i, '', v); });
  set(21, '', 'TOTAL');
  set(23, 'Parkir', 'Parkir');
  set(24, 'Biaya Transfer', 'Biaya Admin dan Biaya Transfer');
  set(25, '', 'TOTAL');
  set(28, 'Pengeluaran Rutin', 'Pulsa');
  ['Rantang Bulanan','Token Listrik','XL Home','SPP Colin','SPP Darlene','Les Colin Darlene',
   'Belanja Bulanan','Isi Bensin','Sabun Cuci Baju','Retribusi Sampah','Beras','Gaji ART',
   'Tagihan PDAM','Air Galon'].forEach(function (v, i) { set(29 + i, '', v); });
  set(43, '', 'TOTAL');
  set(46, 'PLEASURE & HARIAN', 'DAILY DRIVER');
  set(47, '', 'TOTAL');
  set(49, 'BIAYA ANDRE CHINA', 'BIAYA KULIAH CHINA');
  ['BIAYA PULANG','SEWA TEMPAT TINGGAL','BIAYA HIDUP'].forEach(function (v, i) { set(50 + i, '', v); });
  set(53, '', 'TOTAL');
  set(56, 'Kebutuhan Tidak Terduga', 'Kesehatan');
  ['Perjalanan','Pembelian Barang','Perbaikan/Pemeliharaan','Dokumen','Acara','Liburan',
   'Pendidikan','Tambahan Modal Usaha','Pengeluaran Tidak Terduga'].forEach(function (v, i) { set(57 + i, '', v); });
  set(66, '', 'TOTAL');
  set(68, 'TOTAL PENGELUARAN', 'TOTAL');                    // penanda batas
  set(71, 'INCOME', 'GAJI');
  ['UANG SAKU','PENDAPATAN USAHA','KAS LAIN USAHA','PENGEMBALIAN USAHA','THR/CUTI (SALDO BERGERAK)',
   'KK','IKS','BONUS','SPPD','INVESTASI','INDODANA','KREDIVO','TRAVELOKA PAYLATER','ADA KAMI',
   'PINJAMAN LAIN','KARTU KREDIT','LAIN-LAIN','TOTAL INCOME','SALDO','SALDO BULAN SEBELUMNYA',
   'SALDO REAL','CASH BUFFER'].forEach(function (v, i) { set(72 + i, '', v); });
  set(96, 'PROYEKSI PENDAPATAN DAN PINJAMAN', 'Indodana');
  set(113, 'PROYEKSI SALDO', 'SALDO');
  return g;
}

function testDomainDaftarPos() {
  var g = _gridRealUji_();
  var pos = posDariGrid_(g);
  var ada = function (x) { return pos.indexOf(x) >= 0; };

  _cek_('penanda batas ketemu di baris 68', batasPengeluaran_(g) + 1, 68);
  _cek_('jumlah POS = 47', pos.length, 47);

  // POS yang DULU TERLEWAT oleh rentang baris tetap - kini ikut
  _cek_('SEWA TEMPAT TINGGAL ikut', ada('SEWA TEMPAT TINGGAL'), true);
  _cek_('BIAYA HIDUP ikut', ada('BIAYA HIDUP'), true);
  _cek_('Pengeluaran Tidak Terduga ikut', ada('Pengeluaran Tidak Terduga'), true);

  // POS yang memang harus ada
  _cek_('Retribusi Sampah ikut', ada('Retribusi Sampah'), true);
  _cek_('DAILY DRIVER ikut', ada('DAILY DRIVER'), true);
  _cek_('BIAYA KULIAH CHINA ikut', ada('BIAYA KULIAH CHINA'), true);
  _cek_('Tagihan Gojek Paylater ikut', ada('Tagihan Gojek Paylater'), true);
  _cek_('Air Galon ikut', ada('Air Galon'), true);

  // Yang HARUS dikecualikan
  _cek_('baris TOTAL dibuang', ada('TOTAL'), false);
  _cek_('INCOME: GAJI tidak ikut', ada('GAJI'), false);
  _cek_('INCOME: PENDAPATAN USAHA tidak ikut', ada('PENDAPATAN USAHA'), false);
  _cek_('SALDO REAL tidak ikut', ada('SALDO REAL'), false);
  _cek_('PROYEKSI Indodana tidak ikut', ada('Indodana'), false);
  _cek_('TOTAL INCOME tidak ikut', ada('TOTAL INCOME'), false);

  // Tahan penyisipan baris: sisipkan 1 baris di atas -> hasil tetap sama
  var g2 = [['', '']].concat(_gridRealUji_());
  _cek_('tahan sisip 1 baris di atas', JSON.stringify(posDariGrid_(g2)), JSON.stringify(pos));

  // Struktur tak dikenali -> null (pemanggil memakai cara cadangan)
  _cek_('tanpa penanda batas -> null', posDariGrid_([['x', 'y'], ['', 'z']]), null);
}

// ============ DOMAIN: PENYUSUNAN DATA MENU BUDGET ============
// Fixture memakai struktur NYATA sheet REAL; nilai tiap baris sengaja = nomor
// barisnya, supaya salah-baris langsung ketahuan.

function _barisBudgetUji_() {
  var g = _gridRealUji_();                 // [kolomA, kolomB] indeks 0 = baris 1
  var baris = [];
  for (var n = BUDGET_BARIS_BIAYA[0]; n <= BUDGET_BARIS_AKHIR; n++) {
    var sel = g[n - 1] || ['', ''];
    // v (REAL) = SISA budget; budget (REKAP) = alokasi. Dibuat agar mudah diperiksa.
    baris.push({ n: n, a: sel[0], b: sel[1], v: n, budget: n * 4 });
  }
  return baris;
}

function testDomainBudget() {
  var d = susunBudget_(_barisBudgetUji_());
  var labelBiaya = d.biaya.map(function (o) { return o.b; });
  var labelKantong = d.pemasukan.map(function (o) { return o.b; });

  // Baris ringkasan dicari lewat LABEL -> harus menunjuk baris yang benar
  _cek_('totalPengeluaran dari baris 68', d.totalPengeluaran, 68);
  _cek_('totalIncome dari baris 89', d.totalIncome, 89);
  _cek_('saldo dari baris 90', d.saldo, 90);
  _cek_('saldoBulanSebelumnya dari baris 91', d.saldoBulanSebelumnya, 91);
  _cek_('saldoReal dari baris 92', d.saldoReal, 92);

  // Biaya per kategori: baris 3-68
  _cek_('biaya memuat POS pertama', labelBiaya[0], 'Cicilan KTA Flexy');
  _cek_('biaya memuat Pengeluaran Tidak Terduga (65)', labelBiaya.indexOf('Pengeluaran Tidak Terduga') >= 0, true);
  _cek_('biaya memuat subtotal grup', labelBiaya.indexOf('TOTAL') >= 0, true);
  _cek_('biaya TIDAK memuat kantong INCOME', labelBiaya.indexOf('GAJI') >= 0, false);

  // Sisa kantong: baris 71-89
  _cek_('kantong dimulai GAJI (71)', labelKantong[0], 'GAJI');
  _cek_('kantong memuat KARTU KREDIT (87)', labelKantong.indexOf('KARTU KREDIT') >= 0, true);
  _cek_('kantong memuat LAIN-LAIN (88)', labelKantong.indexOf('LAIN-LAIN') >= 0, true);
  _cek_('kantong TIDAK memuat TOTAL INCOME', labelKantong.indexOf('TOTAL INCOME') >= 0, false);
  _cek_('kantong TIDAK memuat SALDO', labelKantong.indexOf('SALDO') >= 0, false);
  _cek_('kantong TIDAK memuat CASH BUFFER', labelKantong.indexOf('CASH BUFFER') >= 0, false);
  _cek_('jumlah kantong = 18', d.pemasukan.length, 18);

  // Nilai mengikuti baris yang benar (bukan geser)
  _cek_('nilai GAJI = baris 71', d.pemasukan[0].v, 71);
  _cek_('nilai kantong terakhir = baris 88', d.pemasukan[d.pemasukan.length - 1].v, 88);

  // Blok PROYEKSI (96+) tidak ikut ke mana pun
  _cek_('proyeksi tidak masuk biaya', labelBiaya.indexOf('Indodana') >= 0, false);
  _cek_('proyeksi tidak masuk kantong', labelKantong.indexOf('Indodana') >= 0, false);
}

// ============ DOMAIN: BUDGET (REKAP) vs SISA (REAL) ============

function testDomainBudgetRekap() {
  // Aturan inti: terpakai = budget - sisa ; sisa 0 = budget habis terserap
  _cek_('terpakai = budget - sisa', itemBiaya_({ a: '', b: 'X', v: 200, budget: 1000 }).terpakai, 800);
  _cek_('persen terhadap budget', itemBiaya_({ a: '', b: 'X', v: 200, budget: 1000 }).pct, 80);
  _cek_('sisa 0 -> 100% terpakai', itemBiaya_({ a: '', b: 'X', v: 0, budget: 1000 }).pct, 100);
  _cek_('sisa penuh -> 0% terpakai', itemBiaya_({ a: '', b: 'X', v: 1000, budget: 1000 }).pct, 0);
  _cek_('sisa > budget tidak negatif', itemBiaya_({ a: '', b: 'X', v: 1500, budget: 1000 }).terpakai, 0);

  // Tanpa budget -> JANGAN menampilkan persen menyesatkan
  var tanpa = itemBiaya_({ a: '', b: 'X', v: 200, budget: 0 });
  _cek_('budget 0 -> adaBudget false', tanpa.adaBudget, false);
  _cek_('budget 0 -> pct -1 (tidak dihitung)', tanpa.pct, -1);
  _cek_('persenTerpakai_ tanpa budget', persenTerpakai_(0, 500), -1);

  // Baris TOTAL dikenali & tidak ikut agregat
  _cek_('baris TOTAL dikenali', itemBiaya_({ a: '', b: 'TOTAL', v: 1, budget: 1 }).isTotal, true);

  // Agregat dari fixture REAL: budget = 4x nomor baris, sisa = nomor baris
  var d = susunBudget_(_barisBudgetUji_());
  _cek_('adaBudget true', d.adaBudget, true);
  _cek_('total terpakai = 3/4 total budget', d.totalTerpakai * 4, d.totalBudget * 3);
  _cek_('total sisa = 1/4 total budget', d.totalSisaBudget * 4, d.totalBudget);
  _cek_('pct terpakai = 75%', d.pctTerpakai, 75);
  _cek_('TOTAL tidak ikut agregat',
    d.biaya.filter(function (o) { return o.isTotal; }).every(function (o) { return true; }), true);
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

/**
 * DIAGNOSTIK: daftar SELURUH sheet pada spreadsheet ANALISA KEUANGAN, beserta
 * ukurannya dan apakah sheet itu dipakai dashboard. Berguna untuk memastikan
 * perubahan manual pada sheet tertentu berdampak atau tidak.
 */
function daftarSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var peran = {};
  peran[SHEET_NAME] = 'DIPAKAI: dibaca & ditulis (transaksi)';
  peran[REAL_SHEET] = 'DIPAKAI: daftar POS + menu Budget';
  peran[MEMORY_SHEET] = 'DIPAKAI: memori pembelajaran';
  var out = ['Spreadsheet "' + ss.getName() + '" - ' + sheets.length + ' sheet:', ''];
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i], nama = sh.getName();
    out.push('  ' + (i + 1) + '. ' + nama +
      '  [' + sh.getLastRow() + ' baris x ' + sh.getLastColumn() + ' kolom]' +
      (sh.isSheetHidden() ? ' (tersembunyi)' : '') +
      '  -> ' + (peran[nama] || 'tidak disentuh dashboard'));
  }
  var pesan = out.join('\n');
  Logger.log(pesan);
  return pesan;
}

/** DIAGNOSTIK: struktur sheet REKAP (kolom A-C + nomor baris). */
function cekStrukturRekap() { return dumpSheet_('REKAP', 3); }

/** Dump isi kolom pertama sebuah sheet beserta nomor barisnya. */
function dumpSheet_(nama, nKolom) {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(nama);
  if (!sh) {
    var daftar = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets().map(function (s) { return s.getName(); });
    var e = 'Sheet "' + nama + '" tidak ada. Sheet yang tersedia: ' + daftar.join(', ');
    Logger.log(e); return e;
  }
  var nBaris = Math.min(sh.getLastRow(), 150);
  var nKol = Math.min(sh.getLastColumn(), nKolom || 3);
  var out = [nama + ': ' + sh.getLastRow() + ' baris x ' + sh.getLastColumn() + ' kolom', ''];
  if (nBaris > 0) {
    var v = sh.getRange(1, 1, nBaris, nKol).getValues();
    for (var r = 0; r < v.length; r++) {
      var sel = [];
      for (var c = 0; c < nKol; c++) sel.push(String(v[r][c]).trim());
      if (sel.join('')) out.push('  ' + (r + 1) + ' | ' + sel.join(' | '));
    }
  }
  var pesan = out.join('\n');
  Logger.log(pesan);
  return pesan;
}

// ====================== CEK KELENGKAPAN MODUL ======================

/**
 * DIAGNOSTIK: pastikan SEMUA modul sudah versi terbaru.
 * Memeriksa simbol kunci tiap modul; bila ada yang hilang berarti berkas itu
 * belum tersalin / masih versi lama. Jalankan ini LEBIH DULU bila
 * `jalankanSemuaTest` gagal dengan "... is not defined".
 */
function cekModulLengkap() {
  var wajib = [
    ['00_config', ['SPREADSHEET_ID', 'ACCOUNTS', 'POS_BATAS_PENGELUARAN', 'BUDGET_BARIS_BIAYA',
                   'BUDGET_BARIS_KANTONG', 'BUDGET_BARIS_AKHIR']],
    ['05_shared', ['parseIsoDate_', 'formatRupiah_', 'parseTanggalCell_', 'inboxHashHex_']],
    ['10_domain_rekening', ['detectAccount_', 'cocokNomorUtuh_', 'cocokNamaPemilik_',
                            'cocokNomorTersamar_', 'isCreditCard_']],
    ['11_domain_transaksi', ['validasiTransaksi_', 'rekeningTransaksi_', 'nilaiNominal_',
                             'barisTransaksi_', 'catatanMemori_']],
    ['12_domain_cashflow', ['mapBankCashflow_', 'buildCashflowRow_']],
    ['13_domain_inbox', ['descGetLine_', 'descSetLine_', 'inboxNeedsRead_', 'inboxAiState_']],
    ['14_domain_pos', ['posDariPenerima_', 'samakanPos_', 'posDariGrid_', 'batasPengeluaran_']],
    ['15_domain_budget', ['susunBudget_', 'barisTotalPengeluaran_', 'rentangBudget_']],
    ['20_app_transaksi', ['appendTransaction', 'updateTransaction', 'lupakanCacheHistory_']],
    ['21_app_inbox', ['uploadInbox', 'listInbox', 'analyzeInboxFile', 'inboxReadOne_']],
    ['22_app_laporan', ['getBudget', 'getBudgetMonths', 'getTransaksiList', 'auditCashflowSetoran']],
    ['40_adapter_sheets', ['getSheet_', 'getPosList_', 'posDariRentang_', 'sheetsBacaTransaksi_',
                           'sheetsBacaReal_', 'sheetsSiapkanBarisBaru_']],
    ['41_adapter_drive', ['getInboxFolder_', 'getInboxFile_', 'inboxImageBlob_', 'inboxGetAi_']],
    ['42_adapter_claude', ['analyzeImage', 'analyzeImg_']],
    ['43_adapter_kurs', ['getFxRate_']],
    ['44_adapter_properties', ['checkPin', 'verifyPin_']],
    ['50_inbound_webapp', ['doGet', 'getConfig', 'include']],
    ['90_triggers', ['autoReadInbox', 'setupAutoRead', 'autoReadStatus']],
    ['99_tests', ['jalankanSemuaTest', 'cekStrukturReal', 'daftarSheet', 'cekModulLengkap']]
  ];
  var out = [], perluSalin = [];
  for (var i = 0; i < wajib.length; i++) {
    var modul = wajib[i][0], simbol = wajib[i][1], hilang = [];
    for (var j = 0; j < simbol.length; j++) {
      if (!_adaSimbol_(simbol[j])) hilang.push(simbol[j]);
    }
    if (hilang.length) {
      out.push('  ✗ ' + modul + '  -> HILANG: ' + hilang.join(', '));
      perluSalin.push(modul);
    } else {
      out.push('  ✓ ' + modul);
    }
  }
  var kepala = perluSalin.length
    ? ('BELUM LENGKAP. Salin ulang berkas berikut dari repo lalu jalankan lagi:\n     ' +
       perluSalin.join(', ') + '\n')
    : 'LENGKAP - semua modul sudah versi terbaru.\n';
  var pesan = kepala + '\n' + out.join('\n');
  Logger.log(pesan);
  return pesan;
}

/** true bila sebuah nama global (fungsi/konstanta) terdefinisi di project. */
function _adaSimbol_(nama) {
  try { return eval('typeof ' + nama) !== 'undefined'; } catch (e) { return false; }
}

/**
 * DIAGNOSTIK: bandingkan BUDGET (REKAP) dengan SISA (REAL) berdampingan untuk satu
 * bulan, memakai baris & kolom yang sama. Jalankan ini untuk MEMASTIKAN tata letak
 * REKAP benar-benar sejajar REAL sebelum mempercayai persentase di menu Budget.
 * Ubah `BULAN_UJI` bila ingin memeriksa bulan lain.
 */
function cekBudgetRekap() {
  var BULAN_UJI = '';   // kosong = pakai bulan berjalan dari daftar REAL
  var m = getBudgetMonths();
  var bulan = BULAN_UJI || m.current;
  if (m.months.indexOf(bulan) < 0) bulan = m.months[m.months.length - 1];

  var header = sheetsBacaReal_().header, col = -1;
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim().toUpperCase() === String(bulan).trim().toUpperCase()) { col = i + 1; break; }
  }
  if (col < 0) { var e = 'Bulan "' + bulan + '" tidak ada di baris 1 REAL.'; Logger.log(e); return e; }

  var awal = BUDGET_BARIS_BIAYA[0], jml = BUDGET_BARIS_AKHIR - awal + 1;
  var real = sheetsBacaReal_(awal, jml, col);
  var rekap = sheetsBacaRekap_(awal, jml, col);
  var out = ['Bulan: ' + bulan + '  (kolom ' + kolomKe_(col) + ')',
             'REKAP terbaca: ' + (rekap.length ? rekap.length + ' baris' : 'KOSONG - sheet/kolom tidak terbaca'), '',
             'baris | POS                            |        BUDGET |          SISA |    TERPAKAI | %'];
  var tB = 0, tS = 0;
  for (var k = 0; k < real.labels.length; k++) {
    var b = String(real.labels[k][1]).trim();
    if (!b || b.toUpperCase() === 'TOTAL') continue;
    var n = awal + k;
    if (n < BUDGET_BARIS_BIAYA[0] || n > BUDGET_BARIS_BIAYA[1]) continue;
    var sisa = toNum_(real.values[k][0]);
    var bud = rekap[k] ? toNum_(rekap[k][0]) : 0;
    var pak = bud > 0 ? Math.max(0, bud - sisa) : 0;
    if (bud > 0) { tB += bud; tS += sisa; }
    out.push('  ' + n + ' | ' + (b + '                              ').slice(0, 30) +
      ' | ' + String(bud).padStart(13) + ' | ' + String(sisa).padStart(13) +
      ' | ' + String(pak).padStart(11) + ' | ' + (bud > 0 ? Math.round(pak / bud * 100) + '%' : '-'));
  }
  out.push('');
  out.push('TOTAL budget ' + tB + ' · sisa ' + tS + ' · terpakai ' + (tB - tS) +
           ' · ' + (tB > 0 ? Math.round((tB - tS) / tB * 100) + '%' : '-'));
  out.push('');
  out.push('PERIKSA: nama POS di kolom "POS" harus cocok dengan baris yang sama di REKAP.');
  out.push('Bila BUDGET semuanya 0, berarti REKAP memakai kolom/baris berbeda - kabari saya.');
  var pesan = out.join('\n');
  Logger.log(pesan);
  return pesan;
}
