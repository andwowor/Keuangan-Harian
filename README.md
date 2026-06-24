# Dashboard Pengisian Biaya Harian

Dashboard untuk mencatat pengeluaran harian dari **screenshot / bukti transfer**.
Gambar yang Anda unggah dibaca otomatis oleh **Claude Vision**, hasilnya
ditampilkan di form untuk Anda tinjau & koreksi, lalu disimpan ke sheet
**TRANSAKSI** pada Google Spreadsheet.

```
Upload bukti  →  Claude membaca (nominal, tanggal, kategori, sumber dana)
              →  Anda tinjau/koreksi di form  →  Simpan ke sheet TRANSAKSI
```

Ringkasan & pivot di sheet lain (saldo bulanan, budget vs realisasi, proyeksi)
otomatis terhitung dari tabel transaksi — dashboard hanya menambah baris baru.

### Aturan pengisian yang diterapkan

| Kolom | Perilaku |
|-------|----------|
| **POS BIAYA** | Hanya pilih dari dropdown (tidak bisa diketik). |
| **KETERANGAN** | Ditebak dari isi bukti, dipandu **history pengisian per POS** dari sheet (muncul sebagai autocomplete + chip rekomendasi). Bila model tidak yakin, rekomendasi ditonjolkan untuk Anda pilih. |
| **NOMINAL** | Dibaca dari bukti. Bila mata uang asing (mis. **RMB/CNY**, USD, SGD), otomatis dikonversi ke Rupiah memakai **kurs pada tanggal transaksi** (sumber: Frankfurter/ECB). Khusus POS **BIAYA KULIAH CHINA** + mata uang asing, sel NOMINAL ditulis sebagai **formula** `=nominal_asli*kurs` (transparan), bukan hasil akhirnya. |
| **TANGGAL** | Selalu diambil dari tanggal pada bukti transaksi. |
| **BIAYA BULAN, TAHUN BIAYA, BUDGET BULAN, TAHUN BUDGET** | **Terisi otomatis** dari tanggal transaksi (pola history ~82%); tinggal dikonfirmasi/koreksi. |
| **SUMBER DANA** | **Terisi otomatis dari nomor rekening sumber pada bukti** (pemetaan rekening → Pendapatan Usaha / Kas Lain Usaha / THR-CUTI). Bila tak terbaca: BOC(1201)→Uang Saku, atau pola SUMBER DANA tersering per POS dari history. Bisa dikoreksi. |
| **Rekening** | Hanya aktif bila SUMBER DANA = **PENDAPATAN USAHA**. Isi nama bank dari bukti transfer (`Mandiri / BNI / BRI / BCA / Kas Tunai Maumbi`). Dikosongkan = dana dari **kas tunai usaha**. Untuk sumber dana lain, Rekening selalu kosong. |
| **Aturan khusus** | Jika bukti menampilkan **"BOC Debit Card (1201)"**, SUMBER DANA otomatis terisi **UANG SAKU**. |

Baris baru selalu ditulis di **baris kosong terbawah** setelah baris terbawah yang
sudah berisi data — dashboard mengecek posisi ini secara live sebelum menyimpan
(ditampilkan di bagian atas: "akan disimpan ke baris …").

---

## Arsitektur

| Komponen | Teknologi |
|----------|-----------|
| Hosting & backend | **Google Apps Script** (Web App) — gratis, akses tulis ke Spreadsheet secara native |
| Pembaca gambar (OCR + kategorisasi) | **Claude Vision API** (`claude-sonnet-4-6`) via `UrlFetchApp` |
| UI | HTML/CSS/JS sederhana, mobile-friendly |

File:
- `Code.gs` — backend (baca gambar ke Claude, tulis ke sheet)
- `Index.html` — tampilan dashboard
- `appsscript.json` — manifest (scope & konfigurasi web app)

---

## Cara Pasang (sekali saja)

### 1. Buat project Apps Script
Cara termudah — terikat langsung ke spreadsheet:
1. Buka [spreadsheet Anda](https://docs.google.com/spreadsheets/d/1IsRwEzQ7xJdd0jpzxpGmvhBvx34CVuOElPFfyRs-5fM/edit).
2. Menu **Extensions → Apps Script**.
3. Hapus isi `Code.gs` bawaan, lalu **salin isi `Code.gs`** dari repo ini.
4. Klik **+** di samping "Files" → **HTML** → beri nama `Index` → salin isi `Index.html`.
5. (Opsional) Klik ikon ⚙ **Project Settings** → centang *"Show appsscript.json manifest"*, lalu samakan isinya dengan `appsscript.json` repo ini.

> Atau pakai **clasp** (`clasp push`) bila Anda terbiasa dengan CLI.

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

### 4. (Opsional) Pasang sebagai aplikasi HP (iPhone/Android)
Lihat **`docs/README.md`** untuk menjadikannya **PWA installable** (ikon di layar utama,
full-screen) lewat GitHub Pages. Atau cukup buka URL di HP lalu **Add to Home Screen**.

---

## Cara Pakai

1. Buka URL dashboard.
2. Ketuk area upload → pilih/foto bukti transfer.
3. Klik **Baca Otomatis** — tunggu beberapa detik.
4. Periksa hasil baca (POS BIAYA, KETERANGAN, NOMINAL, TANGGAL). Bila bukti
   memakai mata uang asing, NOMINAL sudah dikonversi ke Rupiah (info kurs tampil).
5. Bagian **✅ Terisi otomatis** sudah diisi dari pola history (SUMBER DANA,
   BIAYA/BUDGET BULAN & TAHUN, serta Rekening bila Pendapatan Usaha) —
   cukup **koreksi yang meleset**.
6. Klik **Simpan ke Spreadsheet**. Baris masuk di posisi kosong terbawah.

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

## Menu "Sisa Budget"

Tab kedua di dashboard (**📊 Sisa Budget**) menampilkan kondisi keuangan bulanan dari
sheet **REAL**:
- Pilih **bulan** (otomatis dari baris 1 sheet REAL; default bulan berjalan).
- **Ringkasan**: Total Pemasukan, Total Pengeluaran, dan Sisa (Saldo Real).
- **Sisa Kantong** — nilai per kantong (baris 69–86 REAL — semua kantong, termasuk yang 0).
- **Biaya per kategori** (baris 3–64 REAL, dengan subtotal per grup).

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

**Selalu muncul pratinjau** (isi ke TRANSAKSI **dan** ke CASHFLOW) sebelum disubmit. Untuk
sumber dana selain Pendapatan Usaha, perilaku tetap seperti biasa (tanpa CASHFLOW).

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

- **Ganti model (hemat biaya):** ubah `CLAUDE_MODEL` di `Code.gs`.
  - `claude-sonnet-4-6` — seimbang (default)
  - `claude-opus-4-8` — paling akurat
  - `claude-haiku-4-5` — paling murah & cepat
- **Tambah/ubah kategori:** edit array `POS_BIAYA` atau `SUMBER_DANA` di `Code.gs`.
  Daftar ini sekaligus menjadi pilihan dropdown di form **dan** batasan tebakan model.
- **Tema (futuristik, dark):** warna didefinisikan di `:root` pada `Index.html` — latar
  gelap `#0a0e1c` dengan aksen neon cyan `#38bdf8` → violet `#8b5cf6`, kartu kaca (glass).
  Ubah di satu tempat untuk seluruh tampilan. Ikon PWA (HUD ring) ada di `docs/icon-192.png`
  & `docs/icon-512.png`.

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
