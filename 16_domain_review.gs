/**
 * DOMAIN - Penyusunan FAKTA untuk review penggunaan biaya bulan berjalan.
 * MURNI: dilarang memanggil API Google apa pun.
 *
 * Keputusan yang disembunyikan modul ini (Parnas):
 *   - kapan sebuah pos disebut BERLEBIHAN, MENDEKATI batas, atau BOROS DI AWAL,
 *   - kapan sebuah pos disebut RUTIN sehingga layak diproyeksikan di REKAP,
 *   - berapa banyak temuan yang pantas ditampilkan.
 *
 * PEMBAGIAN TUGAS yang disengaja: SELURUH ANGKA dihitung di sini secara deterministik.
 * Model bahasa (42_adapter_claude.gs) hanya menarasikan fakta yang sudah jadi dan
 * memberi saran - tidak pernah menghitung, menaksir, atau mengarang angka.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Kunci periode sebuah baris transaksi: "AGUSTUS|2026". */
function kunciPeriode_(bulan, tahun) {
  return String(bulan || '').trim().toUpperCase() + '|' + String(tahun || '').trim().replace(/\.0$/, '');
}

/**
 * Agregat pengeluaran per POS untuk SATU periode.
 * rows = baris sheet TRANSAKSI (A..G): [pos, ket, nominal, tanggal, biayaBulan, tahunBiaya, sumber].
 * Mengembalikan { pos: { total, jumlah, terbesar:{ket,nominal} } }.
 */
function agregatPerPos_(rows, bulan, tahun) {
  var target = kunciPeriode_(bulan, tahun), out = {};
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i];
    var pos = String(r[0] || '').trim();
    if (!pos || kunciPeriode_(r[4], r[5]) !== target) continue;
    var nom = Number(r[2]) || 0;
    var o = out[pos] || (out[pos] = { pos: pos, total: 0, jumlah: 0, terbesar: null });
    o.total += nom;
    o.jumlah++;
    if (!o.terbesar || nom > o.terbesar.nominal) {
      o.terbesar = { ket: String(r[1] || '').trim(), nominal: nom };
    }
  }
  return out;
}

/**
 * Riwayat pengeluaran per POS di LUAR periode berjalan, untuk menilai mana yang RUTIN.
 * Mengembalikan { pos: { nBulan, total, rerata, terakhir } } - rerata dihitung hanya
 * atas bulan yang benar-benar ada transaksinya (bulan kosong tidak mengencerkan rerata).
 */
function riwayatPerPos_(rows, bulanKini, tahunKini) {
  var kini = kunciPeriode_(bulanKini, tahunKini), acc = {};
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i];
    var pos = String(r[0] || '').trim();
    var k = kunciPeriode_(r[4], r[5]);
    if (!pos || !k || k === '|' || k === kini) continue;
    var a = acc[pos] || (acc[pos] = { pos: pos, perBulan: {}, total: 0 });
    a.perBulan[k] = (a.perBulan[k] || 0) + (Number(r[2]) || 0);
    a.total += Number(r[2]) || 0;
  }
  var out = {};
  for (var p in acc) {
    var bulanKunci = Object.keys(acc[p].perBulan);
    var n = bulanKunci.length;
    out[p] = {
      pos: p, nBulan: n, total: acc[p].total,
      rerata: n ? Math.round(acc[p].total / n) : 0,
      terakhir: acc[p].perBulan[bulanKunci[n - 1]] || 0
    };
  }
  return out;
}

/** Pos yang budgetnya SUDAH TERLAMPAUI (pct >= 100), diurutkan dari kelebihan terbesar. */
function temuanBerlebihan_(biaya) {
  var out = [];
  for (var i = 0; i < (biaya || []).length; i++) {
    var o = biaya[i];
    if (o.isTotal || !o.adaBudget || o.pct < AMBANG_HABIS) continue;
    out.push({ pos: o.b, budget: o.budget, terpakai: o.terpakai, pct: o.pct,
      lebih: Math.max(0, o.terpakai - o.budget) });
  }
  out.sort(function (a, b) { return b.lebih - a.lebih || b.pct - a.pct; });
  return out;
}

