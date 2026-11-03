/**
 * DOMAIN - Rekomendasi KATEGORI BIAYA (kolom K sheet TRANSAKSI) dari history.
 * MURNI: dilarang memanggil API Google apa pun.
 *
 * Keputusan yang disembunyikan modul ini (Parnas):
 *   - bukti apa saja yang dipakai menebak kategori dan seberapa besar bobotnya,
 *   - bagaimana sebuah keterangan dipecah menjadi kata,
 *   - alasan apa yang ditampilkan kepada pemilik.
 *
 * KATEGORI tidak sejalan dengan POS BIAYA: pada history pemilik, menebak dari POS saja
 * hanya benar ~50% (mis. DAILY DRIVER terbelah antara "Makanan & Minuman" dan "Belanja
 * Dapur"). Karena itu KETERANGAN - utuh maupun per kata - menjadi bukti utama, POS hanya
 * pelengkap, dan teks CAKUPAN tiap kategori menjadi cadangan untuk kata yang belum pernah
 * muncul di history.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Kata yang tidak membedakan kategori. Sengaja pendek - kata seperti "biaya" justru penanda. */
var KATEGORI_KATA_ABAIKAN = ['dan', 'di', 'ke', 'untuk', 'utk', 'yang', 'dari', 'dengan', 'buat',
  'atau', 'the', 'of', 'and', 'for', 'termasuk', 'saat'];

/** Bobot tiap jenis bukti. Ditetapkan lewat uji pada history nyata (lihat ADR-0014). */
var KATEGORI_BOBOT = { posKet: 4, ket: 3, kata: 2, pos: 1, cakupan: 1.2 };

/** Keterangan dirapikan untuk dicocokkan utuh: huruf kecil, spasi tunggal. */
function normalKet_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Pecah teks menjadi kata pembeda (unik, >= 3 huruf, bukan angka, bukan kata abaikan). */
function kataKategori_(s) {
  var out = [], ada = {};
  var bagian = normalKet_(s).split(' ');
  for (var i = 0; i < bagian.length; i++) {
    var w = bagian[i];
    if (w.length < 3 || /^\d+$/.test(w) || ada[w] || KATEGORI_KATA_ABAIKAN.indexOf(w) >= 0) continue;
    ada[w] = true; out.push(w);
  }
  return out;
}

function tambahHitung_(peta, kunci, kat) {
  var m = peta[kunci] || (peta[kunci] = {});
  m[kat] = (m[kat] || 0) + 1;
}

/**
 * Bangun model frekuensi dari history.
 * rows   = [[pos, keterangan, kategori], ...]
 * daftar = [{ nama, cakupan }] - hanya kategori di daftar ini yang dihitung, supaya nilai
 *          lama yang sudah tidak ada di dropdown tidak pernah direkomendasikan lagi.
 *
 * Kategori disimpan sebagai NOMOR URUT pada daftar, bukan namanya: model ikut disimpan di
 * cache Apps Script (batas 100 KB per entri), dan dengan nama lengkap model history pemilik
 * sudah 95 KB - nyaris penuh dan terus bertambah tiap bulan.
 */
function modelKategori_(rows, daftar) {
  var idx = {}, cak = {}, nama = [];
  for (var d = 0; d < (daftar || []).length; d++) {
    idx[daftar[d].nama] = d; nama.push(daftar[d].nama);
    var kc = kataKategori_(daftar[d].cakupan + ' ' + daftar[d].nama);
    for (var c = 0; c < kc.length; c++) tambahHitung_(cak, kc[c], d);
  }
  var m = { nama: nama, posKet: {}, ket: {}, kata: {}, pos: {}, cakupan: cak, jumlah: 0 };
  for (var i = 0; i < (rows || []).length; i++) {
    var pos = String(rows[i][0] || '').trim();
    var kat = idx[String(rows[i][2] || '').trim()];
    if (kat === undefined) continue;
    var ket = normalKet_(rows[i][1]);
    m.jumlah++;
    if (pos) tambahHitung_(m.pos, pos, kat);
    if (ket) {
      tambahHitung_(m.ket, ket, kat);
      if (pos) tambahHitung_(m.posKet, pos + '|' + ket, kat);
      var kk = kataKategori_(ket);
      for (var k = 0; k < kk.length; k++) tambahHitung_(m.kata, kk[k], kat);
    }
  }
  return m;
}

