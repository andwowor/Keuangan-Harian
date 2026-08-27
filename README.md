# Keuangan Harian — Dashboard Pengisian Biaya

> Mengikuti **Standar Arsitektur Perangkat Lunak v1.0 (Andre S. Wowor)**.
> Dokumen arsitektur: [`docs/architecture/`](docs/architecture/00-overview.md) · Operasional: [`docs/runbook.md`](docs/runbook.md)

## Tujuan

Mencatat pengeluaran harian dari **screenshot / bukti transfer** dengan koreksi seminimal
mungkin. Gambar dibaca otomatis oleh **Claude Vision**, hasilnya ditinjau pengguna, lalu
disimpan ke sheet **TRANSAKSI**. Rekap/pivot (saldo, budget vs realisasi) tetap dihitung
formula yang sudah ada di spreadsheet — dashboard hanya menambah/mengubah baris.

## Arsitektur singkat

Gaya: **Modular Monolith = Layered + Ports & Adapters + Event-driven** pada batas otomasi
([ADR-0001](docs/architecture/adr/ADR-0001-modular-monolith-apps-script.md)).

```
 inbound adapters          application            domain (MURNI)
 50_inbound_webapp  ──▶  20_app_transaksi  ──▶  10_domain_rekening
 90_triggers             21_app_inbox           11_domain_transaksi
                         22_app_laporan         12_domain_cashflow
                              │                 13_domain_inbox · 14_domain_pos
                              │                 15_domain_budget
                              ▼                        ▲
 outbound adapters  40_sheets 41_drive 42_claude 43_kurs 44_properties
                                                 05_shared · 00_config

 Dependensi hanya mengarah ke DALAM. domain tidak memanggil API Google apa pun.
```

Rincian: [logical](docs/architecture/02-views/logical.md) ·
[deployment](docs/architecture/02-views/deployment.md) ·
[process](docs/architecture/02-views/process.md) ·
[QAS](docs/architecture/01-quality-attributes.md) ·
[evaluasi & utang teknis](docs/architecture/03-evaluation.md)

## Prasyarat

