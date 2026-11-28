/**
 * DOMAIN - PENGGANTIAN: transaksi yang nantinya diganti (reimburse) sebagian/seluruhnya.
 * MURNI: dilarang memanggil API Google apa pun.
 *
 * Keputusan yang disembunyikan modul ini (Parnas):
 *   - bagaimana rincian penggantian ditulis di satu sel dan dibaca kembali,
 *   - kapan daftar penggantian sah (nominal > 0, tanggal sah, total tidak melebihi awal),
 *   - isi sel NOMINAL setelah dikurangi penggantian, mengikuti jenis isi aslinya.
 *
 * NOMINAL (kolom C) selalu DIHITUNG ULANG dari NOMINAL AWAL dikurangi seluruh penggantian,
 * tidak pernah dikurangi sedikit demi sedikit - sehingga menyimpan ulang, menghapus satu
 * penggantian, atau mengedit nominal awal selalu menghasilkan angka yang benar.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/ (ADR-0015).
 */

var PENGGANTIAN_MENUNGGU = 'MENUNGGU';
var PENGGANTIAN_SELESAI = 'SELESAI';

/** Status baku dari isi sel kolom L: '' (tidak ditandai) | MENUNGGU | SELESAI. */
function statusPenggantian_(isi) {
  var s = String(isi == null ? '' : isi).trim().toUpperCase();
  if (!s) return '';
  return s === PENGGANTIAN_SELESAI ? PENGGANTIAN_SELESAI : PENGGANTIAN_MENUNGGU;
}

/**
 * Angka rupiah dari isi sel: angka apa adanya; teks seperti "Rp1.000.000" dibaca dari
 * digitnya saja. (toNum_ tidak bisa dipakai di sini: ia membaca titik sebagai desimal,
 * sehingga "Rp1.000.000" menjadi 1.)
 */
function angkaRupiah_(isi) {
  if (typeof isi === 'number') return isi;
  var t = String(isi == null ? '' : isi);
  var negatif = /^\s*-|-\s*Rp|Rp\s*-/.test(t);
  var d = t.replace(/[^\d]/g, '');
  return d ? (negatif ? -Number(d) : Number(d)) : 0;
}

/** Rincian di sel kolom O -> [{ tanggal:'yyyy-MM-dd', nominal }]. Potongan rusak diabaikan. */
function bacaRincianPenggantian_(teks) {
  var out = [];
  var bagian = String(teks || '').split(';');
  for (var i = 0; i < bagian.length; i++) {
    var m = /^\s*(\d{4}-\d{2}-\d{2})\s*=\s*([\d.]+)\s*$/.exec(bagian[i]);
    if (m) out.push({ tanggal: m[1], nominal: Math.round(Number(m[2])) });
  }
  return out;
}

/** Daftar -> teks kolom O, urut tanggal: "2026-11-20=300000; 2026-11-25=200000". */
function tulisRincianPenggantian_(daftar) {
  return (daftar || []).slice().sort(function (a, b) {
    return a.tanggal < b.tanggal ? -1 : (a.tanggal > b.tanggal ? 1 : 0);
  }).map(function (p) { return p.tanggal + '=' + Math.round(Number(p.nominal)); }).join('; ');
}

function totalPenggantian_(daftar) {
  var t = 0;
  for (var i = 0; i < (daftar || []).length; i++) t += Math.round(Number(daftar[i].nominal) || 0);
  return t;
}

/**
 * Lempar galat bila daftar tidak sah. Total melebihi nominal awal ditolak: hampir pasti
 * salah ketik, dan akan membuat NOMINAL negatif yang mengacaukan budget.
 */
function validasiPenggantian_(daftar, nominalAwal) {
  for (var i = 0; i < (daftar || []).length; i++) {
    var p = daftar[i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.tanggal || ''))) {
      throw new Error('Tanggal penggantian ke-' + (i + 1) + ' belum diisi dengan benar.');
    }
    if (!(Number(p.nominal) > 0)) throw new Error('Nominal penggantian ke-' + (i + 1) + ' harus lebih dari 0.');
  }
  var total = totalPenggantian_(daftar);
  if (total > nominalAwal) {
    throw new Error('Total penggantian (' + formatRupiah_(total) + ') melebihi nominal awal transaksi (' +
      formatRupiah_(nominalAwal) + ').');
  }
}

/**
 * Isi sel NOMINAL (C) setelah penggantian, mengikuti jenis isi NOMINAL AWAL:
 *   - formula (mis. kurs RMB) atau angka -> angka bersih;
 *   - teks "Rp..." (baris lama)          -> teks "Rp..." bersih.
 * Formula asli tidak hilang: tetap tersimpan utuh di kolom NOMINAL AWAL.
 * Mengembalikan null bila total 0 - artinya pulihkan isi asli apa adanya.
 */
function isiNominalBersih_(awalNilai, awalFormula, total) {
  if (!(total > 0)) return null;
  var bersih = angkaRupiah_(awalNilai) - total;
  if (!awalFormula && typeof awalNilai === 'string' && awalNilai.trim()) return formatRupiah_(bersih);
  return bersih;
}

/** Cocok dengan filter Penggantian di Riwayat Biaya: '' | 'ditandai' | 'menunggu' | 'selesai'. */
function cocokFilterPenggantian_(status, filter) {
  var f = String(filter || '');
  if (!f) return true;
  if (f === 'ditandai') return !!status;
  if (f === 'menunggu') return status === PENGGANTIAN_MENUNGGU;
  if (f === 'selesai') return status === PENGGANTIAN_SELESAI;
  return true;
}

/**
 * Nominal yang dipakai untuk mencocokkan Setoran Owner di CASHFLOW: nominal AWAL bila
 * transaksinya ditandai penggantian. Setoran Owner dicatat dengan nominal asli; memakai
 * nominal bersih akan membuat audit menganggapnya "belum masuk" lalu menulis GANDA.
 * row = baris TRANSAKSI A..O (indeks 0).
 */
function nominalAsliTransaksi_(row) {
  if (statusPenggantian_(row[KOLOM_PENGGANTIAN - 1]) && String(row[KOLOM_NOMINAL_AWAL - 1]) !== '') {
    return angkaRupiah_(row[KOLOM_NOMINAL_AWAL - 1]);
  }
  return Number(row[2]) || 0;
}
