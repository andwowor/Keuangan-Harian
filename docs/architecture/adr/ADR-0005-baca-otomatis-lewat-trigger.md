# ADR-0005: Pembacaan bukti otomatis di latar lewat time-driven trigger
Tanggal   : 2026-08-11
Status    : Accepted

## Konteks
Pemilik ingin bukti sudah terbaca saat hendak diproses, termasuk ketika dashboard ditutup.
Apps Script tidak menyediakan notifikasi perubahan folder Drive secara langsung.

## Keputusan
Trigger `autoReadInbox` tiap ±5 menit membaca bukti berstatus `pending`, ditambah pemicu
seketika `readInboxNow` saat unggah. `inboxNeedsRead_` melewati status `done` dan `error`
sehingga bukti lama tidak pernah dibaca ulang saat berkas baru ditambahkan.

## Alternatif yang ditolak
- **Drive push notification / webhook**: butuh endpoint terverifikasi & pembaruan langganan berkala.
- **Baca saat "Proses terpilih" saja**: pengguna menunggu lama untuk banyak bukti.
- **Trigger tiap 1 menit**: boros kuota tanpa manfaat nyata.

## Konsekuensi
+ "Proses terpilih" menampilkan hasil seketika tanpa panggilan API ulang.
+ Biaya API sekali per bukti (idempoten).
− Bukan real-time saat dashboard tertutup (maksimal ~5 menit; QAS-05 menuntut < 10 menit).
− Butuh scope `script.scriptapp` dan pengaktifan sekali oleh pengguna.
