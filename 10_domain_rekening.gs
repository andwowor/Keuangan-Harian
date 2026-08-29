/**
 * DOMAIN - Aturan pemetaan SUMBER DANA (keputusan volatil: daftar rekening/kartu).
 * MURNI: dilarang memanggil API Google apa pun (lihat uji cepat di 99_tests.gs).
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/**
 * Cocokkan teks akun sumber dari bukti ke daftar rekening. Urutan prioritas:
 *   1) NOMOR rekening utuh — ACCOUNTS manual dulu, lalu yang DIPELAJARI dari memori;
 *   2) NAMA pemilik/aplikasi sumber dana (mis. "Andre Stefano Wowor" / "blu");
 *   3) NOMOR DISAMARKAN: nama BANK + gugus angka yang masih terlihat, mis.
 *      "Mandiri - •••••••••5620", "BCA - 026-3**-**85", "BNI - *******055",
 *      "BRI - 1543 **** **** 507".
 * 'text' = teks/nomor akun sumber; 'nameText' = nama pemilik & bank sumber.
 * Mengembalikan entri rekening atau null.
 */
function detectAccount_(text, nameText, learned) {
  var raw = String(text || '');
  var nm = (raw + ' ' + String(nameText || '')).toLowerCase();

  // 0) KARTU KREDIT: bila sumber dana berupa kartu kredit (mis. "BNI Visa Affinity
  //    Platinum · 4512 49** **** 6010"), utamakan sebelum pencocokan rekening bank —
  //    nama bank pada kartu (mis. "BNI") tidak boleh tertukar dengan rekening tabungan.
  if (isCreditCard_(nm)) {
    return { label: 'Kartu Kredit', alasan: 'Kartu kredit terdeteksi pada bukti → KARTU KREDIT',
      sumberDana: 'KARTU KREDIT', bank: '' };
  }

  // Angka bisa berada di field nomor atau (bila kosong) di field nama.
  var digitSrc = /\d/.test(raw) ? raw : String(nameText || '');
  var d = digitSrc.replace(/\D/g, '');
  var masked = isMaskedNumber_(digitSrc);
  var lists = [ACCOUNTS, learned || []];

  // Tiga strategi berurutan; yang pertama cocok dipakai (lihat fungsi masing-masing).
  return cocokNomorUtuh_(d, masked, lists)
      || cocokNamaPemilik_(nm)
      || cocokNomorTersamar_(digitSrc, nm)
      || null;
}

/**
 * Strategi 1 — NOMOR rekening utuh (butuh minimal 6 digit terbaca).
 * Dilewati bila nomor disamarkan, karena menyambung digit antar-mask
 * (mis. "026-3**-**85" -> "026385") bisa membentuk nomor palsu.
 */
function cocokNomorUtuh_(d, masked, lists) {
  if (masked || d.length < 6) return null;
  for (var L = 0; L < lists.length; L++) {
    for (var i = 0; i < lists[L].length; i++) {
      var k = lists[L][i].no;
      if (!k) continue;
      if (d.indexOf(k) >= 0 || k.indexOf(d) >= 0 || d.slice(-6) === k.slice(-6)) return lists[L][i];
    }
  }
  return null;
}

/** Strategi 2 — NAMA pemilik/aplikasi sumber dana (mis. "blu"). */
function cocokNamaPemilik_(nm) {
  for (var a = 0; a < ACCOUNTS.length; a++) {
    var names = ACCOUNTS[a].names || [];
    for (var n = 0; n < names.length; n++) {
      if (names[n] && nm.indexOf(names[n]) >= 0) return ACCOUNTS[a];
    }
  }
  return null;
}

/**
 * Strategi 3 — nomor DISAMARKAN: cocokkan lewat gugus angka yang masih terlihat.
 * Gugus TERAKHIR = akhiran nomor; gugus PERTAMA (bila >= 3 digit & berbeda) = awalan.
 * Nama bank pada bukti SERING TIDAK ADA (mis. "Source of Fund 026-3**-**85") atau hanya
 * watermark, jadi nama bank cuma dipakai MEMPERSEMPIT bila kandidat lebih dari satu.
 * Diterima hanya bila akhirnya menunjuk ke SATU rekening (hindari salah pilih).
 */
function cocokNomorTersamar_(digitSrc, nm) {
  var groups = digitSrc.match(/\d+/g) || [];
  if (!groups.length) return null;
  var tail = groups[groups.length - 1], head = groups[0];
  var cukupSinyal = (tail.length >= 3) || (head !== tail && head.length >= 3);
  if (tail.length < 2 || !cukupSinyal) return null;

  var cand = ACCOUNTS.filter(function (acc) {
    if (acc.no.length < tail.length || acc.no.slice(-tail.length) !== tail) return false;
    if (head !== tail && head.length >= 3 && acc.no.slice(0, head.length) !== head) return false;
    return true;
  });
  var byBank = cand.filter(function (a) { return a.bankName && nm.indexOf(a.bankName) >= 0; });
  if (byBank.length === 1) return byBank[0];   // nama bank ada & menunjuk satu
  if (cand.length === 1) return cand[0];       // pola angka sudah unik (tanpa nama bank)
  return null;
}

/** Deteksi nomor rekening yang disamarkan, mis. "••••5620", "*******055", "1543 **** 507". */
function isMaskedNumber_(t) {
  t = String(t || '');
  return /[*•·●○•·]/.test(t) || /x{2,}/i.test(t);
}

/**
 * Deteksi sumber dana berupa KARTU KREDIT dari teks sumber dana. Contoh yang cocok:
 * "BNI Visa Affinity Platinum", "Kartu Kredit", "Mastercard", "credit card".
 * Kartu DEBIT dikecualikan (mis. "BOC Debit Card" ditangani terpisah -> UANG SAKU).
 */
function isCreditCard_(text) {
  var t = String(text || '').toLowerCase();
  if (t.indexOf('debit') >= 0) return false;
  if (/kartu\s*kredit|credit\s*card/.test(t)) return true;
  return /\b(visa|mastercard|master\s*card|jcb|amex|american\s*express)\b/.test(t);
}

/** Normalisasi kode mata uang ke ISO 4217 yang dikenal Frankfurter/ECB. */
function normalizeCurrency_(c) {
  c = String(c || '').trim().toUpperCase();
  var map = {
    '': 'IDR', 'RP': 'IDR', 'IDR': 'IDR', 'RUPIAH': 'IDR',
    'RMB': 'CNY', 'CNH': 'CNY', 'CNY': 'CNY', 'YUAN': 'CNY', 'RENMINBI': 'CNY', '¥': 'CNY', '元': 'CNY', '￥': 'CNY',
    'US$': 'USD', 'USD': 'USD', '$': 'USD', 'US DOLLAR': 'USD', 'DOLLAR': 'USD',
    'S$': 'SGD', 'SGD': 'SGD', 'SG$': 'SGD',
    'JPY': 'JPY', 'YEN': 'JPY',
    'EUR': 'EUR', '€': 'EUR', 'AUD': 'AUD', 'A$': 'AUD', 'MYR': 'MYR', 'RM': 'MYR',
    'HKD': 'HKD', 'HK$': 'HKD', 'GBP': 'GBP', 'KRW': 'KRW', 'THB': 'THB'
  };
  return map[c] || c;
}
