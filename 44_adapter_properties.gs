/**
 * ADAPTER OUTBOUND - Script Properties (PIN & setelan rahasia) + CacheService.
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

// ====================== PENYIMPANAN JSON (Script Properties) ======================
// Dibungkus di sini supaya application tidak memanggil PropertiesService langsung
// (aturan dependensi Sec. 5.1: vendor hanya di adapter). Dipakai untuk hasil yang harus
// bertahan lebih lama daripada cache, mis. analisa biaya harian.

/** Ambil objek JSON dari Script Property; null bila kosong atau isinya rusak. */
function propAmbilJson_(kunci) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(kunci);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

/** Simpan objek sebagai JSON ke Script Property. */
function propSimpanJson_(kunci, nilai) {
  PropertiesService.getScriptProperties().setProperty(kunci, JSON.stringify(nilai));
}

/** Hapus satu Script Property. */
function propHapus_(kunci) {
  try { PropertiesService.getScriptProperties().deleteProperty(kunci); } catch (e) {}
}
