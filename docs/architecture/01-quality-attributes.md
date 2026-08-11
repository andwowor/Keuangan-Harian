# 01 — Quality Attribute Scenarios (QAS)

Format enam bagian (Bass, Clements & Kazman 2021). Atribut mengacu **ISO/IEC 25010:2023**.
QAS inilah "spesifikasi" arsitektur — bukan daftar fitur.

---

### QAS-01 — Modifiability: rekening baru / pola nomor baru
```
Atribut      : Modifiability
Source       : Pemilik sistem
Stimulus     : Bank menampilkan nomor rekening dengan pola samaran baru
Artifact     : Modul pemetaan sumber dana (10_domain_rekening.gs)
Environment  : Waktu desain, sistem berjalan normal
Response     : Tambah/ubah satu entri ACCOUNTS atau satu strategi pencocokan
Response Msr : < 1 jam kerja; 0 perubahan di adapter/ dan application/;
               ditutup oleh test di 99_tests.gs sebelum deploy
```

### QAS-02 — Modifiability: ganti penyedia AI
```
Atribut      : Modifiability
Source       : Pemilik sistem
Stimulus     : Penyedia AI/model diganti (mis. model atau vendor lain)
Artifact     : Adapter Claude (42_adapter_claude.gs)
Environment  : Waktu desain
Response     : Ganti satu adapter outbound; kontrak hasil baca tetap
Response Msr : < 4 jam kerja; 0 perubahan di domain/ dan application/
```

### QAS-03 — Correctness/Reliability: tanggal tidak bergeser
```
Atribut      : Functional correctness (ISO 25010)
Source       : Pengguna mengunggah bukti tertanggal 14 Juli
Stimulus     : Penyimpanan transaksi ke sheet
Artifact     : Penulisan kolom TANGGAL (11_domain + 40_adapter_sheets)
Environment  : Zona waktu skrip (WITA) berbeda dari zona waktu spreadsheet
Response     : Tanggal ditulis pada zona waktu spreadsheet
Response Msr : 100% tanggal tersimpan sama dengan tanggal pada bukti (0 pergeseran hari)
```

### QAS-04 — Performance: daftar bukti tetap responsif
```
Atribut      : Performance efficiency
Source       : Pengguna membuka tab Simpanan
Stimulus     : Folder berisi ~100 bukti
Artifact     : listInbox + pemuatan thumbnail bertahap
Environment  : Jaringan seluler, operasi normal
Response     : Daftar tampil lebih dulu; thumbnail menyusul bertahap
Response Msr : Daftar tampil < 5 detik; tidak ada pemotongan senyap
               (bila dibatasi, jumlah yang dipotong DITAMPILKAN)
```

### QAS-05 — Availability: pembacaan bukti berjalan tanpa dashboard
```
Atribut      : Availability / Operability
Source       : Bukti masuk ke folder penyimpanan
Stimulus     : Pengguna menutup dashboard sebelum memproses
Artifact     : Trigger terjadwal (90_triggers.gs) + status di deskripsi berkas
Environment  : Dashboard tertutup
Response     : Bukti tetap dibaca di latar; hasil tersimpan permanen
Response Msr : Terbaca < 10 menit sejak masuk; bukti yang sudah terbaca
               TIDAK PERNAH dibaca ulang (biaya API tidak berulang)
```

### QAS-06 — Security: akses publik terlindungi
```
Atribut      : Security (ISO 25010)
Source       : Pihak tak berwenang menemukan URL /exec
Stimulus     : Membuka URL & memanggil fungsi backend
Artifact     : Gerbang PIN (44_adapter_properties.gs) + pembatasan folder
Environment  : Web app dideploy ANYONE_ANONYMOUS (agar bisa dipakai dari PWA)
Response     : Semua fungsi penulisan/pembacaan data menolak tanpa PIN benar;
               akses Drive dibatasi hanya pada folder penyimpanan
Response Msr : 0 fungsi mengubah data tanpa verifyPin_; 0 berkas Drive di luar
               folder dapat dibaca lewat ID
```

### QAS-07 — Integrity: TRANSAKSI ↔ CASHFLOW konsisten
```
Atribut      : Functional correctness
Source       : Pemilik menutup buku bulanan
Stimulus     : Sebagian Setoran Owner tidak tertulis (mis. link CASHFLOW salah bulan)
Artifact     : auditCashflowSetoran / backfillCashflowSetoran (22_app_laporan.gs)
Environment  : Akhir bulan
Response     : Selisih terdeteksi & dapat dilengkapi tanpa menggandakan entri
Response Msr : Pelengkapan idempoten — dijalankan berulang menghasilkan 0 duplikat
```
