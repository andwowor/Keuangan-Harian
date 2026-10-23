# ADR-0013: Spreadsheet CASHFLOW dipilih dari tanggal transaksi, bukan link manual
Tanggal   : 2026-10-23
Status    : Accepted

## Konteks
Setiap transaksi ber-Sumber Dana **Pendapatan Usaha** juga dicatat sebagai *Setoran Owner*
di spreadsheet CASHFLOW. Pemilik membuat **satu spreadsheet per bulan** dengan judul baku
`CASHFLOW DAN BIAYA <BULAN> <TAHUN>`, dan selama ini dashboard menulis ke **satu link**
yang disimpan di Setelan (`CASHFLOW_URL`) dan harus diganti manual tiap awal bulan.

Risiko R1 ("link lupa diganti → Setoran Owner masuk bulan yang salah") **terjadi nyata pada
Juli 2026**: 20 Setoran Owner tidak ada di CASHFLOW Juli. Alat Periksa & Lengkapi yang
dibuat sebagai mitigasi punya cacat yang sama: ia hanya memeriksa spreadsheet di link aktif,
sehingga memeriksa Juli di bulan Oktober berarti membandingkan transaksi Juli dengan
CASHFLOW Oktober.

Pemilik juga meminta agar setiap langkah yang bisa dikerjakan sistem tidak lagi dibebankan
kepadanya.

## Keputusan
Spreadsheet CASHFLOW ditentukan oleh **bulan TANGGAL transaksi**, dicari di Drive lewat
judul bakunya (`driveCariSpreadsheet_`, judul harus **persis** sama).

| Hasil pencarian | Tindakan (`pilihCashflow_`, murni & teruji) |
|---|---|
| tepat 1 | dipakai |
| lebih dari 1 | **ditolak** dengan pesan — tidak menebak |
| 0, bulan berjalan | link di Setelan (cadangan; memang menunjuk bulan berjalan) |
| 0, bulan lampau | **ditolak** — tidak pernah jatuh diam-diam ke link aktif |

Berlaku untuk tiga jalur sekaligus agar konsisten: simpan harian (`appendTransaction`),
pratinjau (`previewCashflow`), serta Periksa & Lengkapi (`auditCashflowSetoran`,
`backfillCashflowSetoran`).

## Pengaman terhadap penulisan ganda
Lengkapi menulis ke catatan keuangan, jadi salah anggap "belum masuk" berarti entri ganda.

- Saat memeriksa bulan M, Setoran Owner di spreadsheet **M+1** ikut dihitung: transaksi akhir
  bulan yang dulu diinput setelah link diganti tercatat di sana.
- Spreadsheet **M−1** juga dibaca, dengan perlakuan berbeda: transaksi awal bulan yang diinput
  *sebelum* link diganti tertulis di sana (bentuk R1 yang paling umum). Entri itu salah bulan,
  jadi tetap dianggap belum masuk — bulan M memang kekurangan — tetapi ditandai `diBulanLain`
  agar pemilik menghapus salinan lamanya; sistem tidak menghapus catatan keuangan sendiri.
- Baris dikenali sebagai Setoran Owner bila **SUBJEK (A) atau KETERANGAN (B)** memuatnya —
  baris yang diketik pemilik sendiri bisa hanya mengisi salah satunya.
- Lengkapi tetap didahului daftar yang harus dilihat pemilik; tidak ada penulisan otomatis
  ke bulan lampau tanpa konfirmasi.

## Alternatif yang ditolak
- **Tetap link manual + pengingat** — mengandalkan ingatan, persis yang gagal pada Juli.
- **Jatuh ke link aktif bila spreadsheet bulan lampau tak ditemukan** — itulah mekanisme
  yang menulis Setoran Owner ke bulan yang salah.
- **Mencocokkan judul secara longgar** (mengandung, abaikan spasi) — akan ikut menangkap
  `Salinan CASHFLOW DAN BIAYA …` yang memang ada di Drive pemilik.

## Konsekuensi
+ Rutinitas "ganti link CASHFLOW tiap awal bulan" hilang; R1 tertutup pada sumbernya.
+ Periksa bulan mana pun langsung ke spreadsheet yang benar, tanpa mengganti setelan.
− Judul spreadsheet kini **bermakna**: mengganti nama spreadsheet bulanan memutus
  pencatatan bulan itu (dengan pesan yang menyebut judul yang dicari, bukan diam-diam).
− Satu pencarian Drive per simpan Pendapatan Usaha (ringan; DriveApp sudah diizinkan).
