/**
 * SHARED - utilitas platform murni (tanggal, uang, encoding).
 * TANPA aturan bisnis. Boleh memakai Utilities (runtime), bukan vendor bisnis.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/**
 * Bangun objek Date untuk tanggal (YYYY-MM-DD) sebagai tengah malam pada ZONA WAKTU
 * SPREADSHEET, supaya tanggal yang tersimpan tidak bergeser akibat beda zona waktu
 * antara project Apps Script dan spreadsheet.
 */
function parseIsoDate_(iso, tz) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return new Date();
  var date = iso.slice(0, 10);
  if (tz) {
    try { return Utilities.parseDate(date, tz, 'yyyy-MM-dd'); } catch (e) {}
  }
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format teks tanggal Indonesia langsung dari ISO (tanpa objek Date, bebas masalah zona waktu). */
function formatTanggalIdFromIso_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  return Number(m[3]) + ' ' + BULAN_TITLE[Number(m[2]) - 1] + ' ' + m[1];
}

function formatRupiah_(n) {
  n = Math.round(Number(n) || 0);
  var s = String(Math.abs(n)), out = '';
  while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
  out = s + out;
  return 'Rp' + (n < 0 ? '-' : '') + out;
}


/** Ubah nilai sel TANGGAL (Date atau teks "14 Juni 2026"/"14 Jun 2026"/ISO) menjadi yyyy-MM-dd. */
function parseTanggalCell_(val, tz) {
  if (val instanceof Date) return Utilities.formatDate(val, tz, 'yyyy-MM-dd');
  var s = String(val || '').trim();
  if (!s) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  // "14 Juni 2026" atau "14 Jun 2026"
  m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (m) {
    var nama = m[2].toLowerCase();
    for (var i = 0; i < BULAN_TITLE.length; i++) {
      var full = BULAN_TITLE[i].toLowerCase();
      if (nama === full || nama === full.slice(0, 3)) {
        return m[3] + '-' + ('0' + (i + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      }
    }
  }
  return '';
}

function parseDataUrl_(dataUrl) {
  var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw new Error('Format gambar tidak dikenali.');
  var mediaType = m[1];
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].indexOf(mediaType) === -1) {
    throw new Error('Tipe gambar tidak didukung: ' + mediaType);
  }
  return { mediaType: mediaType, data: m[2] };
}

function toNum_(x) {
  if (typeof x === 'number') return x;
  if (x === '' || x == null) return 0;
  var n = parseFloat(String(x).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function topKey_(obj) {
  var best = '', bc = -1;
  for (var k in obj) { if (obj[k] > bc) { bc = obj[k]; best = k; } }
  return best;
}

function extractSpreadsheetId_(url) {
  var s = String(url || '').trim();
  var m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  throw new Error('Link spreadsheet tidak valid.');
}

/** Hash MD5 (hex) dari byte gambar — sidik jari isi berkas. */
function inboxHashHex_(bytes) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes);
  var s = '';
  for (var i = 0; i < raw.length; i++) {
    var b = (raw[i] + 256) % 256;
    s += (b < 16 ? '0' : '') + b.toString(16);
  }
  return s;
}
