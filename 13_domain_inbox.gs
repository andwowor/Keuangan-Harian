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
 * Perlu dibaca OTOMATIS? Untuk bukti BARU yang belum pernah dibaca, dan untuk bukti yang
 * GAGAL karena sebab di luar buktinya (akun API ditolak, gangguan sementara) setelah jedanya
 * lewat. Bukti yang sudah punya hasil tidak dibaca ulang - jadi menambah file baru tidak
 * memicu pembacaan ulang yang lama.
 *
 * Gagal karena BUKTINYA sendiri (tipe gambar, gambar tak terbaca) tidak dicoba ulang otomatis:
 * hasilnya tidak akan berubah. Bukti itu tetap bisa dibaca ulang manual lewat "Proses terpilih".
 * `now` opsional (ms) - untuk pengujian.
 */
function inboxNeedsRead_(desc, now) {
  now = now || new Date().getTime();
  if (descGetLine_(desc, 'kh-ai:')) return false;                 // sudah ada hasil
  var state = descGetLine_(desc, 'kh-aistate:');
  if (state === 'done') return false;
  if (state === 'error') {
    if (jenisGalatBaca_(descGetLine_(desc, 'kh-aierr:')) === 'berkas') return false;
    var tsGagal = Number(descGetLine_(desc, 'kh-aierrts:')) || 0;   // galat lama tanpa waktu -> segera
    return now - tsGagal >= jedaCobaUlang_(descGetLine_(desc, 'kh-aicoba:'));
  }
  if (state === 'reading') {
    var ts = Number(descGetLine_(desc, 'kh-aits:')) || 0;
    if (now - ts < INBOX_READING_STALE_MS) return false;          // sedang diproses
  }
  return true;   // '' / 'pending' (baru) atau 'reading' yang macet
}

/**
 * Golongkan galat pembacaan bukti:
 *   'akun'      - akun/kunci API Anthropic menolak (401, 403, organisasi diblokir, saldo/batas
 *                 pemakaian habis, kunci belum diset). Bukan salah buktinya.
 *   'sementara' - gangguan sesaat (429, 5xx, 529 overloaded, batas waktu, jaringan).
 *   'berkas'    - masalah pada bukti itu sendiri; mencoba ulang tidak akan mengubah hasil.
 * Galat yang tidak dikenali dianggap 'berkas' supaya tidak memanggil API tanpa henti.
 */
function jenisGalatBaca_(pesan) {
  var p = String(pesan || '').toLowerCase();
  if (/api error (401|403)\b|permission_error|authentication_error|organization|credit balance|usage limit|billing|anthropic_api_key belum diset/.test(p)) return 'akun';
  if (/api error (408|409|429|5\d\d)\b|overloaded|rate_limit|timed? ?out|timeout|address unavailable|dns error|bandwidth quota|service invoked too many/.test(p)) return 'sementara';
  return 'berkas';
}

/** Jeda sebelum mencoba ulang setelah kegagalan ke-n: 15 mnt, 30 mnt, 1 j, ... maks 12 j. */
function jedaCobaUlang_(coba) {
  var n = Math.max(1, Number(coba) || 1);
  return Math.min(INBOX_JEDA_MAKS_MS, INBOX_JEDA_AWAL_MS * Math.pow(2, n - 1));
}

/** Penjelasan galat untuk pemilik, dalam bahasa sehari-hari. */
function ringkasGalatBaca_(pesan) {
  var jenis = jenisGalatBaca_(pesan);
  // Singkat: penjelasan lengkap & langkah perbaikannya tampil SEKALI di atas daftar,
  // tidak diulang di setiap bukti.
  if (jenis === 'akun') return 'Ditolak akun API Claude — bukan karena buktinya.';
  if (jenis === 'sementara') return 'Gangguan sementara di layanan Claude. Dibaca ulang otomatis.';
  return String(pesan || 'Gagal dibaca.').slice(0, 160);
}