/** Pos yang MENDEKATI batas (>= AMBANG_WASPADA, belum 100%), diurutkan dari yang paling dekat. */
function temuanMendekati_(biaya) {
  var out = [];
  for (var i = 0; i < (biaya || []).length; i++) {
    var o = biaya[i];
    if (o.isTotal || !o.adaBudget || o.pct < AMBANG_WASPADA || o.pct >= AMBANG_HABIS) continue;
    out.push({ pos: o.b, budget: o.budget, terpakai: o.terpakai, pct: o.pct, sisa: o.sisa });
  }
  out.sort(function (a, b) { return b.pct - a.pct; });
  return out;
}

/**
 * Pos yang lajunya JAUH mendahului jalannya bulan - mis. bulan baru jalan 40% tetapi
 * budget sudah terpakai 70%. Hanya untuk pos yang BELUM masuk kategori berlebihan,
 * supaya satu pos tidak muncul di dua temuan sekaligus.
 * porsiBulan = 0..100 (persen hari yang sudah lewat).
 */
function temuanLajuCepat_(biaya, porsiBulan) {
  var out = [];
  for (var i = 0; i < (biaya || []).length; i++) {
    var o = biaya[i];
    if (o.isTotal || !o.adaBudget || o.pct >= AMBANG_WASPADA) continue;
    var selisih = o.pct - porsiBulan;
    if (selisih < REVIEW_AMBANG_LAJU) continue;
    out.push({ pos: o.b, budget: o.budget, terpakai: o.terpakai, pct: o.pct,
      porsiBulan: porsiBulan, mendahului: Math.round(selisih) });
  }
  out.sort(function (a, b) { return b.mendahului - a.mendahului; });
  return out;
}

/**
 * Pos yang ADA PENGELUARANNYA bulan ini tetapi TIDAK punya budget di REKAP.
 * Inilah "lupa diproyeksikan" yang paling pasti - tidak perlu ditebak model.
 * budgetByPos = { namaPos: budget }.
 */
function temuanTanpaBudget_(agregat, budgetByPos) {
  var out = [];
  for (var p in (agregat || {})) {
    if (Number((budgetByPos || {})[p]) > 0) continue;
    if (!(agregat[p].total > 0)) continue;
    out.push({ pos: p, terpakai: agregat[p].total, jumlah: agregat[p].jumlah,
      contoh: agregat[p].terbesar ? agregat[p].terbesar.ket : '' });
  }
  out.sort(function (a, b) { return b.terpakai - a.terpakai; });
  return out;
}

/**
 * Pos yang RUTIN muncul di bulan-bulan sebelumnya (>= REVIEW_MIN_BULAN_RUTIN bulan)
 * tetapi budgetnya 0 di REKAP bulan ini - kemungkinan besar terlewat diproyeksikan,
 * meskipun bulan ini kebetulan belum ada transaksinya.
 */
function temuanRutinTerlewat_(riwayat, budgetByPos, agregat) {
  var out = [];
  for (var p in (riwayat || {})) {
    if (Number((budgetByPos || {})[p]) > 0) continue;
    if ((agregat || {})[p]) continue;                    // sudah dilaporkan sebagai tanpa-budget
    var h = riwayat[p];
    if (h.nBulan < REVIEW_MIN_BULAN_RUTIN || !(h.rerata > 0)) continue;
    out.push({ pos: p, nBulan: h.nBulan, rerata: h.rerata });
  }
  out.sort(function (a, b) { return b.rerata - a.rerata || b.nBulan - a.nBulan; });
  return out;
}

/** Perbandingan pemakaian bulan ini terhadap rerata bulan-bulan sebelumnya (pos yang naik tajam). */
function temuanNaikTajam_(agregat, riwayat) {
  var out = [];
  for (var p in (agregat || {})) {
    var h = (riwayat || {})[p];
    if (!h || h.nBulan < REVIEW_MIN_BULAN_RUTIN || !(h.rerata > 0)) continue;
    var kini = agregat[p].total;
    var naik = Math.round((kini - h.rerata) / h.rerata * 100);
    if (naik < REVIEW_AMBANG_NAIK) continue;
    out.push({ pos: p, kini: kini, rerata: h.rerata, nBulan: h.nBulan, naikPct: naik });
  }
  out.sort(function (a, b) { return b.naikPct - a.naikPct; });
  return out;
}

/** Persen hari yang sudah berlalu pada bulan berjalan (1..100). */
function porsiBulanBerjalan_(hari, hariTotal) {
  var h = Number(hari) || 0, t = Number(hariTotal) || 0;
  if (!(t > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round(h / t * 100)));
}

