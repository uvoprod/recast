/* Recast conversion engine: format table, readers, writers. Everything runs in the browser. */
/* ------------------------------------------------------------------ formats */
const CATS = ['Images', 'Documents', 'Spreadsheets', 'Ebooks'];
const F = {
  png:  {l:'PNG', c:'Images', kw:'lossless transparent screenshot', k:'image'},
  jpg:  {l:'JPEG', c:'Images', x:'jpeg jfif jpe', kw:'photo picture', k:'image'},
  webp: {l:'WebP', c:'Images', kw:'web google', k:'image'},
  gif:  {l:'GIF', c:'Images', kw:'animation', k:'image'},
  bmp:  {l:'Bitmap', c:'Images', x:'dib', kw:'windows', k:'image'},
  tiff: {l:'TIFF', c:'Images', x:'tif', kw:'scan print fax', k:'tiff'},
  ico:  {l:'Icon', c:'Images', kw:'favicon', k:'image'},
  heic: {l:'HEIC', c:'Images', x:'heif', kw:'iphone apple ios photo', k:'heic'},
  avif: {l:'AVIF', c:'Images', kw:'modern web', k:'image'},
  svg:  {l:'SVG', c:'Images', kw:'vector logo', k:'image'},
  pdf:  {l:'PDF', c:'Documents', kw:'acrobat adobe print', k:'pdf'},
  docx: {l:'Word', c:'Documents', kw:'microsoft office word document', k:'docx'},
  odt:  {l:'OpenDocument', c:'Documents', kw:'libreoffice openoffice', k:'odt'},
  pptx: {l:'PowerPoint', c:'Documents', kw:'slides presentation deck', k:'pptx'},
  html: {l:'Web page', c:'Documents', x:'htm xhtml', kw:'website browser', k:'html'},
  md:   {l:'Markdown', c:'Documents', x:'markdown', kw:'notes obsidian github', k:'md'},
  txt:  {l:'Plain text', c:'Documents', x:'text log', kw:'notepad', k:'txt'},
  xlsx: {l:'Excel', c:'Spreadsheets', x:'xls xlsm', kw:'spreadsheet sheet microsoft', k:'sheet'},
  ods:  {l:'OpenDocument Sheet', c:'Spreadsheets', kw:'libreoffice spreadsheet', k:'sheet'},
  csv:  {l:'CSV', c:'Spreadsheets', kw:'comma table spreadsheet', k:'sheet'},
  tsv:  {l:'TSV', c:'Spreadsheets', kw:'tab table', k:'sheet'},
  json: {l:'JSON', c:'Spreadsheets', kw:'data developer'},
  epub: {l:'EPUB', c:'Ebooks', kw:'ebook book kobo apple books', k:'epub'},
  image:{l:'Image', c:'Images', k:'image', hide:1},
};
const EXT = {};
for (const [key, f] of Object.entries(F)) for (const e of [key, ...(f.x || '').split(' ').filter(Boolean)]) EXT[e] = key;
const IMG_OUT = ['png', 'jpg', 'webp', 'gif', 'bmp', 'tiff', 'ico'];
const DOC_OUT = ['pdf', 'docx', 'html', 'md', 'txt', 'epub'];
const SHEET_OUT = ['xlsx', 'csv', 'json'];
const IMG_KINDS = ['image', 'heic', 'tiff'];
const SAVEABLE = new Set('gif png jpg jpeg webp bmp tiff ico txt json md docx pptx epub csv html svg pdf xlsx zip'.split(' '));

function targetsOf(fmt) {
  const k = F[fmt].k;
  let t = IMG_KINDS.includes(k) ? [...IMG_OUT, 'pdf']
        : k === 'pdf' ? [...IMG_OUT, ...DOC_OUT]
        : k === 'sheet' ? [...SHEET_OUT, ...DOC_OUT, ...IMG_OUT]
        : [...DOC_OUT, ...IMG_OUT];
  return t.filter(x => x !== fmt);
}

/* ------------------------------------------------------------------ libraries (loaded on first use) */
const LIB = {
  pdfjs: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'],
  pdflib: ['https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'],
  zip: ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'],
  mammoth: ['https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'],
  marked: ['https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js'],
  turndown: ['https://unpkg.com/turndown@7.1.2/dist/turndown.js', 'https://unpkg.com/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js'],
  xlsx: ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'],
  docx: ['https://unpkg.com/docx@8.5.0/build/index.umd.js'],
  heic: ['https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js'],
  utif: ['https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', 'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js'],
  gif: ['https://cdn.jsdelivr.net/npm/omggif@1.0.10/omggif.js'],
};
const loading = {};
function script(src) {
  return loading[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => { delete loading[src]; rej(new Error('A converter component could not load. Check your internet connection and try again.')); };
    document.head.append(s);
  });
}
async function need(...names) { for (const n of names) for (const u of LIB[n]) await script(u); }

/* ------------------------------------------------------------------ small helpers */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const ctx = c => c.getContext('2d', {willReadFrequently: true});
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Your browser could not encode this image.')), type, q));
const bytesOf = async b => new Uint8Array(await b.arrayBuffer());
const size = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const tick = () => new Promise(r => setTimeout(r));

function flat(c) { // put transparency on white
  const o = canvas(c.width, c.height), x = ctx(o);
  x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0); return o;
}
function fit(c, max) {
  if (!max || Math.max(c.width, c.height) <= max) return c;
  const r = max / Math.max(c.width, c.height), o = canvas(c.width * r, c.height * r), x = ctx(o);
  x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height); return o;
}
function hasAlpha(c) {
  const d = ctx(c).getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}
