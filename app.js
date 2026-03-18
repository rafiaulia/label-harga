/* =============================================
   SAMORO LABEL GENERATOR — app.js
============================================= */

const STORAGE_KEY  = 'samoro_products';
const MAX_PRODUCTS = 10;
const LOGO_IMG_SRC = 'logo.png';

/* ---- Logo SVG fallback ---- */
const LOGO_SVG = `<svg class="label-logo-fallback" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="48" fill="#0a0a0a"/>
  <path d="M50 18 C32 18 18 32 18 50 C18 62 25 72 36 77
           C30 70 28 60 34 53 C38 48 44 46 50 47
           C56 48 62 52 64 58 C67 65 63 73 56 77
           C67 72 74 62 74 50 C74 32 68 18 50 18 Z" fill="white"/>
  <path d="M50 82 C58 82 65 78 69 72 C63 76 55 75 50 70
           C45 75 37 76 31 72 C35 78 42 82 50 82 Z" fill="white"/>
</svg>`;

/* =============================================
   UTILITIES
============================================= */

function formatHarga(num) {
  return Number(num).toLocaleString('id-ID');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Kelas ukuran font harga berdasarkan panjang angka */
function priceNumClass(numStr) {
  if (numStr.length > 9) return 'small';
  if (numStr.length > 6) return 'medium';
  return '';
}

/* =============================================
   LOCAL STORAGE
============================================= */

function getProducts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveProducts(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

/* =============================================
   LOGO BUILDERS
============================================= */

function buildLogoImg(cls) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:400px;height:100px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;';

  const img     = document.createElement('img');
  img.src       = LOGO_IMG_SRC;
  img.className = cls;
  img.alt       = 'Samoro';
  img.style.cssText = 'width:240px;height:60px;object-fit:contain;';
  img.width     = 240;
  img.height    = 60;
  img.onerror   = function () {
    const div = document.createElement('div');
    div.innerHTML = LOGO_SVG;
    this.replaceWith(div.firstChild);
  };

  wrapper.appendChild(img);
  return wrapper;
}
function renderHeaderLogo() {
  const wrap    = document.getElementById('headerLogoWrap');
  wrap.innerHTML = '';

  const img   = document.createElement('img');
  img.src     = LOGO_IMG_SRC;
  img.style.cssText = 'width:28px;height:28px;object-fit:contain;filter:invert(1)';
  img.alt     = 'Samoro';
  img.onerror = function () {
    this.replaceWith((() => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 100 100');
      s.setAttribute('width',   '28');
      s.setAttribute('height',  '28');
      s.innerHTML =
        '<circle cx="50" cy="50" r="48" fill="white"/>' +
        '<path d="M50 18 C32 18 18 32 18 50 C18 62 25 72 36 77 ' +
              'C30 70 28 60 34 53 C38 48 44 46 50 47 ' +
              'C56 48 62 52 64 58 C67 65 63 73 56 77 ' +
              'C67 72 74 62 74 50 C74 32 68 18 50 18 Z" fill="#0a0a0a"/>' +
        '<path d="M50 82 C58 82 65 78 69 72 C63 76 55 75 50 70 ' +
              'C45 75 37 76 31 72 C35 78 42 82 50 82 Z" fill="#0a0a0a"/>';
      return s;
    })());
  };
  wrap.appendChild(img);
}

/* =============================================
   RENDER PRODUCT LIST (UI)
============================================= */

function renderList() {
  const products  = getProducts();
  const list      = document.getElementById('product-list');
  const empty     = document.getElementById('empty-state');
  const btnAdd    = document.getElementById('btn-tambah');
  const badge     = document.getElementById('counter-badge');
  const btnProses = document.getElementById('btn-proses');

  badge.textContent  = products.length;
  btnAdd.disabled    = products.length >= MAX_PRODUCTS;
  btnProses.disabled = products.length === 0;

  list.querySelectorAll('.product-item').forEach(el => el.remove());

  if (products.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  products.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'product-item';
    item.innerHTML = `
      <div class="product-item-info">
        <div class="product-item-name">${escHtml(p.h1)}</div>
     
      </div>
      <div class="product-item-price">Rp ${formatHarga(p.harga)}</div>
      <button class="btn btn-danger" onclick="hapusProduk(${i})">Hapus</button>
    `;
    list.appendChild(item);
  });
}

/* =============================================
   TAMBAH PRODUK
============================================= */

function tambahProduk() {
  const h1    = document.getElementById('inp-headline1').value.trim();
 
  const harga = document.getElementById('inp-harga').value.trim();

  if (!h1)
    return alert('Nama Produk wajib diisi!');
 
  if (!harga || isNaN(harga) || Number(harga) < 0)
    return alert('Harga harus diisi dengan angka valid!');

  const products = getProducts();
  if (products.length >= MAX_PRODUCTS) return;

  products.push({ h1, harga: Number(harga) });
  saveProducts(products);
  renderList();

  document.getElementById('inp-headline1').value = '';
 
  document.getElementById('inp-harga').value     = '';
  document.getElementById('inp-headline1').focus();
}

/* =============================================
   HAPUS PRODUK
============================================= */

