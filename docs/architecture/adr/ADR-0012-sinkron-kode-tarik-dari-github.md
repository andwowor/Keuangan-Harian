# ADR-0012: Kode ditarik proyek Apps Script sendiri dari GitHub
Tanggal   : 2026-08-29
Status    : Accepted

## Konteks
Setiap perubahan harus disalin-tempel manual ke editor Apps Script, berkas demi berkas.
Ini sudah beberapa kali menimbulkan kerusakan nyata, bukan sekadar merepotkan:

- `posDariGrid_ is not defined` — satu modul tertinggal versi lama;
- dashboard "tidak merespon" — isi `Index` ternyata shell PWA, bukan dasbor;
- `LULUS semua 153 test domain` padahal seharusnya 172 — dua berkas belum tersalin.

Pemilik meminta agar perubahan di GitHub langsung masuk ke Apps Script, **dengan deploy
tetap di tangannya**.

## Alternatif yang ditolak
**clasp + GitHub Actions** (cara paling umum). Ditolak karena mengharuskan menyimpan
**refresh token OAuth Google** sebagai secret di repositori yang **publik** (repo ini
publik karena GitHub Pages menyajikan shell PWA). Secret GitHub memang tidak terbaca oleh
PR dari fork, tetapi token itu memberi akses ke seluruh proyek Apps Script pemilik, dan
risikonya tidak sebanding — apalagi ada cara yang tidak membutuhkan kredensial sama sekali.

**Drive API lewat konektor** — Drive hanya bisa mengubah judul/induk berkas, tidak bisa
menulis isi proyek Apps Script.

**api.github.com untuk mendaftar berkas** — Apps Script keluar lewat IP bersama milik
Google; batas 60 permintaan/jam per IP pada GitHub API bisa sudah habis oleh pengguna lain
sehingga sinkron gagal tanpa sebab yang jelas dari sisi pemilik.

## Keputusan
Arahnya dibalik: **proyek menarik**, bukan CI mendorong.

1. `sync-manifest.json` di repositori memuat versi + daftar berkas yang disinkronkan.
2. Adapter `45_adapter_github.gs` mengunduh manifest dan tiap berkas dari
   **raw.githubusercontent.com** (CDN statis, tanpa batas laju seperti API).
3. Adapter `46_adapter_script_api.gs` membaca & menulis isi proyek memakai
   `ScriptApp.getOAuthToken()` — **izin pemilik sendiri, tidak ada kredensial yang disimpan
   di mana pun**. Dua jalur dicoba berurutan:
   **(a) Apps Script API** `script.googleapis.com`, jalur resmi yang bisa membuat *versi*
   proyek sebagai titik pulih; **(b) Drive API**, karena proyek Apps Script sebenarnya
   berkas Drive bertipe `application/vnd.google-apps.script` yang isinya dapat diekspor dan
   ditimpa sebagai `…script+json`.
4. Use case `sinkronDariGitHub(terapkan, pin)` di `23_app_sinkron.gs`, tombol di menu Setelan.

**Deploy tidak pernah otomatis.** Menulis isi proyek tidak menyentuh deployment, sehingga
aplikasi yang sedang dipakai tetap berjalan pada versi lama sampai pemilik menekan
Deploy → New version.

## Pengaman
Isi datang dari internet dan akan menimpa kode yang sedang berjalan, jadi berlaku syarat
minimal sebelum satu byte pun ditulis (`periksaBerkasSinkron_`, murni & teruji):

| Syarat | Menangkap |
|---|---|
| tiap berkas tidak kosong | unduhan terpotong |
| tidak diawali `404: Not Found` | berkas terhapus/rename di repo |
| `appsscript.json` ada & JSON sah | manifest rusak |
| `00_config` ada & memuat `VERSI_APP` | yang terunduh bukan kode |
| `VERSI_APP` **sama dengan** `versi` di manifest | manifest lupa diperbarui |

Satu gagal = **seluruh** sinkron dibatalkan; tidak ada penulisan sebagian.

