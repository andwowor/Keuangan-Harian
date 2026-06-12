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
| **NOMINAL** | Dibaca dari bukti. Bila mata uang asing (mis. **RMB/CNY**, USD, SGD), otomatis dikonversi ke Rupiah memakai **kurs pada tanggal transaksi** (sumber: Frankfurter/ECB). Info kurs ditampilkan; nominal tetap bisa dikoreksi. |
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
| Pembaca gambar (OCR + kategorisasi) | **Claude Vision API** (`claude-opus-4-8`) via `UrlFetchApp` |
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

### 2. Set API key Claude
1. Di editor Apps Script: **Project Settings (⚙) → Script Properties → Add script property**.
2. Property: `ANTHROPIC_API_KEY` — Value: API key Anthropic Anda (`sk-ant-...`).
3. Simpan.

> API key didapat dari https://console.anthropic.com → Settings → API Keys.

### 3. Deploy sebagai Web App
1. Klik **Deploy → New deployment**.
2. Type: **Web app**.
3. *Execute as*: **Me** · *Who has access*: **Only myself** (atau sesuai kebutuhan).
4. **Deploy** → izinkan akses (OAuth) saat diminta.
5. Salin **Web app URL** — itulah dashboard Anda. Buka di HP/komputer, bisa di-*bookmark* atau ditambahkan ke layar utama HP.

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

> **Makin lama makin otomatis:** dashboard membaca sheet TRANSAKSI secara *live*
> setiap kali dipakai, sehingga setiap transaksi baru yang Anda simpan ikut
> memperbaiki tebakan (KETERANGAN & SUMBER DANA) berikutnya — koreksi Anda makin sedikit.

---

## Kustomisasi

- **Ganti model (hemat biaya):** ubah `CLAUDE_MODEL` di `Code.gs`.
  - `claude-opus-4-8` — paling akurat (default)
  - `claude-sonnet-4-6` — seimbang
  - `claude-haiku-4-5` — paling murah & cepat
- **Tambah/ubah kategori:** edit array `POS_BIAYA` atau `SUMBER_DANA` di `Code.gs`.
  Daftar ini sekaligus menjadi pilihan dropdown di form **dan** batasan tebakan model.

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
