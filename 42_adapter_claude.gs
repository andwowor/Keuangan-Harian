/**
 * ADAPTER OUTBOUND - Claude Vision API (api.anthropic.com).
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

// ====================== EKSTRAKSI GAMBAR (CLAUDE VISION) ======================

/**
 * Membaca satu gambar (data URL). Mengembalikan field yang BISA dibaca dari bukti:
 * nominal, tanggal, pos_biaya, keterangan (+rekomendasi), deteksi BOC, dan bank rekening.
 * Field yang HARUS dipilih pemilik (sumber dana, bulan/tahun) TIDAK ditebak di sini.
 */
function analyzeImage(dataUrl, pin) {
  verifyPin_(pin);
  return analyzeImg_(parseDataUrl_(dataUrl));
}

/** Inti pembacaan gambar oleh Claude. img = { mediaType, data(base64) }. PIN sudah diverifikasi. */
function analyzeImg_(img) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY belum diset. Buka Project Settings > Script Properties.');
  }

  var systemPrompt =
    'Anda asisten pencatat keuangan. Anda menerima screenshot atau bukti transfer ' +
    'pengeluaran (umumnya dari aplikasi bank / e-wallet Indonesia). Baca gambar dan ' +
    'ekstrak data sesuai skema. Jangan menebak field yang tidak terlihat pada bukti.\n\n' +
    'Aturan:\n' +
    '- nominal_asli: total uang yang KELUAR dalam MATA UANG ASLI pada bukti, sebagai angka ' +
    '(boleh desimal). Contoh "Rp2.392.144" -> 2392144 ; "¥85,50"/"RMB 85.50" -> 85.5.\n' +
    '- mata_uang: kode ISO 4217 mata uang pada bukti. Rupiah/Rp -> "IDR" ; RMB/¥/元/yuan -> "CNY" ; ' +
    'US$/USD -> "USD" ; S$/SGD -> "SGD" ; dst. Jika tidak jelas, gunakan "IDR".\n' +
    '- tanggal: tanggal transaksi PADA BUKTI, format ISO YYYY-MM-DD. WAJIB diambil dari ' +
    'bukti. Jika benar-benar tidak terbaca, isi string kosong "".\n' +
    '- pos_biaya: pilih dari daftar enum dengan MENCOCOKKAN nama merchant/toko/barang pada bukti ' +
    'ke PANDUAN KATEGORISASI di bawah (dibuat dari history pengisian pemilik). Sinyal kuat: bila ' +
    'mata uang CNY/RMB (belanja di China) -> umumnya "BIAYA KULIAH CHINA", kecuali tiket transportasi ' +
    'pulang ke Indonesia -> "BIAYA PULANG". Merchant kopi/makanan/hiburan domestik (mis. Starbucks, ' +
    'Fore, bioskop, restoran) -> "DAILY DRIVER".\n' +
    '- keterangan: label SINGKAT gaya pencatatan pemilik untuk transaksi ini ' +
    '(nama merchant/barang/keperluan). Contoh gaya: "Makanan", "Snack", "Starbucks", ' +
    '"Kopi", "Kebutuhan harian", "Sepeda", "Transport", "Refill galon", "Tarik tunai", ' +
    '"Oleh-oleh", "Internet", "Bensin Manado". Jika tidak yakin, isi "" dan ' +
    'keterangan_yakin=false.\n' +
    '- keterangan_yakin: true hanya jika Anda cukup yakin keterangan-nya tepat.\n' +
    '- keterangan_opsi: hingga 4 usulan label singkat yang cocok (boleh kosong array).\n' +
    '- merchant: nama merchant/toko/aplikasi/penerima pada bukti apa adanya (untuk pembelajaran), atau "".\n' +
    '- akun_sumber: nomor rekening/akun SUMBER DANA pada bukti, yaitu rekening PENGIRIM / yang ' +
    'DIDEBIT (biasanya berlabel "Sumber Dana", "Source of Fund", "Rekening Sumber", "Dari", "From"), ' +
    'tulis ANGKANYA (boleh sertakan nama bank bila ada). Bukan rekening tujuan/penerima. Bila tidak ada, isi "". ' +
    'Bila nomor DISAMARKAN, SALIN APA ADANYA persis semua angka & tanda samaran yang terlihat — ' +
    'contoh: "•••••••••5620", "026 - 3** - **85", "*******055", "1543 **** **** 507". ' +
    'Sertakan nama bank bila tertera. Jangan menghapus tanda samaran, jangan menebak angka yang tertutup, ' +
    'dan JANGAN mengosongkan hanya karena disamarkan.\n' +
    '- akun_sumber_nama: nama pemilik & bank/aplikasi/kartu SUMBER DANA (pengirim) apa adanya pada bukti — ' +
    'mis. "Andre Stefano Wowor", "blu by BCA Digital", "BNI Multicurrency", "Allo". ' +
    'Bila sumber dana berupa KARTU KREDIT, sertakan nama jaringan/produknya persis (mis. ' +
    '"BNI Visa Affinity Platinum", "Mastercard", "Kartu Kredit"). Bukan penerima. Bila tidak ada, isi "".\n' +
    '- is_boc_1201: true bila pada bukti tertulis "BOC Debit Card (1201)".\n' +
    '- bank_rekening: cadangan bila akun_sumber tidak terbaca — bila bukti transfer dari bank, ' +
    'petakan bank pengirim ke Mandiri/BNI/BRI/BCA; jika tidak jelas isi "". ' +
    '(Hanya dipakai bila sumber dana = PENDAPATAN USAHA.)\n' +
    '- confidence: keyakinan keseluruhan.\n' +
    '- catatan: catatan singkat bila ada yang ambigu, selain itu "".';

  // Tambahkan panduan kategorisasi POS dari history (belajar dari data yang sudah diisi).
  var posList = getPosList_();
  var posExamples = getPosExamples();
  var panduan = '';
  for (var pi = 0; pi < posList.length; pi++) {
    var pp = posList[pi], ex = posExamples[pp];
    panduan += '- ' + pp + (ex && ex.length ? ': ' + ex.join(', ') : '') + '\n';
  }
  systemPrompt += '\n\nPANDUAN KATEGORISASI POS BIAYA (dari history pengisian pemilik — ' +
    'cocokkan merchant/barang pada bukti dengan contoh POS terdekat):\n' + panduan;

  var schema = {
    type: 'object',
    properties: {
      nominal_asli: { type: 'number', description: 'Jumlah dalam mata uang asli pada bukti' },
      mata_uang: { type: 'string', description: 'Kode ISO 4217, mis. IDR/CNY/USD/SGD' },
      tanggal: { type: 'string', description: 'Tanggal transaksi YYYY-MM-DD, atau "" bila tak terbaca' },
      pos_biaya: { type: 'string', enum: posList },
      keterangan: { type: 'string' },
      keterangan_yakin: { type: 'boolean' },
      keterangan_opsi: { type: 'array', items: { type: 'string' } },
      merchant: { type: 'string', description: 'Nama merchant/toko/penerima pada bukti, atau ""' },
      akun_sumber: { type: 'string', description: 'Nomor rekening/akun sumber dana (pengirim) pada bukti, atau ""' },
      akun_sumber_nama: { type: 'string', description: 'Nama pemilik & bank/aplikasi sumber dana (pengirim) pada bukti, atau ""' },
      is_boc_1201: { type: 'boolean' },
      bank_rekening: { type: 'string', enum: ['Mandiri', 'BNI', 'BRI', 'BCA', 'Kas Tunai Maumbi', ''] },
      confidence: { type: 'string', enum: ['tinggi', 'sedang', 'rendah'] },
      catatan: { type: 'string' }
    },
    required: ['nominal_asli', 'mata_uang', 'tanggal', 'pos_biaya', 'keterangan', 'keterangan_yakin',
      'keterangan_opsi', 'merchant', 'akun_sumber', 'akun_sumber_nama', 'is_boc_1201', 'bank_rekening', 'confidence', 'catatan'],
    additionalProperties: false
  };

  var body = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    output_config: { format: { type: 'json_schema', schema: schema } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
        { type: 'text', text: 'Ekstrak data pengeluaran dari bukti ini sesuai skema.' }
      ]
    }]
  };

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code !== 200) throw new Error('Claude API error ' + code + ': ' + text);

  var json = JSON.parse(text);
  if (json.stop_reason === 'refusal') {
    throw new Error('Permintaan ditolak oleh model (refusal). Coba gambar lain.');
  }

  var raw = '';
  for (var i = 0; i < json.content.length; i++) {
    if (json.content[i].type === 'text') raw += json.content[i].text;
  }

  var data;
  try { data = JSON.parse(raw); }
  catch (e) { throw new Error('Gagal membaca hasil dari model: ' + raw); }

  // Konversi ke IDR memakai kurs tanggal transaksi bila mata uang asing (mis. RMB/CNY).
  var cur = normalizeCurrency_(data.mata_uang);
  var amt = Number(data.nominal_asli) || 0;
  data.mataUang = cur;
  data.nominalAsli = amt;
  if (cur === 'IDR' || cur === '') {
    data.nominal = Math.round(amt);
    data.konversi = null;
  } else {
    try {
      var conv = convertToIdr_(amt, cur, data.tanggal);
      data.nominal = Math.round(conv.idr);
      data.konversi = { mataUang: cur, nominalAsli: amt, rate: conv.rate, tanggalKurs: conv.date };
    } catch (e2) {
      data.nominal = 0;
      data.konversi = { error: true, mataUang: cur, nominalAsli: amt, message: String(e2) };
    }
  }
  // Saran SUMBER DANA & Rekening dari nomor rekening sumber (deterministik + dipelajari), lalu aturan BOC.
  var acct = detectAccount_(data.akun_sumber, data.akun_sumber_nama, getLearnedAccounts_());
  data.sumberDanaSaran = '';
  data.rekeningSaran = '';
  data.sumberDanaAlasan = '';
  if (acct) {
    data.sumberDanaSaran = acct.sumberDana;
    data.rekeningSaran = acct.bank || '';
    data.sumberDanaAlasan = acct.alasan || ('Rekening ' + acct.label + ' → ' + acct.sumberDana);
  } else if (data.is_boc_1201) {
    data.sumberDanaSaran = 'UANG SAKU';
    data.sumberDanaAlasan = 'BOC Debit Card (1201) → Uang Saku';
  }

  data.nominalFormatted = formatRupiah_(data.nominal);
  return data;
}
