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
    '- merchant: nama PENERIMA/merchant/toko/aplikasi pada bukti APA ADANYA (untuk pembelajaran). '
    'Untuk bukti TRANSFER, isi dengan nama/label rekening TUJUAN persis seperti tertulis '
    '(mis. "Kairagi Dua 009"), termasuk angkanya. Bila tidak ada, isi "".\n' +
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
  // POS BIAYA dari PENERIMA (aturan deterministik mengalahkan tebakan model).
  var aturanPos = posDariPenerima_(data.merchant, data.keterangan);
  data.posAlasan = '';
  if (aturanPos) {
    var posResmi = samakanPos_(aturanPos.pos, getPosList_());
    if (posResmi) { data.pos_biaya = posResmi; data.posAlasan = aturanPos.alasan; }
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

// ====================== REVIEW PENGGUNAAN BIAYA (CLAUDE) ======================

/**
 * Menarasikan FAKTA review biaya yang sudah dihitung 16_domain_review.gs.
 *
 * Batas peran yang disengaja: model TIDAK menghitung apa pun. Semua angka sudah jadi
 * dan dikirim apa adanya; tugas model hanya menjelaskan artinya dan memberi saran yang
 * bisa ditindaklanjuti. Ini menutup satu-satunya cara analisa keuangan bisa salah
 * secara berbahaya, yaitu angka yang dikarang.
 *
 * fakta: hasil susunFaktaReview_. Mengembalikan
 *   { ringkasan, sorotan:[{pos,tingkat,temuan,saran}], terlewat:[{pos,alasan,usulanBudget}],
 *     langkah:[string] }
 */
function analisaBiaya_(fakta) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY belum diset. Buka Project Settings > Script Properties.');

  var systemPrompt =
    'Anda penasihat keuangan pribadi untuk seorang pemilik usaha di Indonesia. Anda menerima ' +
    'RINGKASAN ANGKA yang sudah dihitung dari spreadsheet miliknya untuk BULAN BERJALAN. ' +
    'Tugas Anda: menilai penggunaan biaya dan memberi rekomendasi yang bisa langsung dikerjakan.\n\n' +
    'ATURAN MUTLAK:\n' +
    '- JANGAN menghitung, menjumlah, atau menaksir angka baru. Pakai HANYA angka yang ada pada data. ' +
    'Bila sebuah angka tidak ada, jangan sebut angka - jelaskan dengan kata-kata.\n' +
    '- Jangan mengarang pos biaya yang tidak ada pada data.\n' +
    '- Ingat bulan belum tentu selesai: "porsiBulan" adalah persen hari yang sudah berlalu. ' +
    'Pos yang pemakaiannya jauh mendahului porsiBulan patut disorot walau belum 100%.\n' +
    '- Angka pada "lajuCepat" bukan pemborosan pasti, melainkan laju yang perlu diperhatikan. ' +
    'Bedakan nadanya dari "berlebihan" yang memang sudah melewati budget.\n' +
    '- Pos pada "tanpaBudget" ADA pengeluarannya bulan ini tetapi budgetnya 0 di sheet REKAP. ' +
    'Pos pada "rutinTerlewat" rutin di bulan-bulan sebelumnya tetapi tidak dianggarkan bulan ini. ' +
    'Keduanya kandidat "lupa diproyeksikan" - usulkan angka budget yang masuk akal ' +
    'BERDASARKAN angka yang tersedia (rerata atau pemakaian bulan ini), bukan tebakan bebas.\n' +
    '- Cicilan, tagihan, dan pajak umumnya tidak bisa dipangkas; sarannya bukan "kurangi" ' +
    'melainkan penjadwalan, pelunasan lebih cepat, atau penyesuaian budget. Sebaliknya pos ' +
    'konsumtif harian memang bisa direm.\n' +
    '- Bahasa Indonesia, langsung, tanpa basa-basi, tanpa menggurui. Sapa dengan "Anda".\n\n' +
    'ISI KELUARAN:\n' +
    '- ringkasan: 2-3 kalimat tentang posisi biaya bulan ini secara keseluruhan.\n' +
    '- sorotan: maksimal 5 pos yang paling perlu diperhatikan. "temuan" = apa yang terjadi ' +
    '(boleh menyebut angka dari data), "saran" = tindakan konkret. Urutkan dari paling mendesak.\n' +
    '- terlewat: pos yang sebaiknya ditambahkan/diisi budgetnya di sheet REKAP, dengan alasannya ' +
    'dan usulan angkanya. Kosongkan array bila memang tidak ada.\n' +
    '- langkah: maksimal 4 tindakan paling berdampak untuk sisa bulan ini, kalimat perintah singkat.';

  var schema = {
    type: 'object',
    properties: {
      ringkasan: { type: 'string' },
      sorotan: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pos: { type: 'string' },
            tingkat: { type: 'string', enum: ['tinggi', 'sedang', 'rendah'] },
            temuan: { type: 'string' },
            saran: { type: 'string' }
          },
          required: ['pos', 'tingkat', 'temuan', 'saran'],
          additionalProperties: false
        }
      },
      terlewat: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pos: { type: 'string' },
            alasan: { type: 'string' },
            usulanBudget: { type: 'number' }
          },
          required: ['pos', 'alasan', 'usulanBudget'],
          additionalProperties: false
        }
      },
      langkah: { type: 'array', items: { type: 'string' } }
    },
    required: ['ringkasan', 'sorotan', 'terlewat', 'langkah'],
    additionalProperties: false
  };

  var body = {
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    output_config: { format: { type: 'json_schema', schema: schema } },
    messages: [{
      role: 'user',
      content: [{ type: 'text',
        text: 'Data bulan berjalan (angka sudah final, jangan dihitung ulang):\n\n' +
          JSON.stringify(fakta, null, 1) }]
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
  if (json.stop_reason === 'refusal') throw new Error('Permintaan ditolak oleh model (refusal).');

  var raw = '';
  for (var i = 0; i < json.content.length; i++) {
    if (json.content[i].type === 'text') raw += json.content[i].text;
  }
  try { return JSON.parse(raw); }
  catch (e) { throw new Error('Gagal membaca hasil analisa dari model: ' + raw); }
}
