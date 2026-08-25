# 03 — Evaluasi Arsitektur (ATAM ringan) & Utang Teknis

Tanggal evaluasi: 2026-08-11 · Standar §2 Langkah 7, §5.9

## Trade-off point

| # | Trade-off | Untung | Rugi | Keputusan |
|---|---|---|---|---|
| T1 | Google Sheets sebagai basis data | Rekap/pivot/formula sudah jadi; pemilik terbiasa | Tanpa transaksi ACID, kuota baca/tulis, skala terbatas | Terima — *usability* & *modifiability* > *scalability* (ADR-0002) |
| T2 | Web app `ANYONE_ANONYMOUS` + PIN | Bisa dibuka dari PWA tanpa login Google | Endpoint publik; keamanan bergantung PIN | Terima dengan mitigasi (ADR-0006) |
| T3 | Hasil baca AI disimpan di deskripsi berkas Drive | Permanen, tanpa DB tambahan, ikut terhapus bersama file | Deskripsi terbatas & bukan penyimpanan terstruktur | Terima (ADR-0004) |
| T4 | Trigger 5 menit untuk baca latar | Jalan walau dashboard tertutup | Bukan real-time; memakai kuota | Terima (ADR-0005) |
| T5 | Gambar diperkecil ke 1600 px sebelum unggah | Hemat kuota & cepat | Teks sangat kecil berpotensi kurang terbaca | Terima; bisa dinaikkan bila akurasi turun |

## Sensitivity point

| # | Titik sensitif | Kualitas terdampak |
|---|---|---|
| S1 | `TIMEZONE` skrip vs zona waktu spreadsheet | Correctness tanggal (QAS-03) |
| S2 | Nilai `CASHFLOW_URL` harus menunjuk bulan berjalan | Integrity TRANSAKSI↔CASHFLOW (QAS-07) |
| S3 | Struktur kolom sheet TRANSAKSI (A..J) | Seluruh alur tulis |
| S4 | ~~Baris sumber POS di sheet REAL~~ **DIPERBAIKI**: POS kini dikenali dari struktur (penanda `TOTAL PENGELUARAN`), bukan nomor baris tetap | Validitas dropdown POS |
| S5 | Batas ukuran gambar Claude (±5 MB base64) | Keberhasilan pembacaan |

## Risiko

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | `CASHFLOW_URL` lupa diganti awal bulan | Setoran Owner masuk bulan salah | **Terjadi nyata (Juli 2026)** → dibuat audit + backfill idempoten |
| R2 | Kuota API Claude habis | Bukti gagal dibaca | Status `error` disimpan; tidak dibaca ulang otomatis; bisa diproses manual |
| R3 | Perubahan tata letak sheet oleh pengguna | Alur tulis rusak | Terpusat di `40_adapter_sheets.gs`; daftar POS kini tahan sisip/hapus baris; diagnostik `cekStrukturReal` |
| R4 | PIN bocor | Data biaya terekspos | Ganti `APP_PIN`; akses Drive dibatasi hanya folder inbox |
| R5 | Salin manual 17 modul ke editor Apps Script tidak lengkap | Aplikasi rusak saat deploy | Gunakan `clasp push`; lihat `docs/runbook.md` |

## Utang teknis (eksplisit, §5.9)

| # | Utang | Alasan ditunda | Rencana |
|---|---|---|---|
| D1 | 7 fungsi masih ber-*cyclomatic complexity* > 10: `getTransaksiList` (25), `getLearnedAccounts_` (18), `analyzeImg_` (18), `logMemory_` (17), `auditCashflowSetoran` (13), `getHistoryContext` (11), `detectAccount_` turunannya | Pemecahan lanjut berisiko pada sistem yang dipakai harian; sudah turun dari 9 fungsi (puncak 42 → 35) | Pecah bertahap, tiap kali disertai test domain lebih dulu (§5.8) |
| D2 | Belum ada test *integration* untuk adapter | Butuh sheet uji terpisah agar tidak mengotori data nyata | Buat spreadsheet fixture + `tests/integration` |
| D3 | `ScriptApp.getOAuthToken()` dipakai di `41_adapter_drive.gs` | Token dipakai untuk mengambil thumbnail Drive resolusi besar — masih dalam domain adapter Drive | Biarkan; tercatat sebagai pengecualian sadar |
| D4 | Belum ada CI (SonarCloud/Actions) untuk mengukur kompleksitas otomatis | Proyek satu orang | Aktifkan GitHub Actions + SonarCloud (§6 tooling) |
| D6 | Ikon PWA masih bernuansa gelap, belum selaras dengan tema terang (ADR-0008); mode gelap belum ada | Kosmetik, tidak memengaruhi fungsi | Regenerasi ikon + opsional `prefers-color-scheme` |
| D5 | `Index.html` masih satu berkas besar (UI + logika presentasi) | Apps Script menyajikan satu HTML; pemecahan butuh `include()` bertingkat | Pecah per tab memakai `include()` bila makin besar |

## Kesimpulan
Arsitektur **memenuhi** aturan tidak-bisa-dinegosiasi §5 nomor 1–5, 7, 9, 10.
Nomor 6 (kompleksitas) **belum penuh** — tercatat sebagai D1 dengan rencana perbaikan.
Nomor 8 (test mendahului perbaikan bug) berlaku mulai sekarang: 61 test domain tersedia di `99_tests.gs`.
