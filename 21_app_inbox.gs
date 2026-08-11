/**
 * APPLICATION - Use case penyimpanan sementara bukti (inbox).
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/**
 * Simpan satu gambar ke folder penyimpanan sementara.
 * Bila isi gambar SAMA dengan bukti yang sudah ada (deteksi duplikat via hash MD5) dan
 * allowDuplicate != true, file TIDAK dibuat dan dikembalikan { duplicate:true, of:{...} }.
 */
function uploadInbox(dataUrl, name, pin, allowDuplicate) {
  verifyPin_(pin);
  var img = parseDataUrl_(dataUrl);
  var bytes = Utilities.base64Decode(img.data);
  var hash = inboxHashHex_(bytes);

  if (!allowDuplicate) {
    var dup = findInboxDuplicate_(bytes.length, hash);
    if (dup) return { duplicate: true, of: dup };
  }

  var ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[img.mediaType] || 'png';
  var base = String(name || '').replace(/\.[a-zA-Z0-9]+$/, '').replace(/[\\\/:*?"<>|]/g, '-').trim();
  if (!base) base = 'bukti';
  var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmmss');
  var blob = Utilities.newBlob(bytes, img.mediaType, base + '_' + stamp + '.' + ext);
  var file = getInboxFolder_().createFile(blob);
  // Simpan sidik jari (deteksi duplikat) + tandai "pending" agar dibaca otomatis di latar.
  var desc = descSetLine_('', 'kh-md5:', hash);
  desc = descSetLine_(desc, 'kh-aistate:', 'pending');
  file.setDescription(desc);
  return { id: file.getId(), name: file.getName(), duplicate: false };
}

/**
 * Baca isi SATU bukti dengan Claude lalu simpan hasilnya di deskripsi berkas.
 * Mengembalikan objek hasil baca (sama seperti analyzeImage). Menyimpan status bila gagal.
 */
function inboxReadOne_(file) {
  if (!inboxStoredHash_(file)) {
    try { inboxSetHash_(file, inboxHashHex_(file.getBlob().getBytes())); } catch (e) {}
  }
  inboxMarkReading_(file);
  try {
    var b = inboxImageBlob_(file);
    var mt = b.getContentType(); if (mt === 'image/jpg') mt = 'image/jpeg';
    if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].indexOf(mt) === -1) {
      throw new Error('Tipe gambar tidak didukung: ' + mt);
    }
    var data = analyzeImg_({ mediaType: mt, data: Utilities.base64Encode(b.getBytes()) });
    inboxSaveAi_(file, data);
    return data;
  } catch (e) {
    inboxMarkError_(file, e && e.message || e);
    throw e;
  }
}

/** Baca hingga `max` bukti yang belum terbaca. Dipakai trigger latar & "baca sekarang". */
function autoReadInboxBatch_(max) {
  var it = getInboxFolder_().getFiles();
  var done = 0;
  while (it.hasNext() && done < max) {
    var f = it.next();
    if ((f.getMimeType() || '').indexOf('image/') !== 0) continue;
    if (!inboxNeedsRead_(f.getDescription())) continue;
    try { inboxReadOne_(f); } catch (e) {}
    done++;
  }
  return done;
}

/** Dipanggil klien setelah upload (fire-and-forget): mulai baca bukti yang masih pending. */
function readInboxNow(pin) {
  verifyPin_(pin);
  return { dibaca: autoReadInboxBatch_(INBOX_READNOW_MAX) };
}

/** Baca satu berkas sekarang bila belum terbaca (dipanggil klien). */
function readInboxFileNow(fileId, pin) {
  verifyPin_(pin);
  var file = getInboxFile_(fileId);
  if (inboxGetAi_(file)) return { done: true, cached: true };
  try { inboxReadOne_(file); return { done: true }; }
  catch (e) { return { done: false, error: String(e && e.message || e) }; }
}

/**
 * Baca bukti dari folder penyimpanan. Bila sudah pernah dibaca di latar belakang,
 * langsung kembalikan hasil yang tersimpan (tanpa memanggil Claude lagi). Bila belum,
 * baca sekarang lalu simpan hasilnya.
 */
function analyzeInboxFile(fileId, pin) {
  verifyPin_(pin);
  var f = getInboxFile_(fileId);
  var cached = inboxGetAi_(f);
  if (cached) return cached;          // hasil sudah ada -> instan
  return inboxReadOne_(f);            // belum -> baca sekarang & simpan
}

