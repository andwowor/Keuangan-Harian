# ADR-0014: Rekomendasi KATEGORI BIAYA dari history, deterministik
Tanggal   : 2026-11-03
Status    : Accepted

## Konteks
Pemilik menambahkan kolom **K — KATEGORI BIAYA** pada sheet TRANSAKSI, dengan dropdown ketat
yang mengambil daftar dari `'KATEGORI BIAYA'!A2:A` (29 kategori, masing-masing dengan teks
CAKUPAN). Seluruh ±1.770 transaksi lama sudah dikategorikan. Permintaannya:

> KATEGORI BIAYA harus kamu tambahkan pada isian wajib pada menu Input. Saat mengisi, berikan
> rekomendasi berdasarkan analisamu dari history biaya yang sudah dicatat kategori biayanya.
> Pengisian dilakukan dengan memilih dari daftar yang ada pada dropdown list.

## Temuan dari data
Kategori **tidak sejalan** dengan POS BIAYA. Menebak dengan kategori terbanyak per POS hanya
benar **48,2%** — `DAILY DRIVER` terbelah antara Makanan & Minuman (250) dan Belanja Dapur
(232), `BIAYA KULIAH CHINA` serupa. Pembeda sesungguhnya ada di KETERANGAN.

## Keputusan
Rekomendasi dihitung **deterministik** dari frekuensi history (`18_domain_kategori.gs`), dengan
empat jenis bukti berbobot:

| Bukti | Bobot | Contoh |
|---|---|---|
| POS + keterangan utuh | 4 | `DAILY DRIVER` + "Kopi" |
| Keterangan utuh | 3 | "Belanja Bulanan" |
| Kata dalam keterangan & merchant bukti | 2 (dibagi rata) | "kopi", "grab" |
| POS saja | 1 | `Isi Bensin` |
| Kata pada teks CAKUPAN kategori | 1,2 | kata baru "parkir" → Transportasi |

Setiap bukti menyumbang `P(kategori | bukti) × bobot × n/(n+1)`, sehingga satu kejadian tidak
mengalahkan pola yang muncul puluhan kali. Hasil: maksimal 3 saran beserta **alasan** dari
bukti terkuat ("12 dari 14 transaksi berketerangan 'Kopi'").

Daftar pilihan dibaca dari **aturan dropdown kolom K** itu sendiri (`sheetsDaftarKategori_`),
bukan dari nama sheet — pilihan dashboard selalu sama persis dengan pilihan sheet. Kategori
yang tidak ada di dropdown tidak pernah direkomendasikan dan ditolak saat simpan, karena
penulisan lewat Apps Script **melewati** validasi dropdown Sheets.

## Diuji pada history nyata
Setiap transaksi ditebak hanya dari transaksi **sebelumnya** (meniru pemakaian sesungguhnya),
1.572 transaksi dinilai:

| | Benar |
|---|---|
| Hanya POS (pembanding) | 48,2% |
| **Saran teratas** | **82,4%** |
| **Masuk 3 saran** | **96,8%** |
| — keterangan terisi | 86,2% |
| — keterangan kosong | 50,0% |

Bobot diuji dalam beberapa kombinasi; semuanya 81–83%, jadi hasil tidak bergantung pada
angka yang kebetulan pas.

## Alternatif yang ditolak
- **Menebak dari POS** — 48%, separuh salah.
- **Menyerahkan ke model bahasa** — tidak deterministik, tidak bisa diuji tanpa jaringan, dan
  tidak "belajar" dari koreksi pemilik kecuali prompt-nya diubah. Model frekuensi ikut
  berubah sendiri setiap kali pemilik menyimpan transaksi.
- **Menyalin daftar kategori ke kode** — langsung usang saat pemilik menambah kategori.

## Konsekuensi
+ Saran teratas langsung terpilih (kotak "Terisi otomatis dari history — konfirmasi"); begitu
  pemilik memilih sendiri, saran berikutnya tidak menimpa pilihannya.
+ Pada Edit, kategori yang sudah tercatat dihormati; saran hanya ditampilkan.
− Model disimpan di cache Apps Script (batas 100 KB per entri). Kategori disimpan sebagai
  nomor urut sehingga model history pemilik 57 KB, bukan 95 KB; bila suatu saat melewati
  batas, model dihitung ulang tiap permintaan (lebih lambat, tetap benar).
− Keterangan kosong hanya bisa ditebak dari POS (50%); di situ 3 saran yang ditampilkan
  menjadi andalan.
