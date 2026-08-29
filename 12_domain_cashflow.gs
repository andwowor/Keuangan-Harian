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
