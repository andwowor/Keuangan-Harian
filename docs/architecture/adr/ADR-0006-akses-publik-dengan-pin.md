# ADR-0006: Web app ANYONE_ANONYMOUS dilindungi PIN
Tanggal   : 2026-08-11
Status    : Accepted

## Konteks
Dashboard dipakai dari PWA (GitHub Pages) lewat iframe. Mode "Anyone with Google account"
memicu alur login yang gagal/menjengkelkan di dalam iframe pada HP.

## Keputusan
Deploy `access: ANYONE_ANONYMOUS`, `executeAs: USER_DEPLOYING`, dengan gerbang **PIN**
(`APP_PIN` di Script Properties). Setiap fungsi backend yang membaca/menulis data memanggil
`verifyPin_`. Akses Drive dibatasi hanya berkas di dalam folder inbox (`getInboxFile_`).

## Alternatif yang ditolak
- **Akses hanya akun Google tertentu**: memutus pemakaian dari PWA/iframe di HP.
- **Tanpa proteksi**: URL bocor = data biaya terekspos.
- **OAuth pihak ketiga**: berlebihan untuk pengguna tunggal.

## Konsekuensi
+ Bisa dipakai dari HP tanpa gesekan login.
− Endpoint publik; keamanan bergantung kerahasiaan PIN (risiko R4).
− Kredensial API tetap aman di Script Properties, tidak pernah dikirim ke klien.
