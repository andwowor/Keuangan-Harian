# ADR-0011: Review biaya — angka dihitung domain, narasi oleh model
Tanggal   : 2026-08-27
Status    : Accepted

## Konteks
Pemilik meminta review penggunaan biaya di bawah ringkasan menu Budget, **khusus bulan
berjalan**, dengan tiga sasaran:

> "evaluasi mana biaya saya yang sudah berlebihan dan berikan rekomendasi … kamu juga bisa
> evaluasi dari history transaksi saya tersebut, biaya apa yang mungkin lupa saya
> proyeksikan pada sheet REKAP."

Cara termudah adalah mengirim seluruh isi sheet TRANSAKSI ke model dan meminta analisa
lengkap. Cara itu ditolak: model bahasa **tidak dapat diandalkan sebagai kalkulator**, dan
kesalahan aritmetika pada laporan keuangan tidak terlihat sebagai kesalahan — ia terlihat
seperti fakta. Pemilik akan mengambil keputusan uang berdasarkan angka itu.

## Keputusan
Tanggung jawab dipisah tegas:

| Bagian | Pemilik tanggung jawab | Modul |
|---|---|---|
| **Semua angka** — agregat per pos, rerata riwayat, persen, selisih, kelebihan, usulan dasar | Domain murni, deterministik | `16_domain_review.gs` |
| **Narasi & saran** — arti angka, prioritas, tindakan | Model bahasa | `42_adapter_claude.gs` |

Model menerima **fakta yang sudah jadi** dan diberi aturan mutlak pada system prompt:
tidak menghitung, tidak menaksir, tidak menyebut angka yang tidak ada pada data, tidak
mengarang pos biaya. Skema keluaran dikunci `json_schema`.

## Aturan penilaian (semuanya di domain, dapat diuji tanpa jaringan)
| Temuan | Aturan |
|---|---|
| `berlebihan` | `pct >= 100` — budget sudah terlampaui |
| `mendekati` | `80 <= pct < 100` |
| `lajuCepat` | `pct − porsiBulan >= REVIEW_AMBANG_LAJU` (15 poin), hanya untuk pos yang belum waspada |
| `tanpaBudget` | ada pengeluaran bulan ini, budget REKAP = 0 |
| `rutinTerlewat` | muncul di `>= REVIEW_MIN_BULAN_RUTIN` (3) bulan berbeda, budget REKAP = 0, belum masuk `tanpaBudget` |
| `naikTajam` | pemakaian bulan ini `>= REVIEW_AMBANG_NAIK` (50%) di atas rerata riwayat |

`porsiBulan` = persen hari yang sudah berlalu. Tanpa itu, pos yang terpakai 70% pada tanggal
5 dan pada tanggal 28 akan dinilai sama — padahal yang pertama bermasalah.

Setiap pos hanya muncul pada **satu** kategori. Pos yang sudah lewat budget tidak diulang
sebagai "mendekati", dan pos yang sudah dilaporkan `tanpaBudget` tidak diulang sebagai
`rutinTerlewat` — pengulangan melemahkan sinyal, bukan menguatkannya.

## Jadwal pembaruan
Pemilik meminta analisa diperbarui **sekali sehari pukul 23.59 WITA**, dan analisa pertama
tersedia langsung tanpa menunggu jadwal. Karena itu:

- **Angka** dihitung ulang **setiap kali** menu Budget dibuka — murah, langsung dari sheet.
- **Narasi & saran** diperbarui oleh trigger harian `reviewHarianJalan` pada
  `REVIEW_JAM:REVIEW_MENIT` waktu `TIMEZONE`, lalu disimpan di Script Property
  `REVIEW_HARIAN`. Cache Apps Script tidak dipakai karena umurnya maksimal 6 jam.
- **Analisa pertama** dibuat saat menu Budget dibuka bila belum ada yang tersimpan, sehingga
  pemilik tidak perlu menunggu sampai tengah malam.
- Bila domain tidak menemukan satu pun temuan, model **tidak dipanggil sama sekali**.

Trigger harian Apps Script berjalan dalam **jendela ±15 menit** dari jam yang diminta; ini
batasan platform, bukan pilihan desain, dan disebutkan apa adanya di UI ("tiap 23.59 WITA").

Karena angka selalu terkini sedangkan narasi bisa berumur sehari, sidik jari angka
(`sidikFakta_`) ikut disimpan. Bila sidik jari saat ini berbeda, UI menandai analisa sebagai
**basi** — pemilik tahu narasi yang dibacanya belum memuat transaksi terbaru, dan bisa
menekan "Analisa ulang" bila perlu.

## Alternatif yang ditolak
- **Kirim seluruh sheet TRANSAKSI ke model** — mahal, lambat, dan menyerahkan aritmetika
  ke komponen yang tidak deterministik.
- **Analisa penuh tanpa model** — mampu menyebut angka, tidak mampu memberi saran yang
  memperhitungkan konteks (cicilan tidak bisa "dihemat", pos konsumtif bisa).
- **Menjalankan review untuk semua bulan** — bulan yang sudah lewat tidak bisa ditindaklanjuti;
  permintaan pemilik memang khusus bulan berjalan.
- **Menganalisa ulang setiap kali layar dimuat** — mahal, dan narasi yang berubah-ubah
  sepanjang hari sulit dijadikan pegangan.

## Konsekuensi
+ Angka pada review **selalu** cocok dengan sheet; tidak ada jalan bagi model mengarangnya.
+ Aturan penilaian dapat diuji tanpa jaringan (36 test domain).
+ Ganti penyedia model = ganti satu adapter.
− Saran tetap buatan AI dan bisa keliru menilai konteks; UI mencantumkan peringatan ini
  secara eksplisit di kaki kartu.
− Ambang (15 poin, 3 bulan, 50%) adalah pilihan awal yang belum dikalibrasi pada data nyata;
  semuanya berada di `00_config.gs` agar mudah disetel.
