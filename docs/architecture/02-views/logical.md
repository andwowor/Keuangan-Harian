# View: Logical (Kruchten 4+1)

## Lapisan & aturan dependensi

```
        adapters (inbound)          adapters (outbound)
   50_inbound_webapp  90_triggers   40_sheets 41_drive 42_claude 43_kurs 44_properties
              │                                    ▲
              ▼                                    │
        ┌──────────────────────────────────────────┴───┐
        │  application  (20_transaksi 21_inbox 22_laporan)
        └──────────────────────┬───────────────────────┘
                               ▼
        ┌──────────────────────────────────────────────┐
        │  domain (MURNI)                              │
        │  10_rekening 11_transaksi 12_cashflow 13_inbox 14_pos 15_budget
        └──────────────────────────────────────────────┘
                               ▲
                    05_shared (utilitas platform)
                    00_config (konstanta)

Dependensi hanya mengarah ke DALAM. domain tidak menunjuk ke mana pun.
```

## Modul & keputusan yang disembunyikan

| Modul | Lapisan | Menyembunyikan |
|---|---|---|
| `00_config.gs` | config | ID sheet/folder, model AI, daftar POS & sumber dana |
| `05_shared.gs` | shared | format tanggal/uang, parsing data URL, hash hex |
| `10_domain_rekening.gs` | domain | aturan sumber dana: nomor utuh → nama → nomor tersamar → kartu kredit |
| `11_domain_transaksi.gs` | domain | field wajib, aturan Rekening, nilai NOMINAL/TANGGAL, susunan baris A..J |
| `12_domain_cashflow.gs` | domain | bentuk baris Setoran Owner & pemetaan bank |
| `13_domain_inbox.gs` | domain | mesin status baca-otomatis + format metadata deskripsi berkas |
| `14_domain_pos.gs` | domain | pemetaan **penerima → POS BIAYA** + pengenalan daftar POS dari struktur REAL |
| `15_domain_budget.gs` | domain | penyusunan menu Budget: rentang biaya/kantong + baris TOTAL/SALDO by label |
| `20_app_transaksi.gs` | application | use case simpan/ubah/ambil transaksi |
| `21_app_inbox.gs` | application | use case unggah, baca, hapus bukti |
| `22_app_laporan.gs` | application | budget, daftar biaya, history, audit CASHFLOW |
| `40_adapter_sheets.gs` | adapter out | **satu-satunya** pemanggil `SpreadsheetApp` |
| `41_adapter_drive.gs` | adapter out | **satu-satunya** pemanggil `DriveApp` |
| `42_adapter_claude.gs` | adapter out | HTTP ke `api.anthropic.com` + skema structured output |
| `43_adapter_kurs.gs` | adapter out | HTTP ke Frankfurter/ECB + cache kurs |
| `44_adapter_properties.gs` | adapter out | Script Properties (PIN) |
| `50_inbound_webapp.gs` | adapter in | `doGet`, widget, konfigurasi UI |
| `90_triggers.gs` | adapter in | trigger terjadwal baca-otomatis |
| `99_tests.gs` | test | uji domain murni + diagnostik |

## Uji cepat kepatuhan (§4.1)

```bash
grep -nE '\b(SpreadsheetApp|DriveApp|UrlFetchApp|PropertiesService|CacheService|ScriptApp|HtmlService|ContentService)\.' \
  05_shared.gs 1?_domain_*.gs   # HARUS kosong
```
