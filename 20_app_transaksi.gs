/**
 * APPLICATION - Use case transaksi (orkestrasi domain + port).
 * Tanpa detail vendor: semua akses eksternal lewat adapter.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

// ====================== SIMPAN KE SHEET ======================

/**
 * Menambahkan satu baris transaksi di baris kosong terbawah sheet TRANSAKSI.
 * payload: {posBiaya, keterangan, nominal, tanggal(YYYY-MM-DD),
 *           biayaBulan, tahunBiaya, sumberDana, budgetBulan, tahunBudget, rekening}
 */
function appendTransaction(payload) {
  verifyPin_(payload && payload.pin);
  validasiTransaksi_(payload);                                   // aturan domain
  var rekening = rekeningTransaksi_(payload.sumberDana, payload.rekening);

  var slot = sheetsSiapkanBarisBaru_();                          // adapter Sheets
  var nominalValue = nilaiNominal_(payload, slot.nominalLama);   // aturan domain
  var tanggalValue = nilaiTanggal_(payload.tanggal, slot.tanggalLama,
    parseIsoDate_(payload.tanggal, slot.tz));
  sheetsTulisBarisTransaksi_(slot.row,
    barisTransaksi_(payload, rekening, nominalValue, tanggalValue));

  // Catat ke memori pembelajaran. Jangan sampai menggagalkan simpan.
  try { logMemory_(catatanMemori_(payload, rekening)); } catch (e) {}
  lupakanCacheHistory_();

  // Auto-isi ke spreadsheet CASHFLOW bila sumber dana = PENDAPATAN USAHA.
  var cashflow = null;
  if (payload.sumberDana === SUMBER_DANA_REKENING) {
    try { cashflow = writeCashflow_(payload); }
    catch (e) { cashflow = { error: String(e && e.message || e) }; }
  }

  // Bukti berasal dari folder penyimpanan sementara -> hapus otomatis setelah tersimpan.
  var inboxDeleted = null;
  if (payload.inboxFileId) inboxDeleted = trashInboxQuiet_(payload.inboxFileId);

  return { ok: true, row: slot.row, cashflow: cashflow, inboxDeleted: inboxDeleted };
}

/** Bersihkan cache pola history & rekening yang dipelajari setelah data berubah. */
function lupakanCacheHistory_() {
  try {
    var c = CacheService.getScriptCache();
    c.remove('histctx'); c.remove('posex'); c.remove('learnacct');
  } catch (e) {}
}

/**
 * Perbarui satu baris transaksi yang sudah ada (edit manual dari menu Daftar).
 * Catatan: sheet CASHFLOW TIDAK ikut diubah otomatis (agar tidak menggandakan entri) —
 * bila perlu, sesuaikan CASHFLOW secara manual.
 */
function updateTransaction(payload, pin) {
  verifyPin_(pin || (payload && payload.pin));
  validasiTransaksi_(payload);                                   // aturan domain
  var row = Number(payload.row);
  var batas = sheetsBatasTransaksi_();
  if (!(row > batas.hdr && row <= batas.last)) throw new Error('Baris transaksi tidak valid.');

  var rekening = rekeningTransaksi_(payload.sumberDana, payload.rekening);
  var kini = sheetsBacaBarisTransaksi_(row);                     // adapter Sheets

  // Pertahankan formula asli bila angkanya tidak diubah; selain itu ikut aturan domain.
  var nominalValue = (payload.keepFormula && payload.nominalFormula)
    ? String(payload.nominalFormula)
    : nilaiNominal_({ nominal: payload.nominal }, kini.values[2]);
  var tanggalValue = nilaiTanggal_(payload.tanggal, kini.values[3],
    parseIsoDate_(payload.tanggal, kini.tz));

  sheetsTulisBarisTransaksi_(row,
    barisTransaksi_(payload, rekening, nominalValue, tanggalValue));
  lupakanCacheHistory_();
  return { ok: true, row: row };
}

/** Ambil satu baris transaksi lengkap (A..J) untuk diedit. */
function getTransaksiRow(row, pin) {
  verifyPin_(pin);
  row = Number(row);
  var batas = sheetsBatasTransaksi_();
  if (!(row > batas.hdr && row <= batas.last)) throw new Error('Baris transaksi tidak valid.');
  var baris = sheetsBacaBarisTransaksi_(row);                    // adapter Sheets
  var v = baris.values, fx = baris.formulas;
  if (!String(v[0]).trim()) throw new Error('Baris ini kosong.');
  return {
    row: row,
    pos: String(v[0]).trim(),
    keterangan: String(v[1]).trim(),
    nominal: Number(v[2]) || 0,
    nominalFormula: fx[2] || '',                     // ada isinya bila NOMINAL berupa formula
    tanggal: parseTanggalCell_(v[3], baris.tz),      // yyyy-MM-dd
    biayaBulan: String(v[4]).trim().toUpperCase(),
    tahunBiaya: String(v[5]).trim().replace(/\.0$/, ''),
    sumberDana: String(v[6]).trim(),
    budgetBulan: String(v[7]).trim().toUpperCase(),
    tahunBudget: String(v[8]).trim().replace(/\.0$/, ''),
    rekening: String(v[9]).trim()
  };
}

/** Pratinjau entri CASHFLOW (tanpa menulis). */
function previewCashflow(payload, pin) {
  verifyPin_(pin);
  var cf = getCashflowSheet_();
  return {
    ok: true,
    title: cf.ss.getName(),
    sheet: CASHFLOW_SHEET,
    targetRow: cashflowLastRow_(cf.sheet) + 1,
    row: buildCashflowRow_(payload)
  };
}

// ====================== KONVERSI MATA UANG ======================

/** Konversi nominal mata uang asing ke IDR memakai kurs tanggal tertentu (dipanggil UI). */
function convertCurrency(amount, currency, isoDate) {
  var cur = normalizeCurrency_(currency);
  var c = convertToIdr_(Number(amount) || 0, cur, isoDate);
  return { idr: Math.round(c.idr), rate: c.rate, date: c.date, currency: cur };
}

function convertToIdr_(amount, currency, isoDate) {
  if (!currency || currency === 'IDR') return { idr: amount, rate: 1, date: isoDate || '' };
  var info = getFxRate_(currency, isoDate);
  return { idr: amount * info.rate, rate: info.rate, date: info.date };
}