/**
 * Cari bukti dengan isi identik. Pra-saring cepat berdasarkan UKURAN byte yang sama,
 * lalu bandingkan hash. Berkas lama yang belum punya sidik jari akan dihitung & disimpan
 * sekali (backfill) supaya cek berikutnya cepat. Mengembalikan {id,name,date} atau null.
 */
function findInboxDuplicate_(size, hash) {
  var it = getInboxFolder_().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var mt = f.getMimeType() || '';
    if (mt.indexOf('image/') !== 0) continue;
    if (f.getSize() !== size) continue;   // hanya berkas berukuran sama yang mungkin duplikat
    var h = inboxStoredHash_(f);
    if (!h) {
      try { h = inboxHashHex_(f.getBlob().getBytes()); inboxSetHash_(f, h); }
      catch (e) { continue; }
    }
    if (h === hash) {
      return { id: f.getId(), name: f.getName(),
        date: Utilities.formatDate(f.getDateCreated(), TIMEZONE, 'd MMM yyyy HH:mm') };
    }
  }
  return null;
}

/**
 * Daftar SELURUH bukti pada folder penyimpanan (terbaru dulu). Thumbnail hanya dibuat
 * untuk sebagian teratas supaya daftar cepat tampil; sisanya diminta bertahap oleh klien
 * lewat getInboxThumbs(). 'truncated' true bila jumlah berkas melampaui batas pengaman.
 */
function listInbox(pin) {
  verifyPin_(pin);
  var it = getInboxFolder_().getFiles();
  var out = [], byId = {}, truncated = false;
  while (it.hasNext()) {
    if (out.length >= INBOX_MAX_LIST) { truncated = true; break; }
    var f = it.next();
    var mt = f.getMimeType() || '';
    if (mt.indexOf('image/') !== 0) continue;   // hanya gambar
    var created = f.getDateCreated();
    byId[f.getId()] = f;
    out.push({
      id: f.getId(), name: f.getName(), mime: mt, size: f.getSize(),
      date: Utilities.formatDate(created, TIMEZONE, 'd MMM yyyy HH:mm'),
      ts: created.getTime(), thumb: '',
      aiState: inboxAiState_(f.getDescription())   // done | reading | pending | error
    });
  }
  out.sort(function (a, b) { return b.ts - a.ts; });
  // Thumbnail hanya untuk sebagian teratas supaya pemuatan tetap cepat.
  for (var i = 0; i < out.length && i < INBOX_THUMB_MAX; i++) {
    out[i].thumb = inboxThumb_(byId[out[i].id], out[i].size);
  }
  // Hanya hitung yang MASIH akan dibaca (pending/reading) — bukan 'error' —
  // supaya auto-refresh berhenti bila tak ada lagi yang sedang diproses.
  var belum = out.filter(function (o) { return o.aiState === 'pending' || o.aiState === 'reading'; }).length;
  return {
    folderUrl: 'https://drive.google.com/drive/folders/' + INBOX_FOLDER_ID,
    items: out, truncated: truncated, batas: INBOX_MAX_LIST, belumTerbaca: belum
  };
}

/** Thumbnail susulan untuk sekelompok bukti (dipanggil bertahap oleh klien). */
function getInboxThumbs(fileIds, pin) {
  verifyPin_(pin);
  var ids = [].concat(fileIds || []);
  var out = {};
  for (var i = 0; i < ids.length && i < INBOX_THUMB_BATCH; i++) {
    try {
      var f = getInboxFile_(ids[i]);
      out[ids[i]] = inboxThumb_(f, f.getSize());
    } catch (e) { out[ids[i]] = ''; }
  }
  return out;
}

/** Hapus (ke Sampah Drive) satu atau beberapa bukti dari folder penyimpanan. */
function deleteInbox(fileIds, pin) {
  verifyPin_(pin);
  var ids = [].concat(fileIds || []);
  var ok = 0, err = [];
  for (var i = 0; i < ids.length; i++) {
    try { getInboxFile_(ids[i]).setTrashed(true); ok++; }
    catch (e) { err.push(String(e && e.message || e)); }
  }
  return { ok: ok, gagal: err.length, pesan: err.join('; ') };
}

/** Hapus bukti tanpa menggagalkan proses pemanggil (dipakai setelah transaksi tersimpan). */
function trashInboxQuiet_(fileId) {
  try { getInboxFile_(fileId).setTrashed(true); return true; }
  catch (e) { return false; }
}

/** Gambar penuh satu bukti (untuk pratinjau di form tinjau). */
function getInboxImage(fileId, pin) {
  verifyPin_(pin);
  var f = getInboxFile_(fileId);
  var b = inboxImageBlob_(f);
  return { id: fileId, name: f.getName(),
    dataUrl: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) };
}
