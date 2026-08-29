/**
 * DOMAIN - Aturan baris transaksi (validasi, Rekening, nilai NOMINAL & TANGGAL).
 * MURNI: dilarang memanggil API Google apa pun. Hanya boleh memakai 05_shared.
 *
 * Keputusan yang disembunyikan modul ini (Parnas):
 *   - field apa yang wajib diisi,
 *   - kapan Rekening boleh terisi,
 *   - kapan NOMINAL ditulis sebagai formula (mata uang asing) vs angka/teks,
 *   - bagaimana satu baris TRANSAKSI (A..J) disusun.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/.
 */

/** POS yang nominalnya ditulis sebagai formula bila memakai mata uang asing. */
var POS_NOMINAL_FORMULA = 'BIAYA KULIAH CHINA';

/** Daftar field wajib: [properti payload, label untuk pesan galat]. */
var FIELD_WAJIB_TRANSAKSI = [
  ['posBiaya', 'POS BIAYA wajib dipilih.'],
  ['tanggal', 'TANGGAL wajib diisi.'],
  ['sumberDana', 'SUMBER DANA wajib dipilih.'],
  ['biayaBulan', 'BIAYA BULAN wajib dipilih.'],
  ['tahunBiaya', 'TAHUN BIAYA wajib dipilih.'],
  ['budgetBulan', 'BUDGET BULAN wajib dipilih.'],
  ['tahunBudget', 'TAHUN BUDGET wajib dipilih.']
];

/** Lempar galat bila ada field wajib yang kosong / nominal tidak sah. */
function validasiTransaksi_(payload) {
  if (!payload) throw new Error('Data transaksi kosong.');
  for (var i = 0; i < FIELD_WAJIB_TRANSAKSI.length; i++) {
    var f = FIELD_WAJIB_TRANSAKSI[i];
    if (!payload[f[0]]) throw new Error(f[1]);
  }
  if (!(payload.nominal > 0)) throw new Error('NOMINAL harus angka lebih dari 0.');
}

/**
 * Aturan kolom Rekening: hanya terisi bila SUMBER DANA = PENDAPATAN USAHA
 * (boleh kosong = kas tunai usaha); selain itu dipaksa kosong.
 */
function rekeningTransaksi_(sumberDana, rekening) {
  if (sumberDana !== SUMBER_DANA_REKENING) return '';
  var r = String(rekening || '').trim();
  if (r && BANK_REKENING.indexOf(r) === -1) throw new Error('Rekening tidak valid: ' + r);
  return r;
}

/** true bila NOMINAL harus ditulis sebagai formula "nominalAsli*kurs". */
function pakaiFormulaNominal_(payload) {
  return payload.posBiaya === POS_NOMINAL_FORMULA
    && !!payload.mataUang && String(payload.mataUang).toUpperCase() !== 'IDR'
    && Number(payload.nominalAsli) > 0 && Number(payload.kurs) > 0;
}

/** Formula NOMINAL memakai koma (,) sebagai pemisah desimal (lokal Indonesia). */
function formulaNominal_(nominalAsli, kurs) {
  return '=' + String(Number(nominalAsli)).replace('.', ',') +
         '*' + String(Number(kurs)).replace('.', ',');
}

/** true bila sel lama bertipe angka (atau kosong) sehingga boleh ditulis sebagai angka. */
function selBertipeAngka_(selLama) {
  return typeof selLama === 'number' || selLama === '' || selLama == null;
}

/** true bila sel lama bertipe tanggal (atau kosong) sehingga boleh ditulis sebagai Date. */
function selBertipeTanggal_(selLama) {
  return (selLama instanceof Date) || selLama === '' || selLama == null;
}

/** Nilai kolom C (NOMINAL) mengikuti tipe sel yang sudah ada pada sheet. */
function nilaiNominal_(payload, selLama) {
  if (pakaiFormulaNominal_(payload)) return formulaNominal_(payload.nominalAsli, payload.kurs);
  return selBertipeAngka_(selLama) ? Number(payload.nominal) : formatRupiah_(payload.nominal);
}

/** Nilai kolom D (TANGGAL) mengikuti tipe sel yang sudah ada pada sheet. */
function nilaiTanggal_(iso, selLama, tanggalDate) {
  return selBertipeTanggal_(selLama) ? tanggalDate : formatTanggalIdFromIso_(iso);
}

/** Susun satu baris TRANSAKSI kolom A..J. */
function barisTransaksi_(payload, rekening, nominalValue, tanggalValue) {
  return [
    payload.posBiaya,               // A POS BIAYA
    payload.keterangan || '',       // B KETERANGAN
    nominalValue,                   // C NOMINAL
    tanggalValue,                   // D TANGGAL
    payload.biayaBulan,             // E BIAYA BULAN
    Number(payload.tahunBiaya),     // F TAHUN BIAYA
    payload.sumberDana,             // G SUMBER DANA
    payload.budgetBulan,            // H BUDGET BULAN
    Number(payload.tahunBudget),    // I TAHUN BUDGET
    rekening                        // J Rekening
  ];
}

/** Catatan pembelajaran (AI_MEMORY) dari payload + metadata saran AI. */
function catatanMemori_(payload, rekening) {
  var meta = payload.meta || {};
  return {
    tanggal: payload.tanggal, pos: payload.posBiaya, keterangan: payload.keterangan,
    nominal: payload.nominal, sumberDana: payload.sumberDana, rekening: rekening,
    akunSumber: meta.akunSumber, mataUang: meta.mataUang, merchant: meta.merchant,
    sugPos: meta.sugPos, sugSumber: meta.sugSumber, sugKeterangan: meta.sugKeterangan,
    dikoreksi: (meta.sugPos && meta.sugPos !== payload.posBiaya) ||
               (meta.sugSumber && meta.sugSumber !== payload.sumberDana) ||
               (meta.sugKeterangan && meta.sugKeterangan !== payload.keterangan)
  };
}
