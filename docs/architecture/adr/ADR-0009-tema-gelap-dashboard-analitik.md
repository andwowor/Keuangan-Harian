# ADR-0009: Tema gelap analitik, diadaptasi dari Figma "Sales Management Dashboard"
Tanggal   : 2026-08-25
Status    : Accepted (menggantikan ADR-0008 tema terang)

## Konteks
Pemilik menunjuk template Figma *Sales Management Dashboard (Community)* dan meminta
desain itu dipakai. Berbeda dengan referensi sebelumnya (landing page e-commerce), template
ini memang **dashboard analitik**, sehingga komponennya punya padanan langsung di aplikasi ini:
stat card, tabel dengan bar proporsi + pil persen, dan meter persentase.

## Keputusan
Mengadopsi bahasa visual template tersebut, dengan token diambil langsung dari file Figma
(`get_design_context` pada node 1:23):

| Peran | Nilai |
|---|---|
| Latar halaman | `#0E0F14` |
| Panel | `#21222D` |
| Tile / permukaan dalam | `#171821` |
| Teks | `#FFFFFF` / `#E8E8E8` / `#A0A0A0` |
| Aksen utama (mint) | `#A9DFD8` |
| Aksen sekunder | `#FEB95A`, `#20AEF3`, `#F2C8ED` |
| Radius | 10px · Tipografi Inter |

Komponen yang diadaptasi ke menu Budget:
- **Stat tile** (dari "Today's Sales") → Total Pemasukan, Total Pengeluaran, Sisa Saldo, Sisa Budget
- **Meter persentase** (dari "Earnings 80%") → gauge pemakaian budget
- **Bar proporsi + pil persen** (dari "Top Products") → biaya per kategori & sisa kantong

## Alternatif yang ditolak
- **Meniru layout desktop bersidebar apa adanya**: aplikasi ini mobile-first; sidebar 132px
  dan grid 1200px tidak dapat dipakai. Navigasi tetap tab atas.
- **Memakai ikon ekspor dari Figma**: URL aset kedaluwarsa ~7 hari dan lingkungan build ini
  tidak dapat mengunduhnya. Ikon memakai glyph sendiri; tidak ada aset Figma yang direferensikan.
- **Mempertahankan tema terang ADR-0008**: ditolak pemilik.

## Konsekuensi
+ Angka ringkasan jauh lebih mudah dipindai (stat tile + gauge) dibanding daftar teks.
+ Proporsi tiap kategori terlihat langsung lewat bar & persen, tanpa menghitung manual.
+ Warna semantik tetap terjaga: mint = pemasukan/positif, `#FF8A8A` = pengeluaran/negatif.
− Kembali gelap; pemakaian di luar ruangan terang lebih sulit dibaca daripada ADR-0008.
− Ikon PWA lama masih belum selaras (utang D6 tetap terbuka).
