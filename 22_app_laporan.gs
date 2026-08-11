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

  var blok = sheetsBacaReal_(3, 88, col);              // baris 3..90: label A,B + nilai bulan
  var labels = blok.labels, vals = blok.values;
  function row(r) {
    var x = r - 3;
    return { a: String(labels[x][0]).trim(), b: String(labels[x][1]).trim(), v: toNum_(vals[x][0]) };
  }
  var biaya = [], pemasukan = [], r, o;
  for (r = 3; r <= 64; r++) { o = row(r); if (o.b === '') continue; biaya.push(o); }   // kategori + subtotal
  for (r = 69; r <= 86; r++) { pemasukan.push(row(r)); }                               // kantong (semua, termasuk 0)

  return {
    month: String(header[col - 1]).trim(),
    biaya: biaya,
    pemasukan: pemasukan,
    totalPengeluaran: row(66).v,
    totalIncome: row(87).v,
    saldo: row(88).v,
    saldoBulanSebelumnya: row(89).v,
    saldoReal: row(90).v
  };
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
  var cf = getCashflowSheet_();
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
    title: cf.ss.getName(), sheet: CASHFLOW_SHEET, bulan: bulanU, tahun: tahunS,
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