/** Jumlah seluruh hitungan pada satu peta {kategori: n}. */
function totalHitung_(peta) {
  var t = 0;
  for (var k in peta) t += peta[k];
  return t;
}

/**
 * Rekomendasi kategori untuk satu transaksi.
 * input = { pos, keterangan, merchant }. Mengembalikan maksimal 3 saran urut skor:
 *   [{ kategori, skor (0..1, relatif terhadap saran teratas), alasan }]
 *
 * Setiap bukti menyumbang P(kategori | bukti) dikali bobotnya dan dikali n/(n+1) - satu
 * kejadian saja tidak boleh mengalahkan pola yang muncul puluhan kali.
 */
function rekomendasiKategori_(model, input) {
  input = input || {};
  var skor = {}, alasan = {};
  function sumbang(peta, bobot, label) {
    if (!peta) return;
    var n = totalHitung_(peta), yakin = n / (n + 1);
    for (var kat in peta) {
      var s = bobot * (peta[kat] / n) * yakin;
      skor[kat] = (skor[kat] || 0) + s;
      if (!alasan[kat] || s > alasan[kat].s) alasan[kat] = { s: s, teks: label(peta[kat], n) };
    }
  }
  var pos = String(input.pos || '').trim();
  var ketN = normalKet_(input.keterangan);
  var ketAsli = String(input.keterangan || '').trim();

  if (pos && ketN) sumbang(model.posKet[pos + '|' + ketN], KATEGORI_BOBOT.posKet, function (c, n) {
    return c + ' dari ' + n + ' transaksi "' + ketAsli + '" di POS ini';
  });
  if (ketN) sumbang(model.ket[ketN], KATEGORI_BOBOT.ket, function (c, n) {
    return c + ' dari ' + n + ' transaksi berketerangan "' + ketAsli + '"';
  });

  var kata = kataKategori_(ketAsli + ' ' + String(input.merchant || ''));
  var dikenal = kata.filter(function (w) { return !!model.kata[w]; });
  for (var i = 0; i < dikenal.length; i++) {
    (function (w) {
      sumbang(model.kata[w], KATEGORI_BOBOT.kata / dikenal.length, function (c, n) {
        return 'kata "' + w + '" ' + c + ' dari ' + n + ' kali masuk kategori ini';
      });
    })(dikenal[i]);
  }
  if (pos) sumbang(model.pos[pos], KATEGORI_BOBOT.pos, function (c, n) {
    return c + ' dari ' + n + ' transaksi POS ' + pos;
  });
  for (var j = 0; j < kata.length; j++) {
    var cakupan = model.cakupan[kata[j]];
    if (!cakupan) continue;
    for (var kc in cakupan) {
      skor[kc] = (skor[kc] || 0) + KATEGORI_BOBOT.cakupan;
      // Alasan selalu bukti TERKUAT: cakupan bisa mengalahkan kata yang lemah di history.
      if (!alasan[kc] || KATEGORI_BOBOT.cakupan > alasan[kc].s) {
        alasan[kc] = { s: KATEGORI_BOBOT.cakupan, teks: 'kata "' + kata[j] + '" ada di cakupan kategori ini' };
      }
    }
  }

  var urut = Object.keys(skor).sort(function (a, b) { return skor[b] - skor[a]; });
  if (!urut.length) return [];
  var puncak = skor[urut[0]];
  return urut.slice(0, 3).map(function (k) {
    return { kategori: model.nama[k], skor: Math.round(skor[k] / puncak * 100) / 100,
      alasan: alasan[k].teks };
  });
}

/** Kategori harus salah satu dari daftar dropdown (aturan validasi ketat kolom K). */
function kategoriSah_(kategori, daftar) {
  var k = String(kategori || '').trim();
  for (var i = 0; i < (daftar || []).length; i++) if (daftar[i].nama === k) return true;
  return false;
}
