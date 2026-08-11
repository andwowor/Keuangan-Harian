# ADR-0007: Zona waktu sistem WITA (Asia/Makassar)
Tanggal   : 2026-08-11
Status    : Accepted (menggantikan pemakaian Asia/Jakarta sebelumnya)

## Konteks
Pemilik berdomisili di zona WITA. Sebelumnya skrip memakai `Asia/Jakarta` (WIB, UTC+7),
sehingga "hari ini" pada dashboard bisa berbeda dari waktu setempat menjelang tengah malam.
Pernah terjadi bug tanggal bergeser satu hari saat penyimpanan.

## Keputusan
`TIMEZONE = 'Asia/Makassar'` di `00_config.gs` dan `timeZone` di `appsscript.json`.
Penulisan kolom TANGGAL tetap memakai **zona waktu spreadsheet** (`sheetsTz_`), bukan zona
skrip, agar tanggal tidak bergeser walau keduanya berbeda.

## Alternatif yang ditolak
- **Menyimpan tanggal sebagai teks saja**: merusak formula & pengurutan di sheet.
- **UTC**: menyulitkan pembacaan manusia dan penentuan bulan berjalan.

## Konsekuensi
+ "Hari ini", bulan berjalan, dan stempel waktu bukti sesuai waktu setempat.
− Pemilik disarankan menyetel zona waktu spreadsheet ke (GMT+08:00) Makassar agar seragam
  (sensitivity point S1).
