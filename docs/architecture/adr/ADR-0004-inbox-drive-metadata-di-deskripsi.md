# ADR-0004: Folder Drive sebagai inbox & deskripsi berkas sebagai penyimpan metadata
Tanggal   : 2026-08-11
Status    : Accepted

## Konteks
Bukti sering diterima saat pemilik belum sempat menginput. Dibutuhkan penampung sementara
plus tempat menyimpan (a) sidik jari anti-duplikat dan (b) hasil baca AI, secara permanen.

## Keputusan
Satu folder Drive menjadi inbox. Metadata disimpan pada **deskripsi berkas** dengan tag baris:
`kh-md5:` (sidik jari), `kh-aistate:` (pending|reading|done|error), `kh-aits:` (stempel waktu),
`kh-ai:` (hasil baca JSON), `kh-aierr:` (pesan galat).
Penulisan tag memakai `descSetLine_` yang **menjaga tag lain** agar tidak saling menimpa.

## Alternatif yang ditolak
- **Sheet terpisah sebagai indeks**: dua sumber kebenaran; berisiko yatim saat berkas dihapus.
- **Nama berkas sebagai metadata**: rapuh dan tidak muat untuk hasil JSON.
- **Cache/Properties**: tidak permanen atau berbatas ukuran.

## Konsekuensi
+ Metadata ikut hidup-mati bersama berkasnya; tidak ada indeks yatim.
+ Anti-duplikat berbasis isi (MD5), bukan nama berkas.
− Deskripsi bukan penyimpanan terstruktur; hasil besar bisa mendekati batas.
− Perlu backfill sidik jari untuk berkas lama (dilakukan sekali, otomatis).
