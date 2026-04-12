/* ============================================================
   NOTA SAMORO – Generator Nota Transfer Bank
   Mendukung: Bank Aladin Syariah · SeaBank · Jago Syariah
   OCR: Tesseract.js v4
   ============================================================ */

'use strict';

/* ─── KONFIGURASI TOKO ────────────────────────────────────── */
const TOKO = {
  alamat1: 'Kabunan RT 6 RW 1, Ngadiwarno',
  alamat2: 'Kec. Sukorejo, Kab Kendal 51363',
  wa:      '083162294652'
};

/* ─── STATE ──────────────────────────────────────────────── */
let state = {
  imageFile: null,
  ocrText:   '',
  extracted: null,
  adminFee:  0
};

/* ============================================================
   UTILS
   ============================================================ */

/** Format rupiah: 2500000 → "Rp2.500.000" */
function fmtRp(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

/** Parse angka dari string rupiah Indonesia: "2.500.000,00" → 2500000 */
function parseRp(str) {
  if (!str) return 0;
  let s = String(str).trim();
  // Clean OCR noise: O→0, l→1, I→1
  s = s.replace(/[Ol]/g, '0').replace(/I/g, '1');
  s = s.replace(/[Rr][Pp]/g, '').trim();
  s = s.replace(/,\d{1,2}$/, '');
  s = s.replace(/[\s.]/g, '');   // ← handle spasi dan titik
  s = s.replace(/[^\d]/g, '');
  return parseInt(s) || 0;
}

/** Sensor nama: tiap kata → huruf pertama + bintang + huruf terakhir
 *  Contoh: "Rudi Ahmad Fauzi" → "R**i A***d F***i"
 */
function sensorNama(nama) {
  if (!nama || !nama.trim()) return '-';
  return nama.trim().split(/\s+/).map(kata => {
    const k = kata.replace(/[^A-Za-z]/g, '');
    if (!k) return kata;
    if (k.length === 1) return k;
    if (k.length === 2) return k[0] + '*';
    return k[0] + '*'.repeat(k.length - 2) + k[k.length - 1];
  }).join(' ');
}

/** Sensor rekening: tampilkan ********XXXX (4 digit terakhir) */
function sensorRek(rek) {
  if (!rek) return '--------';
  // Ambil HANYA digit, lalu ambil 4 terakhir
  const digits = String(rek).replace(/\D/g, '');
  if (digits.length < 4) return '--------';
  return '********' + digits.slice(-4);
}
/** Tanggal & waktu saat ini */
function buildWaktu() {
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}.${mn} WIB`;
}

/** Hitung biaya admin otomatis */
function calcAdmin(jumlah) {
  if (jumlah >= 10000 && jumlah <= 200000)  return 2000;
  if (jumlah > 200000 && jumlah <= 1000000) return Math.round(jumlah * 0.01);
  if (jumlah > 1000000)                     return 10000;
  return 0;
}

/** Truncate string untuk no. transaksi */
function truncTrx(s) {
  if (!s) return '-';
  return s.length > 20 ? s.slice(0, 20) + '...' : s;
}

/** Format tanggal history */
function fmtHistDate(ts) {
  return new Date(ts).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/* ============================================================
   DETEKSI & PARSING BANK
   ============================================================ */

/** Deteksi bank dari teks OCR */
function detectBank(text) {
  const t = text.toLowerCase();
  if (t.includes('aladin'))                       return 'aladin';
  if (t.includes('seabank') || t.includes('sea bank')) return 'seabank';
  if (t.includes('jago'))                         return 'jago';
  return 'unknown';
}

/** Cari jumlah transfer dari teks — ambil nilai setelah "Jumlah Transfer"
 *  atau nilai Rp terbesar sebagai fallback */
function extractAmount(text) {
  // Helper: bersihkan OCR noise dari string rupiah
  const cleanOCR = str => str.replace(/[Ol]/g, '0').replace(/i/g, '1').replace(/I/g, '1');
  
  // Prioritas 0: JAGO KHUSUS — cari "Rp" + angka dengan toleransi OCR noise
  const jagoRpMatch = text.match(/rp\s{0,2}([\d\.,]{2,})/i);
  if (jagoRpMatch) {
    const raw = jagoRpMatch[1];
    const cleaned = cleanOCR(raw).trim();
    const val = parseRp(cleaned);
    if (val > 0 && val < 100000000) return val;
  }

  // Prioritas 1: setelah label "Jumlah Transfer"
  const jumlahMatch = text.match(/jumlah\s*transfer[^\d]*([\d.,\s]{3,})/i);
  if (jumlahMatch) {
    const val = parseRp(cleanOCR(jumlahMatch[1]));
    if (val > 0) return val;
  }
  
  // Prioritas 2: "Rp" dengan variasi noise
  const rpPatterns = [
    /rp\s{0,5}([\d][0-9.,\s]{2,})/gi,
    /rp[^\w\s]+\s*([\d][0-9.,\s]{2,})/gi,
  ];
  
  for (const pattern of rpPatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length) {
      const vals = matches.map(m => parseRp(cleanOCR(m[1]))).filter(v => v >= 1000);
      if (vals.length) return Math.max(...vals);
    }
  }
  
  // Prioritas 3: angka standalone di baris sendiri (untuk Jago yg tanpa "Rp")
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const standaloneVals = [];
  for (const l of lines) {
    if (/^[\d][0-9.,\s]{2,}$/.test(l) || /^[\dOl][0-9.,\sOlI]{2,}$/.test(l)) {
      const cleaned = cleanOCR(l);
      const v = parseRp(cleaned);
      if (v >= 1000) standaloneVals.push(v);
    }
  }
  if (standaloneVals.length) return Math.max(...standaloneVals);
  
  // Prioritas 4: cari angka besar pertama (fallback)
  const allDigitMatches = [...text.matchAll(/([\d]{3,}[\.,]?[\d]*)/g)];
  const bigNumbers = allDigitMatches.map(m => parseRp(m[1])).filter(v => v >= 10000 && v < 100000000);
  if (bigNumbers.length) return Math.max(...bigNumbers);
  
  // Prioritas 5: AGGRESSIVE fallback untuk Jago
  // Cari angka 3+ digit dengan separator (. , spasi) di seluruh teks
  // Format: 142.000 atau 142,000 atau 142 000 atau 142000
  const aggressiveMatch = text.match(/([\d]{2,3}[\.\,\s]?[\d]{3}[\.\,\s]?[\d]{0,3})/);
  if (aggressiveMatch) {
    const cleaned = cleanOCR(aggressiveMatch[1]);
    const v = parseRp(cleaned);
    if (v >= 10000 && v < 100000000) return v;
  }
  
  return 0;
}
/* ── PARSER: BANK ALADIN ─────────────────────────────────── */
/*
  Struktur struk Aladin:
    Transfer berhasil
    Tanggal: 03 Mar 2026, 16:30
    Ref: 20260303NETBIDJA01...
    Jumlah Transfer
    Rp2.500.000,00
    Tujuan
    [NAMA TUJUAN]
    Sea Bank 9018840...
    Dari
    [NAMA PENGIRIM]
    Aladin *** *** 5451
    Metode transfer
    BI Fast
*/
function parseAladin(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const jumlah  = extractAmount(text);

  // Helper: bersihkan OCR noise dari reference number
  const cleanRefNumber = ref => ref.replace(/[Ol]/g, '0').replace(/I/g, '1');

  // Tanggal - handle OCR typo: Tanggal → anggal, Tgl, dll
  const dateM = text.match(/[t]?anggal[:\s]+([^\n\r]+)/i) ||  // anggal atau tanggal
                text.match(/tgl[:\s]+([^\n\r]+)/i) ||           // Tgl
                text.match(/tanggal[:\s]+([^\n\r]+)/i);          // tanggal
  const tanggal = dateM ? dateM[1].trim() : '';

  // Nomor referensi/transaksi — bersihkan OCR noise (O→0, I→1)
  const refM = text.match(/ref[:\s]+([A-Z0-9]+)/i);
  const noTransaksi = refM ? cleanRefNumber(refM[1]) : '';

  // Metode
  const metode = /bi[-\s]?fast/i.test(text) ? 'BI FAST' : 'BI Fast';

  // Blok "Tujuan"
  let namaTujuan = '', bankTujuan = '', rekTujuan = '';
  const idxTujuan = lines.findIndex(l => /^tujuan$/i.test(l));
  if (idxTujuan >= 0) {
    namaTujuan = lines[idxTujuan + 1] || '';
    const bLine = lines[idxTujuan + 2] || '';
    // Contoh: "Sea Bank 9018840xxx" atau "BCA 12345678"
    const bankAccM = bLine.match(/^(.+?)\s+([\d*]{4,})$/);
    if (bankAccM) {
      bankTujuan = bankAccM[1].trim();
      rekTujuan  = bankAccM[2];
    } else {
      bankTujuan = bLine;
    }
  }

  // Blok "Dari"
  let namaPengirim = '', rekPengirim = '';
  const idxDari = lines.findIndex(l => /^dari$/i.test(l));
  if (idxDari >= 0) {
    namaPengirim = lines[idxDari + 1] || '';
    const accLine = lines[idxDari + 2] || '';
    // "Aladin *** *** 5451" — ambil 4 digit terakhir
    const accM = accLine.match(/(\d{4})\s*$/);
    if (accM) rekPengirim = accM[1];
  }

  return {
    bankPengirim: 'Bank Aladin Syariah',
    namaPengirim: sensorNama(namaPengirim),
    rekPengirim:  rekPengirim ? '********' + rekPengirim : '--------',
    bankTujuan:   bankTujuan || '-',
    namaTujuan:   sensorNama(namaTujuan),
    rekTujuan:    sensorRek(rekTujuan),
    noTransaksi:  truncTrx(noTransaksi),
    metode,
    jumlahTransfer: jumlah,
    tanggal
  };
}

/* ── PARSER: SEABANK ─────────────────────────────────────── */
/*
  Struktur struk SeaBank (OCR membaca 2-kolom sebagai baris terpisah):
    SeaBank / Bukti Transaksi
    Rp 500.000
    Dari                        ← label sendiri ATAU inline
    [NAMA PENGIRIM]             ← nama di baris berikutnya
    SeaBank: ********6497       ← rek pengirim
    Ke                          ← label sendiri ATAU inline
    [NAMA TUJUAN]               ← nama di baris berikutnya
    BANK JAGO SYARIAH: ****7067 ← bank + rek tujuan
    Jumlah Transfer  Rp 500.000
    No. Transaksi    20260409...
    Metode Transaksi BI-FAST
    Waktu Transaksi  09 Apr 2026, 12:24

  ROOT CAUSE lama: regex mengasumsikan nama+bank+rek pada SATU baris.
  Kenyataannya Tesseract membacanya baris terpisah karena layout 2 kolom.
*/
function parseSeaBank(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const jumlah = extractAmount(text);

  // Waktu Transaksi - handle OCR typo: Waktu → aktu, Wkt, dll
  const wktM = text.match(/[w]?aktu\s*transaksi[:\s]+([^\n\r]+)/i) ||  // aktu atau waktu
               text.match(/wkt\s*transaksi[:\s]+([^\n\r]+)/i) ||        // Wkt transaksi
               text.match(/waktu\s*transaksi[:\s]+([^\n\r]+)/i);        // waktu transaksi
  const tanggal = wktM ? wktM[1].trim() : '';

  // Fix No. Transaksi: tangani em-dash "—", spasi, noise D di akhir
  // Capture long ID (26+ chars), lalu bersihkan dari non-alphanumeric
  const noM = text.match(/no\.?\s*transaksi[:\s]*—?\s*([A-Z0-9]{15,})/i) || 
              text.match(/no\.?\s*transaksi[:\s]*—?\s*([A-Z0-9]+)/i);
  const noTransaksi = noM ? noM[1].replace(/[^A-Z0-9]/g, '') : '';

  const metode = /bi[-\s]?fast/i.test(text) ? 'BI FAST' : '';

  // Helper: bersihkan noise characters dari awal/tengah string
  // Remove: @, ©, ®, (, ), °, #, single letter (a-z) jika di awal, numbers
  const cleanNoise = l => {
    let cleaned = l;
    // 1. Remove awal: single noise char/digit + space (e.g., "9 ", "g ", "@ ")
    cleaned = cleaned.replace(/^[^\w\s]*[\d@©®\(\)°#]\s+/i, '')
                     .replace(/^[a-z]\s+/i, '');  // "g ", "o " etc
    // 2. Remove tengah: @, ©, ®, (, ), °, #
    cleaned = cleaned.replace(/[@©®\(\)°#]/g, '')
                     .trim();
    // 3. Final trim
    return cleaned;
  };
  
  // Improved isNoise
  const isNoise = l => {
    const stripped = cleanNoise(l);
    if (!stripped || stripped.length <= 1) return true;
    if (/^[\-—_\s@O©®°]+$/.test(l)) return true;
    if (/^(dari|ke|seabank|bukti|transaksi|rp[\s\d]|jumlah|no\.|metode|waktu|bank jago|bank)/i.test(l)) return true;
    if (/^(dari|ke|seabank|bukti|transaksi|rp[\s\d])/i.test(stripped)) return true;
    if (/^\d+$/.test(stripped)) return true;
    const noisyChars = (stripped.match(/[@D\(\)]/g) || []).length;
    const validChars = (stripped.match(/[A-Za-z]/g) || []).length;
    return noisyChars > validChars || validChars === 0;
  };

  // ── PENGIRIM ──
  let namaPengirim = '', rekPengirim = '';
  
  // CHECK 1: Cari baris "Dari [nama]" inline
  const dariLine = lines.find(l => /^dari\s+/i.test(l));
  if (dariLine) {
    const dariM = dariLine.match(/^dari\s+(.*?)(?:@|seabank|$)/i);
    if (dariM) {
      namaPengirim = cleanNoise(dariM[1]);
    }
  }
  
  // CHECK 2: Jika tidak ketemu inline, cari dari baris terpisah sebelum seabank rek
  if (!namaPengirim) {
    const idxSBRek = lines.findIndex(l => /@\s*seabank[\s:]+/i.test(l) || /seabank[\s:]+[\*@x\d\+]/i.test(l));
    if (idxSBRek >= 0) {
      // Nama bisa di baris sebelumnya
      for (let i = idxSBRek - 1; i >= 0; i--) {
        const l = lines[i];
        if (/^dari$/i.test(l)) break;
        if (!isNoise(l)) {
          namaPengirim = cleanNoise(l);
          break;
        }
      }
    }
  }
  
  // Extract rekening pengirim - tangani format "****digitshere"
  const sbRekMatch = text.match(/@\s*seabank[\s:]+([*\d]+)/i) || 
                     text.match(/seabank[\s:]+([*\d]+)/i);
  if (sbRekMatch) {
    rekPengirim = sbRekMatch[1];  // Keep as is, let sensorRek handle it
  }

  // ── TUJUAN ──
  let namaTujuan = '', bankTujuan = '', rekTujuan = '';
  
  // CHECK 1: Cari baris "Ke [nama]" inline  
  const keLine = lines.find(l => /^ke\s+/i.test(l));
  if (keLine) {
    const keM = keLine.match(/^ke\s+(.*?)(?:bank|jago|$)/i);
    if (keM) {
      namaTujuan = cleanNoise(keM[1]);
    }
  }
  
  // CHECK 2: Jika tidak ketemu inline, cari dari baris terpisah sebelum bank tujuan
  if (!namaTujuan) {
    const idxBankTuj = lines.findIndex(l => 
      /[A-Z]{3,}[\s:]+[\*xX¥@\+\d]{4,}/i.test(l) && !/seabank/i.test(l)
    );
    if (idxBankTuj >= 0) {
      for (let i = idxBankTuj - 1; i >= 0; i--) {
        const l = lines[i];
        if (/^ke$/i.test(l)) break;
        if (!isNoise(l)) {
          namaTujuan = cleanNoise(l);
          break;
        }
      }
    }
  }
  
  // Extract bank + rekening tujuan
  // Pattern: BANK_NAME (bisa 1-3 kata) : REKENING (angka/asterisk dengan possible noise)
  const bankTujMatch = text.match(/([A-Z]{3,}(?:\s[A-Z]+){0,2})\s*:\s*([\*\d+]+)/i);
  if (bankTujMatch && !/seabank/i.test(bankTujMatch[1])) {
    bankTujuan = bankTujMatch[1].trim();
    rekTujuan = bankTujMatch[2].replace(/\+/g, '');  // Remove + noise
  }

  return {
    bankPengirim: 'SeaBank',
    namaPengirim: sensorNama(namaPengirim),
    rekPengirim:  sensorRek(rekPengirim),
    bankTujuan:   bankTujuan || '-',
    namaTujuan:   sensorNama(namaTujuan),
    rekTujuan:    sensorRek(rekTujuan),
    noTransaksi:  truncTrx(noTransaksi),
    metode:       metode || 'BI FAST',
    jumlahTransfer: jumlah,
    tanggal
  };
}
/* ── PARSER: JAGO SYARIAH ────────────────────────────────── */
/*
  Struktur struk Jago:
    syariah / Jago              ← header (noise)
    [NAMA TUJUAN]               ← baris pertama bermakna (all caps)
    Mandiri • 9000029...        ← bank tujuan + rek tujuan
    FS / mandiri                ← avatar & logo (noise)
    Rp142.000
    ID Transaksi
    260301SYATIDJ100...
    Sumber akun  ← OPTIONAL, kadang tidak ada
    [NAMA PENGIRIM]
    Jago 5001270...
    Tanggal & waktu transaksi
    01 Mar 2026, 21:16 WIB

  Perbaikan:
  1. Tangani bank name typo (Mandil→Mandiri, Mandri, dll)
  2. Handle struktur tanpa label "Sumber akun"
  3. Cari nama pengirim di sekitar "Jago rek" line
*/
function parseJago(text) {
  // Bersihkan noise: watermark "jago", "syariah", karakter «, icon "FS"
  const cleaned = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !/^(jago|syariah|fs)$/i.test(l) && !/«/.test(l))
    .join('\n');

  const lines = cleaned.split('\n').filter(Boolean);
  
  // ── EKSTRAK NOMINAL ──
  // Prioritas 1: gunakan extractAmount pada teks original dulu
  let jumlah = extractAmount(text);
  
  // Prioritas 2 (Jago fallback): cari baris "Rp" pertama setelah header
  if (jumlah === 0) {
    for (const l of lines) {
      if (/^rp/i.test(l)) {
        const m = l.match(/^rp\s*([\d.,\s]+)/i);
        if (m) {
          jumlah = parseRp(m[1]);
          if (jumlah > 0) break;
        }
      }
    }
  }

  // Tanggal & Waktu - strategy: cari baris yang contain tanggal format (01 Mar 2026, 21:16 WIB, dll)
  let tanggal = '';
  
  // Cari baris dengan pattern tanggal: "DD MMM YYYY" atau "DD-MMM-YYYY" atau dengan jam
  const dateLineIdx = lines.findIndex(l => 
    /\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\-)[a-z]*\s*\d{4}/i.test(l) ||
    /\d{1,2}\/\d{1,2}\/\d{4}/i.test(l) ||  // DD/MM/YYYY
    /\d{4}\-\d{1,2}\-\d{1,2}/i.test(l)     // YYYY-MM-DD
  );
  
  if (dateLineIdx >= 0) {
    tanggal = lines[dateLineIdx].trim();
  }
  
  // Fallback: cari label "tanggal/anggal/tgl...waktu/aktu/wkt" lalu ambil baris setelahnya
  if (!tanggal) {
    const idxTgl = lines.findIndex(l => 
      /([ta]nggal|tgl)[\s\-&@]*([wa]ktu|wkt|transaksi)?/i.test(l)
    );
    if (idxTgl >= 0 && lines[idxTgl + 1]) {
      tanggal = lines[idxTgl + 1].trim();
    }
  }

  const idxId = lines.findIndex(l => /id\s*transaksi/i.test(l));
  const noTransaksi = idxId >= 0 ? (lines[idxId + 1] || '') : '';

  const metode = 'BI FAST';

  // ── BANK TUJUAN & REK TUJUAN ──
  // Cari baris yang ada bank name (dengan toleransi typo)
  // Pattern: [BANK_NAME] [separator] [NOMOR_REKENING]
  // Bank names yang sering muncul: Mandiri, BCA, BRI, Mandil (typo), Mandri (typo), dll
  let namaTujuan = '', bankTujuan = '', rekTujuan = '';
  
  // Helper: cek apakah string adalah bank name (dengan typo tolerance)
  const isBankName = str => /^(mandiri|mandil|mandri|bca|bri|bni|bsi|btn|danamon|permata|cimb|mega|ocbc|bukopin)/i.test(str);
  
  // Cari baris yang mulai dengan bank name
  const idxBank = lines.findIndex(l => isBankName(l));
  if (idxBank >= 0) {
    const bLine = lines[idxBank];
    // Extract bank name + rekening dengan regex fleksibel
    // Format: "[BANKNAME] [separator] [NOMOR]" atau "[BANKNAME][separator][NOMOR]"
    // Separator: •, ·, ., -, *, =, D, ?, ~, space, atau langsung digit
    const bankM = bLine.match(/^([A-Za-z]+(?:\s[A-Za-z]+)?)\s*[•·.\-\*=D?~\s]*\s*(\d{4,})/)  || 
                  bLine.match(/^([A-Za-z]+(?:\s[A-Za-z]+)?)\s+(\d{4,})/);
    if (bankM) {
      bankTujuan = bankM[1].trim();
      rekTujuan  = bankM[2];
    }

    // Nama tujuan: baris sebelum bank line, skip noise & tanda baca saja
    for (let i = idxBank - 1; i >= 0; i--) {
      const l = lines[i];
      if (l.length < 2 || /^[\d\s\=\-\.]+$/.test(l) || /^(id|rp|transaksi)/i.test(l)) continue;
      namaTujuan = l;
      break;
    }
  }

  // ── NAMA PENGIRIM & REK PENGIRIM ──
  let namaPengirim = '', rekPengirim = '';
  
  // Cari baris "Jago [nomor]" — ini adalah rek pengirim
  const idxJagoRek = lines.findIndex(l => /^jago\s+\d/i.test(l));
  
  if (idxJagoRek >= 0) {
    // Extract rekening dari baris "Jago 500127..."
    const jM = lines[idxJagoRek].match(/jago\s+(\d+)/i);
    if (jM) rekPengirim = jM[1];
    
    // Cari nama pengirim: baris sebelum "Jago rek", skip labels & tanda baca
    for (let i = idxJagoRek - 1; i >= 0; i--) {
      const l = lines[i];
      // Skip labels, empty, dan lines yang pure tanda baca/nomor
      if (l.length < 2 || /^(id|jago|sumber|tanggal|waktu|rp|transaksi|mandiri|mandil)/i.test(l) || 
          /^[\d\s\=\-\.]+$/.test(l)) continue;
      namaPengirim = l;
      break;
    }
  }

  return {
    bankPengirim: 'Bank Jago Syariah',
    namaPengirim: sensorNama(namaPengirim),
    rekPengirim:  sensorRek(rekPengirim),
    bankTujuan:   bankTujuan || '-',
    namaTujuan:   sensorNama(namaTujuan),
    rekTujuan:    sensorRek(rekTujuan),
    noTransaksi:  truncTrx(noTransaksi),
    metode,
    jumlahTransfer: jumlah,
    tanggal
  };
}

/** Routing utama parsing */
function parseStruk(text) {
  const bank = detectBank(text);
  if (bank === 'aladin')   return parseAladin(text);
  if (bank === 'seabank')  return parseSeaBank(text);
  if (bank === 'jago')     return parseJago(text);
  // Fallback: coba ekstrak minimal
  return {
    bankPengirim: 'Tidak terdeteksi',
    namaPengirim: '-', rekPengirim: '-',
    bankTujuan:   '-', namaTujuan: '-', rekTujuan: '-',
    noTransaksi: '-', metode: '-',
    jumlahTransfer: extractAmount(text),
    tanggal: ''
  };
}

/* ============================================================
   OCR
   ============================================================ */
async function runOCR(file) {
  setProgress(0, 'Memuat model OCR...');
  show('ocr-progress');

  const processedFile = await preprocessImage(file);

  const { data: { text } } = await Tesseract.recognize(processedFile, 'ind+eng', {
    logger: m => {
      if (m.status === 'loading tesseract core') setProgress(10, 'Memuat Tesseract core...');
      if (m.status === 'initializing tesseract') setProgress(20, 'Inisialisasi...');
      if (m.status === 'loading language traineddata') setProgress(40, 'Mengunduh data bahasa...');
      if (m.status === 'initializing api')       setProgress(60, 'Siap membaca...');
      if (m.status === 'recognizing text') {
        const pct = Math.round(60 + m.progress * 40);
        setProgress(pct, `Membaca teks... ${pct}%`);
      }
    }
  });

  hide('ocr-progress');
  return text;
}

function preprocessImage(file) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1400;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'contrast(1.2)';
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.95);
    };
    img.src = URL.createObjectURL(file);
  });
}

function setProgress(pct, label) {
  const fill = document.getElementById('progress-fill');
  const txt  = document.getElementById('progress-text');
  if (fill) fill.style.width = pct + '%';
  if (txt)  txt.textContent  = label;
}

/* ============================================================
   BUILD NOTA DATA (dipakai untuk HTML preview dan Canvas JPG)
   ============================================================ */
function buildNotaData() {
  if (!state.extracted) return null;
  
  const ext = state.extracted;
  const fee = state.adminFee;
  const total = ext.jumlahTransfer + fee;
  
  return {
    // Header
    title: 'NOTA TRANSFER BANK',
    store: 'TOKO SAMORO',
    addr1: TOKO.alamat1,
    addr2: TOKO.alamat2,
    waktu: ext.tanggal || buildWaktu(),  // ← Pakai tanggal dari OCR, fallback ke waktu sekarang
    
    // Data rows
    rows: [
      { lbl: 'Bank Pngrm', val: ext.bankPengirim || '-' },
      { lbl: 'Nama Pngrm', val: ext.namaPengirim || '-' },
      { lbl: 'Rek. Pngrm', val: ext.rekPengirim || '-' },
      { lbl: 'Bank Tujuan', val: ext.bankTujuan || '-' },
      { lbl: 'Nama Tujuan', val: ext.namaTujuan || '-' },
      { lbl: 'Rek. Tujuan', val: ext.rekTujuan || '-' },
      { lbl: 'No. Trx', val: ext.noTransaksi || '-' },
      { lbl: 'Metode', val: ext.metode || '-' }
    ],
    
    // Summary
    jmlTransfer: fmtRp(ext.jumlahTransfer || 0),
    adminFee: fmtRp(fee),
    total: fmtRp(total),
    
    // Footer
    wa: TOKO.wa
  };
}

/* ============================================================
   RENDER PREVIEW THERMAL (HTML)
   ============================================================ */
function renderPreview() {
  if (!state.extracted) return;
  
  const nota = buildNotaData();
  const el = document.getElementById('nota-preview');

  const row = (lbl, val, bold = false) =>
    `<div class="trow${bold ? ' tb' : ''}"><span class="lbl">${lbl}</span><span class="val">${val || '-'}</span></div>`;

  el.innerHTML = `
    <div class="tc tb">${nota.title}</div>
    <div class="tc tb">${nota.store}</div>
    <div class="tc" style="font-size:8.5px">${nota.addr1}</div>
    <div class="tc" style="font-size:8.5px">${nota.addr2}</div>
    <div class="thr-s"></div>
    ${row('Waktu', nota.waktu)}
    <div class="thr"></div>
    ${nota.rows.map(r => row(r.lbl, r.val)).join('')}
    <div class="thr"></div>
    ${row('Jml Transfer', nota.jmlTransfer, true)}
    ${row('Admin Toko', nota.adminFee)}
    <div class="thr-s"></div>
    ${row('TOTAL', nota.total, true)}
    <div class="thr-s"></div>
<div class="tc" style="margin-top:4px;font-size:8px;line-height:1.3;color:#555">
  <div>Nota ini dibuat oleh toko Samoro</div>
  <div>WA: ${nota.wa}</div>
  <div>Hubungi jika ada kendala</div>
</div>
  `;
}

/* ============================================================
   CANVAS UNTUK JPG (57mm @ 203 DPI = ~455px; printable ~384px)
   ============================================================ */
function drawCanvas() {
  return new Promise((resolve, reject) => {
    const notaEl = document.getElementById('nota-preview');
    html2canvas(notaEl, {
      scale: 3,          // resolusi tinggi biar tidak blur saat print
      backgroundColor: '#ffffff',
      useCORS: true
    }).then(canvas => resolve(canvas))
      .catch(err => reject(err));
  });
}
/* ============================================================
   STORAGE (localStorage)
   ============================================================ */
function saveToHistory(item) {
  const all = getHistory();
  all.unshift(item);
  localStorage.setItem('samoro_history', JSON.stringify(all));
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem('samoro_history') || '[]'); }
  catch { return []; }
}

function deleteFromHistory(idx) {
  const all = getHistory();
  all.splice(idx, 1);
  localStorage.setItem('samoro_history', JSON.stringify(all));
}

/* ============================================================
   RENDER HISTORY
   ============================================================ */
function renderHistory() {
  const all   = getHistory();
  const list  = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  document.getElementById('history-count').textContent = all.length;

  if (!all.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = all.map((item, i) => `
    <div class="history-item">
      <div class="history-info">
        <div class="h-total">${fmtRp(item.total)}</div>
        <div class="h-banks">${item.bankPengirim || '—'} → ${item.bankTujuan || '—'}</div>
        <div class="h-meta">${item.namaPengirim || ''} · ${fmtHistDate(item.createdAt)}</div>
        <div class="h-breakdown">Transfer: ${fmtRp(item.jumlahTransfer)} + Admin: ${fmtRp(item.adminFee)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button class="btn-hapus" onclick="lihatHistory(${i})">Lihat</button>
        <button class="btn-hapus" onclick="hapusHistory(${i})">Hapus</button>
      </div>
    </div>
  `).join('');
}
/** Exposed ke inline onclick di history */
window.hapusHistory = function(idx) {
  if (!confirm('Hapus riwayat ini?')) return;
  deleteFromHistory(idx);
  renderHistory();
};
window.lihatHistory = function(idx) {
  const item = getHistory()[idx];
  if (!item) return;
  // Restore ke state lalu pindah ke tab generate untuk lihat preview
  state.extracted = {
    bankPengirim:   item.bankPengirim,
    namaPengirim:   item.namaPengirim,
    rekPengirim:    item.rekPengirim,
    bankTujuan:     item.bankTujuan,
    namaTujuan:     item.namaTujuan,
    rekTujuan:      item.rekTujuan,
    noTransaksi:    item.noTransaksi,
    metode:         item.metode,
    jumlahTransfer: item.jumlahTransfer,
    tanggal:        item.tanggal || ''
  };
  state.adminFee = item.adminFee;

  // Pindah ke tab Buat Nota
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="generate"]').classList.add('active');
  el('tab-generate').classList.add('active');

  // Update UI
  el('nominal-input').value = item.jumlahTransfer;
  el('admin-input').value   = item.adminFee;
  el('total-display').textContent = fmtRp(item.total);
  el('admin-hint').textContent = `Riwayat · nominal ${fmtRp(item.jumlahTransfer)}`;

  // Populate edit fields jika ada
  el('edit-bank-pengirim').value = item.bankPengirim || '';
  el('edit-nama-pengirim').value = item.namaPengirim || '';
  el('edit-rek-pengirim').value  = item.rekPengirim  || '';
  el('edit-bank-tujuan').value   = item.bankTujuan   || '';
  el('edit-nama-tujuan').value   = item.namaTujuan   || '';
  el('edit-rek-tujuan').value    = item.rekTujuan    || '';
  el('edit-waktu').value         = item.tanggal      || '';

  show('card-admin');
  renderPreview();
  show('card-preview');

  // Scroll ke preview
  el('card-preview').scrollIntoView({ behavior: 'smooth' });
};
/* ============================================================
   DOM HELPERS
   ============================================================ */
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function el(id)   { return document.getElementById(id); }

/* ============================================================
   EVENT LISTENERS & INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  /* ── TABS ── */
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      el('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'history') renderHistory();
    });
  });

  /* ── FILE UPLOAD ── */
  el('drop-zone').addEventListener('click', () => el('file-input').click());

  el('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    state.imageFile = file;

    // Preview
    el('preview-img').src = URL.createObjectURL(file);
    hide('drop-zone');
    show('img-preview');
    show('btn-extract');
    hide('card-admin');
    hide('card-preview');
    hide('card-debug');
    state.extracted = null;
  });

  el('btn-change').addEventListener('click', () => {
    el('file-input').value = '';
    state.imageFile = null;
    state.extracted = null;
    hide('img-preview');
    hide('btn-extract');
    hide('card-admin');
    hide('card-preview');
    hide('card-debug');
    show('drop-zone');
  });

  /* ── EKSTRAK (OCR + PARSE) ── */
  el('btn-extract').addEventListener('click', async () => {
    if (!state.imageFile) return;

    el('btn-extract').disabled = true;
    el('btn-extract').textContent = 'Sedang membaca...';

    try {
      const text = await runOCR(state.imageFile);
      state.ocrText = text;

      // Tampilkan debug
      el('ocr-raw').textContent = text;
      show('card-debug');

      // Parse
      state.extracted = parseStruk(text);
      state.adminFee  = calcAdmin(state.extracted.jumlahTransfer);

      // ⚠️ Jika nominal gagal terbaca (0), minta user input manual
      if (state.extracted.jumlahTransfer === 0) {
        const manualInput = prompt('⚠️ Sistem tidak bisa membaca nominal transfer dari foto.\n\nSilakan input nominal transfer secara manual (contoh: 142000):');
        if (manualInput) {
          const parsed = parseRp(manualInput);
          if (parsed > 0) {
            state.extracted.jumlahTransfer = parsed;
            state.adminFee = calcAdmin(parsed);
          }
        }
      }

      // Set nominal input field dengan hasil OCR / manual input
      el('nominal-input').value = state.extracted.jumlahTransfer;

      // Update UI admin
      const auto = calcAdmin(state.extracted.jumlahTransfer);
      el('admin-hint').textContent =
        `Kalkulasi otomatis: ${fmtRp(auto)} untuk nominal ${fmtRp(state.extracted.jumlahTransfer)}`;
      el('admin-input').value = state.adminFee;
      updateTotal();

      // ── POPULATE EDIT FORM dengan data OCR ──
      el('edit-bank-pengirim').value = state.extracted.bankPengirim || '';
      el('edit-nama-pengirim').value = state.extracted.namaPengirim || '';
      el('edit-rek-pengirim').value = state.extracted.rekPengirim || '';
      el('edit-bank-tujuan').value = state.extracted.bankTujuan || '';
      el('edit-nama-tujuan').value = state.extracted.namaTujuan || '';
      el('edit-rek-tujuan').value = state.extracted.rekTujuan || '';
      el('edit-waktu').value = state.extracted.tanggal || '';

      show('card-admin');
      renderPreview();
      show('card-preview');

    } catch (err) {
      alert('Gagal membaca struk. Pastikan foto jelas dan koneksi internet tersedia untuk unduh model OCR.\n\n' + err.message);
      console.error(err);
    }

    el('btn-extract').disabled = false;
    el('btn-extract').textContent = 'Baca Struk Otomatis';
  });

  /* ── TOGGLE DEBUG ── */
  el('toggle-debug').addEventListener('click', () => {
    const raw = el('ocr-raw');
    const isHidden = raw.classList.contains('hidden');
    raw.classList.toggle('hidden', !isHidden);
    el('toggle-debug').textContent = (isHidden ? '▼' : '▶') + ' Teks OCR mentah (klik untuk lihat/sembunyikan)';
  });

  /* ── ADMIN FEE & NOMINAL ── */
  el('nominal-input').addEventListener('input', e => {
    if (!state.extracted) return;
    const nominal = Number(e.target.value) || 0;
    state.extracted.jumlahTransfer = nominal;
    state.adminFee = calcAdmin(nominal);
    el('admin-input').value = state.adminFee;
    updateTotal();
    renderPreview();
  });

  el('admin-input').addEventListener('input', e => {
    state.adminFee = Number(e.target.value) || 0;
    updateTotal();
    if (state.extracted) renderPreview();
  });

  el('btn-reset-admin').addEventListener('click', () => {
    if (!state.extracted) return;
    state.adminFee = calcAdmin(state.extracted.jumlahTransfer);
    el('admin-input').value = state.adminFee;
    updateTotal();
    renderPreview();
  });

  function updateTotal() {
    const total = state.extracted
      ? (state.extracted.jumlahTransfer || 0) + state.adminFee
      : 0;
    el('total-display').textContent = fmtRp(total);
  }

  /* ── TOGGLE EDIT DATA ── */
  el('btn-toggle-edit').addEventListener('click', () => {
    const content = el('edit-content');
    const btn = el('btn-toggle-edit');
    const isHidden = content.classList.contains('hidden');
    content.classList.toggle('hidden', !isHidden);
    btn.textContent = (isHidden ? '▼' : '▶') + ' Koreksi Data Bank (jika OCR salah)';
  });

  /* ── EDIT FORM LISTENERS ── */
  const editFields = [
    'edit-bank-pengirim',
    'edit-nama-pengirim', 
    'edit-rek-pengirim',
    'edit-bank-tujuan',
    'edit-nama-tujuan',
    'edit-rek-tujuan',
    'edit-waktu'
  ];

  editFields.forEach(fieldId => {
    el(fieldId).addEventListener('input', e => {
      if (!state.extracted) return;
      
      // Map field ID ke property di state.extracted
      const fieldMap = {
        'edit-bank-pengirim':  'bankPengirim',
        'edit-nama-pengirim':  'namaPengirim',
        'edit-rek-pengirim':   'rekPengirim',
        'edit-bank-tujuan':    'bankTujuan',
        'edit-nama-tujuan':    'namaTujuan',
        'edit-rek-tujuan':     'rekTujuan',
        'edit-waktu':          'tanggal'
      };
      
      const propName = fieldMap[fieldId];
      state.extracted[propName] = e.target.value || '';
      renderPreview();
    });
  });

  /* ── DOWNLOAD ── */
  el('btn-download').addEventListener('click', async () => {
    if (!state.extracted) {
      alert('Tidak ada data untuk diunduh. Baca struk terlebih dahulu.');
      return;
    }

    const btn = el('btn-download');
    btn.disabled = true;
    btn.textContent = 'Menyiapkan...';

    try {
      const canvas = await drawCanvas();
      if (!canvas) {
        alert('Gagal membuat canvas nota');
        btn.disabled = false;
        btn.textContent = 'Download Nota (JPG) & Simpan Riwayat';
        return;
      }

      const url    = canvas.toDataURL('image/jpeg', 0.95);
      const a      = document.createElement('a');
      a.href        = url;
      a.download    = 'nota_samoro_' + Date.now() + '.jpg';
      a.click();

      // Simpan riwayat
      saveToHistory({
        ...state.extracted,
        adminFee:  state.adminFee,
        total:     (state.extracted.jumlahTransfer || 0) + state.adminFee,
        createdAt: Date.now()
      });
      document.getElementById('history-count').textContent = getHistory().length;

    } catch (err) {
      alert('Gagal membuat gambar nota.\n' + err.message);
      console.error(err);
    }

    btn.disabled = false;
    btn.textContent = 'Download Nota (JPG) & Simpan Riwayat';
  });

  /* ── INIT HISTORY COUNT ── */
  document.getElementById('history-count').textContent = getHistory().length;
});
