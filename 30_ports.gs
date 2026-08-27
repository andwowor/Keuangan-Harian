/**
 * PORTS - KONTRAK antara lapisan application dan dunia luar.
 *
 * Apps Script memakai namespace datar tanpa `interface`, sehingga port di sini berupa
 * KONTRAK TERDOKUMENTASI: nama fungsi, bentuk masukan, dan bentuk keluaran yang WAJIB
 * dipatuhi setiap adapter. Mengganti penyedia = mengganti SATU adapter yang memenuhi
 * kontrak ini, tanpa menyentuh domain/ maupun application/ (lihat QAS-02).
 *
 * Aturan: application HANYA boleh memanggil nama-nama di bawah ini untuk urusan
 * eksternal — tidak pernah SpreadsheetApp/DriveApp/UrlFetchApp/ScriptApp langsung.
 *
 * Bagian dari Keuangan Harian - lihat docs/architecture/02-views/logical.md
 */

/**
 * PORT: LedgerRepository  -> diimplementasikan 40_adapter_sheets.gs
 *
 *   sheetsTz_()                              : string  zona waktu spreadsheet
 *   sheetsBatasTransaksi_()                  : { hdr:number, last:number }
 *   sheetsBacaTransaksi_(nCol)               : { hdr, last, tz, rows:Array<Array> }
 *   sheetsBacaBarisTransaksi_(row, nCol)     : { values:Array, formulas:Array, tz:string }
 *   sheetsSiapkanBarisBaru_()                : { row, nominalLama, tanggalLama, tz }
 *   sheetsTulisBarisTransaksi_(row, values)  : void
 *   sheetsBacaReal_(barisAwal, jml, kolom)   : { header:Array, labels:Array, values:Array }
 *   sheetsBacaMemori_()                      : Array<Array>   (sheet AI_MEMORY)
 *   sheetsBacaCashflowSetoran_()             : { tz, title, rows:Array<Array> }
 *   logMemory_(catatan)                      : void
 *   writeCashflow_(payload)                  : { row, sumberDana, title }
 *
 * Kontrak: SEMUA nilai balik berupa DATA BIASA (array/objek polos) — bukan objek
 * Range/Sheet — agar application tidak terikat pada Google Sheets.
 */

/**
 * PORT: ProofStorage (inbox bukti)  -> diimplementasikan 41_adapter_drive.gs
 *
 *   getInboxFolder_()                : Folder    (khusus internal adapter)
 *   getInboxFile_(fileId)            : File      melempar bila di luar folder inbox
 *   inboxImageBlob_(file)            : Blob      otomatis perkecil bila > INBOX_MAX_BYTES
 *   inboxThumb_(file, size)          : string    data URL thumbnail ('' bila gagal)
 *   inboxStoredHash_(file)           : string    sidik jari MD5 ('' bila belum ada)
 *   inboxSetHash_(file, hash)        : void      menjaga tag metadata lain
 *   inboxGetAi_(file)                : Object|null  hasil baca tersimpan
 *   inboxMarkReading_(file)          : void
 *   inboxSaveAi_(file, dataObj)      : void
 *   inboxMarkError_(file, pesan)     : void
 *
 * Kontrak keamanan: setiap akses berkas WAJIB lewat getInboxFile_ sehingga berkas di
 * luar folder penyimpanan tidak dapat dibaca lewat ID (QAS-06).
 */

/**
 * PORT: ProofReader (pembaca bukti / AI)  -> diimplementasikan 42_adapter_claude.gs
 *
 *   analyzeImg_({ mediaType, data })  : Object hasil ekstraksi tervalidasi skema
 *
 * Bentuk keluaran (kontrak yang dipegang application & UI):
 *   { nominal_asli, mata_uang, tanggal, pos_biaya, keterangan, keterangan_yakin,
 *     keterangan_opsi, merchant, akun_sumber, akun_sumber_nama, is_boc_1201,
 *     bank_rekening, confidence, catatan,
 *     // ditambahkan setelah pascaproses:
 *     mataUang, nominalAsli, nominal, konversi, sumberDanaSaran, rekeningSaran,
 *     sumberDanaAlasan, nominalFormatted }
 *
 * Catatan: keputusan SUMBER DANA yang kritikal TIDAK diambil dari model, melainkan
 * dari aturan deterministik 10_domain_rekening.gs (ADR-0003).
 */

/**
 * PORT: SpendingAnalyst (penasihat biaya)  -> diimplementasikan 42_adapter_claude.gs
 *
 *   analisaBiaya_(fakta)  : { ringkasan, sorotan:[{pos,tingkat,temuan,saran}],
 *                             terlewat:[{pos,alasan,usulanBudget}], langkah:[string] }
 *
 * Kontrak: `fakta` sudah berisi SELURUH angka hasil hitungan domain (16_domain_review.gs).
 * Adapter TIDAK boleh menghitung ulang, dan model diinstruksikan hanya memakai angka yang
 * ada pada fakta - lihat ADR-0011.
 */

/**
 * PORT: ExchangeRateProvider  -> diimplementasikan 43_adapter_kurs.gs
 *
 *   getFxRate_(currency, isoDate)  : { rate:number, date:string }
 *
 * Kontrak: melempar galat bila kurs tidak tersedia; pemanggil menampilkan pesan agar
 * pengguna mengisi NOMINAL manual (tidak pernah diam-diam memakai kurs 0).
 */

/**
 * PORT: SecretStore & Auth  -> diimplementasikan 44_adapter_properties.gs
 *
 *   checkPin(pin)              : boolean  true bila PIN cocok / APP_PIN belum diset
 *   verifyPin_(pin)            : void     melempar galat bila PIN salah
 *   propAmbilJson_(kunci)      : Object|null  hasil tersimpan lintas sesi
 *   propSimpanJson_(kunci, v)  : void
 *   propHapus_(kunci)          : void
 *
 * Kontrak: SETIAP fungsi backend yang membaca atau menulis data pengguna wajib
 * memanggil verifyPin_ di baris pertama (QAS-06).
 */

/**
 * PORT: Scheduler  -> diimplementasikan 90_triggers.gs
 *
 *   setupAutoRead(pin)     : { aktif:boolean }  pasang trigger ±5 menit
 *   disableAutoRead(pin)   : { aktif:boolean }  lepas trigger
 *   autoReadStatus(pin)    : { aktif:boolean }
 *   autoReadInbox()          : number  jumlah bukti yang dibaca pada satu putaran
 *   setupReviewHarian(pin)   : { aktif, jam, zona }  pasang trigger 23.59 WITA
 *   disableReviewHarian(pin) : { aktif, jam, zona }
 *   reviewHarianStatus(pin)  : { aktif, jam, zona }
 *   reviewHarianJalan()      : string  ringkasan hasil satu putaran analisa harian
 */
