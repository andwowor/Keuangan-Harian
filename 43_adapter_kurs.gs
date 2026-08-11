/**
 * ADAPTER OUTBOUND - Kurs mata uang (Frankfurter/ECB).
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Kurs 1 unit `currency` -> IDR pada tanggal (sumber: Frankfurter/ECB), di-cache 6 jam. */
function getFxRate_(currency, isoDate) {
  var date = /^\d{4}-\d{2}-\d{2}/.test(isoDate || '')
    ? isoDate.slice(0, 10)
    : Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var key = 'fx_' + currency + '_' + date;
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var url = 'https://api.frankfurter.app/' + date + '?from=' + encodeURIComponent(currency) + '&to=IDR';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Gagal mengambil kurs ' + currency + '->IDR untuk ' + date);
  }
  var j = JSON.parse(resp.getContentText());
  if (!j.rates || !j.rates.IDR) {
    throw new Error('Kurs ' + currency + '->IDR tidak tersedia untuk ' + date);
  }
  var out = { rate: j.rates.IDR, date: j.date || date };
  cache.put(key, JSON.stringify(out), 21600);
  return out;
}