- Akun Google + spreadsheet **ANALISA KEUANGAN** (sheet `TRANSAKSI`, `REAL`)
- Spreadsheet **CASHFLOW & BIAYA `<bulan>`** (sheet `INPUT PENGGUNAAN BIAYA`)
- Folder Google Drive untuk penyimpanan sementara bukti
- **Kunci API Anthropic**
- (Opsional) Node.js + [`clasp`](https://github.com/google/clasp) untuk deploy satu perintah

## Instalasi

1. Buka spreadsheet → **Extensions → Apps Script**.
2. Salin **semua modul** `*.gs`, `Index.html`, dan `appsscript.json` dari repo ini
   (atau `clasp push` — jauh lebih aman, tidak ada berkas yang terlewat).
3. **Project Settings → Script Properties**, isi sesuai [`.env.example`](.env.example):
   `ANTHROPIC_API_KEY`, `APP_PIN`, `CASHFLOW_URL`.
4. Jalankan fungsi apa pun dari editor → **Review permissions → Allow**.

## Menjalankan

**Deploy → New deployment → Web app** · *Execute as*: **Me** · *Who has access*: **Anyone**
(keamanan dijaga `APP_PIN` — [ADR-0006](docs/architecture/adr/ADR-0006-akses-publik-dengan-pin.md)).
Buka **Web app URL** (`…/exec`). Untuk dipasang sebagai aplikasi HP, lihat [`docs/README.md`](docs/README.md).

## Test

Di editor Apps Script, pilih fungsi lalu **Run** (hasil di *Execution log*):

| Fungsi | Cakupan |
|---|---|
| `jalankanSemuaTest` | **158 test unit domain** — murni, tidak menyentuh data nyata |
| `cekFolderPenyimpanan` | Integrasi: izin Drive & folder inbox |
| `cekDeteksiRekening` | Aturan sumber dana pada contoh bukti nyata |

Sesuai §5.8: **setiap perbaikan bug didahului satu test yang gagal** di `99_tests.gs`.

## Deploy pembaruan

`Deploy → Manage deployments → Edit → Version: **New version** → Deploy`.
Menekan Save saja tidak memperbarui URL `/exec`.

## Runbook

Operasional harian, rutinitas awal/akhir bulan, dan pemulihan masalah:
[`docs/runbook.md`](docs/runbook.md).

## Lisensi

Penggunaan pribadi (proprietary). Hak cipta © Andre S. Wowor.

---

# Referensi Fitur

### Aturan pengisian yang diterapkan

| Kolom | Perilaku |
|-------|----------|
| **POS BIAYA** | **Terisi otomatis dari penerima** bila penerima ada di daftar aturan tetap (mis. penerima **Kairagi Dua 009** → **Retribusi Sampah**); aturan ini mengalahkan tebakan model. Selain itu ditebak dari merchant/barang. Combobox: **ketik untuk mencari** lalu pilih dari daftar. Nilai **wajib dari daftar** (divalidasi), sehingga cocok dengan dropdown kolom POS BIAYA di sheet TRANSAKSI. |
| **KETERANGAN** | Ditebak dari isi bukti, dipandu **history pengisian per POS** dari sheet (muncul sebagai autocomplete + chip rekomendasi). Bila model tidak yakin, rekomendasi ditonjolkan untuk Anda pilih. |
| **NOMINAL** | Dibaca dari bukti. Bila mata uang asing (mis. **RMB/CNY**, USD, SGD), otomatis dikonversi ke Rupiah memakai **kurs pada tanggal transaksi** (sumber: Frankfurter/ECB). Khusus POS **BIAYA KULIAH CHINA** + mata uang asing, sel NOMINAL ditulis sebagai **formula** `=nominal_asli*kurs` (transparan), bukan hasil akhirnya. |
| **TANGGAL** | Selalu diambil dari tanggal pada bukti transaksi. |
| **BIAYA BULAN, TAHUN BIAYA, BUDGET BULAN, TAHUN BUDGET** | **Terisi otomatis** dari tanggal transaksi (pola history ~82%); tinggal dikonfirmasi/koreksi. |
| **SUMBER DANA** | **Terisi otomatis dari sumber dana pada bukti.** (1) **Kartu kredit** (mis. `BNI Visa Affinity Platinum · 4512 49** **** 6010`, atau ada kata Visa/Mastercard/Kartu Kredit) → **KARTU KREDIT**. (2) **Nomor rekening** — cocok lewat nomor penuh, atau **nomor yang disamarkan** via pola angka unik yang terlihat (mis. `026-3**-**85`→BCA, `•••••••••5620`→Mandiri, `*******055`→BNI, `1543 **** **** 507`→BRI). (3) **Nama aplikasi** blu → THR/Cuti. Nomor kartu tidak tertukar dengan rekening tabungan bank yang sama. Bila tak terbaca: BOC(1201)→Uang Saku, atau pola per POS dari history. Bisa dikoreksi. |
| **Rekening** | Hanya aktif bila SUMBER DANA = **PENDAPATAN USAHA**. Isi nama bank dari bukti transfer (`Mandiri / BNI / BRI / BCA / Kas Tunai Maumbi`). Dikosongkan = dana dari **kas tunai usaha**. Untuk sumber dana lain, Rekening selalu kosong. |
| **Aturan khusus** | Jika bukti menampilkan **"BOC Debit Card (1201)"**, SUMBER DANA otomatis terisi **UANG SAKU**. |

Baris baru selalu ditulis di **baris kosong terbawah** setelah baris terbawah yang
sudah berisi data — dashboard mengecek posisi ini secara live sebelum menyimpan
(ditampilkan di bagian atas: "akan disimpan ke baris …").

---

## Cara Pasang (sekali saja)

### 1. Buat project Apps Script
Cara termudah — terikat langsung ke spreadsheet:
1. Buka [spreadsheet Anda](https://docs.google.com/spreadsheets/d/1IsRwEzQ7xJdd0jpzxpGmvhBvx34CVuOElPFfyRs-5fM/edit).
2. Menu **Extensions → Apps Script**.
3. Hapus `Code.gs` bawaan. Buat **satu berkas Script per modul** di repo ini dan salin isinya
   (nama tanpa akhiran `.gs`): `00_config`, `05_shared`, `10_domain_rekening`,
   `11_domain_transaksi`, `12_domain_cashflow`, `13_domain_inbox`, `14_domain_pos`,
   `15_domain_budget`, `20_app_transaksi`,
   `21_app_inbox`, `22_app_laporan`, `30_ports`, `40_adapter_sheets`, `41_adapter_drive`,
   `42_adapter_claude`, `43_adapter_kurs`, `44_adapter_properties`, `50_inbound_webapp`,
   `90_triggers`, `99_tests`. Urutan berkas tidak berpengaruh, tetapi **tidak boleh ada yang terlewat**.
4. Klik **+** di samping "Files" → **HTML** → beri nama `Index` → salin isi `Index.html`.
5. Klik ikon ⚙ **Project Settings** → centang *"Show appsscript.json manifest"*, lalu samakan isinya dengan `appsscript.json` repo ini.

> **Jauh lebih aman:** pakai **clasp** (`clasp push`) — semua modul terkirim sekali jalan
> tanpa risiko ada berkas tertinggal. Lihat [`docs/runbook.md`](docs/runbook.md).

### 2. Set Script Properties (API key + PIN)
1. Di editor Apps Script: **Project Settings (⚙) → Script Properties → Add script property**.
2. Tambahkan:
   - `ANTHROPIC_API_KEY` = API key Anthropic Anda (`sk-ant-...`).
   - `APP_PIN` = PIN pilihan Anda (mis. `1234`) — **kunci akses dashboard**.
3. Simpan.

> API key didapat dari https://console.anthropic.com → Settings → API Keys.
> `APP_PIN` mengunci dashboard (wajib bila akses web app "Anyone"). Bila `APP_PIN`
> dikosongkan, dashboard terbuka tanpa kunci.

### 3. Deploy sebagai Web App
1. Klik **Deploy → New deployment**.
2. Type: **Web app**.
3. *Execute as*: **Me** · *Who has access*: **Anyone** (agar bisa dibuka dari aplikasi HP/PWA tanpa kendala login). Keamanan dijaga oleh `APP_PIN`.
4. **Deploy** → izinkan akses (OAuth) saat diminta.
5. Salin **Web app URL** (berakhiran `/exec`) — itulah dashboard Anda.

> **Saat memperbarui kode:** gunakan **Deploy → Manage deployments → Edit → Version:
> New version → Deploy** (bukan sekadar Save), agar URL `/exec` memakai kode terbaru.
> Khusus setelah fitur **Simpanan** ditambahkan, project meminta izin **Google Drive**
> yang baru — jalankan sekali fungsi apa pun dari editor (atau deploy ulang) lalu
> **Review permissions → Allow** saat diminta.

### 4. (Opsional) Pasang sebagai aplikasi HP (iPhone/Android)
Lihat **`docs/README.md`** untuk menjadikannya **PWA installable** (ikon di layar utama,
full-screen) lewat GitHub Pages. Atau cukup buka URL di HP lalu **Add to Home Screen**.

---

## Cara Pakai

1. Buka URL dashboard.
2. Ketuk area upload → pilih/foto bukti transfer. **Bisa memilih lebih dari satu
   gambar sekaligus** (atau jatuhkan beberapa file) — tiap gambar = 1 biaya. Semua
   bukti masuk ke **antrean** dengan status (menunggu → membaca → siap ditinjau →
   tersimpan). Anda juga bisa menambah gambar lagi kapan saja atau menghapus satu bukti.
3. Klik **Baca Otomatis** — semua bukti dibaca berurutan; bukti pertama yang selesai
   langsung terbuka untuk ditinjau sementara sisanya masih diproses.
4. Periksa hasil baca (POS BIAYA, KETERANGAN, NOMINAL, TANGGAL). Di kartu tinjau
   juga tampil **gambar bukti yang dibaca** — ketuk untuk memperbesar (ketuk lagi
   untuk zoom penuh) sehingga mudah dicocokkan dengan hasil baca. Bila bukti
   memakai mata uang asing, NOMINAL sudah dikonversi ke Rupiah (info kurs tampil).
5. Bagian **✅ Terisi otomatis** sudah diisi dari pola history (SUMBER DANA,
   BIAYA/BUDGET BULAN & TAHUN, serta Rekening bila Pendapatan Usaha) —
   cukup **koreksi yang meleset**.
6. Klik **Simpan & Lanjut**. Baris masuk di posisi kosong terbawah, lalu form
   otomatis lompat ke bukti berikutnya yang siap ditinjau — ulangi sampai semua
   bukti tersimpan. (**Tutup** menutup form tanpa menyimpan; bukti tetap di antrean.)

**Input Manual (tanpa foto):** di tab Input ada bagian **✍️ Input Manual** untuk mengetik
biaya langsung (POS, keterangan, nominal, tanggal, biaya bulan/tahun, sumber dana, budget
bulan/tahun, Rekening bila Pendapatan Usaha). KETERANGAN menampilkan **rekomendasi dari
history** sesuai POS yang dipilih; Rekening dari daftar bank history. **Selalu ada pratinjau**
sebelum disimpan. Disimpan ke sheet TRANSAKSI lewat alur yang sama (termasuk auto-isi CASHFLOW
bila sumber dana Pendapatan Usaha).

> **Makin lama makin otomatis:** dashboard membaca sheet TRANSAKSI secara *live*
> setiap kali dipakai, sehingga setiap transaksi baru yang Anda simpan ikut
> memperbaiki tebakan (POS BIAYA, KETERANGAN, SUMBER DANA) berikutnya.
>
> Selain itu, tiap simpan dicatat ke sheet tersembunyi **`AI_MEMORY`** (bukti +
> saran AI + pilihan akhir Anda + tanda apakah dikoreksi). Dari memori ini sistem
> **mempelajari nomor rekening baru → sumber dana** secara otomatis: rekening yang
> belum terdaftar cukup Anda koreksi sekali–dua kali, lalu dikenali sendiri.
> (Sheet `AI_MEMORY` dibuat & disembunyikan otomatis; boleh Anda buka untuk audit.)

## Menu "Simpanan" (penyimpanan sementara bukti)

Tab **📦 Simpanan** menampung screenshot/bukti transfer yang **belum sempat diproses**,
di sebuah folder Google Drive. Berguna saat Anda menerima bukti tapi belum sempat
menginput biayanya.

| Fitur | Keterangan |
|---|---|
| **🖼 Pilih Gambar** | Unggah satu/banyak bukti dari galeri ke folder penyimpanan. |
| **📷 Ambil Foto** | Ambil foto langsung dari kamera HP, langsung tersimpan ke folder. |
| **Peringatan duplikat** | Bila bukti yang diunggah **isinya sama** dengan yang sudah ada di folder (dibandingkan lewat sidik jari MD5), sistem **otomatis memperingatkan** dan menunjukkan bukti mana yang sama — Anda bisa **Lewati** (default) atau **Unggah tetap**. |
| **Tawaran bersihkan galeri** | Setelah unggah berhasil, dashboard **otomatis menawarkan** untuk menghapus bukti dari galeri HP (lihat catatan di bawah). |
| **Daftar bukti** | **Semua** bukti di folder tampil dengan thumbnail, nama, tanggal & ukuran (terbaru dulu). Daftar muncul lebih dulu, thumbnail menyusul bertahap agar tidak lama menunggu. |
| **Lihat penuh** | **Ketuk bukti** (atau ikon ⤢) untuk membuka gambar **full screen**; ketuk lagi untuk zoom/geser. Ketuk **kotak centang** untuk memilih (proses/hapus). |
| **Pilih satu/semua** | Centang bukti satu per satu atau **Pilih semua**. |
| **Baca otomatis di latar** | Begitu bukti masuk folder, isinya **dibaca otomatis** oleh Claude dan hasilnya disimpan permanen (di deskripsi file Drive). Berjalan lewat **trigger waktu** (±5 menit) sehingga **tetap jalan walau dashboard ditutup**, plus pembacaan seketika saat upload. Aktifkan sekali lewat tombol **Aktifkan** di kartu upload. Tiap bukti menampilkan status: `✓ terbaca` / `⏳ dibaca` / `… antre baca` / `⚠️ gagal`. |
| **▶ Proses terpilih** | Bukti terpilih masuk ke antrean tab **Input**. Bila sudah dibaca di latar, **hasilnya tampil langsung** tanpa Claude membaca ulang; bila belum, dibaca saat itu juga. |
| **🗑 Hapus terpilih** | Hapus bukti dari folder (masuk Sampah Drive, bisa dipulihkan 30 hari). |
| **Auto-hapus setelah tersimpan** | Begitu sebuah bukti **berhasil terinput** ke TRANSAKSI, file-nya otomatis dihapus dari folder penyimpanan. |

Gambar diperkecil otomatis (sisi terpanjang 1600 px) sebelum diunggah, agar hemat ruang
Drive dan cepat dibaca. Bukti dibaca **langsung di server** dari Drive, jadi tidak perlu
diunduh dulu ke HP.

> **Catatan penting soal menghapus dari galeri HP:** dashboard **otomatis menawarkan**
> pembersihan galeri setelah unggah berhasil, tetapi **penghapusan file di galeri harus
> Anda ketuk sendiri** di aplikasi Galeri/Google Photos. Ini batasan keamanan
> Android/iOS — halaman web (termasuk PWA) tidak diizinkan menghapus file di
> penyimpanan HP. Yang otomatis adalah *tawaran + daftar nama file*-nya.

Folder penyimpanan diatur lewat konstanta `INBOX_FOLDER_ID` di `00_config.gs`.

## Menu "Sisa Budget"

Menu **📊 Budget** adalah **tampilan pertama saat aplikasi dibuka** (diatur lewat
konstanta `TAB_AWAL` di `Index.html`). Menampilkan kondisi keuangan bulanan dari
sheet **REAL**:
- Pilih **bulan** (otomatis dari baris 1 sheet REAL; default bulan berjalan).
- **Ringkasan**: Total Pemasukan, Total Pengeluaran, dan Sisa (Saldo Real).
- **Sisa Kantong** — nilai per kantong (**baris 71–89** REAL — semua kantong, termasuk yang 0).
- **Biaya per kategori** (**baris 3–68** REAL, dengan subtotal per grup).
- **⚠️ Peringatan saldo minus:** saat menu Budget dibuka, dashboard memeriksa baris
  **SALDO REAL** sheet REAL untuk bulan **setelah bulan berjalan s/d Desember tahun depan**
  (mis. berjalan Agustus 2026 → September 2026 s/d Desember 2027). Bila ada yang minus,
  muncul **pop-up peringatan** sekali per sesi + **banner menetap** di atas menu Budget,
  berisi daftar bulan, nominalnya, dan bulan terparah.

Baris **TOTAL PENGELUARAN / TOTAL INCOME / SALDO / SALDO BULAN SEBELUMNYA / SALDO REAL**
dicari lewat **label**, bukan nomor baris — jadi tetap benar walau baris disisipkan/dihapus.

Data dibaca langsung dari REAL (yang sudah terisi formula dari TRANSAKSI), jadi angkanya
selalu sinkron. Kolom bulan dideteksi otomatis dari label "BULAN TAHUN" di baris 1
(mis. `JUNI 2026`), tidak di-hardcode.

## Menu "Daftar Biaya"

Tab (**📋 Daftar**) untuk melihat daftar biaya dari sheet **TRANSAKSI** (ANALISA KEUANGAN),
dengan filter gabungan (semua opsional, di-AND-kan):
- **Bulan** (kolom BIAYA BULAN) & **Tahun** (kolom TAHUN BIAYA) — default bulan/tahun berjalan, bisa diset "Semua".
- **Tanggal** (kolom TANGGAL) — tanggal spesifik.
- **POS Biaya** (kolom POS BIAYA).
- **Keterangan** (kolom KETERANGAN) — pencarian "mengandung".
- **Sumber Dana** (kolom SUMBER DANA).

Menampilkan tiap transaksi (POS, keterangan, tanggal, sumber dana, nominal) **urut terbaru → terlama**,
plus jumlah transaksi & total nominal sesuai filter. Tombol **Reset filter tambahan** mengosongkan
filter tanggal/POS/keterangan/sumber.

**Edit manual transaksi:** ketuk salah satu transaksi (ikon ✏️) untuk membuka form edit —
POS BIAYA (combobox), KETERANGAN, NOMINAL, TANGGAL, BIAYA BULAN/TAHUN, SUMBER DANA (+Rekening
bila Pendapatan Usaha), BUDGET BULAN/TAHUN. **Simpan Perubahan** menulis balik ke baris yang
sama di sheet TRANSAKSI. Catatan: bila NOMINAL berupa **formula** (mis. BIAYA KULIAH CHINA =
nominal×kurs), formula dipertahankan selama angkanya tidak diubah. Sheet **CASHFLOW tidak ikut
berubah otomatis** saat edit (agar tidak menggandakan entri) — sesuaikan manual bila perlu.

## Menu "Setelan" & auto-isi CASHFLOW

Tab ketiga (**⚙ Setelan**) untuk menautkan **spreadsheet CASHFLOW & BIAYA bulan berjalan**
(berganti tiap bulan — cukup tempel link barunya tiap awal bulan; disimpan di Script
Property `CASHFLOW_URL`).

Bila biaya disimpan dengan **SUMBER DANA = Pendapatan Usaha**, entri otomatis juga dicatat
ke sheet **INPUT PENGGUNAAN BIAYA** di spreadsheet CASHFLOW tersebut, pada baris kosong
terbawah, dengan aturan:

| Kolom | Isi |
|-------|-----|
| SUBJEK BIAYA | *(tidak ditulis — terisi otomatis dari KETERANGAN di sheet itu)* |
| KETERANGAN | `Setoran Owner` |
| NOMINAL | nominal transaksi |
| TANGGAL | tanggal transaksi |
| OUTLET | `MAUMBI` |
| STATUS LAPOR APLIKASI SMARTLINK | `BELUM INPUT` |
| SUMBER DANA | mengikuti **Rekening** TRANSAKSI (Mandiri/BNI/BRI/BCA → uppercase; kosong → `KAS TUNAI MAUMBI`) |

**Selalu muncul pratinjau** (isi ke TRANSAKSI **dan** ke CASHFLOW) sebelum disubmit.
Saat **Konfirmasi & Simpan** ditekan, modal menampilkan **animasi progres** berisi daftar
spreadsheet yang sedang ditulis + penghitung detik; kedua tombol dikunci sehingga klik ganda
tidak dapat membuat baris dobel. Untuk
sumber dana selain Pendapatan Usaha, perilaku tetap seperti biasa (tanpa CASHFLOW).

### 🔁 Periksa & lengkapi "Setoran Owner" CASHFLOW

Bila ada transaksi Pendapatan Usaha yang **belum** tercatat sebagai Setoran Owner di CASHFLOW
(mis. karena saat itu link CASHFLOW menunjuk bulan lain, atau penulisan sempat gagal), tab
**Setelan** punya kartu **🔁 Periksa "Setoran Owner" CASHFLOW**:
- Pilih **Bulan (TANGGAL)** & **Tahun**, klik **Periksa** — dashboard membandingkan transaksi
  Pendapatan Usaha di TRANSAKSI (berdasar TANGGAL) dengan Setoran Owner di CASHFLOW aktif,
  lalu menampilkan berapa yang **belum masuk** beserta daftarnya.
- Klik **Lengkapi** untuk menuliskan semua Setoran Owner yang belum ada. **Aman diulang** —
  pencocokan lewat (tanggal + nominal) memastikan hanya yang benar-benar belum ada yang ditulis,
  jadi tidak menggandakan entri.

Catatan: bila Setoran Owner sebelumnya tak sengaja tertulis ke spreadsheet CASHFLOW **bulan lain**
(karena link belum diganti saat input), pelengkap ini menambahkannya ke link yang **aktif sekarang**;
entri yang salah tempat di bulan lain perlu Anda hapus manual bila mau.

---

## Widget home screen (via app pihak ketiga)

Apps Script menyediakan endpoint ringkas (dilindungi `token` = `APP_PIN`):

- **Halaman widget** (paling mudah): `…/exec?view=widget&token=PIN` — kartu gelap berisi
  **Sisa Budget bulan ini**, Pemasukan, Pengeluaran, dan **Biaya hari ini** (auto-refresh
  tiap 30 menit). Pasang dengan aplikasi *"webpage widget"* (mis. **Web Widget / Webpage Widget**
  di Play Store): tambah widget → isi URL di atas → taruh di layar utama.
- **JSON** (untuk widget lanjutan seperti **KWGT**): `…/exec?api=summary&token=PIN` →
  `{ bulan, sisa, pengeluaran, income, hariIni, hariIniCount, updated }`.

> Ganti `PIN` dengan `APP_PIN` Anda. Token ada di URL yang tersimpan di app widget — wajar untuk
> perangkat pribadi; jaga kerahasiaannya. (Widget asli/native tetap perlu aplikasi Android tersendiri.)

## Kustomisasi

- **Ganti model (hemat biaya):** ubah `CLAUDE_MODEL` di `00_config.gs`.
  - `claude-sonnet-4-6` — seimbang (default)
  - `claude-opus-4-8` — paling akurat
  - `claude-haiku-4-5` — paling murah & cepat
- **Daftar POS BIAYA** di dashboard otomatis dibaca dari **sheet REAL kolom B** pada baris item
  biaya (`POS_SOURCE_ROWS` di `00_config.gs`: 3–13, 17–20, 23–24, 28–42, 46, 49–50, 54–64; baris
  "TOTAL"/kosong di-skip). Cukup ubah di REAL, dashboard menyesuaikan (cache ±5 menit). Array
  `POS_BIAYA` di `00_config.gs` hanya cadangan bila gagal dibaca. **SUMBER DANA** memakai daftar
  bawaan `SUMBER_DANA` di `00_config.gs`.
- **Tema (gelap analitik — [ADR-0009](docs/architecture/adr/ADR-0009-tema-gelap-dashboard-analitik.md)):**
  diadaptasi dari Figma *Sales Management Dashboard*; token diambil langsung dari file itu.
  Latar `#0E0F14`, panel `#21222D`, tile `#171821`, aksen mint `#A9DFD8` (+ amber `#FEB95A`,
  biru `#20AEF3`, pink `#F2C8ED`), radius 10px, Inter. Menu Budget memakai **stat tile**,
  **gauge pemakaian budget**, dan **bar proporsi + pil persen** per kategori. Semua warna
  ada di `:root` `Index.html`; tidak ada warna literal di markup. Shell PWA & `theme_color`
  mengikuti. Layout sidebar desktop tidak dipakai — aplikasi ini mobile-first.

---

## Catatan teknis

- Baris baru ditambahkan tepat setelah baris terisi terakhir pada sheet `TRANSAKSI`
  (kolom A–J). Format sel & data-validation disalin dari baris transaksi terakhir
  agar tampilan (Rp…, tanggal, dropdown) tetap konsisten.
- NOMINAL ditulis sebagai angka dan TANGGAL sebagai tanggal asli bila kolom
  tersebut bertipe angka/tanggal; bila ternyata bertipe teks, ditulis sebagai
  teks berformat (`Rp…`, `19 November 2025`) — terdeteksi otomatis.
- Skema input mengikuti 10 kolom sheet TRANSAKSI:
  `POS BIAYA · KETERANGAN · NOMINAL · TANGGAL · BIAYA BULAN · TAHUN BIAYA · SUMBER DANA · BUDGET BULAN · TAHUN BUDGET · Rekening`.
- **Zona waktu: WITA (Waktu Indonesia Tengah, UTC+8 / `Asia/Makassar`)** — dipakai untuk
  tanggal default, cap waktu bukti, dan penentuan bulan/tahun berjalan. Diatur di dua tempat:
  konstanta `TIMEZONE` (`00_config.gs`) dan `timeZone` (`appsscript.json`). Penulisan TANGGAL ke sheet
  mengikuti zona waktu **spreadsheet** (agar tanggal tidak bergeser). Untuk konsistensi penuh,
  set juga zona waktu Google Sheet Anda ke **(GMT+08:00) Makassar** lewat *File → Setelan →
  Zona waktu* pada spreadsheet.
