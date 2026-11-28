/**
 * APPLICATION - Use case PENGGANTIAN: tandai transaksi, catat penggantian yang masuk.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/ (ADR-0015).
 */

/** Ringkasan penggantian dari satu baris A..O; null bila tidak ditandai. */
function ringkasBarisPenggantian_(v) {
  var status = statusPenggantian_(v[KOLOM_PENGGANTIAN - 1]);                       // aturan domain
  if (!status) return null;
  var rincian = bacaRincianPenggantian_(v[KOLOM_RINCIAN_PENGGANTIAN - 1]);
  var awal = String(v[KOLOM_NOMINAL_AWAL - 1]) !== '' ? angkaRupiah_(v[KOLOM_NOMINAL_AWAL - 1])
    : angkaRupiah_(v[2]);
  var total = totalPenggantian_(rincian);
  return { status: status, awal: awal, total: total, bersih: awal - total, jumlah: rincian.length };
}

/** Nomor baris harus berada di blok data TRANSAKSI. */
function barisTransaksiSah_(row) {
  row = Number(row);
  var batas = sheetsBatasTransaksi_();                                             // adapter Sheets
  if (!(row > batas.hdr && row <= batas.last)) throw new Error('Baris transaksi tidak valid.');
  return row;
}

/** Data penggantian satu transaksi, untuk jendela Penggantian di Riwayat Biaya. */
function getPenggantian(row, pin) {
  verifyPin_(pin);
  row = barisTransaksiSah_(row);
  var b = sheetsBacaBarisPenuh_(row), v = b.values;                                // adapter Sheets
  var ring = ringkasBarisPenggantian_(v);
  if (!ring) throw new Error('Transaksi ini tidak ditandai penggantian.');
  ring.row = row;
  ring.pos = String(v[0]).trim();
  ring.ket = String(v[1]).trim();
  ring.tgl = parseTanggalCell_(v[3], b.tz);
  ring.sumber = String(v[6]).trim();
  ring.rincian = bacaRincianPenggantian_(v[KOLOM_RINCIAN_PENGGANTIAN - 1]);
  return ring;
}

/**
 * Simpan SELURUH daftar penggantian satu transaksi (menggantikan daftar lama), lalu hitung
 * ulang NOMINAL = NOMINAL AWAL - total. `selesai` = tidak ada lagi penggantian yang ditunggu.
 * daftar = [{ tanggal:'yyyy-MM-dd', nominal }].
 */
function simpanPenggantian(row, daftar, selesai, pin) {
  verifyPin_(pin);
  row = barisTransaksiSah_(row);
  var b = sheetsBacaBarisPenuh_(row);
  if (!statusPenggantian_(b.values[KOLOM_PENGGANTIAN - 1])) {
    throw new Error('Transaksi ini tidak ditandai penggantian.');
  }
  // Ditandai langsung di sheet tanpa NOMINAL AWAL: lengkapi dulu dari NOMINAL saat ini.
  if (String(b.values[KOLOM_NOMINAL_AWAL - 1]) === '') {
    sheetsTandaiPenggantian_(row);
    b = sheetsBacaBarisPenuh_(row);
  }
  var bersih = (daftar || []).map(function (p) {
    return { tanggal: String(p.tanggal || '').slice(0, 10), nominal: Math.round(Number(p.nominal) || 0) };
  });
  var awalNilai = b.values[KOLOM_NOMINAL_AWAL - 1], awalFormula = b.formulas[KOLOM_NOMINAL_AWAL - 1];
  validasiPenggantian_(bersih, angkaRupiah_(awalNilai));                          // aturan domain
  var total = totalPenggantian_(bersih);
  sheetsTulisPenggantian_(row, selesai ? PENGGANTIAN_SELESAI : PENGGANTIAN_MENUNGGU, total,
    tulisRincianPenggantian_(bersih), isiNominalBersih_(awalNilai, awalFormula, total));
  lupakanCacheHistory_();
  return getPenggantian(row, pin);
}
