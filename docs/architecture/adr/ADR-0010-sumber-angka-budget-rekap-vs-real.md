# ADR-0010: REKAP = budget, REAL = sisa budget
Tanggal   : 2026-08-25
Status    : Accepted

## Konteks
Menu Budget semula memperlakukan angka pada sheet **REAL** sebagai **pengeluaran**, lalu
menghitung persentase tiap kategori terhadap total pengeluaran. Pemilik mengoreksi:

> "Angka 0 pada setiap biaya pada sheet REAL artinya seluruh budget pada masing-masing biaya
> sudah terserap atau sudah terpakai semua. Budget per masing-masing pos biaya ada pada sheet REKAP."

Artinya angka REAL adalah **SISA budget**, bukan pengeluaran — dan pembanding persentase
yang benar adalah **budget pada sheet REKAP**, bukan total pengeluaran.

## Keputusan
- **REKAP** = alokasi **budget** per pos biaya.
- **REAL** = **sisa** budget per pos (0 = habis terserap).
- **terpakai = budget − sisa** (dijepit minimal 0 bila sisa melebihi budget).
- **% terpakai = terpakai / budget**, dipakai untuk gauge pemakaian budget maupun bar/pil
  persen pada Biaya per Kategori.
- Total pada ringkasan **dihitung dari baris item**, bukan diambil dari baris `TOTAL` sheet —
  label baris total peninggalan lama tidak dapat diandalkan setelah makna kolom berubah.
- Tata letak REKAP diasumsikan **sejajar REAL** (baris POS & kolom bulan sama), sehingga
  pembacaan memakai baris + kolom yang sama.

## Penanganan bila budget tidak tersedia
Bila REKAP tidak terbaca atau budget sebuah pos bernilai 0, sistem **tidak menampilkan
persentase apa pun** (`pct = -1`, `adaBudget = false`) dan menampilkan tanda `—` atau pesan
"Angka budget tidak terbaca dari sheet REKAP". Ini disengaja: pada aplikasi keuangan,
persentase yang salah lebih berbahaya daripada persentase yang tidak ditampilkan.

## Alternatif yang ditolak
- **Memakai baris `TOTAL PENGELUARAN` REAL sebagai pembagi**: labelnya tidak lagi mencerminkan
  isi setelah makna kolom dipahami sebagai sisa.
- **Menebak kolom REKAP dari nama bulan sendiri**: header REKAP memakai dua baris
  (tahun + singkatan bulan), berbeda dari REAL. Memakai kolom REAL yang sudah terbukti
  lebih aman.
- **Menampilkan persentase dengan asumsi budget = pengeluaran bila REKAP kosong**: ditolak,
  menghasilkan angka menyesatkan.

## Ambang status (warna di menu Budget)

| Persen terpakai | Status | Warna |
|---|---|---|
| `< 80%` | `aman` | hijau `#5FD68A` |
| `>= 80%` | `waspada` | kuning `#FEB95A` |
| `>= 100%` | `habis` | merah `#FF6B6B` |

Tepat **80% dihitung waspada** — ambang peringatan bersifat inklusif, sehingga tidak ada
nilai yang jatuh di celah antara "di bawah 80%" dan "di atas 80%". Ambang disimpan sebagai
`AMBANG_WASPADA` / `AMBANG_HABIS` di `00_config.gs`; klasifikasinya adalah aturan domain
(`statusBudget_`), UI hanya memetakan status ke warna.

Persentase **tidak dipangkas di 100**: pos yang sisanya minus berarti budget terlampaui dan
harus terlihat apa adanya (mis. `DAILY DRIVER` Agustus 2026 = 103%, sisa −Rp442.220). Yang
dibatasi hanya **lebar bar** dan cincin gauge, karena itu urusan tata letak. Pos di atas
100% diberi pil `lebih` untuk membedakannya dari pos yang pas terserap (`habis`).

## Verifikasi
`cekBudgetRekap()` di `99_tests.gs` mencetak perbandingan berdampingan
(baris · POS · budget · sisa · terpakai · %) untuk satu bulan, agar keselarasan baris/kolom
REKAP↔REAL dapat dipastikan sebelum angkanya dipercaya. 19 test domain menutup aturan ini.

Keselarasan baris/kolom sudah **diverifikasi pada data nyata** (Agustus 2026, kolom AK):
budget per pos terbaca dan nama POS di REAL sejajar dengan baris yang sama di REKAP.

## Konsekuensi
+ Persentase akhirnya bermakna: "berapa persen budget pos ini sudah terpakai".
+ Pos yang budgetnya habis ditandai eksplisit (`habis`).
− Menu Budget kini bergantung pada satu sheet tambahan (REKAP); bila tata letaknya berubah,
  angka budget hilang (ditangani dengan tampilan `—`, bukan angka salah).
