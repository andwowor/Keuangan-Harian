/**
 * ADAPTER INBOUND - Web app (doGet, widget, konfigurasi UI).
 * Tanpa aturan bisnis: hanya menerjemahkan permintaan ke use case.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

// ====================== WEB APP ======================

/** Entry point web app — dashboard, atau data widget bila ada parameter. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.api === 'summary') return widgetJson_(p.token);
  if (p.view === 'widget') return widgetPage_(p.token);
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Keuangan Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Menyisipkan file HTML lain ke dalam template (dipakai bila perlu). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Data untuk mengisi dropdown & nilai default di form. */
function getConfig() {
  var now = new Date();
  var year = Number(Utilities.formatDate(now, TIMEZONE, 'yyyy'));
  return {
    posBiaya: getPosList_(),
    sumberDana: getSumberList_(),
    sumberDanaRekening: SUMBER_DANA_REKENING,
    bankRekening: BANK_REKENING,
    bulan: BULAN_UPPER,
    tahun: [year - 1, year, year + 1],
    today: Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd'),
    tahunIni: year,
    versi: VERSI_APP,
    cabang: GITHUB_BRANCH
  };
}

// ====================== WIDGET (DATA UNTUK HOME SCREEN) ======================

/** Ringkasan untuk widget: sisa budget bulan ini + biaya hari ini. */
function buildWidgetData_() {
  var now = new Date();
  var bulan = BULAN_UPPER[Number(Utilities.formatDate(now, TIMEZONE, 'MM')) - 1] +
    ' ' + Utilities.formatDate(now, TIMEZONE, 'yyyy');
  var data = { bulan: bulan, updated: Utilities.formatDate(now, TIMEZONE, 'dd/MM HH:mm') };
  try {
    var b = getBudget(bulan);
    data.income = b.totalIncome; data.pengeluaran = b.totalPengeluaran; data.sisa = b.saldoReal;
  } catch (e) { data.budgetError = String(e && e.message || e); }
  try {
    var t = getTransaksiList({ tanggal: Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd') });
    data.hariIni = t.total; data.hariIniCount = t.count;
  } catch (e) { data.hariIniError = String(e && e.message || e); }
  return data;
}

/** Endpoint JSON: GET ...exec?api=summary&token=PIN */
function widgetJson_(token) {
  var out;
  try { verifyPin_(token); out = buildWidgetData_(); }
  catch (e) { out = { error: String(e && e.message || e) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Halaman widget ringkas: GET ...exec?view=widget&token=PIN */
function widgetPage_(token) {
  var html;
  try { verifyPin_(token); html = widgetHtml_(buildWidgetData_()); }
  catch (e) {
    html = '<!doctype html><meta charset=utf-8><body style="margin:0;font-family:sans-serif;background:#0a0e1c;color:#fda4af;padding:14px">'
      + (e && e.message || e) + '</body>';
  }
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function widgetHtml_(d) {
  function show(n) { return (n === undefined || n === null) ? '—' : formatRupiah_(n); }
  var sisaColor = (Number(d.sisa) < 0) ? '#fb7185' : '#34d399';
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="refresh" content="1800">'
    + '<style>html,body{margin:0}body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;'
    + 'background:linear-gradient(135deg,#0d1326,#131d39);color:#e7ecf6;padding:14px 16px}'
    + '.lbl{font-size:11px;letter-spacing:.18em;color:#93a0c0;text-transform:uppercase}'
    + '.big{font-size:26px;font-weight:800;margin:2px 0 10px}'
    + '.row{display:flex;justify-content:space-between;font-size:13px;margin:4px 0}'
    + '.muted{color:#93a0c0}.up{font-size:10px;color:#6b7799;margin-top:10px}</style></head><body>'
    + '<div class="lbl">Sisa Budget · ' + d.bulan + '</div>'
    + '<div class="big" style="color:' + sisaColor + '">' + show(d.sisa) + '</div>'
    + '<div class="row"><span class="muted">Pemasukan</span><b>' + show(d.income) + '</b></div>'
    + '<div class="row"><span class="muted">Pengeluaran</span><b>' + show(d.pengeluaran) + '</b></div>'
    + '<div class="row"><span class="muted">Biaya hari ini</span><b>' + show(d.hariIni) + ' (' + (d.hariIniCount || 0) + ')</b></div>'
    + '<div class="up">diperbarui ' + d.updated + '</div>'
    + '</body></html>';
}
