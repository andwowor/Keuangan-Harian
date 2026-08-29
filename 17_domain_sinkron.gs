/**
 * DOMAIN - Aturan sinkronisasi kode dari repositori ke proyek Apps Script.
 * MURNI: dilarang memanggil API Google/jaringan apa pun.
 *
 * Keputusan yang disembunyikan modul ini (Parnas):
 *   - berkas mana yang termasuk "kode aplikasi" dan bagaimana namanya di proyek,
 *   - apa syarat MINIMAL sebelum isi dari internet boleh menimpa kode yang sedang jalan,
 *   - berkas proyek yang bukan milik repositori diapakan.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Jenis berkas Apps Script dari nama berkas repositori. '' bila tidak dikelola. */
function tipeBerkasScript_(nama) {
  var n = String(nama || '');
  if (n === 'appsscript.json') return 'JSON';        // hanya manifest, bukan JSON lain
  if (/\.gs$/i.test(n)) return 'SERVER_JS';
  if (/\.html$/i.test(n)) return 'HTML';
  return '';
}

/** Nama berkas di dalam proyek Apps Script (tanpa ekstensi). */
function namaProyek_(nama) {
  return String(nama || '').replace(/\.(gs|html|json)$/i, '');
}

/**
 * Saring daftar nama berkas repositori menjadi berkas yang akan disinkronkan.
 * Berkas di dalam subfolder (mengandung '/') diabaikan - proyek Apps Script datar,
 * dan isi docs/ memang bukan kode aplikasi.
 */
function berkasDikelola_(daftarNama) {
  var out = [];
  for (var i = 0; i < (daftarNama || []).length; i++) {
    var n = String(daftarNama[i] || '').trim();
    if (!n || n.indexOf('/') >= 0) continue;
    var t = tipeBerkasScript_(n);
    if (!t) continue;
    out.push({ path: n, nama: namaProyek_(n), tipe: t });
  }
  return out;
}

/**
 * Pemeriksaan WAJIB sebelum menimpa kode yang sedang berjalan. Mengembalikan daftar
 * alasan penolakan (kosong = lolos).
 *
 * Isi diambil dari internet, jadi kegagalan yang paling mungkin bukan "kode salah"
 * melainkan "yang terunduh bukan kode sama sekali" - halaman 404, respons kosong, atau
 * berkas terpotong. Tiga hal itu yang diperiksa di sini; benar-salahnya logika bukan
 * urusan modul ini.
 *
 * berkas = [{ name, type, source }], versiManifest = nilai VERSI_APP yang dijanjikan.
 */
function periksaBerkasSinkron_(berkas, versiManifest) {
  var galat = [], adaManifest = false, adaConfig = false;
  for (var i = 0; i < (berkas || []).length; i++) {
    var b = berkas[i];
    var isi = String(b.source || '');
    if (!isi.trim()) { galat.push(b.name + ': isinya kosong'); continue; }
    if (/^404: Not Found/.test(isi.trim())) { galat.push(b.name + ': tidak ada di repositori'); continue; }
    if (b.name === 'appsscript') {
      adaManifest = true;
      try { JSON.parse(isi); } catch (e) { galat.push('appsscript.json bukan JSON yang sah'); }
    }
    if (b.name === '00_config') {
      adaConfig = true;
      var v = cariVersiApp_(isi);
      if (!v) galat.push('00_config: VERSI_APP tidak ditemukan');
      else if (versiManifest && v !== versiManifest) {
        galat.push('versi tidak cocok: manifest "' + versiManifest + '" vs 00_config "' + v + '"');
      }
    }
  }
  if (!adaManifest) galat.push('appsscript.json tidak ikut terunduh');
  if (!adaConfig) galat.push('00_config.gs tidak ikut terunduh');
  return galat;
}

/** Ambil nilai VERSI_APP dari sumber 00_config. '' bila tidak ada. */
function cariVersiApp_(isi) {
  var m = /var\s+VERSI_APP\s*=\s*['"]([^'"]+)['"]/.exec(String(isi || ''));
  return m ? m[1] : '';
}

/**
 * Gabungkan isi proyek LAMA dengan berkas BARU dari repositori.
 * Berkas proyek yang TIDAK ada di repositori DIPERTAHANKAN, tidak dihapus - proyek bisa
 * saja memuat berkas buatan pemilik sendiri, dan menghapusnya diam-diam jauh lebih
 * merugikan daripada menyisakan berkas usang.
 */
function gabungKonten_(lama, baru) {
  var peta = {}, hasil = [];
  for (var i = 0; i < (baru || []).length; i++) {
    peta[baru[i].name] = true;
    hasil.push(baru[i]);
  }
  var dipertahankan = [];
  for (var j = 0; j < (lama || []).length; j++) {
    if (peta[lama[j].name]) continue;
    hasil.push(lama[j]);
    dipertahankan.push(lama[j].name);
  }
  return { files: hasil, dipertahankan: dipertahankan };
}

/** Ringkasan perubahan: mana yang baru, berubah, atau sudah sama. */
function ringkasSinkron_(lama, baru) {
  var petaLama = {};
  for (var i = 0; i < (lama || []).length; i++) petaLama[lama[i].name] = String(lama[i].source || '');
  var ditambah = [], diubah = [], sama = [];
  for (var j = 0; j < (baru || []).length; j++) {
    var b = baru[j];
    if (!(b.name in petaLama)) ditambah.push(b.name);
    else if (petaLama[b.name] !== String(b.source || '')) diubah.push(b.name);
    else sama.push(b.name);
  }
  return { ditambah: ditambah, diubah: diubah, sama: sama,
    adaPerubahan: !!(ditambah.length || diubah.length) };
}
