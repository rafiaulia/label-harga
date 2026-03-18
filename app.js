/* =============================================
   SAMORO LABEL GENERATOR — app.js
============================================= */

const STORAGE_KEY  = 'samoro_products';
const MAX_PRODUCTS = 5;
const LOGO_IMG_SRC = 'logo.png';

/* ---- Logo SVG inline (fallback jika logo.png tidak ditemukan) ---- */
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
  return 'RP ' + Number(num).toLocaleString('id-ID');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function priceClass(formatted) {
  if (formatted.length > 14) return 'small';
  if (formatted.length > 11) return 'medium';
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

/* Logo untuk label (90x90) */
function buildLogoImg(cls) {
  const img = document.createElement('img');
  img.src       = LOGO_IMG_SRC;
  img.className = cls;
  img.alt       = 'Samoro';
  img.onerror   = function () {
    const div = document.createElement('div');
    div.innerHTML = LOGO_SVG;
    this.replaceWith(div.firstChild);
  };
  return img;
}

/* Logo untuk header (28x28, inverted) */
function renderHeaderLogo() {
  const wrap = document.getElementById('headerLogoWrap');
  wrap.innerHTML = '';

  const img = document.createElement('img');
  img.src   = LOGO_IMG_SRC;
  img.style.cssText = 'width:28px;height:28px;object-fit:contain;filter:invert(1)';
  img.alt   = 'Samoro';
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

  badge.textContent      = products.length;
  btnAdd.disabled        = products.length >= MAX_PRODUCTS;
  btnProses.disabled     = products.length === 0;

  // Hapus item lama, pertahankan empty-state
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
        <div class="product-item-sub">${escHtml(p.h2)}</div>
      </div>
      <div class="product-item-price">${formatHarga(p.harga)}</div>
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
  const h2    = document.getElementById('inp-headline2').value.trim();
  const harga = document.getElementById('inp-harga').value.trim();

  if (!h1)
    return alert('Headline 1 (Nama Produk) wajib diisi!');
  if (!h2)
    return alert('Headline 2 (Merk & Spesifikasi) wajib diisi!');
  if (!harga || isNaN(harga) || Number(harga) < 0)
    return alert('Harga harus diisi dengan angka valid!');

  const products = getProducts();
  if (products.length >= MAX_PRODUCTS) return;

  products.push({ h1, h2, harga: Number(harga) });
  saveProducts(products);
  renderList();

  // Kosongkan form
  document.getElementById('inp-headline1').value = '';
  document.getElementById('inp-headline2').value = '';
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
============================================= */

function buildLabel(p) {
  const hargaFmt = formatHarga(p.harga);
  const pc       = priceClass(hargaFmt);

  // Wrapper utama
  const tag = document.createElement('div');
  tag.className = 'label-tag';

  /* --- KIRI: kolom logo --- */
  const left = document.createElement('div');
  left.className = 'label-left';
  left.appendChild(buildLogoImg('label-logo'));

  const storeName = document.createElement('div');
  storeName.className   = 'label-store-name';
  storeName.textContent = 'samoro';
  left.appendChild(storeName);

  /* --- KANAN: kolom info --- */
  const right = document.createElement('div');
  right.className = 'label-right';

  // Atas: nama produk
  const top = document.createElement('div');
  top.className = 'label-top';

  const h1el = document.createElement('div');
  h1el.className   = 'label-headline1';
  h1el.textContent = p.h1.toUpperCase();

  const h2el = document.createElement('div');
  h2el.className   = 'label-headline2';
  h2el.textContent = p.h2.toUpperCase();

  top.appendChild(h1el);
  top.appendChild(h2el);

  // Bawah: harga
  const bot = document.createElement('div');
  bot.className = 'label-bottom';

  const priceEl = document.createElement('div');
  priceEl.className   = 'label-price' + (pc ? ' ' + pc : '');
  priceEl.textContent = hargaFmt;

  bot.appendChild(priceEl);

  right.appendChild(top);
  right.appendChild(bot);

  tag.appendChild(left);
  tag.appendChild(right);

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
  document.getElementById('btn-reset-nota').style.display = 'inline-flex';

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* =============================================
   SEMBUNYIKAN / RESET NOTA
============================================= */

function hideNota() {
  document.getElementById('nota-section').classList.remove('visible');
  document.getElementById('btn-cetak').style.display      = 'none';
  document.getElementById('btn-reset-nota').style.display = 'none';
  document.getElementById('nota-wrap').innerHTML = '';
}

function resetNota() { hideNota(); }

/* =============================================
   EVENT LISTENERS & INIT
============================================= */

// Enter di field harga langsung tambah produk
document.getElementById('inp-harga').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') tambahProduk();
});

// Inisialisasi saat halaman dimuat
renderHeaderLogo();
renderList();
