# View: Deployment

```
┌── HP (Android/iOS) ─────────────┐
│  PWA shell (GitHub Pages)       │   docs/index.html + sw.js + manifest
│    └─ <iframe> ──────────────┐  │
└──────────────────────────────│──┘
                               ▼
             Google Apps Script Web App  (/exec)
             executeAs: USER_DEPLOYING · access: ANYONE_ANONYMOUS
             dilindungi Script Property APP_PIN
                    │
    ┌───────────────┼───────────────┬────────────────┬─────────────┐
    ▼               ▼               ▼                ▼             ▼
 Google Sheets   Google Sheets   Google Drive    api.anthropic   api.frankfurter
 ANALISA         CASHFLOW &      folder inbox    .com            .app
 KEUANGAN        BIAYA <bulan>   (bukti)         (Claude Vision) (kurs ECB)
```

## Artefak & lokasi

| Artefak | Lokasi | Catatan |
|---|---|---|
| Kode backend | Apps Script project | 17 modul `.gs` ber-prefix |
| UI | `Index.html` (HtmlService) | disajikan oleh `doGet` |
| Shell PWA | GitHub Pages `docs/` | hanya pembungkus; tanpa aturan bisnis |
| Rahasia | Script Properties | `ANTHROPIC_API_KEY`, `APP_PIN`, `CASHFLOW_URL` |
| Data | Google Sheets & Drive | tidak ada database terpisah |

## Trigger

| Trigger | Handler | Interval |
|---|---|---|
| Time-driven | `autoReadInbox` | ±5 menit (dipasang lewat tombol di tab Simpanan) |

## Zona waktu
Skrip **WITA (`Asia/Makassar`)** — `TIMEZONE` di `00_config.gs` dan `timeZone` di `appsscript.json`.
Penulisan TANGGAL mengikuti zona waktu **spreadsheet** agar tidak bergeser (lihat QAS-03).
