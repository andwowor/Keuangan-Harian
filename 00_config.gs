/**
 * KONFIGURASI & COMPOSITION ROOT
 * Konstanta seluruh sistem. Tanpa logika, tanpa panggilan API.
 * Kredensial TIDAK PERNAH di sini - pakai Script Property (lihat .env.example).
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

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
var TIMEZONE = 'Asia/Makassar'; // WITA (Waktu Indonesia Tengah, UTC+8)

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
// Opsional:
//   'names'    = kata kunci nama pemilik/aplikasi (huruf kecil), dipakai bila nomor tak terbaca;
//   'bankName' = nama bank pada bukti (huruf kecil), dipakai untuk mencocokkan NOMOR YANG
//                DISAMARKAN, mis. "Mandiri - •••••••••5620", "BCA - 026-3**-**85",
//                "BNI - *******055", "BRI - 1543 **** **** 507".
var ACCOUNTS = [
  { no: '154301003768507', label: 'BRI 154301003768507', bankName: 'bri',
    sumberDana: 'PENDAPATAN USAHA', bank: 'BRI' },
  { no: '1860031055', label: 'BNI 1860031055', bankName: 'bni',
    sumberDana: 'PENDAPATAN USAHA', bank: 'BNI' },
  { no: '0263632785', label: 'BCA 0263632785', bankName: 'bca',
    sumberDana: 'PENDAPATAN USAHA', bank: 'BCA' },
  { no: '1500034495620', label: 'Mandiri 1500034495620', bankName: 'mandiri',
    sumberDana: 'PENDAPATAN USAHA', bank: 'Mandiri' },
  { no: '0263935851', label: 'BCA 0263935851', bankName: 'bca',
    sumberDana: 'KAS LAIN USAHA', bank: '' },
  // Kunci blu = 'blu' saja. JANGAN pakai nama pemilik (mis. "Andre Stefano Wowor"),
  // karena nama itu juga muncul di rekening bank lain milik pemilik yang sama.
  { no: '002929331804', label: 'blu Andre Stefano Wowor', names: ['blu'],
    bankName: 'blu', sumberDana: 'THR/CUTI (SALDO BERGERAK)', bank: '' },
  { no: '085242081620', label: 'Allo 085242081620', bankName: 'allo',
    sumberDana: 'THR/CUTI (SALDO BERGERAK)', bank: '' },
  { no: '1966320708', label: 'BNI Multicurrency 1966320708', names: ['bni multicurrency', 'multicurrency'],
    bankName: 'bni', sumberDana: 'THR/CUTI (SALDO BERGERAK)', bank: '' },
  { no: '005401232138503', label: 'BRI 005401232138503', bankName: 'bri',
    sumberDana: 'THR/CUTI (SALDO BERGERAK)', bank: '' }
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

// Sumber daftar POS BIAYA: sheet REAL kolom B pada baris item biaya (tanpa TOTAL/sub-header).
var POS_SOURCE_SHEET = 'REAL';
var POS_SOURCE_COL = 2; // kolom B
var POS_SOURCE_ROWS = [[3, 13], [17, 20], [23, 24], [28, 42], [46, 46], [49, 50], [54, 64]];

// ====================== MENU SISA BUDGET (sheet REAL) ======================

var REAL_SHEET = 'REAL';

// ============ PENYIMPANAN SEMENTARA BUKTI (FOLDER GOOGLE DRIVE) ============

// Folder Drive penampung screenshot/bukti transfer yang belum sempat diproses.
var INBOX_FOLDER_ID = '1jBDHlpmo-3NfzJweYSB87reE8FSfniKs';
var INBOX_MAX_LIST = 500;  // pengaman: batas atas jumlah bukti yang didaftar sekali muat
var INBOX_THUMB_MAX = 24;  // thumbnail awal (sisanya dimuat bertahap dari klien)
var INBOX_THUMB_BATCH = 12; // jumlah thumbnail per permintaan susulan
var INBOX_MAX_BYTES = 3500000; // di atas ini, pakai versi resolusi lebih kecil dari Drive
var INBOX_AUTOREAD_PER_RUN = 8;   // maks. bukti dibaca per satu jalannya trigger latar belakang
var INBOX_READNOW_MAX = 12;       // maks. bukti dibaca dalam satu panggilan "baca sekarang"
var AUTOREAD_HANDLER = 'autoReadInbox';
var INBOX_READING_STALE_MS = 10 * 60 * 1000; // status "reading" dianggap macet setelah 10 menit
