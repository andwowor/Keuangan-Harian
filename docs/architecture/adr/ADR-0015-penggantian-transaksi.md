# ADR-0015: Penggantian transaksi — disimpan di baris transaksinya sendiri
Tanggal   : 2026-11-27
Status    : Accepted

## Konteks
Sebagian biaya nantinya **diganti** (reimburse), misalnya biaya kantor yang dibayar dulu
lalu dikembalikan, kadang sekaligus, kadang dicicil. Pemilik meminta:

- tanda "akan ada penggantian" saat input;
- tanda itu tampil dan bisa difilter di Riwayat Biaya;
- transaksi bertanda bisa diklik untuk mencatat penggantian yang masuk — **lebih dari satu**,
  masing-masing dengan nominal dan tanggal;
- total penggantian **mengurangi** nominal transaksi.

## Keputusan
Seluruh data penggantian disimpan di **baris transaksinya sendiri**, kolom L–O sheet
TRANSAKSI (judulnya dibuat otomatis bila kosong; tidak pernah menimpa judul lain):

| Kolom | Isi |
|---|---|
| L PENGGANTIAN | `MENUNGGU` / `SELESAI` (kosong = tidak ditandai) |
| M NOMINAL AWAL | salinan **persis** isi NOMINAL sebelum dikurangi — formula kurs RMB ikut tersalin sebagai formula |
| N TOTAL PENGGANTIAN | jumlah seluruh penggantian |
| O RINCIAN PENGGANTIAN | `2026-12-01=300000; 2026-12-05=200000` |

**NOMINAL (C) selalu dihitung ulang** = NOMINAL AWAL − total penggantian, tidak pernah
dikurangi sedikit demi sedikit. Menyimpan ulang, menghapus satu penggantian, atau mengedit
nominal awal selalu menghasilkan angka benar. Karena REAL/REKAP menjumlah kolom C, budget
ikut terkoreksi tanpa mengubah satu pun formula pemilik.

Bila seluruh penggantian dihapus, isi NOMINAL **dipulihkan dari M apa adanya**, termasuk
formulanya. Selama ada penggantian, C berisi angka bersih; formula asli tetap utuh di M.

## Alternatif yang ditolak
- **Sheet PENGGANTIAN terpisah** yang merujuk nomor baris transaksi — rujukan rusak begitu
  baris TRANSAKSI diurutkan atau disisipi, dan tidak ada kolom ID yang stabil.
- **Mengurangi C setiap ada penggantian** tanpa menyimpan awal — tidak bisa dikoreksi bila
  salah ketik, dan formula kurs hilang.
- **Membangun formula `=(formula asli)-total`** — format formula Apps Script vs lokal
  Indonesia (koma desimal) tidak dijamin bolak-balik; menyalin sel (`copyTo`) tidak punya
  masalah itu.

## Pengaman
- Total penggantian **tidak boleh melebihi** nominal awal — ditolak sebelum menulis apa pun.
- Pada Edit, yang diedit adalah **nominal awal**; C dihitung ulang. Tanda tidak bisa dilepas
  selama masih ada rincian penggantian.
- **Audit Setoran Owner memakai nominal awal.** Setoran Owner di CASHFLOW dicatat sebelum ada
  penggantian; memakai nominal bersih akan membuat audit menganggapnya "belum masuk" lalu
  Lengkapi menulis ganda (`nominalAsliTransaksi_`).
- Pembacaan sheet tahan bila sheet belum punya kolom sampai O: kolom yang tidak ada dibaca
  kosong, dan kolom ditambahkan saat pertama kali menandai.

## Konsekuensi
+ Satu baris = satu kebenaran; pemilik bisa membaca dan memeriksa semuanya langsung di sheet.
+ Diuji: 31 test domain + 23 skenario ujung-ke-ujung menjalankan **adapter asli** terhadap
  tiruan spreadsheet (input, dua penggantian, penolakan, edit, lepas tanda, formula RMB pulih).
− Penggantian untuk transaksi Pendapatan Usaha **tidak** mengubah Setoran Owner di CASHFLOW
  (sama seperti Edit) — sesuaikan manual bila perlu.
− Mengubah kolom C langsung di sheet pada transaksi bertanda akan tertimpa saat penggantian
  berikutnya disimpan; ubah lewat Edit di dashboard (yang memperbarui nominal awal).
