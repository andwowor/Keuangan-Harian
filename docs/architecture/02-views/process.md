# View: Process (alur runtime)

## P1 — Input biaya dari bukti (sinkron)

```
Pengguna ▶ unggah gambar ▶ analyzeImage (42_adapter_claude)
   ▶ detectAccount_ (10_domain)  ─ tentukan SUMBER DANA
   ▶ konversi kurs bila valas (43_adapter_kurs)
   ▶ [UI] tinjau & koreksi
   ▶ appendTransaction (20_app)
        ├─ validasiTransaksi_ / rekeningTransaksi_ / nilaiNominal_  (11_domain)
        ├─ sheetsSiapkanBarisBaru_ + sheetsTulisBarisTransaksi_     (40_adapter)
        ├─ logMemory_  → AI_MEMORY (pembelajaran)
        ├─ writeCashflow_ bila SUMBER DANA = PENDAPATAN USAHA
        └─ trashInboxQuiet_ bila bukti berasal dari folder penyimpanan
```

## P2 — Baca bukti otomatis di latar (asinkron, event-driven)

```
Bukti masuk folder ──▶ status "pending" (deskripsi berkas)
                          │
        ┌─────────────────┴──────────────────┐
        ▼                                    ▼
 readInboxNow (saat unggah)         autoReadInbox (trigger ±5 mnt)
        └────────────┬───────────────────────┘
                     ▼
        inboxNeedsRead_ (13_domain)  ─ lewati 'done' & 'error'
                     ▼
        inboxReadOne_ ▶ analyzeImg_ ▶ simpan hasil ke deskripsi berkas ('done')
                     ▼
        "Proses terpilih" memakai hasil tersimpan → TANPA panggilan API ulang
```

**Idempotensi:** status disimpan permanen pada berkas, sehingga bukti yang sudah terbaca
tidak pernah dibaca ulang meski file baru ditambahkan (QAS-05).

## P3 — Audit & pelengkapan Setoran Owner

```
auditCashflowSetoran(bulan, tahun)
   ▶ sheetsBacaTransaksi_ (Pendapatan Usaha, difilter TANGGAL)
   ▶ sheetsBacaCashflowSetoran_ (multiset "tanggal|nominal")
   ▶ selisih = yang belum tercatat
backfillCashflowSetoran ▶ tulis hanya selisihnya (idempoten, QAS-07)
```

## Konkurensi
Aplikasi pengguna tunggal. Risiko balapan hanya antara **trigger latar** dan **pemakaian
interaktif**; ditangani dengan penanda status `reading` + ambang macet 10 menit
(`INBOX_READING_STALE_MS`), bukan dengan penguncian.
