/**
 * APPLICATION - Use case laporan: budget, daftar biaya, history, audit CASHFLOW.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** Daftar bulan (label "BULAN YYYY" pada baris 1 sheet REAL) + label bulan berjalan. */
function getBudgetMonths() {
  var header = sheetsBacaReal_().header;               // adapter Sheets
  var months = [];
  for (var i = 0; i < header.length; i++) {
    var h = String(header[i]).trim();
    if (/^[A-Za-z]+\s+\d{4}$/.test(h)) months.push(h);
  }
  var now = new Date();
  var cur = BULAN_UPPER[Number(Utilities.formatDate(now, TIMEZONE, 'MM')) - 1] +
    ' ' + Utilities.formatDate(now, TIMEZONE, 'yyyy');
  return { months: months, current: cur };
}

/** Data biaya (per kategori), pemasukan (per kantong), & saldo untuk satu bulan dari sheet REAL. */
function getBudget(monthLabel) {
  var header = sheetsBacaReal_().header;               // adapter Sheets
  var col = -1;
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim().toUpperCase() === String(monthLabel).trim().toUpperCase()) { col = i + 1; break; }
  }
  if (col < 0) throw new Error('Bulan "' + monthLabel + '" tidak ada di sheet REAL.');

  // Baca blok REAL sekali, lalu susun memakai aturan domain (15_domain_budget).
  var awal = BUDGET_BARIS_BIAYA[0];
  var blok = sheetsBacaReal_(awal, BUDGET_BARIS_AKHIR - awal + 1, col);
  // BUDGET per pos dari sheet REKAP, kolom & baris yang sama dengan REAL.
  var bud = sheetsBacaRekap_(awal, BUDGET_BARIS_AKHIR - awal + 1, col);
  var baris = [];
  for (var k = 0; k < blok.labels.length; k++) {
    baris.push({
      n: awal + k,
      a: blok.labels[k][0],
      b: blok.labels[k][1],
      v: toNum_(blok.values[k][0]),                       // REAL = SISA budget
      budget: bud[k] ? toNum_(bud[k][0]) : 0              // REKAP = BUDGET
    });
  }
  var d = susunBudget_(baris);
  d.month = String(header[col - 1]).trim();
  return d;
}

/**
 * PERINGATAN DINI: bulan-bulan ke depan yang SALDO REAL-nya minus.
 * Rentang pantau = bulan setelah bulan berjalan s/d Desember tahun depan
 * (mis. berjalan Agustus 2026 -> September 2026 s/d Desember 2027).
 * Nilai dibaca dari baris SALDO REAL sheet REAL, kolom bulan masing-masing.
 */
function getPeringatanSaldo(pin) {
  verifyPin_(pin);
  var barisSaldo = sheetsCariBarisReal_(LABEL_SALDO_REAL, BUDGET_BARIS_AKHIR);
  if (barisSaldo < 0) barisSaldo = BARIS_SALDO_REAL_CADANGAN;      // cadangan bila label berubah
  var barisBuffer = sheetsCariBarisReal_(LABEL_CASH_BUFFER, BUDGET_BARIS_AKHIR);
  if (barisBuffer < 0) barisBuffer = BARIS_CASH_BUFFER_CADANGAN;
  var nilaiBaris = sheetsBacaBarisReal_(barisSaldo);
  var nilaiBuffer = sheetsBacaBarisReal_(barisBuffer);
  var header = sheetsBacaReal_().header;

  var now = new Date();
  var bulanIdx = Number(Utilities.formatDate(now, TIMEZONE, 'MM')) - 1;
  var tahun = Number(Utilities.formatDate(now, TIMEZONE, 'yyyy'));

  // Petakan label bulan -> nilai saldo pada kolom yang sama.
  var pantau = bulanPantauSaldo_(bulanIdx, tahun);                 // aturan domain
  var daftar = [];
  for (var i = 0; i < pantau.length; i++) {
    var col = -1;
    for (var c = 0; c < header.length; c++) {
      if (String(header[c]).trim().toUpperCase() === pantau[i].label) { col = c; break; }
    }
    daftar.push({
      label: pantau[i].label,
      ada: col >= 0 && col < nilaiBaris.length,
      nilai: col >= 0 ? toNum_(nilaiBaris[col]) : 0,
      bufferAda: col >= 0 && col < nilaiBuffer.length,
      buffer: col >= 0 && col < nilaiBuffer.length ? toNum_(nilaiBuffer[col]) : 0
    });
  }
  var minus = saldoMinus_(daftar);                                 // aturan domain (merah)
  var ring = ringkasPeringatan_(minus);
  ring.minus = minus;
  ring.bulanBerjalan = BULAN_UPPER[bulanIdx] + ' ' + tahun;
  ring.rentang = pantau.length ? (pantau[0].label + ' s/d ' + pantau[pantau.length - 1].label) : '';
  ring.baris = barisSaldo;
  ring.diperiksa = daftar.filter(function (d) { return d.ada; }).length;

  // Peringatan KUNING: saldo masih positif tetapi di bawah CASH BUFFER (aturan domain).
  var bawah = saldoDiBawahBuffer_(daftar);
  var kuning = ringkasBuffer_(bawah);
  kuning.bawah = bawah;
  kuning.baris = barisBuffer;
  ring.kuning = kuning;
  ring.adaApaPun = !!(ring.ada || kuning.ada);
  return ring;
}