const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = src; });
async function imgToCanvas(blob, isSvg) {
  if (!isSvg) try {
    const bm = await createImageBitmap(blob), c = canvas(bm.width, bm.height);
    ctx(c).drawImage(bm, 0, 0); bm.close(); return c;
  } catch {}
  const url = URL.createObjectURL(blob);
  try {
    const im = await loadImg(url);
    let w = im.naturalWidth || 1024, h = im.naturalHeight || 1024;
    if (isSvg && Math.max(w, h) < 1600) { const r = 1600 / Math.max(w, h); w *= r; h *= r; }
    const c = canvas(w, h); ctx(c).drawImage(im, 0, 0, c.width, c.height); return c;
  } finally { URL.revokeObjectURL(url); }
}
async function srcToCanvas(src) { // images inside documents; remote links can't load here
  if (!/^(data|blob):/.test(src)) return null;
  try { const im = await loadImg(src); const c = canvas(im.naturalWidth, im.naturalHeight); ctx(c).drawImage(im, 0, 0); return c; }
  catch { return null; }
}

/* ------------------------------------------------------------------ image encoders */
async function encode(c, to, o) {
  c = fit(c, o.max);
  if (to === 'png') return toBlob(c, 'image/png');
  if (to === 'jpg') return toBlob(flat(c), 'image/jpeg', o.quality / 100);
  if (to === 'webp') {
    const b = await toBlob(c, 'image/webp', o.quality / 100);
    if (b.type !== 'image/webp') throw new Error("This browser can't create WebP files. Try Chrome, Edge or Firefox.");
    return b;
  }
  if (to === 'bmp') return bmp(flat(c));
  if (to === 'ico') return ico(c);
  if (to === 'gif') { await need('gif'); return gif(c); }
  if (to === 'tiff') {
    await need('utif');
    const d = ctx(c).getImageData(0, 0, c.width, c.height).data;
    return new Blob([UTIF.encodeImage(new Uint8Array(d.buffer), c.width, c.height)], {type: 'image/tiff'});
  }
  throw new Error('Unknown image format');
}
function bmp(c) {
  const w = c.width, h = c.height, d = ctx(c).getImageData(0, 0, w, h).data, row = (w * 3 + 3) & ~3;
  const buf = new ArrayBuffer(54 + row * h), v = new DataView(buf), u = new Uint8Array(buf);
  v.setUint16(0, 0x4d42, true); v.setUint32(2, buf.byteLength, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true);
  v.setUint16(28, 24, true); v.setUint32(34, row * h, true); v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    let p = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; u[p++] = d[i + 2]; u[p++] = d[i + 1]; u[p++] = d[i]; }
  }
  return new Blob([buf], {type: 'image/bmp'});
}
async function ico(c) {
  const s = Math.min(256, Math.max(c.width, c.height)), q = canvas(s, s), r = Math.min(s / c.width, s / c.height);
  const x = ctx(q); x.imageSmoothingQuality = 'high';
  x.drawImage(c, (s - c.width * r) / 2, (s - c.height * r) / 2, c.width * r, c.height * r);
  const png = await bytesOf(await toBlob(q, 'image/png')), head = new DataView(new ArrayBuffer(22));
  head.setUint16(2, 1, true); head.setUint16(4, 1, true); head.setUint8(6, s & 255); head.setUint8(7, s & 255);
  head.setUint16(10, 1, true); head.setUint16(12, 32, true); head.setUint32(14, png.length, true); head.setUint32(18, 22, true);
  return new Blob([head.buffer, png], {type: 'image/x-icon'});
}
function quantize(c) { // median-cut palette (up to 256 colours) and the index of every pixel
  const w = c.width, h = c.height, d = ctx(c).getImageData(0, 0, w, h).data, hist = new Uint32Array(32768);
  let clear = false;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { clear = true; continue; }
    hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++;
  }
  const ch = (k, n) => n === 0 ? (k >> 10) & 31 : n === 1 ? (k >> 5) & 31 : k & 31;
  const keys = []; for (let k = 0; k < 32768; k++) if (hist[k]) keys.push(k);
  const limit = clear ? 255 : 256;
  let boxes = keys.length ? [keys] : [[0]];
  while (boxes.length < limit) {
    let best = -1, bestCh = 0, bestR = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let n = 0; n < 3; n++) {
        let lo = 31, hi = 0; for (const k of b) { const v = ch(k, n); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > bestR) { bestR = hi - lo; best = i; bestCh = n; }
      }
    });
    if (best < 0) break;
    const b = boxes[best].sort((a, z) => ch(a, bestCh) - ch(z, bestCh));
    let total = 0; for (const k of b) total += hist[k];
    let acc = 0, cut = 1;
    for (let i = 0; i < b.length - 1; i++) { acc += hist[b[i]]; if (acc >= total / 2) { cut = i + 1; break; } }
    boxes.splice(best, 1, b.slice(0, cut), b.slice(cut));
  }
  const pal = boxes.map(b => {
    let r = 0, g = 0, bl = 0, n = 0;
    for (const k of b) { const m = hist[k] || 1; r += ch(k, 0) * m; g += ch(k, 1) * m; bl += ch(k, 2) * m; n += m; }
    return [Math.round(r / n * 8.226), Math.round(g / n * 8.226), Math.round(bl / n * 8.226)];
  });
  const ti = pal.length; if (clear) pal.push([0, 0, 0]);
  let n = 2; while (n < pal.length) n *= 2; while (pal.length < n) pal.push([0, 0, 0]);
  const cache = new Int16Array(32768).fill(-1), idx = new Uint8Array(w * h), real = clear ? ti : pal.length;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    if (d[i + 3] < 128) { idx[p] = ti; continue; }
    const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    if (cache[k] < 0) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < real; j++) { const q = pal[j], dr = q[0] - d[i], dg = q[1] - d[i + 1], db = q[2] - d[i + 2], dd = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (dd < bd) { bd = dd; bi = j; } }
      cache[k] = bi;
    }
    idx[p] = cache[k];
  }
  return {palette: pal.map(([r, g, b]) => (r << 16) | (g << 8) | b), idx, ti, clear};
}
function gif(c) { return gifFrames([c]); }
function gifFrames(frames, delay = 0) { // frames share one size; each gets its own palette
  const w = frames[0].width, h = frames[0].height, buf = new Uint8Array(w * h * 2 * frames.length + 4096);
  const gw = new GifWriter(buf, w, h, frames.length > 1 ? {loop: 0} : {});
  for (const c of frames) {
    const q = quantize(c), opt = {palette: q.palette};
    if (q.clear) opt.transparent = q.ti;
    if (frames.length > 1) { opt.delay = delay; opt.disposal = 2; }
    gw.addFrame(0, 0, w, h, q.idx, opt);
  }
  return new Blob([buf.subarray(0, gw.end())], {type: 'image/gif'});
}

