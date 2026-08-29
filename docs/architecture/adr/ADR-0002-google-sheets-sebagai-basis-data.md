# ADR-0002: Google Sheets sebagai basis data (bukan DB terpisah)
Tanggal   : 2026-08-11
Status    : Accepted

## Konteks
Pemilik sudah memiliki spreadsheet "ANALISA KEUANGAN" berisi rekap, pivot, dan formula
(sheet REAL) yang dipakai untuk pengambilan keputusan. Volume data ratusan baris/bulan.

## Keputusan
Sheets tetap menjadi sumber kebenaran. Dashboard hanya **menambah/mengubah baris**;
seluruh rekap tetap dihitung formula yang sudah ada.

## Alternatif yang ditolak
- **Cloudflare D1 / Postgres**: memaksa migrasi rekap & memutus alur kerja pemilik.
- **Firestore**: sama, plus menambah vendor baru tanpa manfaat pada kualitas yang dituju.

## Konsekuensi
+ Nol migrasi data; rekap bulanan otomatis sinkron.
+ Pemilik tetap bisa mengoreksi manual langsung di spreadsheet.
− Tanpa transaksi ACID; penulisan bersamaan tidak dijamin atomik (dapat diterima: pengguna tunggal).
− Terikat tata letak kolom (sensitivity point S3) → diisolasi di `40_adapter_sheets.gs`.
