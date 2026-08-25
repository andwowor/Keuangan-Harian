# ADR-0008: Tema visual terang untuk aplikasi keuangan
Tanggal   : 2026-08-25
Status    : Accepted (menggantikan tema gelap "futuristik" sebelumnya)

## Konteks
Tema sebelumnya gelap-futuristik (navy, neon cyan-ungu, glass card) atas permintaan
pemilik. Pemilik kemudian menunjukkan template Figma "Furniro" (landing page e-commerce
furnitur) sebagai referensi. Template itu **tata letaknya tidak dapat dipakai** - halaman
pemasaran desktop, sedangkan dashboard ini aplikasi kerja mobile-first berisi form, tabel,
combobox, dan antrean bukti. Yang relevan hanyalah bahasa visualnya.

Pemilik memilih: versi TERANG yang cocok untuk aplikasi keuangan, memakai prinsip
spasi/tipografi referensi tersebut, tanpa nuansa toko furnitur.

## Keputusan
Tema terang berbasis netral + SATU warna aksen:
- latar `#F6F7F9`, kartu putih, garis `#E4E7EC`, teks `#16181D`/`#767C88`
- aksen tunggal indigo `#4F46E5` (hover `#4338CA`, lembut `#EEF0FE`)
- radius 14px (kartu) / 10px (kontrol), bayangan lembut, spasi lebih lega

**Warna aksen sengaja BUKAN hijau atau merah**, karena keduanya dipakai sebagai MAKNA
angka pada aplikasi keuangan: hijau = pemasukan/positif (`#047857`), merah =
pengeluaran/negatif (`#C6303B`). Aksen netral mencegah warna aksi tertukar dengan
warna arti angka.

Seluruh warna hidup di CSS custom property pada satu blok `<style>` `Index.html`;
tidak ada warna literal di markup, sehingga penggantian tema cukup satu tempat.
Shell PWA (`docs/`), `theme_color`, dan `background_color` manifest ikut disamakan.

## Alternatif yang ditolak
- **Mengadopsi tata letak Furniro apa adanya**: komponennya (hero, grid produk,
  testimoni, newsletter) tidak ada padanannya di dashboard ini.
- **Memakai palet krem/emas Furniro**: nuansa ritel furnitur tidak sesuai konteks keuangan.
- **Mempertahankan tema gelap**: ditolak pemilik pada percakapan ini.
- **Mode gelap otomatis (`prefers-color-scheme`)**: ditunda - menambah permukaan uji
  tanpa permintaan; dicatat sebagai kemungkinan lanjutan.

## Konsekuensi
+ Angka lebih mudah dibaca pada layar terang di luar ruangan.
+ Makna warna (hijau/merah) tidak lagi bersaing dengan warna aksen neon.
+ Penggantian tema berikutnya cukup mengubah token di `:root`.
− Ikon PWA lama masih bernuansa gelap; belum diselaraskan (utang kecil).
− Tidak ada mode gelap; pemakaian malam hari lebih terang dari sebelumnya.