function hapusProduk(index) {
  const products = getProducts();
  products.splice(index, 1);
  saveProducts(products);
  renderList();
  hideNota();
}

/* =============================================
   BUILD SATU LABEL (DOM)
   Layout baru: ATAS (nama) / TENGAH (harga) / BAWAH (brand)
   ┌──────────────────────────────┐
   │  NAMA PRODUK  SPESIFIKASI   │ 90px
   ├──────────────────────────────┤
   │   Rp    38.000              │ flex:1
   ├──────────────────────────────┤
   │      🅢  samoro             │ 70px
   └──────────────────────────────┘
============================================= */

function buildLabel(p) {
  const numStr = formatHarga(p.harga);  /* "38.000" */
  const pc     = priceNumClass(numStr);

  const tag = document.createElement('div');
  tag.className = 'label-tag';

  /* ── ATAS: nama produk ── */
  const nameArea = document.createElement('div');
  nameArea.className = 'label-name-area';

  const h1el = document.createElement('div');
  h1el.className   = 'label-headline1';
  h1el.textContent = p.h1.toUpperCase();


  
  nameArea.appendChild(h1el);

  

  /* ── TENGAH: harga ── */
  const priceArea = document.createElement('div');
  priceArea.className = 'label-price-area';

  const rpEl = document.createElement('div');
  rpEl.className   = 'label-price-rp';
  rpEl.textContent = 'Rp';

  const numEl = document.createElement('div');
  numEl.className   = 'label-price-num' + (pc ? ' ' + pc : '');
  numEl.textContent = numStr;

  priceArea.appendChild(rpEl);
  priceArea.appendChild(numEl);

  /* ── BAWAH: logo + nama toko ── */
  const brandArea = document.createElement('div');
  brandArea.className = 'label-brand-area';

  brandArea.appendChild(buildLogoImg('label-logo'));

  const storeName = document.createElement('div');
  storeName.className   = 'label-store-name';
  storeName.textContent = '';
  brandArea.appendChild(storeName);

  /* ── Susun ── */
  tag.appendChild(nameArea);
  tag.appendChild(priceArea);
  tag.appendChild(brandArea);

  return tag;
}

/* =============================================
   GENERATE NOTA
============================================= */

function prosesCetak() {
  const products = getProducts();
  if (products.length === 0) return;

  const wrap = document.getElementById('nota-wrap');
  wrap.innerHTML = '';

  products.forEach(p => wrap.appendChild(buildLabel(p)));

  const section = document.getElementById('nota-section');
  section.classList.add('visible');

  document.getElementById('btn-cetak').style.display      = 'inline-flex';
  document.getElementById('btn-export').style.display     = 'inline-flex';
  document.getElementById('btn-reset-nota').style.display = 'inline-flex';

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* Scale preview di HP agar muat lebar layar */
  scaleNotaWrap();
}

/* =============================================
   SCALE PREVIEW (MOBILE)
============================================= */

function scaleNotaWrap() {
  const wrap      = document.getElementById('nota-wrap');
  const container = wrap.parentElement;
  const available = container.offsetWidth;
  const scale     = Math.min(1, available / 580);

  wrap.style.transform      = `scale(${scale})`;
  wrap.style.transformOrigin = 'top left';

  /* Kompensasi tinggi yang "hilang" akibat scale */
  const labelCount  = getProducts().length;
  const totalH      = 350 * labelCount;
  const scaledH     = totalH * scale;
  container.style.height = scaledH + 4 + 'px'; /* +4 border */
}

/* =============================================
   SEMBUNYIKAN / RESET NOTA
============================================= */

function hideNota() {
  document.getElementById('nota-section').classList.remove('visible');
  document.getElementById('btn-cetak').style.display      = 'none';
  document.getElementById('btn-export').style.display     = 'none';
  document.getElementById('btn-reset-nota').style.display = 'none';
  document.getElementById('nota-wrap').innerHTML          = '';

  const container = document.querySelector('.nota-scroll-wrap');
  if (container) container.style.height = '';
}

function resetNota() { hideNota(); }

/* =============================================
   EXPORT PNG (html2canvas — 1:1 dengan preview)
============================================= */

function exportAsPNG() {
  const products = getProducts();
  if (products.length === 0) return alert('Belum ada produk!');

  prosesCetak();

  setTimeout(() => {
    const notaWrap = document.getElementById('nota-wrap');

    /* Reset scale sementara agar html2canvas ambil ukuran asli */
    const prevTransform = notaWrap.style.transform;
    notaWrap.style.transform = 'scale(1)';

    html2canvas(notaWrap, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    }).then(function (canvas) {
      /* Kembalikan scale preview */
      notaWrap.style.transform = prevTransform;

      const link      = document.createElement('a');
      link.download   = 'samoro-label.png';
      link.href       = canvas.toDataURL('image/png');
      link.click();
    });
  }, 400);
}

/* =============================================
   EVENT LISTENERS & INIT
============================================= */

document.getElementById('inp-harga').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') tambahProduk();
});

window.addEventListener('resize', function () {
  if (document.getElementById('nota-section').classList.contains('visible')) {
    scaleNotaWrap();
  }
});

renderHeaderLogo();
renderList();
