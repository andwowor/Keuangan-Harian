/**
 * ADAPTER OUTBOUND - Script Properties (PIN & setelan rahasia).
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Cek PIN untuk gate UI. True bila cocok ATAU bila APP_PIN belum diset (tanpa gate). */
function checkPin(pin) {
  var p = PropertiesService.getScriptProperties().getProperty('APP_PIN');
  if (!p) return true;
  return String(pin) === String(p);
}

/** Lempar error bila PIN tidak valid (dipakai pada fungsi mahal/menulis). */
function verifyPin_(pin) {
  var p = PropertiesService.getScriptProperties().getProperty('APP_PIN');
  if (p && String(pin) !== String(p)) throw new Error('PIN salah / akses ditolak.');
}
