/**
 * DOMAIN - Aturan penentuan POS BIAYA dari PENERIMA pembayaran.
 * MURNI: dilarang memanggil API Google apa pun.
 *
 * Keputusan yang disembunyikan modul ini (Parnas): daftar penerima tetap yang
 * selalu memetakan ke satu POS BIAYA tertentu. Aturan deterministik ini MENGALAHKAN
 * tebakan model (prinsip yang sama dengan SUMBER DANA - lihat ADR-0003).
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/**
 * Pemetaan PENERIMA -> POS BIAYA.
 * 'kunci' ditulis huruf kecil; pencocokan memakai "mengandung" pada teks penerima
 * yang sudah dinormalkan (spasi rangkap dirapatkan).
 * 'pos' boleh berbeda huruf besar/kecil dari sheet - nanti diselaraskan samakanPos_().
 */
var POS_PENERIMA = [
  { kunci: ['kairagi dua 009'], pos: 'Retribusi Sampah',
    alasan: 'Penerima "Kairagi Dua 009" → Retribusi Sampah' }
];

/** Rapatkan spasi & samakan huruf agar pencocokan tahan variasi penulisan. */
function normalTeksPenerima_(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Cari aturan POS berdasarkan penerima. Mengembalikan { pos, alasan } atau null.
 * Sumber teks: nama penerima/merchant pada bukti, ditambah teks pendukung lain.
 */
function posDariPenerima_(penerima, teksLain) {
  var t = normalTeksPenerima_(String(penerima || '') + ' ' + String(teksLain || ''));
  if (!t) return null;
  for (var i = 0; i < POS_PENERIMA.length; i++) {
    var aturan = POS_PENERIMA[i];
    for (var k = 0; k < aturan.kunci.length; k++) {
      if (aturan.kunci[k] && t.indexOf(aturan.kunci[k]) >= 0) return aturan;
    }
  }
  return null;
}

/**
 * Selaraskan nama POS ke EJAAN PERSIS pada daftar POS yang berlaku (sheet REAL),
 * supaya nilai yang ditulis selalu cocok dengan dropdown kolom POS BIAYA.
 * Mengembalikan '' bila POS tidak ada pada daftar.
 */
function samakanPos_(pos, daftarPos) {
  var p = normalTeksPenerima_(pos);
  var list = daftarPos || [];
  for (var i = 0; i < list.length; i++) {
    if (normalTeksPenerima_(list[i]) === p) return list[i];
  }
  return '';
}

// ============ DAFTAR POS BIAYA DARI GRID SHEET REAL ============
// Keputusan yang disembunyikan: BAGAIMANA mengenali baris POS pada sheet REAL.
// Dulu memakai nomor baris tetap (POS_SOURCE_ROWS) sehingga rusak begitu pemilik
// menyisipkan/menghapus baris. Sekarang dikenali dari STRUKTUR:
//   - hanya baris DI ATAS penanda batas (kolom A memuat "TOTAL PENGELUARAN"),
//   - kolom B tidak kosong, dan
//   - kolom B bukan baris "TOTAL".
// Semua baris di bawah penanda (INCOME, SALDO, PROYEKSI) otomatis terabaikan.

/**
 * Ambil daftar POS BIAYA dari grid sheet REAL.
 * grid: array baris, tiap baris [kolomA, kolomB]; indeks 0 = baris 1 sheet.
 * Mengembalikan array POS (urut, tanpa duplikat), atau NULL bila penanda batas
 * tidak ditemukan (pemanggil harus memakai cara cadangan).
 */
function posDariGrid_(grid) {
  var batas = batasPengeluaran_(grid);
  if (batas < 0) return null;              // struktur tak dikenali -> biar pemanggil fallback
  var out = [], seen = {};
  for (var i = 0; i < batas; i++) {
    var b = String((grid[i] && grid[i][1]) || '').trim();
    if (!b || b.toUpperCase() === 'TOTAL') continue;
    var k = b.toLowerCase();
    if (seen[k]) continue;
    seen[k] = 1; out.push(b);
  }
  return out;
}

/**
 * Indeks baris penanda batas antara blok PENGELUARAN dan blok INCOME
 * (kolom A memuat "TOTAL PENGELUARAN"). -1 bila tidak ditemukan.
 */
function batasPengeluaran_(grid) {
  for (var i = 0; i < grid.length; i++) {
    var a = String((grid[i] && grid[i][0]) || '').trim().toUpperCase();
    if (a.indexOf(POS_BATAS_PENGELUARAN) >= 0) return i;
  }
  return -1;
}
