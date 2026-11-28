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
 *           biayaBulan, tahunBiaya, sumberDana, budgetBulan, tahunBudget, rekening, kategoriBiaya}
 */
function appendTransaction(payload) {
  verifyPin_(payload && payload.pin);
  validasiTransaksi_(payload);                                   // aturan domain
  pastikanKategoriSah_(payload.kategoriBiaya);                   // dropdown kolom K
  var rekening = rekeningTransaksi_(payload.sumberDana, payload.rekening);
  // Periksa kolom L..O SEBELUM menulis: bila tidak bisa dipakai, transaksi tidak setengah tersimpan.
  if (payload.penggantian) sheetsPastikanHeaderPenggantian_();

  var slot = sheetsSiapkanBarisBaru_();                          // adapter Sheets
  var nominalValue = nilaiNominal_(payload, slot.nominalLama);   // aturan domain
  var tanggalValue = nilaiTanggal_(payload.tanggal, slot.tanggalLama,
    parseIsoDate_(payload.tanggal, slot.tz));
  sheetsTulisBarisTransaksi_(slot.row,
    barisTransaksi_(payload, rekening, nominalValue, tanggalValue));
  if (payload.penggantian) sheetsTandaiPenggantian_(slot.row);  // ADR-0015

  // Catat ke memori pembelajaran. Jangan sampai menggagalkan simpan.
  try { logMemory_(catatanMemori_(payload, rekening)); } catch (e) {}
  lupakanCacheHistory_();

  // Auto-isi ke spreadsheet CASHFLOW bulan TANGGAL transaksi bila sumber dana = PENDAPATAN USAHA.
  var cashflow = null;
  if (payload.sumberDana === SUMBER_DANA_REKENING) {
    try { cashflow = writeCashflow_(payload, cashflowTargetTanggal_(payload.tanggal)); }
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
  lupakanCacheKategori_();
}

/**
 * Perbarui satu baris transaksi yang sudah ada (edit manual dari menu Riwayat Biaya).
 * Catatan: sheet CASHFLOW TIDAK ikut diubah otomatis (agar tidak menggandakan entri) —
 * bila perlu, sesuaikan CASHFLOW secara manual.
 */
function updateTransaction(payload, pin) {
  verifyPin_(pin || (payload && payload.pin));
  validasiTransaksi_(payload);                                   // aturan domain
  pastikanKategoriSah_(payload.kategoriBiaya);                   // dropdown kolom K
  var row = Number(payload.row);
  var batas = sheetsBatasTransaksi_();
  if (!(row > batas.hdr && row <= batas.last)) throw new Error('Baris transaksi tidak valid.');

  var rekening = rekeningTransaksi_(payload.sumberDana, payload.rekening);
  var kini = sheetsBacaBarisPenuh_(row);                         // adapter Sheets (A..O)
  var v = kini.values;

  // Penggantian (ADR-0015). Pada transaksi bertanda, NOMINAL di form adalah NOMINAL AWAL (M);
  // kolom C lalu dihitung ulang = awal - total penggantian.
  var ditandai = !!statusPenggantian_(v[KOLOM_PENGGANTIAN - 1]);
  var ingin = (payload.penggantian === undefined || payload.penggantian === null) ? ditandai : !!payload.penggantian;
  var rincian = ditandai ? bacaRincianPenggantian_(v[KOLOM_RINCIAN_PENGGANTIAN - 1]) : [];
  var total = totalPenggantian_(rincian);
  if (ditandai && !ingin && total > 0) {
    throw new Error('Transaksi ini sudah menerima penggantian ' + formatRupiah_(total) + '. Hapus dulu ' +
      'rinciannya di jendela Penggantian sebelum melepas tanda.');
  }
  var acuan = (ditandai && String(v[KOLOM_NOMINAL_AWAL - 1]) !== '') ? v[KOLOM_NOMINAL_AWAL - 1] : v[2];

  // Pertahankan formula asli bila angkanya tidak diubah; selain itu ikut aturan domain.
  var dipertahankan = !!(payload.keepFormula && payload.nominalFormula);
  var nominalValue = dipertahankan ? String(payload.nominalFormula)
    : nilaiNominal_({ nominal: payload.nominal }, acuan);
  var tanggalValue = nilaiTanggal_(payload.tanggal, kini.values[3],
    parseIsoDate_(payload.tanggal, kini.tz));

  var isiC = nominalValue;
  if (ditandai && ingin && total > 0) {
    var awalAngka = angkaRupiah_(dipertahankan ? acuan : payload.nominal);
    validasiPenggantian_(rincian, awalAngka);                    // total tidak boleh > awal baru
    var formulaAwal = /^=/.test(String(nominalValue)) ? String(nominalValue) : '';
    isiC = isiNominalBersih_(formulaAwal ? awalAngka : nominalValue, formulaAwal, total);
  }

  sheetsTulisBarisTransaksi_(row,
    barisTransaksi_(payload, rekening, isiC, tanggalValue));
  if (ditandai && ingin) sheetsTulisNominalAwal_(row, nominalValue);
  else if (ditandai && !ingin) sheetsLepasPenggantian_(row);
  else if (!ditandai && ingin) sheetsTandaiPenggantian_(row);
  lupakanCacheHistory_();
  return { ok: true, row: row };
}

/** Ambil satu baris transaksi lengkap (A..K) untuk diedit. */
function getTransaksiRow(row, pin) {
  verifyPin_(pin);
  row = Number(row);
  var batas = sheetsBatasTransaksi_();
  if (!(row > batas.hdr && row <= batas.last)) throw new Error('Baris transaksi tidak valid.');
  var baris = sheetsBacaBarisPenuh_(row);                        // adapter Sheets (A..O)
  var v = baris.values, fx = baris.formulas;
  if (!String(v[0]).trim()) throw new Error('Baris ini kosong.');
  // Transaksi bertanda penggantian: yang diedit adalah NOMINAL AWAL (M), bukan nominal bersih (C).
  var pg = ringkasBarisPenggantian_(v);
  if (pg && String(v[KOLOM_NOMINAL_AWAL - 1]) !== '') {
    v = v.slice(); fx = fx.slice();
    v[2] = v[KOLOM_NOMINAL_AWAL - 1];
    fx[2] = fx[KOLOM_NOMINAL_AWAL - 1];
  }
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
    rekening: String(v[9]).trim(),
    kategoriBiaya: String(v[KOLOM_KATEGORI - 1] || '').trim(),
    penggantian: pg                                  // null bila tidak ditandai
  };
}

/**
 * Pratinjau entri CASHFLOW (tanpa menulis), pada spreadsheet bulan TANGGAL transaksi -
 * spreadsheet yang sama yang nanti ditulisi appendTransaction.
 */
function previewCashflow(payload, pin) {
  verifyPin_(pin);
  var info = sheetsCashflowInfo_(cashflowTargetTanggal_(payload.tanggal));   // adapter Sheets
  return {
    ok: true,
    title: info.title,
    sheet: CASHFLOW_SHEET,
    targetRow: info.nextRow,
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
