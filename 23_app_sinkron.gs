/**
 * APPLICATION - Use case: tarik kode terbaru dari GitHub ke proyek Apps Script ini.
 *
 * Pemilik tidak lagi menyalin berkas satu per satu. DEPLOY tetap di tangan pemilik:
 * fungsi ini hanya mengganti ISI proyek, tidak pernah membuat deployment baru, sehingga
 * aplikasi yang sedang dipakai orang lain tidak berubah sampai pemilik menekan Deploy.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/**
 * Bandingkan (dan opsional terapkan) kode GitHub ke proyek ini.
 * `terapkan` = false -> hanya melihat apa yang akan berubah (tidak menulis apa pun).
 */
function sinkronDariGitHub(terapkan, pin) {
  verifyPin_(pin);

  var manifest = githubManifest_();                       // adapter GitHub
  var dikelola = berkasDikelola_(manifest.berkas);        // aturan domain
  if (!dikelola.length) throw new Error('Manifest tidak memuat berkas kode yang dikenali.');

  var baru = [];
  for (var i = 0; i < dikelola.length; i++) {
    baru.push({ name: dikelola[i].nama, type: dikelola[i].tipe,
      source: githubAmbilTeks_(dikelola[i].path) });
  }

  // Isi datang dari internet: tolak sebelum menimpa bila ada yang mencurigakan.
  var galat = periksaBerkasSinkron_(baru, manifest.versi);
  if (galat.length) throw new Error('Dibatalkan, isi dari GitHub tidak lolos pemeriksaan:\n- ' +
    galat.join('\n- '));

  var lama = scriptBacaKonten_();                          // adapter Apps Script API
  var ringkas = ringkasSinkron_(lama, baru);               // aturan domain
  ringkas.versi = manifest.versi;
  ringkas.cabang = GITHUB_BRANCH;
  ringkas.diterapkan = false;

  if (!terapkan || !ringkas.adaPerubahan) return ringkas;

  // Titik pulih dibuat SEBELUM menimpa. Bila ini gagal, sinkron dibatalkan - lebih baik
  // tidak jadi memperbarui daripada memperbarui tanpa jalan kembali.
  ringkas.versiCadangan = scriptBuatVersi_(
    'Sebelum sinkron ' + Utilities.formatDate(new Date(), TIMEZONE, 'd MMM yyyy HH:mm') +
    ' (ke ' + manifest.versi + ')', lama);

  var gabung = gabungKonten_(lama, baru);                  // aturan domain
  scriptTulisKonten_(gabung.files);                        // adapter Apps Script API
  ringkas.dipertahankan = gabung.dipertahankan;
  ringkas.diterapkan = true;
  ringkas.waktu = Utilities.formatDate(new Date(), TIMEZONE, 'd MMMM yyyy HH:mm');
  return ringkas;
}

/**
 * Versi untuk dijalankan LANGSUNG DARI EDITOR (dropdown fungsi > Run).
 *
 * Ada supaya sinkron tidak pernah terkunci oleh telur-dan-ayam: tombol di menu Setelan
 * berjalan pada versi web app yang TER-DEPLOY, sehingga selama deployment masih lama,
 * tombol itu ikut memakai kode lama. Dari editor selalu kode terbaru yang dipakai.
 *
 * Tanpa PIN dengan sengaja: PIN menjaga web app publik yang anonim, sedangkan menjalankan
 * fungsi dari editor sudah menuntut hak edit penuh atas proyek ini - PIN tidak menambah
 * pengamanan apa pun di sana.
 */
function sinkronSekarang() {
  var r = sinkronDariGitHub(true, PropertiesService.getScriptProperties().getProperty('APP_PIN'));
  var out = ['Cabang : ' + r.cabang, 'Versi  : ' + r.versi];
  if (!r.adaPerubahan) { out.push('', 'Kode proyek sudah sama dengan GitHub.'); }
  else {
    out.push('', 'Berubah  (' + r.diubah.length + '): ' + r.diubah.join(', '));
    out.push('Baru     (' + r.ditambah.length + '): ' + r.ditambah.join(', '));
    out.push('Sudah sama (' + r.sama.length + ')');
    if (r.dipertahankan && r.dipertahankan.length) {
      out.push('Dipertahankan (bukan dari repo): ' + r.dipertahankan.join(', '));
    }
    out.push('', 'Titik pulih: ' + r.versiCadangan);
    out.push('SELESAI ' + r.waktu + ' — sekarang Deploy > Manage deployments > New version.');
  }
  var pesan = out.join('\n');
  Logger.log(pesan);
  return pesan;
}
