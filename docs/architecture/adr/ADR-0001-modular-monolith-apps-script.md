# ADR-0001: Modular monolith (Layered + Ports & Adapters) di Google Apps Script
Tanggal   : 2026-08-11
Status    : Accepted

## Konteks
Pengembang tunggal. Sistem punya banyak integrasi eksternal (Sheets ×2, Drive, Claude, kurs).
Kebutuhan kualitas terkuat: *modifiability* (aturan rekening/POS/bulan sering berubah) dan
*usability*, bukan *scalability*. Hukum Conway (P8) menolak microservices untuk tim 1 orang.
Apps Script tidak punya folder — namespace datar.

## Keputusan
Kami memakai **modular monolith**: Layered + Ports & Adapters, direalisasikan dengan
**prefix nama berkas** sesuai Standar §4.3 Varian B:
`00_config`, `05_shared`, `1x_domain_*`, `2x_app_*`, `4x_adapter_*`, `50_inbound_*`, `90_triggers`, `99_tests`.
Dependensi hanya mengarah ke dalam; `domain` tidak memanggil API Google apa pun.

## Alternatif yang ditolak
- **Satu berkas `Code.gs`** (kondisi sebelumnya): melanggar P1/P2; domain & vendor bercampur;
  fungsi terkompleks mencapai McCabe 42.
- **Microservices / pemisahan layanan**: ditolak oleh Hukum Conway untuk tim 1 orang.
- **Pindah ke Cloudflare Workers + D1**: lihat ADR-0002.

## Konsekuensi
+ Aturan bisnis dapat diuji tanpa API Google (61 test domain berjalan di Node/editor).
+ Satu sistem eksternal = satu adapter → penggantian vendor terlokalisasi.
− Penyalinan manual ke editor Apps Script kini 17 berkas → disarankan `clasp push` (R5).
− Beberapa fungsi lama masih kompleks (utang D1).