Sebelum menimpa, dibuat **versi Apps Script** berlabel "Sebelum sinkron …" sebagai titik
pulih. Bila pembuatan versi gagal, sinkron dibatalkan — lebih baik tidak jadi memperbarui
daripada memperbarui tanpa jalan kembali.

Berkas proyek yang **tidak ada di repositori dipertahankan**, tidak dihapus, dan dilaporkan
namanya. Proyek bisa memuat berkas buatan pemilik; menghapusnya diam-diam jauh lebih
merugikan daripada menyisakan berkas usang.

## Mengapa ada jalur Drive
Pada percobaan pertama, `script.googleapis.com` menolak dengan HTTP 403. `cekSinkron()`
memastikan penyebabnya:

> `Apps Script API has not been used in project 120323933880 before or it is disabled.`

`120323933880` adalah **Cloud project bawaan** Apps Script — tersembunyi dan tidak dapat
dikelola pemilik. Pada percobaan yang sama, ekspor lewat Drive menjawab **HTTP 200**. Perbaikan "resmi"-nya adalah memasang **Cloud project standar** milik
sendiri — dan justru **itu yang tidak boleh dilakukan di sini**: memasangnya memunculkan
OAuth consent screen berstatus *Testing*, yang membuat otorisasi **kedaluwarsa setiap 7
hari**. Pemilik secara khusus meminta agar tidak ada risiko semacam itu.

Karena itu jalur Drive dipakai sebagai gantinya: memakai scope `drive` yang **sudah**
dipakai fitur Simpanan selama berminggu-minggu, tetap pada Cloud project bawaan, dan tanpa
consent screen — sehingga tidak ada yang kedaluwarsa.

Konsekuensinya jalur Drive tidak punya mekanisme *versi*, jadi titik pulihnya berupa berkas
`cadangan-kode-*.json` di folder Simpanan.

Galat dari kedua jalur kini **selalu menyertakan pesan asli Google**. Versi pertama adapter
ini menelan pesan asli dan hanya menampilkan dugaan, sehingga "API belum aktif" tak dapat
dibedakan dari "API butuh Cloud project" — dua hal dengan penanganan yang sangat berbeda.
`cekSinkron()` mencetak jawaban mentah kedua jalur untuk diagnosis.

## Prasyarat sekali pakai
- Apps Script API dinyalakan di <https://script.google.com/home/usersettings> (dibutuhkan
  jalur (a); jalur (b) tetap jalan tanpa ini).
- Scope `https://www.googleapis.com/auth/script.projects` pada `appsscript.json` — karena
  manifest berubah, pemilik menyetujui ulang izin satu kali.
- **JANGAN** memasang Google Cloud project standar pada proyek ini; lihat bagian di atas.

## Utang teknis
Scope `script.projects` tetap diminta walau jalur (a) terbukti tertutup pada proyek ini.
Dibiarkan karena sudah disetujui dan mencabutnya menuntut satu putaran persetujuan ulang
lagi; layak dihapus saat ada perubahan manifest berikutnya.
- Salinan manual **terakhir** untuk memasang modul sinkron itu sendiri.

## Konsekuensi
+ Tidak ada lagi kelas galat "berkas belum tersalin".
+ Tidak ada kredensial Google di repositori publik maupun di GitHub Actions.
+ Kendali penerbitan tetap penuh di tangan pemilik.
− Cabang sumber dipatri di `GITHUB_BRANCH`; mengganti cabang = mengubah konfigurasi lalu
  sinkron sekali (disengaja — proyek tidak boleh diam-diam menarik kode dari cabang lain).
− `sync-manifest.json` harus ikut diperbarui setiap ada berkas baru; `tools/buat-manifest.sh`
  melakukannya, dan pemeriksaan versi membuat manifest yang lupa diperbarui **menggagalkan**
  sinkron alih-alih memasang versi lama diam-diam.
− Siapa pun yang bisa menulis ke cabang itu bisa menjalankan kode di akun Google pemilik —
  setara dengan risiko salin-tempel selama ini, tetapi kini otomatis, jadi disiplin akses
  cabang menjadi lebih penting.
