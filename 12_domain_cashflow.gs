/**
 * DOMAIN - Aturan baris CASHFLOW (Setoran Owner).
 * MURNI: tanpa API Google.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Petakan Rekening (TRANSAKSI) -> opsi SUMBER DANA pada dropdown CASHFLOW. */
function mapBankCashflow_(rek) {
  var r = String(rek || '').trim().toUpperCase();
  if (!r || r === 'MAUMBI') return 'KAS TUNAI MAUMBI';
  if (CASHFLOW_SUMBER_OPTIONS.indexOf(r) >= 0) return r;
  return 'KAS TUNAI MAUMBI';
}

/** Nilai-nilai baris CASHFLOW yang akan ditulis (untuk pratinjau & penulisan). */
function buildCashflowRow_(payload) {
  return {
    subjek: 'Setoran Owner',
    keterangan: 'Setoran Owner',
    nominal: Number(payload.nominal),
    tanggal: payload.tanggal,
    outlet: 'MAUMBI',
    status: 'BELUM INPUT',
    sumberDana: mapBankCashflow_(payload.rekening)
  };
}

// ============ MEMILIH SPREADSHEET CASHFLOW PER BULAN ============
// Pemilik membuat satu spreadsheet CASHFLOW per bulan dengan judul tetap, mis.
// "CASHFLOW DAN BIAYA JULI 2026". Pemeriksaan Setoran Owner memakai spreadsheet
// bulan yang DIPERIKSA - bukan link aktif di Setelan, yang selalu menunjuk bulan berjalan.

/** Judul spreadsheet CASHFLOW untuk satu bulan, mis. "CASHFLOW DAN BIAYA JULI 2026". */
function judulCashflowBulan_(bulan, tahun) {
  return 'CASHFLOW DAN BIAYA ' + String(bulan || '').trim().toUpperCase() + ' ' +
    String(tahun || '').trim().replace(/\.0$/, '');
}

/** Bulan sesudahnya: ('DESEMBER', 2026) -> { bulan:'JANUARI', tahun:'2027' }. */
function bulanBerikut_(bulan, tahun) {
  var i = BULAN_UPPER.indexOf(String(bulan || '').trim().toUpperCase());
  var t = Number(String(tahun || '').replace(/\.0$/, ''));
  if (i < 0 || !t) return null;
  return i === 11 ? { bulan: BULAN_UPPER[0], tahun: String(t + 1) }
                  : { bulan: BULAN_UPPER[i + 1], tahun: String(t) };
}

/**
 * Tentukan spreadsheet target dari hasil pencarian judul di Drive.
 * Mengembalikan { id } ('' = pakai link aktif di Setelan) atau { galat }.
 *
 * Tidak pernah diam-diam jatuh ke link aktif untuk bulan LAMPAU: memeriksa transaksi
 * Juli terhadap CASHFLOW Oktober akan menandai semuanya "belum masuk", lalu Lengkapi
 * menulis Setoran Owner Juli ke spreadsheet Oktober. Link aktif hanya dipakai untuk
 * bulan berjalan, yang memang ditunjuknya.
 */
function pilihCashflow_(daftarId, judul, bulanBerjalan) {
  var n = (daftarId || []).length;
  if (n === 1) return { id: daftarId[0] };
  if (n > 1) return { galat: 'Ada ' + n + ' spreadsheet berjudul persis "' + judul +
    '" di Drive. Ganti nama yang tidak dipakai supaya Setoran Owner tidak tertulis ke spreadsheet yang salah.' };
  if (bulanBerjalan) return { id: '' };
  return { galat: 'Spreadsheet "' + judul + '" tidak ditemukan di Drive. Pastikan judulnya persis seperti itu.' };
}

/**
 * Baris CASHFLOW yang merupakan Setoran Owner. SUBJEK (A) ATAU KETERANGAN (B) diperiksa:
 * baris tulisan dashboard mengisi keduanya, tetapi baris yang diketik pemilik sendiri bisa
 * saja hanya menyebutnya di salah satu kolom. Melewatkannya berarti dianggap "belum masuk"
 * dan Lengkapi menulis GANDA - kesalahan yang jauh lebih buruk daripada sebaliknya.
 */
function barisSetoranOwner_(subjek, keterangan) {
  var s = (String(subjek || '') + ' ' + String(keterangan || '')).toLowerCase();
  return s.indexOf('setoran owner') >= 0;
}
