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
    saldo: 0, saldoBulanSebelumnya: 0, saldoReal: 0,
    // Ringkasan budget (dihitung dari item, bukan dari baris TOTAL sheet)
    totalBudget: 0, totalTerpakai: 0, totalSisaBudget: 0, adaBudget: false
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

    if (dlmBiaya(r.n)) {
      var it = itemBiaya_(r);
      hasil.biaya.push(it);
      if (!it.isTotal && it.adaBudget) {
        hasil.adaBudget = true;
        hasil.totalBudget += it.budget;
        hasil.totalSisaBudget += it.sisa;
        hasil.totalTerpakai += it.terpakai;
      }
    } else if (dlmKantong(r.n)) {
      hasil.pemasukan.push({ a: String(r.a || '').trim(), b: b, v: r.v });
    }
  }
  hasil.pctTerpakai = persenTerpakai_(hasil.totalBudget, hasil.totalTerpakai);
  return hasil;
}

/**
 * Satu baris biaya. `v` (REAL) adalah SISA budget; `budget` (REKAP) adalah alokasi.
 *   terpakai = budget - sisa   (sisa 0 berarti budget habis terserap)
 * Bila budget tidak tersedia (REKAP kosong/0), persentase TIDAK dihitung -
 * `adaBudget` false supaya UI menampilkan tanda "-" alih-alih angka menyesatkan.
 */
function itemBiaya_(r) {
  var a = String(r.a || '').trim();
  var b = String(r.b || '').trim();
  var isTotal = (b.toUpperCase() === 'TOTAL') || (a.toUpperCase().indexOf('TOTAL') >= 0);
  var sisa = Number(r.v) || 0;
  var budget = Number(r.budget) || 0;
  var adaBudget = budget > 0;
  var terpakai = adaBudget ? Math.max(0, budget - sisa) : 0;
  var pct = persenTerpakai_(budget, terpakai);
  return {
    a: a, b: b, v: sisa, sisa: sisa, budget: budget,
    terpakai: terpakai, isTotal: isTotal, adaBudget: adaBudget,
    pct: pct, status: statusBudget_(pct)
  };
}

/**
 * Status pemakaian budget sebuah pos, dari persen terpakai:
 *   habis   : >= 100%  (budget sudah terserap penuh)
 *   waspada : >= 80%   (mendekati batas)
 *   aman    : < 80%
 *   ''      : budget tidak diketahui (pct < 0)
 * Catatan: tepat 80% dihitung WASPADA - ambang peringatan bersifat inklusif.
 */
function statusBudget_(pct) {
  if (!(pct >= 0)) return '';
  if (pct >= AMBANG_HABIS) return 'habis';
  if (pct >= AMBANG_WASPADA) return 'waspada';
  return 'aman';
}

/** Persen terpakai terhadap budget; -1 bila budget tidak diketahui. */
function persenTerpakai_(budget, terpakai) {
  if (!(budget > 0)) return -1;
  return Math.max(0, Math.min(100, Math.round(terpakai / budget * 100)));
}


/** Penguji apakah sebuah nomor baris berada di dalam rentang [awal, akhir]. */
function rentangBudget_(rg) {
  return function (n) { return n >= rg[0] && n <= rg[1]; };
}
