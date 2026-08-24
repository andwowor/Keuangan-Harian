# Runbook — Keuangan Harian

Cara mengoperasikan & memulihkan sistem. Standar §4.1.

## 1. Deploy perubahan kode

**Disarankan (satu perintah, anti-lupa berkas):**
```bash
npm i -g @google/clasp && clasp login
clasp clone <SCRIPT_ID>     # sekali saja, di folder kosong
clasp push                  # kirim semua modul .gs + Index.html + appsscript.json
```

**Manual (bila tanpa clasp):** salin **seluruh** berkas `*.gs`, `Index.html`, dan
`appsscript.json` ke editor Apps Script. Urutan berkas tidak memengaruhi hasil
(semua modul berbagi namespace global), tetapi **tidak boleh ada yang tertinggal**.

Lalu **wajib**: `Deploy → Manage deployments → Edit → Version: New version → Deploy`.
Menekan Save saja TIDAK memperbarui URL `/exec`.

## 2. Setelah menambah scope OAuth
Jalankan fungsi apa pun dari editor → **Review permissions → Allow**.
Scope saat ini: `spreadsheets`, `drive`, `script.external_request`, `script.scriptapp`.

## 3. Rutinitas awal bulan  ⚠️ paling sering terlewat
Ganti link CASHFLOW di tab **Setelan** ke spreadsheet bulan baru.
Bila terlewat, Setoran Owner akan masuk ke spreadsheet bulan lama (risiko R1).

## 4. Rutinitas akhir bulan — pastikan CASHFLOW lengkap
Tab **Setelan → 🔁 Periksa "Setoran Owner" CASHFLOW** → pilih bulan & tahun → **Periksa**.
Bila ada yang belum masuk → **Lengkapi**. Idempoten: aman diulang, tidak menggandakan.

## 5. Mengaktifkan baca-otomatis bukti
Tab **Simpanan** → tombol **Aktifkan** (memasang trigger `autoReadInbox` tiap ±5 menit).
Status per bukti: `… antre baca` → `⏳ dibaca` → `✓ terbaca` (atau `⚠️ gagal baca`).

## 6. Diagnostik dari editor Apps Script

| Fungsi | Gunanya |
|---|---|
| `jalankanSemuaTest` | 110 test unit domain (tanpa menyentuh data nyata) |
| `cekFolderPenyimpanan` | Memastikan izin Drive & folder inbox terbaca |
| `cekDeteksiRekening` | Memastikan aturan sumber dana bekerja pada contoh bukti nyata |
| `cekStrukturReal` | Melaporkan struktur sheet REAL + POS yang terbaca (jalankan setiap kali REAL diubah) |

## 7. Pemulihan masalah umum

| Gejala | Penyebab paling mungkin | Tindakan |
|---|---|---|
| Perubahan tidak muncul di HP | Deploy tanpa "New version" | Ulangi langkah 1 |
| Tab Simpanan error izin | Scope Drive belum disetujui | Langkah 2 |
| Bukti berstatus `⚠️ gagal baca` | Kuota/jaringan API | Centang bukti → **Proses terpilih** (membaca ulang manual) |
| Setoran Owner tidak lengkap | `CASHFLOW_URL` salah bulan | Langkah 3 lalu langkah 4 |
| Tanggal bergeser 1 hari | Zona waktu spreadsheet ≠ WITA | Spreadsheet → File → Setelan → Zona waktu → (GMT+08:00) Makassar |
| Bukti terhapus tak sengaja | — | Google Drive → Sampah (tersimpan 30 hari) |

## 8. Kredensial
Semua rahasia di **Script Properties** (lihat `.env.example`). Tidak pernah di kode atau Git.
Mengganti PIN: ubah `APP_PIN`, lalu beri tahu perangkat yang dipakai.