/**
 * REVIEW PENGGUNAAN BIAYA - hanya untuk BULAN BERJALAN.
 *
 * Angka SELALU dihitung ulang setiap kali dibuka (murah, dari sheet), tetapi NARASI &
 * SARAN diperbarui hanya SEKALI SEHARI pukul 23.59 WITA lewat trigger (lihat 90_triggers).
 * Analisa tersimpan di Script Property agar bertahan antar-sesi.
 *
 * - Belum pernah ada analisa  -> dibuat sekarang juga (analisa pertama tidak menunggu jadwal).
 * - Sudah ada                 -> dipakai apa adanya, disertai waktu pembuatannya.
 * - `paksa` = true            -> analisa ulang sekarang (tombol "Analisa ulang").
 *
 * `basi` = true bila angka sudah berubah sejak analisa terakhir dibuat, sehingga pemilik
 * tahu narasi yang dibacanya belum memuat transaksi terbaru.
 */
function getReviewBiaya(monthLabel, paksa, pin) {
  verifyPin_(pin);
  var bulanKini = getBudgetMonths().current;
  var diminta = String(monthLabel || '').trim().toUpperCase();
  if (diminta !== String(bulanKini).trim().toUpperCase()) {
    return { berlaku: false, alasan: 'Review hanya tersedia untuk bulan berjalan (' + bulanKini + ').' };
  }

  var fakta = faktaReviewBulanIni_(bulanKini);
  if (!fakta.adaTemuan) {
    return { berlaku: true, fakta: fakta, kosong: true,
      analisa: { ringkasan: 'Tidak ada pos yang melewati batas, melaju terlalu cepat, ' +
        'atau terlewat dianggarkan pada bulan ini.', sorotan: [], terlewat: [], langkah: [] } };
  }

  var simpan = propAmbilJson_(PROP_REVIEW_HARIAN);      // adapter Properties
  if (!paksa && simpan && simpan.bulan === bulanKini && simpan.analisa) {
    return { berlaku: true, fakta: fakta, analisa: simpan.analisa,
      dibuat: simpan.dibuat, jadwal: true,
      basi: simpan.sidik !== sidikFakta_(fakta) };
  }
  var hasil = simpanAnalisaReview_(bulanKini, fakta);
  return { berlaku: true, fakta: fakta, analisa: hasil.analisa, dibuat: hasil.dibuat, baru: true };
}

/** Susun FAKTA review bulan berjalan dari sheet REAL/REKAP + TRANSAKSI (tanpa memanggil model). */
function faktaReviewBulanIni_(bulanKini) {
  var d = getBudget(bulanKini);                        // biaya + budget REKAP + saldo
  var pecah = String(bulanKini).split(/\s+/);
  var namaBulan = pecah[0], tahun = pecah[1];
  var bulanIdx = BULAN_UPPER.indexOf(namaBulan.toUpperCase());
  var now = new Date();
  var rows = sheetsBacaTransaksi_(7).rows;             // adapter Sheets (A..G)
  return susunFaktaReview_({
    bulan: bulanKini,
    hari: Number(Utilities.formatDate(now, TIMEZONE, 'dd')),
    hariTotal: jumlahHariBulan_(bulanIdx, tahun),
    biaya: d.biaya,
    agregat: agregatPerPos_(rows, namaBulan, tahun),
    riwayat: riwayatPerPos_(rows, namaBulan, tahun),
    totalBudget: d.totalBudget, totalTerpakai: d.totalTerpakai,
    totalSisaBudget: d.totalSisaBudget, pctTerpakai: d.pctTerpakai,
    saldoReal: d.saldoReal
  });
}