/** Jumlah hari pada sebuah bulan (bulanIdx 0-11), memperhitungkan tahun kabisat. */
function jumlahHariBulan_(bulanIdx, tahun) {
  var b = Number(bulanIdx), t = Number(tahun);
  var hari = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (b === 1 && ((t % 4 === 0 && t % 100 !== 0) || t % 400 === 0)) return 29;
  return hari[b] || 30;
}

/**
 * Rangkum semua temuan menjadi satu objek FAKTA yang siap dinarasikan.
 * Setiap daftar dipotong REVIEW_MAKS_TEMUAN supaya prompt tetap ringkas dan biayanya
 * terkendali; jumlah yang dipotong tetap dilaporkan (lihat *Lain) agar tidak
 * terkesan sudah mencakup semuanya.
 */
function susunFaktaReview_(opt) {
  var biaya = opt.biaya || [], agregat = opt.agregat || {}, riwayat = opt.riwayat || {};
  var budgetByPos = {};
  for (var i = 0; i < biaya.length; i++) {
    if (!biaya[i].isTotal && biaya[i].b) budgetByPos[biaya[i].b] = biaya[i].budget;
  }
  var porsi = porsiBulanBerjalan_(opt.hari, opt.hariTotal);
  var berlebihan = temuanBerlebihan_(biaya);
  var mendekati = temuanMendekati_(biaya);
  var laju = temuanLajuCepat_(biaya, porsi);
  var tanpa = temuanTanpaBudget_(agregat, budgetByPos);
  var rutin = temuanRutinTerlewat_(riwayat, budgetByPos, agregat);
  var naik = temuanNaikTajam_(agregat, riwayat);

  var nTx = 0, totalTx = 0;
  for (var p in agregat) { nTx += agregat[p].jumlah; totalTx += agregat[p].total; }

  return {
    bulan: opt.bulan, hari: opt.hari, hariTotal: opt.hariTotal, porsiBulan: porsi,
    totalBudget: opt.totalBudget || 0, totalTerpakai: opt.totalTerpakai || 0,
    totalSisaBudget: opt.totalSisaBudget || 0, pctTerpakai: opt.pctTerpakai,
    saldoReal: opt.saldoReal || 0,
    jumlahTransaksi: nTx, totalTransaksi: totalTx,
    berlebihan: berlebihan.slice(0, REVIEW_MAKS_TEMUAN), berlebihanLain: sisaTemuan_(berlebihan),
    mendekati: mendekati.slice(0, REVIEW_MAKS_TEMUAN), mendekatiLain: sisaTemuan_(mendekati),
    lajuCepat: laju.slice(0, REVIEW_MAKS_TEMUAN), lajuCepatLain: sisaTemuan_(laju),
    tanpaBudget: tanpa.slice(0, REVIEW_MAKS_TEMUAN), tanpaBudgetLain: sisaTemuan_(tanpa),
    rutinTerlewat: rutin.slice(0, REVIEW_MAKS_TEMUAN), rutinTerlewatLain: sisaTemuan_(rutin),
    naikTajam: naik.slice(0, REVIEW_MAKS_TEMUAN), naikTajamLain: sisaTemuan_(naik),
    adaTemuan: !!(berlebihan.length || mendekati.length || laju.length ||
      tanpa.length || rutin.length || naik.length)
  };
}

/** Berapa temuan yang tidak ikut ditampilkan karena pemotongan daftar. */
function sisaTemuan_(arr) {
  return Math.max(0, (arr || []).length - REVIEW_MAKS_TEMUAN);
}

/**
 * Sidik jari fakta - dipakai sebagai kunci cache hasil analisa. Bila angka pada sheet
 * belum berubah, analisa lama dipakai ulang sehingga tidak memanggil model berulang kali.
 * Sengaja hanya memuat angka yang MEMPENGARUHI kesimpulan.
 */
function sidikFakta_(f) {
  var bagian = [f.bulan, f.hari, f.totalBudget, f.totalTerpakai, f.jumlahTransaksi, f.totalTransaksi];
  var daftar = ['berlebihan', 'mendekati', 'lajuCepat', 'tanpaBudget', 'rutinTerlewat', 'naikTajam'];
  for (var i = 0; i < daftar.length; i++) {
    var arr = f[daftar[i]] || [];
    for (var j = 0; j < arr.length; j++) {
      bagian.push(arr[j].pos + ':' + (arr[j].terpakai || arr[j].kini || arr[j].rerata || 0));
    }
  }
  return bagian.join('~');
}
