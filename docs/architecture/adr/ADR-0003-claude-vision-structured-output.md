# ADR-0003: Pembacaan bukti memakai Claude Vision + structured output
Tanggal   : 2026-08-11
Status    : Accepted

## Konteks
Bukti transfer berupa screenshot beragam bank/e-wallet. Dibutuhkan ekstraksi nominal,
tanggal, POS, keterangan, dan identitas sumber dana dengan koreksi seminimal mungkin.

## Keputusan
Memakai Claude (model di `CLAUDE_MODEL`) lewat HTTP dengan
`output_config.format = json_schema`, sehingga keluaran tervalidasi skema (termasuk `enum`
POS BIAYA yang dibaca live dari sheet REAL). Prompt diperkaya contoh dari history pengguna.

## Alternatif yang ditolak
- **OCR biasa (Google Vision/Tesseract)**: menghasilkan teks mentah; pemetaan ke POS/sumber
  dana tetap harus ditulis manual dan rapuh.
- **Regex per bank**: tidak berkelanjutan; tiap bank/aplikasi punya tata letak berbeda.

## Konsekuensi
+ Field terisi konsisten sesuai skema; POS selalu valid terhadap daftar sheet.
+ Sistem "belajar" dari history lewat contoh pada prompt + sheet AI_MEMORY.
− Bergantung kuota & harga API (risiko R2), serta batas ukuran gambar (S5).
− Nondeterministik → keputusan sumber dana yang kritikal TIDAK diserahkan ke model,
  melainkan ke aturan deterministik `10_domain_rekening.gs`.