/** Panggil model, simpan hasilnya beserta waktu & sidik jari angka. */
function simpanAnalisaReview_(bulanKini, fakta) {
  var analisa = analisaBiaya_(fakta);                  // adapter Claude
  var rec = {
    bulan: bulanKini,
    dibuat: Utilities.formatDate(new Date(), TIMEZONE, "d MMMM yyyy HH:mm"),
    sidik: sidikFakta_(fakta),
    analisa: analisa
  };
  propSimpanJson_(PROP_REVIEW_HARIAN, rec);            // adapter Properties
  return rec;
}

/**
 * Dipanggil TRIGGER harian pukul 23.59 WITA. Tidak memakai PIN karena berjalan sebagai
 * pemilik script, bukan lewat permintaan web. Galat ditelan agar satu kegagalan jaringan
 * tidak mematikan trigger.
 */
function perbaruiReviewHarian_() {
  try {
    var bulanKini = getBudgetMonths().current;
    var fakta = faktaReviewBulanIni_(bulanKini);
    if (!fakta.adaTemuan) { propHapus_(PROP_REVIEW_HARIAN); return 'tanpa temuan'; }
    simpanAnalisaReview_(bulanKini, fakta);
    return 'analisa diperbarui ' + bulanKini;
  } catch (e) {
    return 'gagal: ' + (e && e.message ? e.message : e);
  }
}

// ====================== DAFTAR BIAYA (sheet TRANSAKSI) ======================

/** Opsi filter: bulan (tetap) + daftar tahun yang ada di kolom TAHUN BIAYA + default berjalan. */
function getTransaksiFilters() {
  var data = sheetsBacaTransaksi_(6);                  // adapter Sheets (A..F)
  var years = {};
  for (var i = 0; i < data.rows.length; i++) {
    var y = String(data.rows[i][5]).trim().replace(/\.0$/, ''); // F TAHUN BIAYA
    if (y) years[y] = 1;
  }
  var arr = Object.keys(years).map(Number).filter(function (n) { return !isNaN(n); });
  arr.sort(function (a, b) { return b - a; });
  var now = new Date();
  return {
    bulan: BULAN_UPPER,
    tahun: arr,
    current: {
      bulan: BULAN_UPPER[Number(Utilities.formatDate(now, TIMEZONE, 'MM')) - 1],
      tahun: Number(Utilities.formatDate(now, TIMEZONE, 'yyyy'))
    }
  };
}

/** Daftar biaya dengan filter gabungan (semua opsional). filter = {bulan,tahun,tanggal,pos,keterangan,sumber}. */
function getTransaksiList(filter) {
  filter = filter || {};
  var data = sheetsBacaTransaksi_(7);                  // adapter Sheets (A..G)
  var hdr = data.hdr;
  var out = [], total = 0;
  var bU = String(filter.bulan || '').trim().toUpperCase();          // E BIAYA BULAN
  var tY = String(filter.tahun || '').trim().replace(/\.0$/, '');    // F TAHUN BIAYA
  var fTgl = String(filter.tanggal || '').trim();                    // D TANGGAL (yyyy-MM-dd)
  var fPos = String(filter.pos || '').trim();                        // A POS BIAYA
  var fKet = String(filter.keterangan || '').trim().toLowerCase();   // B KETERANGAN (mengandung)
  var fSum = String(filter.sumber || '').trim();                     // G SUMBER DANA
  {
    var rng = data.rows, tz = data.tz;
    for (var i = 0; i < rng.length; i++) {
      var r = rng[i];
      if (bU && String(r[4]).trim().toUpperCase() !== bU) continue;
      if (tY && String(r[5]).trim().replace(/\.0$/, '') !== tY) continue;
      var tglIso = r[3] instanceof Date ? Utilities.formatDate(r[3], tz, 'yyyy-MM-dd') : String(r[3]).trim();
      if (fTgl && tglIso !== fTgl) continue;
      if (fPos && String(r[0]).trim() !== fPos) continue;
      if (fKet && String(r[1]).toLowerCase().indexOf(fKet) < 0) continue;
      if (fSum && String(r[6]).trim() !== fSum) continue;
      var nom = Number(r[2]) || 0;                                   // C NOMINAL
      total += nom;
      out.push({
        row: hdr + 1 + i,                                           // baris asli di sheet (untuk edit)
        pos: String(r[0]).trim(),
        ket: String(r[1]).trim(),
        nominal: nom,
        tgl: tglIso,
        sumber: String(r[6]).trim()
      });
    }
  }
  out.sort(function (a, b) { return a.tgl < b.tgl ? 1 : (a.tgl > b.tgl ? -1 : 0); }); // terbaru -> terlama
  return { count: out.length, total: total, items: out };
}


