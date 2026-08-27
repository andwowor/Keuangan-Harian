# 00 — Ikhtisar & Konteks Arsitektur

**Sistem:** Keuangan Harian — dashboard pencatatan biaya pribadi dari screenshot/bukti transfer.
**Standar acuan:** *Standar Arsitektur Perangkat Lunak v1.0 (Andre S. Wowor)* · ISO/IEC/IEEE 42010:2022.
**Gaya arsitektur:** Modular Monolith = **Layered + Ports & Adapters + Event-driven** pada batas otomasi (§3).

## Stakeholder & Concern (ISO 42010)

| Stakeholder | Concern utama |
|---|---|
| Pemilik (pengguna tunggal) | Input biaya cepat & minim koreksi; data akurat; bisa dipakai dari HP |
| Pemilik (sebagai pengembang) | *Modifiability* — aturan rekening/POS/bulan sering berubah |
| Akuntan / pembukuan | Konsistensi TRANSAKSI ↔ CASHFLOW (Setoran Owner) |
| Google (platform) | Batas kuota Apps Script, izin OAuth |
| Anthropic (penyedia AI) | Batas ukuran gambar & kuota API |

## Batas sistem

```
[HP/PWA] ─▶ Web App (Apps Script)
                 ├─▶ Google Sheets  : ANALISA KEUANGAN (TRANSAKSI, REAL, REKAP, AI_MEMORY)
                 ├─▶ Google Sheets  : CASHFLOW & BIAYA <bulan berjalan>
                 ├─▶ Google Drive   : folder penyimpanan bukti (inbox)
                 ├─▶ Claude API     : pembacaan gambar (vision, structured output)
                 └─▶ Frankfurter/ECB: kurs mata uang asing
```

## Keputusan yang dianggap paling volatil (Parnas 1972)

Tiap keputusan di bawah **disembunyikan di balik satu modul dengan antarmuka stabil**:

| Keputusan volatil | Modul penyembunyi |
|---|---|
| Daftar rekening/kartu → SUMBER DANA | `10_domain_rekening.gs` |
| Aturan baris & nilai NOMINAL/TANGGAL | `11_domain_transaksi.gs` |
| Daftar penerima tetap → POS BIAYA | `14_domain_pos.gs` |
| Rentang baris & baris ringkasan menu Budget | `15_domain_budget.gs` |
| Arti angka REAL (sisa) vs REKAP (budget) | `15_domain_budget.gs` — [ADR-0010](adr/ADR-0010-sumber-angka-budget-rekap-vs-real.md) |
| Rentang pantau & ambang peringatan saldo minus | `15_domain_budget.gs` |
| Aturan baris Setoran Owner | `12_domain_cashflow.gs` |
| Status baca-otomatis bukti | `13_domain_inbox.gs` |
| ID spreadsheet CASHFLOW (ganti tiap bulan) | Script Property `CASHFLOW_URL` |
| Struktur sheet & lokasi kolom | `40_adapter_sheets.gs` |
| Penyedia AI & format promptnya | `42_adapter_claude.gs` |
| Penyedia kurs | `43_adapter_kurs.gs` |

## Peta dokumen

- `01-quality-attributes.md` — QAS enam-bagian (spesifikasi arsitektur sebenarnya)
- `02-views/` — logical, deployment, process (Kruchten 4+1)
- `03-evaluation.md` — trade-off, sensitivity point, risiko, utang teknis (ATAM ringan)
- `adr/` — catatan keputusan arsitektur (format Nygard)