/* ------------------------------------------------------------------ readers */
async function readImage(it) {
  const k = F[it.fmt].k;
  if (k === 'heic') {
    try { return [await imgToCanvas(it.file)]; } catch {} // Safari opens HEIC natively
    await need('heic');
    const out = await heic2any({blob: it.file, toType: 'image/png'});
    return [await imgToCanvas(Array.isArray(out) ? out[0] : out)];
  }
  if (k === 'tiff') {
    try { return [await imgToCanvas(it.file)]; } catch {}
    await need('utif');
    const buf = await it.file.arrayBuffer(), pages = [];
    for (const ifd of UTIF.decode(buf)) {
      UTIF.decodeImage(buf, ifd);
      if (!ifd.width) continue;
      const c = canvas(ifd.width, ifd.height), x = ctx(c), img = x.createImageData(ifd.width, ifd.height);
      img.data.set(UTIF.toRGBA8(ifd)); x.putImageData(img, 0, 0); pages.push(c);
    }
    if (!pages.length) throw new Error("This TIFF couldn't be read.");
    return pages;
  }
  try { return [await imgToCanvas(it.file, it.fmt === 'svg')]; }
  catch { throw new Error(`This browser can't open ${F[it.fmt].l} images.`); }
}

async function openPdf(it) {
  await need('pdfjs');
  try { return await pdfjsLib.getDocument({data: await bytesOf(it.file), isEvalSupported: false}).promise; }
  catch (e) { throw new Error(e?.name === 'PasswordException' ? 'This PDF is password-protected.' : "This PDF couldn't be opened."); }
}
async function* pdfPages(it, dpi, progress) {
  const pdf = await openPdf(it);
  for (let i = 1; i <= pdf.numPages; i++) {
    progress(`Page ${i} of ${pdf.numPages}`, (i - 1) / pdf.numPages);
    const page = await pdf.getPage(i), vp = page.getViewport({scale: dpi / 72}), c = canvas(vp.width, vp.height), x = ctx(c);
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({canvasContext: x, viewport: vp, intent: 'print'}).promise; // print intent doesn't wait on animation frames
    page.cleanup(); yield c;
  }
}
async function pdfHtml(it, progress) { // rebuild headings, paragraphs and bullets from the text layer
  const pdf = await openPdf(it), lines = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    progress(`Reading page ${i} of ${pdf.numPages}`, (i - 1) / pdf.numPages);
    const page = await pdf.getPage(i), tc = await page.getTextContent();
    let cur = null;
    for (const t of tc.items) {
      if (!('str' in t)) continue;
      const sz = Math.round(Math.hypot(t.transform[2], t.transform[3]) * 10) / 10 || t.height, y = t.transform[5];
      if (cur && Math.abs(cur.y - y) <= Math.max(sz, cur.size || sz) * 0.5) { cur.text += t.str; if (t.str.trim()) cur.size = Math.max(cur.size, sz); }
      else { if (cur) lines.push(cur); cur = {text: t.str, size: t.str.trim() ? sz : 0, y}; }
      if (t.hasEOL) { lines.push(cur); cur = null; }
    }
    if (cur) lines.push(cur);
    lines.push({br: 1}); page.cleanup();
  }
  const weight = {};
  for (const l of lines) if (l.text?.trim()) weight[l.size] = (weight[l.size] || 0) + l.text.length;
  const body = +Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] || 11;
  const out = []; let cur = null, prev = null;
  for (const ln of lines) {
    const t = ln.br ? '' : ln.text.replace(/\s+/g, ' ').trim();
    if (!t) { cur = prev = null; continue; }
    const r = ln.size / body, close = prev && prev.y - ln.y > 0 && prev.y - ln.y < ln.size * 1.8;
    if (r >= 1.18 && t.length < 150) {
      const tag = r >= 1.6 ? 'h1' : r >= 1.3 ? 'h2' : 'h3';
      if (cur && cur.tag === tag && close) cur.text += ' ' + t; else out.push(cur = {tag, text: t});
    } else if (/^[\u2022\u25e6\u25aa\u2023\u25cf\u25cb\u25a0\u25a1\-\u2013*]\s+/.test(t)) {
      out.push(cur = {tag: 'li', text: t.replace(/^\S+\s+/, '')});
    } else if (cur && (cur.tag === 'p' || cur.tag === 'li') && close && Math.abs(prev.size - ln.size) < 0.6) {
      cur.text = /[a-z]-$/i.test(cur.text) ? cur.text.slice(0, -1) + t : cur.text + ' ' + t;
    } else out.push(cur = {tag: 'p', text: t});
    prev = ln;
  }
  if (!out.length) throw new Error("This PDF has no text in it (it's probably a scan). Save it as images instead.");
  let html = '', inList = false;
  for (const b of out) {
    if (b.tag === 'li' && !inList) { html += '<ul>'; inList = true; }
    if (b.tag !== 'li' && inList) { html += '</ul>'; inList = false; }
    html += `<${b.tag}>${esc(b.text)}</${b.tag}>`;
  }
  return html + (inList ? '</ul>' : '');
}

const xml = s => new DOMParser().parseFromString(s, 'application/xml');
const zipPath = (base, rel) => {
  const parts = base.split('/').slice(0, -1);
  for (const p of decodeURIComponent(rel).split('/')) { if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p); }
  return parts.join('/');
};
const MIME = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp'};