/** Rekomendasi KETERANGAN (dari history sheet) untuk POS BIAYA tertentu. */
function getKeteranganOptions(posBiaya) {
  if (!posBiaya) return [];
  var vals = sheetsBacaTransaksi_(2).rows;             // adapter Sheets (A & B)
  if (!vals.length) return [];
  var freq = {};
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === posBiaya) {
      var k = String(vals[i][1]).trim();
      if (k) freq[k] = (freq[k] || 0) + 1;
    }
  }
  var arr = Object.keys(freq).map(function (k) { return [k, freq[k]]; });
  arr.sort(function (a, b) { return b[1] - a[1]; });
  return arr.slice(0, 12).map(function (x) { return x[0]; });
}

/**
 * Konteks pembelajaran dari history sheet (di-cache 5 menit, di-refresh tiap simpan).
 * - sumberDanaByPos: SUMBER DANA paling sering dipakai untuk tiap POS BIAYA.
 */
function getHistoryContext() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('histctx');
  if (cached) return JSON.parse(cached);

  var data = sheetsBacaTransaksi_(7);                  // adapter Sheets (A..G)
  var ctx = { sumberDanaByPos: {} };

  if (data.rows.length) {
    var vals = data.rows;
    var freq = {}; // pos -> { sumberDana: jumlah }
    for (var i = 0; i < vals.length; i++) {
      var pos = String(vals[i][0]).trim();   // A POS BIAYA
      var sd = String(vals[i][6]).trim();    // G SUMBER DANA
      if (!pos || !sd) continue;
      (freq[pos] = freq[pos] || {})[sd] = (freq[pos][sd] || 0) + 1;
    }
    for (var p in freq) {
      var best = '', bc = -1;
      for (var s in freq[p]) { if (freq[p][s] > bc) { bc = freq[p][s]; best = s; } }
      ctx.sumberDanaByPos[p] = best;
    }
  }
  cache.put('histctx', JSON.stringify(ctx), 300);
  return ctx;
}

/**
 * Contoh keterangan/merchant per POS BIAYA dari history (untuk memandu pemilihan POS).
 * Dipakai sebagai "panduan kategorisasi" pada prompt analyzeImage. Cache 5 menit.
 */
function getPosExamples() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('posex');
  if (hit) return JSON.parse(hit);

  var data2 = sheetsBacaTransaksi_(2);                 // adapter Sheets (A & B)
  var map = {};
  if (data2.rows.length) {
    var vals = data2.rows;
    var freq = {};
    for (var i = 0; i < vals.length; i++) {
      var p = String(vals[i][0]).trim(), k = String(vals[i][1]).trim();
      if (!p) continue;
      freq[p] = freq[p] || {};
      if (k) freq[p][k] = (freq[p][k] || 0) + 1;
    }
    for (var pp in freq) {
      var arr = Object.keys(freq[pp]).map(function (k) { return [k, freq[pp][k]]; });
      arr.sort(function (a, b) { return b[1] - a[1]; });
      map[pp] = arr.slice(0, 8).map(function (x) { return x[0]; });
    }
  }
  cache.put('posex', JSON.stringify(map), 300);
  return map;
}

/** Rekening yang DIPELAJARI dari sheet AI_MEMORY: nomor rekening -> sumber dana (+bank) tersering. */
function getLearnedAccounts_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('learnacct');
  if (hit) return JSON.parse(hit);
  var out = [];
  try {
    var data = sheetsBacaMemori_();                     // adapter Sheets
    if (data.length > 1) {
      var head = data[0];
      var iAk = head.indexOf('akun_sumber'), iSd = head.indexOf('sumber_dana_final'), iRek = head.indexOf('rekening_final');
      if (iAk >= 0 && iSd >= 0) {
        var agg = {};
        for (var r = 1; r < data.length; r++) {
          var dig = String(data[r][iAk] || '').replace(/\D/g, '');
          var sd = String(data[r][iSd] || '').trim();
          if (dig.length < 6 || !sd) continue;
          agg[dig] = agg[dig] || { sd: {}, bank: {} };
          agg[dig].sd[sd] = (agg[dig].sd[sd] || 0) + 1;
          var rk = iRek >= 0 ? String(data[r][iRek] || '').trim() : '';
          if (rk) agg[dig].bank[rk] = (agg[dig].bank[rk] || 0) + 1;
        }
        for (var dg in agg) {
          out.push({ no: dg, label: 'Rekening ' + dg + ' (dipelajari)', sumberDana: topKey_(agg[dg].sd), bank: topKey_(agg[dg].bank) });
        }
      }
    }
  } catch (e) {}
  cache.put('learnacct', JSON.stringify(out), 300);
  return out;
}

