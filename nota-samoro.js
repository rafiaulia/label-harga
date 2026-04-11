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
  s = s.replace(/[Rr][Pp]/g, '').trim();
  s = s.replace(/,\d{1,2}$/, '');   // hapus desimal koma
  s = s.replace(/\./g, '');          // hapus titik ribuan
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
  const digits = String(rek).replace(/\D/g, '');
  if (!digits) return '--------';
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
  // Prioritas: cari label "Jumlah Transfer"
  const jumlahMatch = text.match(/jumlah\s*transfer[^\d]*([\d.,\s]{3,})/i);
  if (jumlahMatch) {
    const val = parseRp(jumlahMatch[1]);
    if (val > 0) return val;
  }
  // Fallback: ambil semua Rp lalu pilih yang terbesar
  const rpMatches = [...text.matchAll(/[Rr][Pp][\s]*([\d.,]{3,})/g)];
  if (rpMatches.length) {
    const vals = rpMatches.map(m => parseRp(m[1])).filter(v => v > 0);
    return vals.length ? Math.max(...vals) : 0;
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

  // Tanggal
  const dateM = text.match(/tanggal[:\s]+([^\n\r]+)/i);
  const tanggal = dateM ? dateM[1].trim() : '';

  // Nomor referensi/transaksi
  const refM = text.match(/ref[:\s]+([A-Z0-9]+)/i);
  const noTransaksi = refM ? refM[1] : '';

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
  Struktur struk SeaBank:
    SeaBank
    Bukti Transaksi
    Rp 500.000
    Dari  [NAMA]  SeaBank: ********6497
    Ke    [NAMA]  BANK JAGO SYARIAH: ********7067
    Jumlah Transfer       Rp 500.000
    No. Transaksi         20260409435052161...
    Metode Transaksi      BI-FAST
    Waktu Transaksi       09 Apr 2026, 12:24
*/
function parseSeaBank(text) {
  const jumlah = extractAmount(text);

  // Waktu transaksi
  const wktM = text.match(/waktu\s*transaksi[:\s]+([^\n\r]+)/i);
  const tanggal = wktM ? wktM[1].trim() : '';

  // No. transaksi
  const noM = text.match(/no\.?\s*transaksi[:\s]+([A-Z0-9]+)/i);
  const noTransaksi = noM ? noM[1] : '';

  const metode = /bi[-\s]?fast/i.test(text) ? 'BI FAST' : '';

  // ── Pengirim (Dari) ──
  // Pola di baris: "[NAMA]  SeaBank: ********6497"
  let namaPengirim = '', rekPengirim = '';

  // Coba satu baris dengan nama + SeaBank + rek
  const dariLineM = text.match(/dari\s+(.+?)\s+SeaBank[:\s]+([\*\d]+)/i);
  if (dariLineM) {
    namaPengirim = dariLineM[1].trim();
    rekPengirim  = dariLineM[2];
  } else {
    // Fallback: cari rek SeaBank saja
    const sbRekM = text.match(/SeaBank[:\s]+([\*\d]{8,})/i);
    if (sbRekM) rekPengirim = sbRekM[1];
    // Nama: baris setelah "Dari"
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const idxD  = lines.findIndex(l => /^dari$/i.test(l));
    if (idxD >= 0) namaPengirim = lines[idxD + 1] || '';
  }

  // ── Tujuan (Ke) ──
  // Pola: "Ke [NAMA] BANK JAGO SYARIAH: ********7067"
  let namaTujuan = '', bankTujuan = '', rekTujuan = '';

  const keLineM = text.match(/ke\s+(.+?)\s+((?:BANK\s+)?[A-Z][A-Z\s]+(?:SYARIAH|BANK)?)[:\s]+([\*\d]+)/i);
  if (keLineM) {
    namaTujuan = keLineM[1].trim();
    bankTujuan = keLineM[2].trim();
    rekTujuan  = keLineM[3];
  } else {
    // Fallback per baris
    const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);
    const idxKe  = lines.findIndex(l => /^ke$/i.test(l));
    if (idxKe >= 0) {
      const keLine = lines[idxKe + 1] || '';
      // "Ra Arr Fah   BANK JAGO SYARIAH: ****7067"
      const m2 = keLine.match(/^(.+?)\s+((?:BANK\s+)?[A-Z][A-Z\s]+)[:\s]+([\*\d]+)$/i);
      if (m2) {
        namaTujuan = m2[1].trim();
        bankTujuan = m2[2].trim();
        rekTujuan  = m2[3];
      } else {
        namaTujuan = keLine;
      }
    }
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
    [NAMA TUJUAN]           ← baris awal (penerima)
    Mandiri • 9000029...    ← bank tujuan + partial rek
    Rp142.000               ← nominal
    ID Transaksi
    260301SYATIDJ100...
    Sumber akun
    [NAMA PENGIRIM]
    Jago 5001270...
    Tanggal & waktu transaksi
    01 Mar 2026, 21:16 WIB
*/
function parseJago(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const jumlah = extractAmount(text);

  // Tanggal — baris setelah label "Tanggal & waktu transaksi"
  const idxTgl = lines.findIndex(l => /tanggal\s*&?\s*waktu/i.test(l));
  const tanggal = idxTgl >= 0 ? (lines[idxTgl + 1] || '') : '';

  // ID Transaksi — baris setelah label "ID Transaksi"
  const idxId = lines.findIndex(l => /id\s*transaksi/i.test(l));
  const noTransaksi = idxId >= 0 ? (lines[idxId + 1] || '') : '';

  const metode = 'BI FAST';

  // ── Tujuan: nama tujuan & bank tujuan ──
  // Bank tujuan biasanya ada pola "NamaBank • XXXXXXXXX"
  let namaTujuan = '', bankTujuan = '', rekTujuan = '';
  const idxBankDot = lines.findIndex(l => /[•·]/.test(l) || /mandiri|bca|bri|bni|bsi|danamon|permata|cimb/i.test(l));
  if (idxBankDot > 0) {
    namaTujuan = lines[idxBankDot - 1];
    const bLine = lines[idxBankDot];
    // "Mandiri • 9000029xxx"
    const bM = bLine.match(/^(.+?)\s*[•·]\s*([\d*]+)/);
    if (bM) {
      bankTujuan = bM[1].trim();
      rekTujuan  = bM[2];
    } else {
      bankTujuan = bLine;
    }
  }

  // ── Pengirim: dari "Sumber akun" ──
  let namaPengirim = '', rekPengirim = '';
  const idxSumber = lines.findIndex(l => /sumber\s*akun/i.test(l));
  if (idxSumber >= 0) {
    namaPengirim = lines[idxSumber + 1] || '';
    const jagoLine = lines[idxSumber + 2] || '';
    // "Jago 5001270..." — ambil angka setelahnya
    const jM = jagoLine.match(/jago\s+([\d*]+)/i);
    if (jM) rekPengirim = jM[1];
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
  setProgress(0, 'Memuat model OCR (butuh internet pertama kali)...');
  show('ocr-progress');

  const { data: { text } } = await Tesseract.recognize(file, 'ind+eng', {
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

function setProgress(pct, label) {
  const fill = document.getElementById('progress-fill');
  const txt  = document.getElementById('progress-text');
  if (fill) fill.style.width = pct + '%';
  if (txt)  txt.textContent  = label;
}

/* ============================================================
   RENDER PREVIEW THERMAL (HTML)
   ============================================================ */
function renderPreview() {
  const ext   = state.extracted;
  const fee   = state.adminFee;
  const total = ext.jumlahTransfer + fee;
  const el    = document.getElementById('nota-preview');

  const row = (lbl, val) =>
    `<div class="trow"><span class="lbl">${lbl}</span><span class="val">${val || '-'}</span></div>`;

  el.innerHTML = `
    <div class="tc tb">NOTA TRANSFER BANK</div>
    <div class="tc tb">TOKO SAMORO</div>
    <div class="tc" style="font-size:8.5px">${TOKO.alamat1}</div>
    <div class="tc" style="font-size:8.5px">${TOKO.alamat2}</div>
    <div class="thr-s"></div>
    ${row('Waktu', buildWaktu())}
    <div class="thr"></div>
    ${row('Bank Pngrm', ext.bankPengirim)}
    ${row('Nama Pngrm', ext.namaPengirim)}
    ${row('Rek. Pngrm', ext.rekPengirim)}
    ${row('Bank Tujuan', ext.bankTujuan)}
    ${row('Nama Tujuan', ext.namaTujuan)}
    ${row('Rek. Tujuan', ext.rekTujuan)}
    ${row('No. Trx', ext.noTransaksi)}
    ${row('Metode', ext.metode)}
    <div class="thr"></div>
    <div class="trow tb">${row('Jml Transfer', fmtRp(ext.jumlahTransfer))}</div>
    ${row('Admin Toko', fmtRp(fee))}
    <div class="thr-s"></div>
    <div class="trow tb"><span class="lbl">TOTAL</span><span class="val">${fmtRp(total)}</span></div>
    <div class="thr-s"></div>
    <div class="tc" style="margin-top:4px;font-size:8px;line-height:1.7;color:#555">
      Nota oleh Toko Samoro<br>
      WA: ${TOKO.wa}<br>
      Hubungi jika ada kendala
    </div>
  `;
}

/* ============================================================
   CANVAS UNTUK JPG (57mm @ 203 DPI = ~455px; printable ~384px)
   ============================================================ */
function drawCanvas() {
  return new Promise(resolve => {
    const CW  = 400;   // canvas width (px) — mewakili lebar kertas 57mm
    const PAD = 16;    // padding kiri-kanan
    const FS  = 21;    // font size px
    const LH  = 30;    // line height px
    const FONT = `'Courier New', Courier, monospace`;

    const canvas = document.createElement('canvas');
    canvas.width  = CW;
    canvas.height = 1600; // akan di-crop
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, CW, 1600);

    let y = PAD + 6;

    /* ── helpers ── */
    const setFont = (bold = false, size = FS) => {
      ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT;
      ctx.fillStyle = '#000';
    };

    const center = (text, bold = false, size = FS) => {
      setFont(bold, size);
      ctx.textAlign = 'center';
      ctx.fillText(text, CW / 2, y);
      y += LH;
    };

    const hr = (dashed = false, gap = 6) => {
      ctx.beginPath();
      ctx.strokeStyle = '#000';
      ctx.lineWidth   = 1;
      ctx.setLineDash(dashed ? [4, 4] : []);
      ctx.moveTo(PAD, y);
      ctx.lineTo(CW - PAD, y);
      ctx.stroke();
      ctx.setLineDash([]);
      y += gap;
    };

    /* Baris dua kolom: label kiri, nilai kanan (wrap nilai jika panjang) */
    const row = (lbl, val, bold = false) => {
      setFont(false, FS);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#555';
      ctx.fillText(lbl, PAD, y);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'right';

      // Hitung max chars per baris untuk nilai
      const valStr = String(val || '-');
      const maxW   = CW - PAD * 2 - ctx.measureText(lbl).width - 8;
      // Jika muat satu baris
      setFont(bold, FS);
      if (ctx.measureText(valStr).width <= maxW) {
        ctx.fillText(valStr, CW - PAD, y);
        y += LH;
      } else {
        // Wrap setiap ~16 karakter
        const chunks = valStr.match(/.{1,16}/g) || [valStr];
        chunks.forEach((chunk, i) => {
          if (i === 0) {
            ctx.fillText(chunk, CW - PAD, y);
          } else {
            ctx.textAlign = 'right';
            ctx.fillText(chunk, CW - PAD, y);
          }
          y += LH;
        });
      }
    };

    /* ── Konten nota ── */
    const ext   = state.extracted;
    const fee   = state.adminFee;
    const total = ext.jumlahTransfer + fee;

    center('NOTA TRANSFER BANK', true);
    center('TOKO SAMORO', true);
    center(TOKO.alamat1, false, FS - 2);
    center(TOKO.alamat2, false, FS - 2);
    y += 4; hr(false);

    row('Waktu', buildWaktu());
    hr(true);

    row('Bank Pngrm', ext.bankPengirim);
    row('Nama Pngrm', ext.namaPengirim);
    row('Rek. Pngrm', ext.rekPengirim);
    row('Bank Tujuan', ext.bankTujuan);
    row('Nama Tujuan', ext.namaTujuan);
    row('Rek. Tujuan', ext.rekTujuan);
    row('No. Trx', ext.noTransaksi);
    row('Metode', ext.metode);
    hr(true);

    row('Jml Transfer', fmtRp(ext.jumlahTransfer), true);
    row('Admin Toko',   fmtRp(fee));
    y += 4; hr(false);

    row('TOTAL TAGIHAN', fmtRp(total), true);
    y += 4; hr(false);

    // Footer
    const footLines = [
      'Nota oleh Toko Samoro,',
      'Hubungi WA: ' + TOKO.wa,
      'jika ada kendala transaksi.'
    ];
    setFont(false, FS - 3);
    ctx.fillStyle  = '#666';
    ctx.textAlign  = 'center';
    footLines.forEach(f => { ctx.fillText(f, CW / 2, y); y += LH - 4; });
    y += PAD;

    // Crop ke tinggi aktual
    const out = document.createElement('canvas');
    out.width  = CW;
    out.height = y;
    const octx = out.getContext('2d');
    octx.fillStyle = '#fff';
    octx.fillRect(0, 0, CW, y);
    octx.drawImage(canvas, 0, 0);
    resolve(out);
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
  const all    = getHistory();
  const list   = document.getElementById('history-list');
  const empty  = document.getElementById('history-empty');
  document.getElementById('history-count').textContent = all.length;

  if (!all.length) {
    list.innerHTML = '';
    show('history-empty');
    return;
  }
  hide('history-empty');

  list.innerHTML = all.map((item, i) => `
    <div class="history-item">
      <div class="history-info">
        <div class="h-total">${fmtRp(item.total)}</div>
        <div class="h-banks">${item.bankPengirim || '—'} → ${item.bankTujuan || '—'}</div>
        <div class="h-meta">${item.namaPengirim || ''} · ${fmtHistDate(item.createdAt)}</div>
        <div class="h-breakdown">Transfer: ${fmtRp(item.jumlahTransfer)} + Admin: ${fmtRp(item.adminFee)}</div>
      </div>
      <button class="btn-hapus" onclick="hapusHistory(${i})">Hapus</button>
    </div>
  `).join('');
}

/** Exposed ke inline onclick di history */
window.hapusHistory = function(idx) {
  if (!confirm('Hapus riwayat ini?')) return;
  deleteFromHistory(idx);
  renderHistory();
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

      // Update UI admin
      const auto = calcAdmin(state.extracted.jumlahTransfer);
      el('admin-hint').textContent =
        `Kalkulasi otomatis: ${fmtRp(auto)} untuk nominal ${fmtRp(state.extracted.jumlahTransfer)}`;
      el('admin-input').value = state.adminFee;
      updateTotal();

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

  /* ── ADMIN FEE ── */
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
      ? state.extracted.jumlahTransfer + state.adminFee
      : 0;
    el('total-display').textContent = fmtRp(total);
  }

  /* ── DOWNLOAD ── */
  el('btn-download').addEventListener('click', async () => {
    if (!state.extracted) return;

    const btn = el('btn-download');
    btn.disabled = true;
    btn.textContent = 'Menyiapkan...';

    try {
      const canvas = await drawCanvas();
      const url    = canvas.toDataURL('image/jpeg', 0.95);
      const a      = document.createElement('a');
      a.href        = url;
      a.download    = 'nota_samoro_' + Date.now() + '.jpg';
      a.click();

      // Simpan riwayat
      saveToHistory({
        ...state.extracted,
        adminFee:  state.adminFee,
        total:     state.extracted.jumlahTransfer + state.adminFee,
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