async function epubHtml(it) {
  await need('zip');
  const z = await JSZip.loadAsync(await it.file.arrayBuffer());
  const opfPath = xml(await z.file('META-INF/container.xml').async('string')).querySelector('rootfile').getAttribute('full-path');
  const opf = xml(await z.file(opfPath).async('string')), man = {};
  for (const i of opf.getElementsByTagName('item')) man[i.getAttribute('id')] = i.getAttribute('href');
  let html = '';
  for (const ref of opf.getElementsByTagName('itemref')) {
    const path = zipPath(opfPath, man[ref.getAttribute('idref')] || ''), f = z.file(path);
    if (!f) continue;
    const doc = new DOMParser().parseFromString(await f.async('string'), 'text/html');
    for (const img of doc.querySelectorAll('img')) {
      const p = zipPath(path, img.getAttribute('src') || ''), fi = z.file(p), ext = p.split('.').pop().toLowerCase();
      if (fi && MIME[ext]) img.setAttribute('src', `data:${MIME[ext]};base64,${await fi.async('base64')}`); else img.remove();
    }
    html += doc.body.innerHTML;
  }
  return html;
}
async function pptxHtml(it) {
  await need('zip');
  const z = await JSZip.loadAsync(await it.file.arrayBuffer());
  const slides = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  let html = '';
  for (const [i, s] of slides.entries()) {
    const doc = xml(await z.file(s).async('string'));
    const paras = [...doc.getElementsByTagNameNS('*', 'p')].filter(p => p.namespaceURI?.includes('drawingml'))
      .map(p => [...p.getElementsByTagNameNS('*', 't')].map(t => t.textContent).join('')).filter(t => t.trim());
    html += `<h2>Slide ${i + 1}${paras[0] ? ': ' + esc(paras[0]) : ''}</h2>` + paras.slice(1).map(p => `<p>${esc(p)}</p>`).join('');
  }
  return html;
}
async function odtHtml(it) {
  await need('zip');
  const z = await JSZip.loadAsync(await it.file.arrayBuffer());
  const doc = xml(await z.file('content.xml').async('string'));
  const inline = el => [...el.childNodes].map(n => n.nodeType === 3 ? esc(n.nodeValue) : n.localName === 's' ? ' ' : n.localName === 'tab' ? ' ' : n.localName === 'line-break' ? '<br>' : n.nodeType === 1 ? inline(n) : '').join('');
  const walk = el => [...el.children].map(n => {
    const ln = n.localName;
    if (ln === 'h') return `<h${Math.min(6, +(n.getAttribute('text:outline-level') || 1))}>${inline(n)}</h${Math.min(6, +(n.getAttribute('text:outline-level') || 1))}>`;
    if (ln === 'p') return `<p>${inline(n)}</p>`;
    if (ln === 'list') return `<ul>${[...n.children].map(li => `<li>${walk(li).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>`;
    if (ln === 'table') return `<table>${[...n.getElementsByTagNameNS('*', 'table-row')].map(r => `<tr>${[...r.children].filter(c => c.localName === 'table-cell').map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    return walk(n);
  }).join('');
  return walk(doc.getElementsByTagName('office:text')[0] || doc.documentElement);
}
async function workbook(it) {
  if (it.wb) return it.wb;
  await need('xlsx');
  it.wb = it.fmt === 'csv' || it.fmt === 'tsv'
    ? XLSX.read(await it.file.text(), {type: 'string', raw: true, FS: it.fmt === 'tsv' ? '\t' : undefined})
    : XLSX.read(await bytesOf(it.file), {type: 'array'});
  return it.wb;
}
function sheetRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: '', raw: false});
  while (rows.length && rows[rows.length - 1].every(v => v === '')) rows.pop();
  return rows;
}
async function htmlFor(it, progress) {
  if (it.html) return it.html;
  const k = F[it.fmt].k;
  let html;
  if (k === 'pdf') html = await pdfHtml(it, progress);
  else if (k === 'docx') { await need('mammoth'); html = (await mammoth.convertToHtml({arrayBuffer: await it.file.arrayBuffer()})).value; }
  else if (k === 'md') { await need('marked'); html = marked.parse(await it.file.text()); }
  else if (k === 'html') html = await it.file.text();
  else if (k === 'txt') html = (await it.file.text()).split(/\r?\n\s*\r?\n/).map(p => `<p>${esc(p.trim()).replace(/\r?\n/g, '<br>')}</p>`).join('');
  else if (k === 'epub') html = await epubHtml(it);
  else if (k === 'pptx') html = await pptxHtml(it);
  else if (k === 'odt') html = await odtHtml(it);
  else if (k === 'sheet') {
    const wb = await workbook(it), many = wb.SheetNames.length > 1;
    html = wb.SheetNames.map(n => {
      const rows = sheetRows(wb.Sheets[n]);
      if (!rows.length) return '';
      const cell = (v, t) => `<${t}>${esc(v)}</${t}>`;
      return (many ? `<h2>${esc(n)}</h2>` : '') + '<table>' + rows.map((r, i) => '<tr>' + r.map(v => cell(v, i ? 'td' : 'th')).join('') + '</tr>').join('') + '</table>';
    }).join('');
  } else throw new Error('This file type cannot be read as a document.');
  return it.html = clean(html);
}
function clean(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script,style,iframe,object,embed,link,meta,noscript,form,button,input,select,textarea').forEach(e => e.remove());
  for (const e of d.querySelectorAll('*'))
    for (const a of [...e.attributes]) if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) e.removeAttribute(a.name);
  return d.body.innerHTML;
}

/* ------------------------------------------------------------------ document model: HTML -> blocks */
const BLOCK = new Set('P H1 H2 H3 H4 H5 H6 UL OL LI PRE TABLE BLOCKQUOTE HR DIV SECTION ARTICLE MAIN HEADER FOOTER NAV ASIDE FIGURE FIGCAPTION DL DT DD BODY CENTER ADDRESS DETAILS SUMMARY'.split(' '));
const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,ul,ol,li,pre,table,blockquote,hr,div,section,article,figure,dl';
const SKIP = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'SVG']);
function runNode(n, st, out) {
  if (n.nodeType === 3) { const t = n.nodeValue.replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' '); if (t) out.push({t, ...st}); return; }
  if (n.nodeType !== 1 || SKIP.has(n.tagName)) return;
  const tag = n.tagName;
  if (tag === 'BR') { out.push({t: '\n'}); return; }
  if (tag === 'IMG') { const s = n.getAttribute('src'); if (s) out.push({img: s}); return; }
  const s = {...st};
  if (/^(B|STRONG|TH)$/.test(tag)) s.b = 1;
  if (/^(I|EM|CITE|VAR)$/.test(tag)) s.i = 1;
  if (/^(CODE|KBD|SAMP|TT)$/.test(tag)) s.m = 1;
  for (const c of n.childNodes) runNode(c, s, out);
}
const runsOf = el => { const out = []; for (const c of el.childNodes) runNode(c, {}, out); return out; };
function trimRuns(r) {
  r = r.filter(x => x.img || x.t);
  if (r[0]?.t) r[0] = {...r[0], t: r[0].t.replace(/^ +/, '')};
  const l = r.length - 1;
  if (r[l]?.t) r[l] = {...r[l], t: r[l].t.replace(/ +$/, '')};
  return r.filter(x => x.img || x.t);
}
const rtext = r => r.map(x => x.t || '').join('');
function blocksOf(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html'), out = [];
  const emit = (runs, mk) => {
    let cur = [];
    const fl = () => { const c = trimRuns(cur); if (c.some(r => r.t?.trim())) out.push(mk(c)); cur = []; };
    for (const r of runs) { if (r.img) { fl(); out.push({type: 'img', src: r.img}); } else cur.push(r); }
    fl();
  };
  const walk = (nodes, cx) => {
    let pend = [];
    const fp = () => { if (pend.length) emit(pend, r => ({type: 'p', runs: r, quote: cx.quote})); pend = []; };
    for (const n of nodes) {
      if (n.nodeType === 3) { runNode(n, {}, pend); continue; }
      if (n.nodeType !== 1 || SKIP.has(n.tagName)) continue;
      const t = n.tagName;
      if (!BLOCK.has(t) && !n.querySelector(BLOCK_SEL)) { runNode(n, {}, pend); continue; }
      fp();
      if (/^H[1-6]$/.test(t)) emit(runsOf(n), r => ({type: 'h', level: +t[1], runs: r}));
      else if (t === 'UL' || t === 'OL') {
        let i = +(n.getAttribute('start') || 1);
        for (const li of n.children) {
          if (li.tagName !== 'LI') continue;
          const inl = [], nested = [];
          for (const c of li.childNodes) (c.nodeType === 1 && /^(UL|OL|TABLE|PRE|BLOCKQUOTE)$/.test(c.tagName) ? nested : inl).push(c);
          const runs = []; inl.forEach(c => runNode(c, {}, runs));
          out.push({type: 'li', depth: cx.depth, marker: t === 'OL' ? `${i++}.` : cx.depth % 2 ? '\u2013' : '\u2022', runs: trimRuns(runs.filter(r => !r.img))});
          walk(nested, {...cx, depth: cx.depth + 1});
        }
      }
      else if (t === 'PRE') out.push({type: 'pre', text: n.textContent});
      else if (t === 'TABLE') {
        const rows = [...n.rows].map(tr => [...tr.cells].map(td => ({head: td.tagName === 'TH', runs: trimRuns(runsOf(td).filter(r => !r.img))}))).filter(r => r.length);
        if (rows.length) out.push({type: 'table', rows});
      }
      else if (t === 'BLOCKQUOTE') walk([...n.childNodes], {...cx, quote: true});
      else if (t === 'HR') out.push({type: 'hr'});
      else if (/^(P|DT|DD|FIGCAPTION|SUMMARY|ADDRESS)$/.test(t)) emit(runsOf(n), r => ({type: 'p', runs: r, quote: cx.quote}));
      else if (t === 'LI') out.push({type: 'li', depth: cx.depth, marker: '\u2022', runs: trimRuns(runsOf(n).filter(r => !r.img))});
      else walk([...n.childNodes], cx);
    }
    fp();
  };
  walk([...doc.body.childNodes], {depth: 0});
  return out;
}
function blocksText(blocks) {
  let s = '', prevLi = false;
  for (const b of blocks) {
    const line = b.type === 'h' || b.type === 'p' ? rtext(b.runs)
      : b.type === 'li' ? '  '.repeat(b.depth) + b.marker + ' ' + rtext(b.runs)
      : b.type === 'pre' ? b.text.replace(/\n$/, '')
      : b.type === 'table' ? b.rows.map(r => r.map(c => rtext(c.runs)).join('\t')).join('\n')
      : b.type === 'hr' ? '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500' : '';
    if (!line) continue;
    s += (s ? (prevLi && b.type === 'li' ? '\n' : '\n\n') : '') + line;
    prevLi = b.type === 'li';
  }
  return s + '\n';
}

/* ------------------------------------------------------------------ page layout (shared by PDF and image output) */
const PAGE = [595.28, 841.89], MARGIN = 56, INK = '#16181d', GREY = '#8a8f99', RULE = '#b9bdc6';
const HS = {1: 22, 2: 17, 3: 14, 4: 12.5, 5: 11.5, 6: 11};
function wrap(P, runs, sz, width, force = {}) {
  const lines = []; let cur = [], w = 0, sp = false;
  const push = () => { lines.push(cur); cur = []; w = 0; };
  for (const r of runs) {
    if (r.t === '\n') { push(); sp = false; continue; }
    for (const m of r.t.replace(/\t/g, ' ').matchAll(/\S+|\s+/g)) {
      if (/^\s/.test(m[0])) { sp = true; continue; }
      const f = {b: r.b || force.b, i: r.i || force.i, m: r.m || force.m};
      let t = m[0], ww = P.width(t, f, sz), sw = cur.length && sp ? P.width(' ', f, sz) : 0;
      sp = false;
      if (cur.length && w + sw + ww > width) { push(); sw = 0; }
      while (ww > width && t.length > 1) { // break words longer than a line
        let n = Math.max(1, Math.floor(t.length * (width - w) / ww));
        while (n > 1 && P.width(t.slice(0, n), f, sz) > width - w) n--;
        cur.push({t: t.slice(0, n), f, x: w + sw}); push(); sw = 0;
        t = t.slice(n); ww = P.width(t, f, sz);
      }
      cur.push({t, f, x: w + sw}); w += sw + ww;
    }
  }
  if (cur.length) push();
  return lines;
}
async function layout(blocks, P) {
  const [W, H] = PAGE, M = MARGIN, CW = W - 2 * M;
  let y = 0, first = true;
  const newPage = async () => { await P.page(W, H); y = M; };
  const room = async h => { if (y + h > H - M && y > M + 1) await newPage(); };
  const lines = async (ls, x, sz, lh, bar) => {
    for (const ln of ls) {
      await room(lh);
      if (bar) P.line(M + 3, y + 1, M + 3, y + lh, GREY, 1.5);
      for (const it of ln) P.text(it.t, x + it.x, y + sz, it.f, sz, INK);
      y += lh;
    }
  };
  await newPage();
  for (const b of blocks) {
    if (b.type === 'h') {
      const sz = HS[b.level], lh = sz * 1.25, ls = wrap(P, b.runs, sz, CW, {b: 1});
      if (!first) y += sz * 0.7;
      await room(lh * Math.min(ls.length, 2) + 24);
      await lines(ls, M, sz, lh); y += 5;
    } else if (b.type === 'p') {
      const ind = b.quote ? 16 : 0;
      await lines(wrap(P, b.runs, 11, CW - ind, b.quote ? {i: 1} : {}), M + ind, 11, 15.4, b.quote); y += 7;
    } else if (b.type === 'li') {
      const ind = 18 * (b.depth + 1), ls = wrap(P, b.runs, 11, CW - ind);
      await room(15.4);
      P.text(b.marker, M + ind - P.width(b.marker, {}, 11) - 6, y + 11, {}, 11, INK);
      await lines(ls.length ? ls : [[]], M + ind, 11, 15.4); y += 3;
    } else if (b.type === 'pre') {
      const per = Math.max(8, Math.floor((CW - 8) / P.width('M', {m: 1}, 9)));
      for (const raw of b.text.replace(/\n$/, '').replace(/\t/g, '    ').split('\n'))
        for (let i = 0; i < Math.max(1, raw.length); i += per) {
          await room(12); P.text(raw.slice(i, i + per), M + 4, y + 9, {m: 1}, 9, INK); y += 12;
        }
      y += 8;
    } else if (b.type === 'table') {
      const cols = Math.max(...b.rows.map(r => r.length)), cw = CW / cols, pad = 4, sz = cols > 6 ? 8 : 9.5, lh = sz * 1.3;
      for (const row of b.rows) {
        const cells = row.map(c => wrap(P, c.runs, sz, cw - 2 * pad, {b: c.head}));
        const rh = Math.max(1, ...cells.map(c => c.length)) * lh + 2 * pad;
        await room(Math.min(rh, H - 2 * M));
        for (let ci = 0; ci < cols; ci++) {
          P.rect(M + ci * cw, y, cw, rh, RULE);
          (cells[ci] || []).forEach((ln, li) => ln.forEach(it => P.text(it.t, M + ci * cw + pad + it.x, y + pad + li * lh + sz, it.f, sz, INK)));
        }
        y += rh;
      }
      y += 10;
    } else if (b.type === 'img') {
      const im = await srcToCanvas(b.src);
      if (!im) continue;
      let w = Math.min(CW, im.width * 0.75), h = im.height * w / im.width;
      if (h > H - 2 * M) { h = H - 2 * M; w = im.width * h / im.height; }
      await room(h); await P.image(im, M, y, w, h); y += h + 10;
    } else if (b.type === 'hr') { await room(16); P.line(M, y + 8, W - M, y + 8, RULE, 0.75); y += 16; }
    first = false;
  }
  await P.end();
}
class CanvasPainter { // pages as images; handles every script the browser can show
  constructor(dpi, onPage) { this.s = dpi / 72; this.onPage = onPage; this.m = ctx(canvas(1, 1)); }
  css(f, sz) { return `${f.i ? 'italic ' : ''}${f.b ? 700 : 400} ${sz}px ${f.m ? 'Menlo, Consolas, "Courier New", monospace' : 'Helvetica, Arial, sans-serif'}`; }
  width(t, f, sz) { this.m.font = this.css(f, sz); return this.m.measureText(t).width; }
  async page(w, h) {
    if (this.c) await this.onPage(this.c);
    const c = this.c = canvas(w * this.s, h * this.s), x = this.x = ctx(c);
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.scale(this.s, this.s);
  }
  text(t, x, y, f, sz, col) { this.x.font = this.css(f, sz); this.x.fillStyle = col; this.x.fillText(t, x, y); }
  line(x1, y1, x2, y2, col, w) { const x = this.x; x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); }
  rect(x, y, w, h, col) { this.x.strokeStyle = col; this.x.lineWidth = 0.5; this.x.strokeRect(x, y, w, h); }
  image(im, x, y, w, h) { this.x.drawImage(im, x, y, w, h); }
  async end() { if (this.c) await this.onPage(this.c); this.c = null; }
}
class PdfPainter { // real, selectable text
  async init() {
    await need('pdflib');
    const S = PDFLib.StandardFonts; this.doc = await PDFLib.PDFDocument.create();
    const e = n => this.doc.embedFont(n);
    this.F = {r: await e(S.Helvetica), b: await e(S.HelveticaBold), i: await e(S.HelveticaOblique), bi: await e(S.HelveticaBoldOblique), m: await e(S.Courier), mb: await e(S.CourierBold)};
    return this;
  }
  font(f) { return this.F[f.m ? (f.b ? 'mb' : 'm') : f.b && f.i ? 'bi' : f.b ? 'b' : f.i ? 'i' : 'r']; }
  color(c) { return PDFLib.rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255); }
  width(t, f, sz) { return this.font(f).widthOfTextAtSize(t, sz); }
  async page(w, h) { this.p = this.doc.addPage([w, h]); this.h = h; }
  text(t, x, y, f, sz, col) { if (t) this.p.drawText(t, {x, y: this.h - y, size: sz, font: this.font(f), color: this.color(col)}); }
  line(x1, y1, x2, y2, col, w) { this.p.drawLine({start: {x: x1, y: this.h - y1}, end: {x: x2, y: this.h - y2}, thickness: w, color: this.color(col)}); }
  rect(x, y, w, h, col) { this.p.drawRectangle({x, y: this.h - y - h, width: w, height: h, borderColor: this.color(col), borderWidth: 0.5}); }
  async image(im, x, y, w, h) {
    const a = hasAlpha(im), bytes = await bytesOf(await toBlob(a ? im : flat(im), a ? 'image/png' : 'image/jpeg', 0.9));
    this.p.drawImage(a ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes), {x, y: this.h - y - h, width: w, height: h});
  }
  async end() {}
}
const WIN_EXTRA = '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';
function westernOnly(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 10 || c === 9 || (c >= 32 && c < 127) || (c >= 160 && c <= 255) || WIN_EXTRA.includes(ch)) continue;
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ writers */
async function pagesToPdf(pages, o, ppi) {
  await need('pdflib');
  const doc = await PDFLib.PDFDocument.create();
  for await (const c0 of pages) {
    const c = fit(c0, o.max), a = hasAlpha(c);
    const bytes = await bytesOf(await toBlob(a ? c : flat(c), a ? 'image/png' : 'image/jpeg', Math.max(0.5, o.quality / 100)));
    const img = a ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const res = ppi || Math.max(72, Math.max(c.width, c.height) / 11), w = c.width * 72 / res, h = c.height * 72 / res;
    doc.addPage([w, h]).drawImage(img, {x: 0, y: 0, width: w, height: h});
    await tick();
  }
  return new Blob([await doc.save()], {type: 'application/pdf'});
}
async function docToPdf(blocks, o, notes) {
  const all = blocks.map(b => b.type === 'table' ? b.rows.flat().map(c => rtext(c.runs)).join(' ') : b.type === 'pre' ? b.text : b.runs ? (b.marker || '') + rtext(b.runs) : '').join(' ');
  if (westernOnly(all)) {
    const P = await new PdfPainter().init(); await layout(blocks, P);
    return new Blob([await P.doc.save()], {type: 'application/pdf'});
  }
  notes.push('saved as page images to keep its non-Latin text');
  const pages = []; await layout(blocks, new CanvasPainter(o.dpi, c => { pages.push(c); }));
  return pagesToPdf(pages, {...o, max: 0}, o.dpi);
}
function htmlPage(body, title) {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:17px/1.6 Georgia,serif;max-width:44rem;margin:2.5rem auto;padding:0 1rem;color:#1b1b1b}img{max-width:100%;height:auto}table{border-collapse:collapse;margin:1rem 0}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}pre{background:#f4f4f4;padding:12px;overflow:auto;font-size:14px}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:1rem;color:#555}</style>
</head><body>\n${body}\n</body></html>\n`;
}
async function toMarkdown(html) {
  await need('turndown');
  const td = new TurndownService({headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*'});
  td.use(turndownPluginGfm.gfm);
  td.addRule('embedded-images', {filter: n => n.nodeName === 'IMG' && /^data:/.test(n.getAttribute('src') || ''), replacement: () => ''});
  return td.turndown(html) + '\n';
}
async function toDocx(blocks) {
  await need('docx');
  const D = window.docx, kids = [];
  const runs = (rs, ex = {}) => rs.map(r => r.t === '\n' ? new D.TextRun({text: '', break: 1}) : new D.TextRun({text: r.t, bold: !!(r.b || ex.b), italics: !!(r.i || ex.i), font: r.m ? 'Courier New' : undefined}));
  for (const b of blocks) {
    if (b.type === 'h') kids.push(new D.Paragraph({heading: D.HeadingLevel['HEADING_' + b.level], children: runs(b.runs)}));
    else if (b.type === 'p') kids.push(new D.Paragraph({children: runs(b.runs, b.quote ? {i: 1} : {}), indent: b.quote ? {left: 567} : undefined, spacing: {after: 120}}));
    else if (b.type === 'li') kids.push(new D.Paragraph({indent: {left: 360 * (b.depth + 1) + 360, hanging: 360}, children: [new D.TextRun({text: b.marker + '\t'}), ...runs(b.runs)]}));
    else if (b.type === 'pre') for (const l of b.text.replace(/\n$/, '').split('\n')) kids.push(new D.Paragraph({children: [new D.TextRun({text: l, font: 'Courier New', size: 18})]}));
    else if (b.type === 'table') {
      const cols = Math.max(...b.rows.map(r => r.length));
      kids.push(new D.Table({width: {size: 100, type: D.WidthType.PERCENTAGE}, rows: b.rows.map(r => new D.TableRow({children: Array.from({length: cols}, (_, i) => new D.TableCell({children: [new D.Paragraph({children: r[i] ? runs(r[i].runs, {b: r[i].head}) : []})]}))}))}));
      kids.push(new D.Paragraph({children: []}));
    } else if (b.type === 'img') {
      const im = await srcToCanvas(b.src); if (!im) continue;
      const w = Math.min(600, im.width), h = im.height * w / im.width;
      kids.push(new D.Paragraph({children: [new D.ImageRun({data: await bytesOf(await toBlob(im, 'image/png')), transformation: {width: w, height: h}})]}));
    } else if (b.type === 'hr') kids.push(new D.Paragraph({border: {bottom: {color: '999999', space: 1, style: D.BorderStyle.SINGLE, size: 6}}, children: []}));
  }
  return D.Packer.toBlob(new D.Document({sections: [{children: kids.length ? kids : [new D.Paragraph({children: []})]}]}));
}
async function toEpub(html, title) {
  await need('zip');
  const z = new JSZip(), d = new DOMParser().parseFromString(html, 'text/html'), items = [], toc = [];
  z.file('mimetype', 'application/epub+zip', {compression: 'STORE'});
  z.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  let n = 0;
  for (const img of d.querySelectorAll('img')) {
    const m = (img.getAttribute('src') || '').match(/^data:(image\/(png|jpeg|gif|webp|svg\+xml));base64,(.*)$/);
    if (!m) { img.remove(); continue; }
    const name = `images/img${++n}.${{png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp', 'svg+xml': 'svg'}[m[2]]}`;
    z.file('OEBPS/' + name, m[3], {base64: true});
    items.push(`<item id="img${n}" href="${name}" media-type="${m[1]}"/>`);
    img.setAttribute('src', name); if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
  }
  d.querySelectorAll('h1,h2').forEach((h, i) => { h.id = 's' + i; toc.push(`<li><a href="text.xhtml#s${i}">${esc(h.textContent.trim() || 'Section ' + (i + 1))}</a></li>`); });
  const body = new XMLSerializer().serializeToString(d.body).replace(/^<body[^>]*>/, '').replace(/<\/body>$/, '');
  const head = t => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(t)}</title></head>`;
  z.file('OEBPS/text.xhtml', `${head(title)}<body>${body}</body></html>`);
  z.file('OEBPS/nav.xhtml', `${head('Contents')}<body><nav epub:type="toc"><h1>Contents</h1><ol>${toc.join('') || `<li><a href="text.xhtml">${esc(title)}</a></li>`}</ol></nav></body></html>`);
  z.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/>${items.join('')}</manifest><spine><itemref idref="text"/></spine></package>`);
  return z.generateAsync({type: 'blob', mimeType: 'application/epub+zip'});
}

/* ------------------------------------------------------------------ one conversion */
async function* rasterPages(it, o, progress) {
  const k = F[it.fmt].k;
  if (IMG_KINDS.includes(k)) { yield* await readImage(it); return; }
  if (k === 'pdf') { yield* pdfPages(it, o.dpi, progress); return; }
  progress('Laying out pages');
  const pages = []; await layout(blocksOf(await htmlFor(it, progress)), new CanvasPainter(o.dpi, c => { pages.push(c); }));
  yield* pages;
}
async function convert(it, to, o, progress) {
  const stem = it.stem, outs = [], notes = [], k = F[it.fmt].k;
  if (IMG_OUT.includes(to)) {
    const blobs = [];
    for await (const c of rasterPages(it, o, progress)) { blobs.push(await encode(c, to, o)); await tick(); }
    blobs.forEach((b, i) => outs.push({name: blobs.length > 1 ? `${stem}-page${String(i + 1).padStart(3, '0')}.${to}` : `${stem}.${to}`, blob: b}));
  } else if (to === 'pdf') {
    outs.push({name: stem + '.pdf', blob: IMG_KINDS.includes(k) ? await pagesToPdf(rasterPages(it, o, progress), o) : await docToPdf(blocksOf(await htmlFor(it, progress)), o, notes)});
  } else if (SHEET_OUT.includes(to)) {
    const wb = await workbook(it);
    if (to === 'xlsx') outs.push({name: stem + '.xlsx', blob: new Blob([XLSX.write(wb, {type: 'array', bookType: 'xlsx'})], {type: 'application/octet-stream'})});
    if (to === 'csv') for (const n of wb.SheetNames)
      outs.push({name: wb.SheetNames.length > 1 ? `${stem}-${n}.csv` : stem + '.csv', blob: new Blob(['\ufeff' + XLSX.utils.sheet_to_csv(wb.Sheets[n])], {type: 'text/csv'})});
    if (to === 'json') {
      const data = Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], {defval: ''})]));
      outs.push({name: stem + '.json', blob: new Blob([JSON.stringify(wb.SheetNames.length > 1 ? data : data[wb.SheetNames[0]], null, 2)], {type: 'application/json'})});
    }
  } else {
    const html = await htmlFor(it, progress);
    progress('Writing ' + F[to].l);
    const blob = to === 'html' ? new Blob([htmlPage(html, stem)], {type: 'text/html'})
      : to === 'md' ? new Blob([await toMarkdown(html)], {type: 'text/markdown'})
      : to === 'txt' ? new Blob([blocksText(blocksOf(html))], {type: 'text/plain'})
      : to === 'docx' ? await toDocx(blocksOf(html))
      : await toEpub(html, stem);
    outs.push({name: `${stem}.${to}`, blob});
  }
  return {outs, notes};
}
async function mergeAll(list, o, progress) {
  await need('pdflib');
  const out = await PDFLib.PDFDocument.create();
  for (const [i, it] of list.entries()) {
    progress(it, `Adding ${i + 1} of ${list.length}`, i / list.length);
    const blob = it.fmt === 'pdf' ? it.file : (await convert(it, 'pdf', o, m => progress(it, m))).outs[0].blob;
    let src;
    try { src = await PDFLib.PDFDocument.load(await bytesOf(blob)); }
    catch { throw new Error(`${it.name} couldn't be added (it may be password-protected).`); }
    (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
  }
  return new Blob([await out.save()], {type: 'application/pdf'});
}

/* ------------------------------------------------------------------ saving */
let downloads;
async function saveFile(name, blob) {
  if (downloads === undefined) { try { downloads = await window.claude?.use?.('downloads') ?? null; } catch { downloads = null; } }
  if (downloads) {
    try { await downloads.save({filename: name, data: blob}); return true; }
    catch (e) {
      if (e?.code === 'declined') return false;
      if (e?.code === 'rate_limited') throw new Error('A save is already waiting for your answer.');
      if (e?.code === 'too_large') throw new Error('This file is too large to save here.');
      throw new Error("Saving isn't available in this view.");
    }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return true;
}
async function zipOf(files) {
  await need('zip');
  const z = new JSZip(), used = new Set();
  for (const f of files) {
    let n = f.name, i = 1;
    while (used.has(n)) n = f.name.replace(/(\.[^.]+)?$/, ` (${i++})$1`);
    used.add(n); z.file(n, f.blob);
  }
  return z.generateAsync({type: 'blob'});
}
async function package_(it) { // one file when the type is allowed, otherwise a zip
  const o = it.outs;
  if (o.length === 1 && SAVEABLE.has(o[0].name.split('.').pop())) return o[0];
  return {name: `${it.stem} (${it.to.toUpperCase()}).zip`, blob: await zipOf(o)};
}
