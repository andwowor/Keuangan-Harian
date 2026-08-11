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