/**
 * Kumpulkan "Setoran Owner" yang SUDAH ada di CASHFLOW sebagai multiset key = "tglIso|nominal".
 */
function cashflowSetoranHave_(cf) {
  var have = {};
  var tz = cf.tz;
  var vals = cf.rows;                                  // B..D: KETERANGAN, NOMINAL, TANGGAL
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim().toLowerCase().indexOf('setoran owner') < 0) continue;
    var nom = Math.round(Number(vals[i][1]) || 0);
    var tg = vals[i][2];
    var iso = tg instanceof Date ? Utilities.formatDate(tg, tz, 'yyyy-MM-dd') : parseTanggalCell_(tg, tz);
    var key = iso + '|' + nom;
    have[key] = (have[key] || 0) + 1;
  }
  return have;
}

/**
 * PERIKSA: transaksi PENDAPATAN USAHA di TRANSAKSI (difilter berdasar TANGGAL bulan/tahun)
 * yang BELUM tercatat sebagai "Setoran Owner" di spreadsheet CASHFLOW aktif. Tidak menulis apa pun.
 */
function auditCashflowSetoran(bulan, tahun, pin) {
  verifyPin_(pin);
  // Lewat PORT sheetsBacaCashflowSetoran_ ({tz,title,rows}) - BUKAN getCashflowSheet_
  // ({ss,sheet}, objek vendor). Salah sumber inilah yang membuat cf.rows undefined
  // ("Cannot read properties of undefined") sejak restrukturisasi modul.
  var cf = sheetsBacaCashflowSetoran_();
  var have = cashflowSetoranHave_(cf);

  var data = sheetsBacaTransaksi_(10);                 // adapter Sheets (A..J)
  var hdr = data.hdr, tz = data.tz;
  var bulanU = String(bulan || '').trim().toUpperCase();
  var tahunS = String(tahun || '').trim().replace(/\.0$/, '');
  var missing = [], total = 0, matched = 0;

  {
    var rows = data.rows;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (String(row[6]).trim().toUpperCase() !== SUMBER_DANA_REKENING) continue; // G SUMBER DANA
      var tgl = row[3];
      var iso = tgl instanceof Date ? Utilities.formatDate(tgl, tz, 'yyyy-MM-dd') : parseTanggalCell_(tgl, tz);
      if (!iso) continue;
      if (bulanU && BULAN_UPPER[Number(iso.slice(5, 7)) - 1] !== bulanU) continue;
      if (tahunS && iso.slice(0, 4) !== tahunS) continue;
      total++;
      var nom = Math.round(Number(row[2]) || 0);   // C NOMINAL
      var key = iso + '|' + nom;
      if (have[key] > 0) { have[key]--; matched++; continue; }
      missing.push({
        row: hdr + 1 + r, tanggal: iso, nominal: nom,
        pos: String(row[0]).trim(), keterangan: String(row[1]).trim(),
        rekening: String(row[9]).trim(), sumberCashflow: mapBankCashflow_(String(row[9]).trim())
      });
    }
  }
  return {
    title: cf.title, sheet: CASHFLOW_SHEET, bulan: bulanU, tahun: tahunS,
    total: total, matched: matched, missingCount: missing.length, missing: missing
  };
}

/**
 * LENGKAPI: tulis semua "Setoran Owner" yang belum masuk (hasil auditCashflowSetoran) ke CASHFLOW.
 * Aman dijalankan ulang — hanya menulis yang benar-benar belum ada.
 */
function backfillCashflowSetoran(bulan, tahun, pin) {
  verifyPin_(pin);
  var audit = auditCashflowSetoran(bulan, tahun, pin);
  var ditulis = 0, err = [];
  for (var i = 0; i < audit.missing.length; i++) {
    var m = audit.missing[i];
    try { writeCashflow_({ nominal: m.nominal, tanggal: m.tanggal, rekening: m.rekening }); ditulis++; }
    catch (e) { err.push('Baris ' + m.row + ': ' + (e && e.message || e)); }
  }
  return { ditulis: ditulis, gagal: err.length, pesan: err.join('; '),
    diperiksa: audit.total, title: audit.title };
}
