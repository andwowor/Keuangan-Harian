/**
 * ADAPTER INBOUND - Trigger terjadwal (baca bukti otomatis di latar belakang).
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Target TRIGGER waktu: dibaca otomatis di latar belakang (jalan walau dashboard ditutup). */
function autoReadInbox() { return autoReadInboxBatch_(INBOX_AUTOREAD_PER_RUN); }

// --- Trigger baca-otomatis: pasang / lepas / status ---
function setupAutoRead(pin) {
  verifyPin_(pin);
  disableAutoRead_();
  ScriptApp.newTrigger(AUTOREAD_HANDLER).timeBased().everyMinutes(5).create();
  return autoReadStatus(pin);
}
function disableAutoRead(pin) { verifyPin_(pin); disableAutoRead_(); return autoReadStatus(pin); }
function disableAutoRead_() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === AUTOREAD_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
}
function autoReadStatus(pin) {
  verifyPin_(pin);
  var ts = ScriptApp.getProjectTriggers(), aktif = false;
  for (var i = 0; i < ts.length; i++) { if (ts[i].getHandlerFunction() === AUTOREAD_HANDLER) aktif = true; }
  return { aktif: aktif };
}

// ====================== REVIEW BIAYA HARIAN (23.59 WITA) ======================
// Analisa penggunaan biaya diperbarui SEKALI SEHARI, bukan setiap kali menu Budget dibuka.
// Alasannya dua: hemat panggilan model, dan narasi yang stabil sepanjang hari lebih mudah
// dijadikan pegangan daripada teks yang berubah tiap kali layar dimuat.

/** Target TRIGGER harian. Nama fungsi ini dirujuk REVIEW_HANDLER di 00_config.gs. */
function reviewHarianJalan() { return perbaruiReviewHarian_(); }

/**
 * Pasang trigger harian pukul REVIEW_JAM:REVIEW_MENIT waktu TIMEZONE.
 * Apps Script menjalankan trigger harian dalam jendela +-15 menit dari jam yang diminta -
 * jadi anggap "sekitar 23.59", bukan tepat detik ke-0.
 */
function setupReviewHarian(pin) {
  verifyPin_(pin);
  disableReviewHarian_();
  ScriptApp.newTrigger(REVIEW_HANDLER).timeBased()
    .atHour(REVIEW_JAM).nearMinute(REVIEW_MENIT).everyDays(1)
    .inTimezone(TIMEZONE).create();
  return reviewHarianStatus(pin);
}

function disableReviewHarian(pin) { verifyPin_(pin); disableReviewHarian_(); return reviewHarianStatus(pin); }

function disableReviewHarian_() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === REVIEW_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
}

function reviewHarianStatus(pin) {
  verifyPin_(pin);
  var ts = ScriptApp.getProjectTriggers(), aktif = false;
  for (var i = 0; i < ts.length; i++) { if (ts[i].getHandlerFunction() === REVIEW_HANDLER) aktif = true; }
  return { aktif: aktif, jam: ('0' + REVIEW_JAM).slice(-2) + '.' + ('0' + REVIEW_MENIT).slice(-2),
    zona: TIMEZONE };
}
