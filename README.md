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
4. Periksa hasil di form (terutama **POS BIAYA** & **SUMBER DANA**). Ada label
   *keyakinan* (tinggi/sedang/rendah) dan catatan bila model ragu.
5. Klik **Simpan ke Spreadsheet**.

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
