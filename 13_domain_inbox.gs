/**
 * DOMAIN - Mesin status baca-otomatis bukti + format metadata.
 * MURNI: tanpa API Google.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

// --- Deskripsi berkas = penyimpan metadata (berbaris). Tag: kh-md5:, kh-aistate:, kh-aits:, kh-ai:, kh-aierr:
function descGetLine_(desc, tag) {
  var lines = String(desc || '').split('\n');
  for (var i = 0; i < lines.length; i++) { if (lines[i].indexOf(tag) === 0) return lines[i].slice(tag.length); }
  return '';
}
function descSetLine_(desc, tag, val) {
  var lines = String(desc || '').split('\n').filter(function (l) { return l && l.indexOf(tag) !== 0; });
  if (val !== null && val !== undefined && val !== '') lines.push(tag + val);
  return lines.join('\n');
}
function inboxAiState_(desc) {
  if (descGetLine_(desc, 'kh-ai:')) return 'done';
  return descGetLine_(desc, 'kh-aistate:') || 'pending';
}

/**
 * Perlu dibaca OTOMATIS? Hanya untuk bukti BARU yang belum pernah dibaca.
 * Bukti yang sudah punya hasil ('done'/kh-ai) atau sudah pernah dicoba & gagal ('error')
 * TIDAK dibaca ulang — jadi menambah file baru tidak memicu pembacaan ulang yang lama.
 * (Bukti 'error' bisa dibaca ulang manual lewat "Proses terpilih".)
 */
function inboxNeedsRead_(desc) {
  if (descGetLine_(desc, 'kh-ai:')) return false;                 // sudah ada hasil
  var state = descGetLine_(desc, 'kh-aistate:');
  if (state === 'done' || state === 'error') return false;        // sudah dibaca / sudah dicoba
  if (state === 'reading') {
    var ts = Number(descGetLine_(desc, 'kh-aits:')) || 0;
    if (new Date().getTime() - ts < INBOX_READING_STALE_MS) return false; // sedang diproses
  }
  return true;   // hanya '' / 'pending' (baru) atau 'reading' yang macet
}
