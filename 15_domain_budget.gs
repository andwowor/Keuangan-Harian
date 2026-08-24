/**
 * DOMAIN - Penyusunan data menu Budget dari blok sheet REAL.
 * MURNI: dilarang memanggil API Google apa pun.
 *
 * Keputusan yang disembunyikan modul ini (Parnas):
 *   - baris mana yang termasuk "biaya per kategori" dan mana "sisa kantong",
 *   - baris mana yang merupakan TOTAL/SALDO (dicari lewat LABEL, bukan nomor baris,
 *     supaya tidak rusak bila pemilik menyisipkan/menghapus baris).
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Label baris ringkasan pada kolom B sheet REAL (dicocokkan PERSIS, huruf besar). */
var LABEL_TOTAL_INCOME = 'TOTAL INCOME';
var LABEL_SALDO = 'SALDO';
var LABEL_SALDO_SEBELUM = 'SALDO BULAN SEBELUMNYA';
var LABEL_SALDO_REAL = 'SALDO REAL';

/** true bila baris ini adalah TOTAL PENGELUARAN (grand total blok biaya). */
function barisTotalPengeluaran_(a) {
  return String(a || '').trim().toUpperCase().indexOf(POS_BATAS_PENGELUARAN) >= 0;
}

/**
 * Susun data menu Budget.
 * baris: array objek { n:nomorBaris, a:kolomA, b:kolomB, v:nilai } untuk seluruh blok
 *        yang dibaca dari sheet REAL.
 * Mengembalikan { biaya, pemasukan, totalPengeluaran, totalIncome, saldo,
 *                 saldoBulanSebelumnya, saldoReal }.
 */
function susunBudget_(baris) {
  var hasil = {
    biaya: [], pemasukan: [],
    totalPengeluaran: 0, totalIncome: 0,
    saldo: 0, saldoBulanSebelumnya: 0, saldoReal: 0
  };
  var dlmBiaya = rentangBudget_(BUDGET_BARIS_BIAYA);
  var dlmKantong = rentangBudget_(BUDGET_BARIS_KANTONG);

  for (var i = 0; i < baris.length; i++) {
    var r = baris[i];
    var b = String(r.b || '').trim();
    var bU = b.toUpperCase();

    // --- Ringkasan: dicari lewat label, di mana pun letaknya ---
    if (barisTotalPengeluaran_(r.a)) { hasil.totalPengeluaran = r.v; continue; }
    if (bU === LABEL_TOTAL_INCOME) { hasil.totalIncome = r.v; continue; }
    if (bU === LABEL_SALDO_REAL) { hasil.saldoReal = r.v; continue; }
    if (bU === LABEL_SALDO_SEBELUM) { hasil.saldoBulanSebelumnya = r.v; continue; }
    if (bU === LABEL_SALDO) { hasil.saldo = r.v; continue; }

    if (!b) continue;                       // baris kosong dilewati
    // --- Daftar ---
    if (dlmBiaya(r.n)) hasil.biaya.push({ a: String(r.a || '').trim(), b: b, v: r.v });
    else if (dlmKantong(r.n)) hasil.pemasukan.push({ a: String(r.a || '').trim(), b: b, v: r.v });
  }
  return hasil;
}

/** Penguji apakah sebuah nomor baris berada di dalam rentang [awal, akhir]. */
function rentangBudget_(rg) {
  return function (n) { return n >= rg[0] && n <= rg[1]; };
}
