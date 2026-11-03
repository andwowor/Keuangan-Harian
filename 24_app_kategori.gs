/**
 * APPLICATION - Use case KATEGORI BIAYA: daftar pilihan & rekomendasi dari history.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/ (ADR-0014).
 */

var CACHE_DAFTAR_KATEGORI = 'katdaftar';
var CACHE_MODEL_KATEGORI = 'katmodel';

/** Daftar pilihan KATEGORI BIAYA [{ nama, cakupan }] dari dropdown kolom K (di-cache 10 menit). */
function daftarKategori_() {
  var hit = cacheAmbil_(CACHE_DAFTAR_KATEGORI);           // adapter Cache
  if (hit && hit.length) return hit;
  var d = sheetsDaftarKategori_();                        // adapter Sheets
  if (d.length) cacheSimpan_(CACHE_DAFTAR_KATEGORI, d, 600);
  return d;
}

/** Model rekomendasi dari seluruh history TRANSAKSI (di-cache; dibuang tiap ada simpan/edit). */
function modelKategoriTersimpan_() {
  var hit = cacheAmbil_(CACHE_MODEL_KATEGORI);
  if (hit && hit.nama) return hit;
  var rows = sheetsBacaTransaksi_(KOLOM_KATEGORI).rows;   // adapter Sheets (A..K)
  var pasang = [];
  for (var i = 0; i < rows.length; i++) {
    pasang.push([rows[i][0], rows[i][1], rows[i][KOLOM_KATEGORI - 1]]);
  }
  var m = modelKategori_(pasang, daftarKategori_());      // aturan domain
  cacheSimpan_(CACHE_MODEL_KATEGORI, m, KATEGORI_CACHE_DETIK);
  return m;
}

/**
 * Rekomendasi KATEGORI BIAYA untuk form Input (dipanggil UI setiap POS/KETERANGAN berubah).
 * input = { pos, keterangan, merchant }. Mengembalikan { saran: [{ kategori, skor, alasan }] }.
 */
function rekomendasiKategori(input, pin) {
  verifyPin_(pin);
  return { saran: rekomendasiKategori_(modelKategoriTersimpan_(), input || {}) };   // aturan domain
}

/** Lempar galat bila kategori tidak ada di daftar dropdown kolom K. */
function pastikanKategoriSah_(kategori) {
  var daftar = daftarKategori_();
  if (!daftar.length) return;   // daftar tak terbaca: jangan blokir simpan karena masalah baca
  if (!kategoriSah_(kategori, daftar)) {                  // aturan domain
    throw new Error('KATEGORI BIAYA "' + kategori + '" tidak ada di daftar dropdown sheet TRANSAKSI.');
  }
}

/** Buang cache model & daftar - dipanggil setelah data TRANSAKSI berubah. */
function lupakanCacheKategori_() {
  cacheHapus_(CACHE_MODEL_KATEGORI);
  cacheHapus_(CACHE_DAFTAR_KATEGORI);
}
