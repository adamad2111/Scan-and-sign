/* Scan & Sign — app controller */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const icons = () => window.lucide && lucide.createIcons({ attrs: { 'stroke-width': 2 } });
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FILTERS = [
  { id: 'color', name: 'Color' },
  { id: 'gray', name: 'Grayscale' },
  { id: 'bw', name: 'Black & White' },
  { id: 'photo', name: 'Photo' },
];
const INK = ['#111111', '#1F3FA8', '#0A84FF', '#C62828'];
const STAMP_COLORS = ['#D7263D', '#1F4FBF', '#1E8E3E', '#6B2FB3', '#3A3A3C'];

const state = {
  docs: [], signatures: [], stamps: [],
  scan: { pages: [], targetDoc: null, stream: null, lastQuad: null, lastQuadAt: 0, loop: 0 },
  review: { idx: 0, crop: false },
  editor: { doc: null, sel: null },
};

/* ---------------- Theme ---------------- */
const root = document.documentElement;
function setTheme(t) {
  root.dataset.theme = t;
  $('meta[name=theme-color]').content = t === 'dark' ? '#000000' : '#F2F2F7';
  $('#themeBtn').innerHTML = `<i data-lucide="${t === 'dark' ? 'sun' : 'moon'}"></i>`; icons();
}
setTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('#themeBtn').onclick = () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');

/* ---------------- Toast ---------------- */
let toastT;
function toast(msg, icon = 'check-circle-2') {
  const t = $('#toast'); t.innerHTML = `<i data-lucide="${icon}"></i>${esc(msg)}`; icons();
  t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- Views ---------------- */
function show(id) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + id));
  document.body.classList.toggle('hide-tabbar', !['home', 'library'].includes(id));
  if (id === 'home') renderHome();
  if (id === 'library') renderLibrary();
}
$$('.tab').forEach(t => t.onclick = () => { $$('.tab').forEach(x => x.classList.toggle('active', x === t)); show(t.dataset.tab); });

/* ---------------- Sheets ---------------- */
let currentSheet = null;
function openSheet({ title, body, confirm, onMount, onClose }) {
  if (currentSheet) closeSheet(true);
  const rootEl = $('#sheetRoot');
  const back = document.createElement('div'); back.className = 'sheet-backdrop';
  const el = document.createElement('div'); el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
  el.innerHTML = `<div class="grabber"></div>
    <div class="sheet-head">
      <button class="glass-btn circle" data-close aria-label="Close"><i data-lucide="x"></i></button>
      <h3>${esc(title)}</h3>
      ${confirm ? `<button class="glass-btn circle tint" data-confirm aria-label="${esc(confirm.label || 'Done')}"><i data-lucide="${confirm.icon || 'check'}"></i></button>` : '<span></span>'}
    </div>
    <div class="sheet-body">${body}</div>`;
  rootEl.append(back, el);
  back.onclick = () => closeSheet();
  $('[data-close]', el).onclick = () => closeSheet();
  if (confirm) $('[data-confirm]', el).onclick = () => confirm.onClick(el);
  currentSheet = { el, back, onClose };
  icons();
  onMount && onMount(el);
  return el;
}
function closeSheet(instant) {
  if (!currentSheet) return;
  const { el, back, onClose } = currentSheet; currentSheet = null;
  onClose && onClose();
  if (instant) { el.remove(); back.remove(); return; }
  el.classList.add('out'); back.classList.add('out');
  setTimeout(() => { el.remove(); back.remove(); }, 300);
}
function actionSheet(title, rows) {
  openSheet({
    title,
    body: `<div class="list">${rows.map((r, i) => `<button class="list-row ${r.danger ? 'danger' : ''}" data-i="${i}">
      <span class="ic" style="background:${r.color || (r.danger ? 'var(--red)' : 'var(--blue)')}"><i data-lucide="${r.icon}"></i></span>
      <span style="flex:1"><div>${esc(r.label)}</div>${r.sub ? `<div class="sub">${esc(r.sub)}</div>` : ''}</span></button>`).join('')}</div>`,
    onMount: el => $$('.list-row', el).forEach(b => b.onclick = () => { const r = rows[+b.dataset.i]; closeSheet(); setTimeout(() => r.run(), 120); }),
  });
}

/* ---------------- Home ---------------- */
function fmtDate(d) { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function renderHome() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const docs = state.docs.filter(d => !q || d.name.toLowerCase().includes(q));
  const grid = $('#docGrid');
  grid.innerHTML = docs.map((d, i) => `
    <div class="doc-card" style="animation-delay:${i * 30}ms" data-id="${d.id}">
      <button class="doc-thumb" data-open="${d.id}" aria-label="Open ${esc(d.name)}">
        ${d.thumb ? `<img src="${d.thumb}" alt="">` : ''}
        <span class="count glass">${d.pages.length} ${d.pages.length === 1 ? 'page' : 'pages'}</span>
      </button>
      <div class="doc-meta"><div class="txt"><div class="doc-name">${esc(d.name)}</div><div class="doc-date">${fmtDate(d.updated)}</div></div>
        <button class="more-btn" data-more="${d.id}" aria-label="More"><i data-lucide="ellipsis"></i></button></div>
    </div>`).join('');
  $('#emptyHome').classList.toggle('show', state.docs.length === 0);
  $('.search').classList.toggle('hidden', state.docs.length === 0);
  icons();
  $$('[data-open]', grid).forEach(b => b.onclick = () => openEditor(findDoc(b.dataset.open)));
  $$('[data-more]', grid).forEach(b => b.onclick = () => {
    const d = findDoc(b.dataset.more);
    actionSheet(d.name, [
      { icon: 'pencil', label: 'Rename', run: () => renameDoc(d) },
      { icon: 'file-down', label: 'Export PDF', color: '#FF9500', run: () => exportPDF(d) },
      { icon: 'trash-2', label: 'Delete Document', danger: true, run: () => { state.docs = state.docs.filter(x => x !== d); renderHome(); toast('Document deleted', 'trash-2'); } },
    ]);
  });
}
$('#searchInput').oninput = renderHome;
const findDoc = id => state.docs.find(d => d.id === id);

/* ---------------- Library ---------------- */
function renderLibrary() {
  const sig = $('#libSignatures'), st = $('#libStamps');
  sig.innerHTML = state.signatures.length ? state.signatures.map(s => `<div class="lib-item sig"><img src="${s.url}" alt="Signature"><button class="del" data-del-sig="${s.id}" aria-label="Delete"><i data-lucide="x"></i></button></div>`).join('')
    : `<div class="lib-empty">No saved signatures yet</div>`;
  st.innerHTML = state.stamps.length ? state.stamps.map(s => `<div class="lib-item"><img src="${s.url}" alt="Stamp"><button class="del" data-del-stamp="${s.id}" aria-label="Delete"><i data-lucide="x"></i></button></div>`).join('')
    : `<div class="lib-empty">No custom stamps yet</div>`;
  icons();
  $$('[data-del-sig]').forEach(b => b.onclick = () => { state.signatures = state.signatures.filter(s => s.id !== b.dataset.delSig); renderLibrary(); });
  $$('[data-del-stamp]').forEach(b => b.onclick = () => { state.stamps = state.stamps.filter(s => s.id !== b.dataset.delStamp); renderLibrary(); });
}

/* ---------------- Scanner ---------------- */
async function openScanner(targetDoc = null) {
  state.scan.pages = []; state.scan.targetDoc = targetDoc;
  updateThumbStack();
  show('scanner');
  $('#camFallback').classList.add('hidden');
  $('#shutterBtn').disabled = true;
  $('#scanHint').textContent = 'Starting camera…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
    state.scan.stream = stream;
    const v = $('#video'); v.srcObject = stream; await v.play().catch(() => {});
    $('#shutterBtn').disabled = false;
    $('#scanHint').textContent = 'Position the document in view';
    startDetectLoop();
  } catch (e) {
    $('#camFallback').classList.remove('hidden');
    $('#scanHint').textContent = 'Camera unavailable';
  }
}
function stopCamera() {
  cancelAnimationFrame(state.scan.loop);
  if (state.scan.stream) state.scan.stream.getTracks().forEach(t => t.stop());
  state.scan.stream = null; $('#video').srcObject = null; $('#detectPoly').setAttribute('points', '');
}
function startDetectLoop() {
  const v = $('#video'); let last = 0, shown = null;
  const step = t => {
    state.scan.loop = requestAnimationFrame(step);
    if (!v.videoWidth || t - last < 180) return; last = t;
    const q = Imaging.detectQuad(v);
    const poly = $('#detectPoly');
    if (q) {
      state.scan.lastQuad = q; state.scan.lastQuadAt = performance.now();
      shown = shown ? shown.map((p, i) => ({ x: p.x + (q[i].x - p.x) * .5, y: p.y + (q[i].y - p.y) * .5 })) : q;
      const cw = v.clientWidth, ch = v.clientHeight, s = Math.max(cw / v.videoWidth, ch / v.videoHeight);
      const ox = (cw - v.videoWidth * s) / 2, oy = (ch - v.videoHeight * s) / 2;
      poly.setAttribute('points', shown.map(p => `${p.x * v.videoWidth * s + ox},${p.y * v.videoHeight * s + oy}`).join(' '));
      poly.style.opacity = 1; $('#scanHint').textContent = 'Document detected';
    } else { poly.style.opacity = 0; shown = null; $('#scanHint').textContent = 'Position the document in view'; }
  };
  state.scan.loop = requestAnimationFrame(step);
}
function capture() {
  const v = $('#video'); if (!v.videoWidth) return;
  const c = Imaging.downscale(v, 2600);
  const fresh = performance.now() - state.scan.lastQuadAt < 700 ? state.scan.lastQuad : null;
  addScanPage(c, fresh || Imaging.detectQuad(c) || Imaging.defaultQuad());
  const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}
function addScanPage(canvas, quad) {
  state.scan.pages.push({ id: uid(), src: canvas, quad, rot: 0, filter: 'color', out: null, key: '' });
  updateThumbStack();
}
function updateThumbStack() {
  const n = state.scan.pages.length, el = $('#thumbStack');
  if (!n) { el.innerHTML = ''; $('#saveScanBtn').disabled = true; $('#saveScanBtn').textContent = 'Save'; return; }
  const p = state.scan.pages[n - 1];
  const t = Imaging.warp(Imaging.downscale(p.src, 400), p.quad, 160);
  el.innerHTML = `<img src="${t.toDataURL('image/jpeg', .7)}" alt="Last scan"><span class="badge">${n}</span>`;
  $('#saveScanBtn').disabled = false; $('#saveScanBtn').textContent = `Save (${n})`;
}
$('#shutterBtn').onclick = capture;

async function loadFiles(files) {
  const out = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(f);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }).catch(() => null);
    if (!img) continue;
    out.push(Imaging.downscale(img, 2600));
    URL.revokeObjectURL(url);
  }
  return out;
}
let importMode = 'scan';
$('#fileImport').onchange = $('#fileCapture').onchange = async e => {
  const canvases = await loadFiles(e.target.files); e.target.value = '';
  if (!canvases.length) return;
  if (importMode === 'home') { state.scan.pages = []; state.scan.targetDoc = null; }
  canvases.forEach(c => addScanPage(c, Imaging.detectQuad(c) || Imaging.defaultQuad()));
  if (importMode === 'home' || !state.scan.stream) { stopCamera(); openReview(state.scan.pages.length - canvases.length); }
};

/* ---------------- Review ---------------- */
let reviewSmall = new WeakMap();
async function processPage(p) {
  const key = JSON.stringify([p.quad, p.rot, p.filter]);
  if (p.key === key && p.out) return p.out;
  const warped = Imaging.rotate(Imaging.warp(p.src, p.quad, 2000), p.rot);
  p.out = Imaging.filter(warped, p.filter); p.key = key;
  return p.out;
}
function openReview(idx = 0) {
  if (!state.scan.pages.length) { show(state.scan.targetDoc ? 'editor' : 'home'); return; }
  state.review.idx = clamp(idx, 0, state.scan.pages.length - 1); state.review.crop = false;
  show('review'); renderReview();
}
async function renderReview() {
  const { idx, crop } = state.review, pages = state.scan.pages, p = pages[idx];
  $('#reviewTitle').textContent = `Page ${idx + 1} of ${pages.length}`;
  $('.page-arrow.left').classList.toggle('hidden', idx === 0);
  $('.page-arrow.right').classList.toggle('hidden', idx >= pages.length - 1);
  $('#cropToolBtn').classList.toggle('on', crop);
  $('#filterStrip').classList.toggle('hidden', crop);
  const cv = $('#reviewCanvas'), svg = $('#cropSvg');
  if (crop) {
    const s = Imaging.downscale(p.src, 1400);
    cv.width = s.width; cv.height = s.height; cv.getContext('2d').drawImage(s, 0, 0);
    svg.classList.remove('hidden'); fitReviewCanvas(); drawCrop();
  } else {
    svg.classList.add('hidden');
    $('#reviewBusy').classList.remove('hidden'); await nextFrame();
    const out = await processPage(p);
    if (state.review.idx !== idx || state.review.crop) return;
    cv.width = out.width; cv.height = out.height; cv.getContext('2d').drawImage(out, 0, 0);
    $('#reviewBusy').classList.add('hidden'); fitReviewCanvas();
    renderFilterStrip(p);
  }
}
function fitReviewCanvas() {
  const stage = $('#reviewStage'), cv = $('#reviewCanvas');
  const sw = stage.clientWidth - 48, sh = stage.clientHeight - 20;
  const s = Math.min(sw / cv.width, sh / cv.height);
  cv.style.width = Math.round(cv.width * s) + 'px'; cv.style.height = Math.round(cv.height * s) + 'px';
}
window.addEventListener('resize', () => { if ($('#view-review').classList.contains('active')) { fitReviewCanvas(); if (state.review.crop) drawCrop(); } });
function renderFilterStrip(p) {
  const strip = $('#filterStrip');
  let small = reviewSmall.get(p);
  if (!small || small.key !== JSON.stringify([p.quad, p.rot])) {
    small = { key: JSON.stringify([p.quad, p.rot]), c: Imaging.rotate(Imaging.warp(Imaging.downscale(p.src, 500), p.quad, 150), p.rot) };
    reviewSmall.set(p, small);
  }
  strip.innerHTML = FILTERS.map(f => `<button class="filter-chip ${p.filter === f.id ? 'active' : ''}" data-f="${f.id}"><canvas></canvas><span>${f.name}</span></button>`).join('');
  $$('.filter-chip', strip).forEach(b => {
    const c = $('canvas', b), r = Imaging.filter(small.c, b.dataset.f);
    c.width = r.width; c.height = r.height; c.getContext('2d').drawImage(r, 0, 0);
    b.onclick = () => { p.filter = b.dataset.f; renderReview(); };
  });
}
function drawCrop() {
  const p = state.scan.pages[state.review.idx], cv = $('#reviewCanvas'), svg = $('#cropSvg');
  const w = cv.clientWidth, h = cv.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const pts = p.quad.map(q => [q.x * w, q.y * h]);
  const poly = pts.map(q => q.join(',')).join(' ');
  svg.innerHTML = `<path class="shade" d="M0 0H${w}V${h}H0Z M${pts.map(q => q.join(' ')).join(' L')} Z"/>
    <polygon class="edge" points="${poly}"/>
    ${pts.map((q, i) => `<circle class="hit" data-i="${i}" cx="${q[0]}" cy="${q[1]}" r="26"/><circle class="handle" data-i="${i}" cx="${q[0]}" cy="${q[1]}" r="11" pointer-events="none"/>`).join('')}`;
  $$('.hit', svg).forEach(hn => hn.onpointerdown = e => {
    e.preventDefault(); hn.setPointerCapture(e.pointerId);
    const i = +hn.dataset.i;
    const move = ev => {
      const r = cv.getBoundingClientRect();
      p.quad[i] = { x: clamp((ev.clientX - r.left) / r.width, 0, 1), y: clamp((ev.clientY - r.top) / r.height, 0, 1) };
      p.quad = p.quad.slice(); drawCropLive();
    };
    const up = () => { hn.removeEventListener('pointermove', move); hn.removeEventListener('pointerup', up); hn.removeEventListener('pointercancel', up); drawCrop(); };
    hn.addEventListener('pointermove', move); hn.addEventListener('pointerup', up); hn.addEventListener('pointercancel', up);
  });
  function drawCropLive() {
    const pts2 = p.quad.map(q => [q.x * w, q.y * h]);
    $('.shade', svg).setAttribute('d', `M0 0H${w}V${h}H0Z M${pts2.map(q => q.join(' ')).join(' L')} Z`);
    $('.edge', svg).setAttribute('points', pts2.map(q => q.join(',')).join(' '));
    $$('circle', svg).forEach(c => { const j = +c.dataset.i; c.setAttribute('cx', pts2[j][0]); c.setAttribute('cy', pts2[j][1]); });
  }
}
function finishReview() {
  const pages = state.scan.pages;
  Promise.all(pages.map(processPage)).then(outs => {
    const docPages = outs.map(c => ({ id: uid(), canvas: c, url: c.toDataURL('image/jpeg', .92), overlays: [] }));
    let doc = state.scan.targetDoc;
    if (doc) { doc.pages.push(...docPages); doc.updated = new Date(); }
    else {
      const now = new Date();
      doc = { id: uid(), name: 'Scan ' + now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' at ' + now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), created: now, updated: now, pages: docPages };
      state.docs.unshift(doc);
    }
    state.scan.pages = [];
    openEditor(doc);
    toast(`${docPages.length} ${docPages.length === 1 ? 'page' : 'pages'} saved`);
  });
}

/* ---------------- Editor ---------------- */
function openEditor(doc) {
  state.editor.doc = doc; state.editor.sel = null;
  $('#editorTitle').textContent = doc.name;
  show('editor'); renderPages();
  $('#editorScroll').scrollTop = 0; updatePageChip(true);
}
function renderPages() {
  const doc = state.editor.doc, wrap = $('#pagesWrap');
  wrap.innerHTML = doc.pages.map((p, i) => `<div class="page" data-pid="${p.id}" style="aspect-ratio:${p.canvas.width}/${p.canvas.height}">
      <img class="base" src="${p.url}" alt="Page ${i + 1}" draggable="false"><div class="page-num">${i + 1}</div></div>`).join('');
  doc.pages.forEach(p => p.overlays.forEach(o => mountOverlay(p, o)));
  $$('.page', wrap).forEach(el => el.addEventListener('pointerdown', e => { if (e.target === el || e.target.classList.contains('base')) select(null); }));
}
function pageEl(p) { return $(`.page[data-pid="${p.id}"]`); }
function mountOverlay(p, o) {
  const el = document.createElement('div'); el.className = 'ov'; el.dataset.oid = o.id;
  el.innerHTML = `<img src="${o.url}" alt="${o.kind}" draggable="false"><span class="h rotate"><i data-lucide="rotate-cw"></i></span><span class="h resize"><i data-lucide="move-diagonal-2"></i></span>`;
  pageEl(p).appendChild(el); styleOverlay(o, el); icons();
  bindOverlay(p, o, el);
}
function styleOverlay(o, el = $(`.ov[data-oid="${o.id}"]`)) {
  if (!el) return;
  el.style.left = o.x * 100 + '%'; el.style.top = o.y * 100 + '%'; el.style.width = o.w * 100 + '%';
  el.style.transform = `translate(-50%,-50%) rotate(${o.rot}deg)`; el.style.opacity = o.opacity;
}
function bindOverlay(p, o, el) {
  const pageNode = () => pageEl(p);
  el.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    select({ p, o });
    const r = pageNode().getBoundingClientRect();
    const mode = e.target.closest('.resize') ? 'resize' : e.target.closest('.rotate') ? 'rotate' : 'move';
    const cx = r.left + o.x * r.width, cy = r.top + o.y * r.height;
    const start = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y, w: o.w, d: Math.hypot(e.clientX - cx, e.clientY - cy) || 1 };
    el.setPointerCapture(e.pointerId); hideMenu();
    const move = ev => {
      if (mode === 'move') { o.x = clamp(start.ox + (ev.clientX - start.x) / r.width, 0, 1); o.y = clamp(start.oy + (ev.clientY - start.y) / r.height, 0, 1); }
      else if (mode === 'resize') { o.w = clamp(start.w * Math.hypot(ev.clientX - cx, ev.clientY - cy) / start.d, .04, 1.2); }
      else { let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90; if (a > 180) a -= 360; if (Math.abs(a) < 4) a = 0; o.rot = Math.round(a); }
      styleOverlay(o, el);
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); showMenu(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}
function select(s) {
  state.editor.sel = s;
  $$('.ov').forEach(el => el.classList.toggle('sel', !!s && el.dataset.oid === s.o.id));
  s ? showMenu() : hideMenu();
}
function hideMenu() { $('.ov-menu')?.remove(); }
function showMenu() {
  hideMenu(); const s = state.editor.sel; if (!s) return;
  const pn = pageEl(s.p); if (!pn) return;
  const pw = pn.clientWidth, ph = pn.clientHeight;
  const halfH = (s.o.w * pw * s.o.aspect) / 2;
  const m = document.createElement('div'); m.className = 'ov-menu glass';
  m.style.left = clamp(s.o.x * pw, 110, pw - 110) + 'px';
  let top = s.o.y * ph - halfH - 56;
  if (top < 50) top = s.o.y * ph + halfH + 78;
  m.style.top = top + 'px';
  m.innerHTML = `<button data-m="dup"><i data-lucide="copy"></i>Duplicate</button><button data-m="fade"><i data-lucide="droplet"></i>${s.o.opacity < 1 ? 'Solid' : 'Faded'}</button><button data-m="del" class="danger"><i data-lucide="trash-2"></i>Delete</button>`;
  m.addEventListener('pointerdown', e => e.stopPropagation());
  pn.appendChild(m); icons();
  const mw = m.offsetWidth; m.style.left = clamp(s.o.x * pw, mw / 2 + 4, Math.max(mw / 2 + 4, pw - mw / 2 - 4)) + 'px';
  $$('button', m).forEach(b => b.onclick = () => {
    const { p, o } = s;
    if (b.dataset.m === 'del') { p.overlays = p.overlays.filter(x => x !== o); $(`.ov[data-oid="${o.id}"]`)?.remove(); select(null); }
    if (b.dataset.m === 'dup') { const n = { ...o, id: uid(), x: clamp(o.x + .05, 0, 1), y: clamp(o.y + .04, 0, 1) }; p.overlays.push(n); mountOverlay(p, n); select({ p, o: n }); }
    if (b.dataset.m === 'fade') { o.opacity = o.opacity < 1 ? 1 : .72; styleOverlay(o); showMenu(); }
    touchDoc();
  });
}
document.addEventListener('keydown', e => {
  const s = state.editor.sel;
  if (!s || !$('#view-editor').classList.contains('active') || currentSheet || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { s.p.overlays = s.p.overlays.filter(x => x !== s.o); $(`.ov[data-oid="${s.o.id}"]`)?.remove(); select(null); }
  if (e.key === 'Escape') select(null);
});
$('#editorScroll').addEventListener('pointerdown', e => { if (e.target.id === 'editorScroll' || e.target.id === 'pagesWrap') select(null); });
function currentPageIndex() {
  const sc = $('#editorScroll'), mid = sc.getBoundingClientRect().top + sc.clientHeight * .45;
  let best = 0, bd = 1e9;
  $$('.page', sc).forEach((el, i) => { const r = el.getBoundingClientRect(); const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0; if (d < bd) { bd = d; best = i; } });
  return best;
}
let chipT;
function updatePageChip(force) {
  const doc = state.editor.doc; if (!doc) return;
  const chip = $('#pageChip'); chip.textContent = `${currentPageIndex() + 1} / ${doc.pages.length}`;
  if (doc.pages.length < 2 && !force) return;
  if (doc.pages.length < 2) { chip.classList.remove('show'); return; }
  chip.classList.add('show'); clearTimeout(chipT); chipT = setTimeout(() => chip.classList.remove('show'), 1300);
}
$('#editorScroll').addEventListener('scroll', () => updatePageChip());
function touchDoc() { if (state.editor.doc) state.editor.doc.updated = new Date(); }

function placeOverlay(kind, canvas, { rot = 0, w } = {}) {
  const doc = state.editor.doc; if (!doc) return;
  const i = currentPageIndex(), p = doc.pages[i], pn = pageEl(p);
  const sc = $('#editorScroll'), r = pn.getBoundingClientRect(), sr = sc.getBoundingClientRect();
  const viewMid = sr.top + sc.clientHeight * .5;
  const y = clamp((viewMid - r.top) / r.height, .12, .88);
  const aspect = canvas.height / canvas.width;
  const o = { id: uid(), kind, url: canvas.toDataURL('image/png'), aspect, x: kind === 'signature' ? .68 : .5, y: kind === 'signature' ? Math.max(y, .5) : y,
    w: w || (kind === 'signature' ? .3 : kind === 'text' ? Math.min(.5, .045 / aspect * 1.6) : aspect > .8 ? .24 : .34), rot, opacity: 1 };
  for (let k = 0; k < 6 && p.overlays.some(e => Math.abs(e.x - o.x) < .2 && Math.abs(e.y - o.y) < .07); k++) o.y = clamp(o.y + .09, .08, .94);
  if (kind === 'text') o.w = clamp(canvas.width / 96 * .028, .08, .8);
  const img = new Image(); img.src = o.url; o.img = img;
  p.overlays.push(o); mountOverlay(p, o); select({ p, o }); touchDoc();
}

/* ---------------- Signature ---------------- */
class Pad {
  constructor(canvas) {
    this.c = canvas; this.strokes = []; this.color = INK[0]; this.dpr = Math.min(3, devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect(); canvas.width = r.width * this.dpr; canvas.height = r.height * this.dpr;
    this.x = canvas.getContext('2d'); this.x.lineCap = 'round'; this.x.lineJoin = 'round';
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => canvas.addEventListener(t, () => this.cur = null));
    this.onchange = () => {};
  }
  pt(e) { const r = this.c.getBoundingClientRect(); return { x: (e.clientX - r.left) * this.dpr, y: (e.clientY - r.top) * this.dpr, t: performance.now() }; }
  down(e) { e.preventDefault(); this.c.setPointerCapture(e.pointerId); const p = this.pt(e); this.cur = { pts: [p], segs: [], w: 3.2 * this.dpr }; this.strokes.push(this.cur); this.dot(p); this.onchange(); }
  move(e) {
    if (!this.cur) return; e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      const p = this.pt(ev), pts = this.cur.pts, prev = pts[pts.length - 1];
      const d = Math.hypot(p.x - prev.x, p.y - prev.y); if (d < 1.5 * this.dpr) continue;
      const v = d / this.dpr / Math.max(1, p.t - prev.t);
      const max = 4.2 * this.dpr, min = 1.3 * this.dpr;
      const target = clamp(max - v * 1.6 * this.dpr, min, max);
      const w = this.cur.w * .65 + target * .35; this.cur.w = w;
      pts.push(p);
      if (pts.length >= 3) {
        const a = pts[pts.length - 3], b = pts[pts.length - 2], c = p;
        const seg = { x0: (a.x + b.x) / 2, y0: (a.y + b.y) / 2, cx: b.x, cy: b.y, x1: (b.x + c.x) / 2, y1: (b.y + c.y) / 2, w };
        this.cur.segs.push(seg); this.drawSeg(this.x, seg, this.color);
      }
    }
  }
  dot(p) { this.x.fillStyle = this.color; this.x.beginPath(); this.x.arc(p.x, p.y, 1.6 * this.dpr, 0, Math.PI * 2); this.x.fill(); this.cur.dot = p; }
  drawSeg(x, s, color) { x.strokeStyle = color; x.lineWidth = s.w; x.beginPath(); x.moveTo(s.x0, s.y0); x.quadraticCurveTo(s.cx, s.cy, s.x1, s.y1); x.stroke(); }
  redraw(ctx = this.x, color = this.color) {
    ctx.clearRect(0, 0, this.c.width, this.c.height); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const st of this.strokes) {
      if (!st.segs.length && st.dot) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(st.dot.x, st.dot.y, 1.6 * this.dpr, 0, Math.PI * 2); ctx.fill(); }
      st.segs.forEach(s => this.drawSeg(ctx, s, color));
    }
  }
  setColor(c) { this.color = c; this.redraw(); }
  undo() { this.strokes.pop(); this.redraw(); this.onchange(); }
  clear() { this.strokes = []; this.redraw(); this.onchange(); }
  export() { if (!this.strokes.length) return null; const c = Imaging.makeCanvas(this.c.width, this.c.height); this.redraw(c.getContext('2d')); return Imaging.trim(c, 10); }
}

function swatchesHTML(colors, sel, attr = 'data-color') { return `<div class="swatches">${colors.map(c => `<button class="swatch ${c === sel ? 'on' : ''}" ${attr}="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div>`; }

function openSignatureCreator({ place }) {
  const FONTS = [`'Great Vibes'`, `'Dancing Script'`, `Allura`, `Caveat`];
  let mode = 'draw', pad, font = FONTS[0], color = INK[0];
  const el = openSheet({
    title: 'New Signature',
    confirm: { icon: 'check', label: 'Save signature', onClick: () => {
      let c = null;
      if (mode === 'draw') c = pad.export();
      else { const name = $('#sigName', el).value.trim(); if (name) c = Stamps.signatureText(name, font, color); }
      if (!c) { toast(mode === 'draw' ? 'Draw your signature first' : 'Type your name first', 'info'); return; }
      const sig = { id: uid(), canvas: c, url: c.toDataURL('image/png') };
      state.signatures.unshift(sig); closeSheet();
      if (place) placeOverlay('signature', c); else { renderLibrary(); toast('Signature saved'); }
    } },
    body: `<div class="segmented" role="tablist"><button class="on" data-mode="draw">Draw</button><button data-mode="type">Type</button></div>
      <div data-panel="draw">
        <div class="sig-pad-wrap"><div class="sig-baseline"></div><div class="sig-hint">Sign above the line</div><canvas id="sigPad"></canvas></div>
        <div class="pad-actions">${swatchesHTML(INK, color)}
          <div style="display:flex;gap:4px"><button class="btn-plain" data-undo>Undo</button><button class="btn-plain" data-clear>Clear</button></div></div>
      </div>
      <div data-panel="type" class="hidden">
        <input id="sigName" class="text-field" placeholder="Your full name" autocomplete="name">
        <div class="field-label">Style</div>
        <div class="font-list">${FONTS.map((f, i) => `<button class="font-opt ${i === 0 ? 'on' : ''}" data-font="${esc(f)}" style="font-family:${f}">Your Name</button>`).join('')}</div>
        <div class="field-label">Ink</div>${swatchesHTML(INK, color)}
      </div>`,
    onMount: el => {
      requestAnimationFrame(() => { pad = new Pad($('#sigPad', el)); pad.onchange = () => $('.sig-hint', el).style.opacity = pad.strokes.length ? 0 : 1; });
      $$('[data-mode]', el).forEach(b => b.onclick = () => {
        mode = b.dataset.mode; $$('[data-mode]', el).forEach(x => x.classList.toggle('on', x === b));
        $$('[data-panel]', el).forEach(p => p.classList.toggle('hidden', p.dataset.panel !== mode));
        if (mode === 'type') setTimeout(() => $('#sigName', el).focus(), 50);
      });
      $('[data-undo]', el).onclick = () => pad.undo();
      $('[data-clear]', el).onclick = () => pad.clear();
      $$('[data-color]', el).forEach(b => b.onclick = () => {
        color = b.dataset.color; $$('[data-color]', el).forEach(x => x.classList.toggle('on', x.dataset.color === color));
        pad && pad.setColor(color); $$('.font-opt', el).forEach(f => f.style.color = color);
      });
      $('#sigName', el).oninput = e => $$('.font-opt', el).forEach(f => f.textContent = e.target.value || 'Your Name');
      $$('.font-opt', el).forEach(b => b.onclick = () => { font = b.dataset.font; $$('.font-opt', el).forEach(x => x.classList.toggle('on', x === b)); });
    },
  });
}
function openSignaturePicker() {
  if (!state.signatures.length) return openSignatureCreator({ place: true });
  openSheet({
    title: 'Add Signature',
    body: `<div class="pick-grid"><button class="pick-item add" data-new><i data-lucide="plus"></i>New Signature</button>
      ${state.signatures.map(s => `<button class="pick-item sig" data-sig="${s.id}"><img src="${s.url}" alt="Saved signature"></button>`).join('')}</div>`,
    onMount: el => {
      $('[data-new]', el).onclick = () => openSignatureCreator({ place: true });
      $$('[data-sig]', el).forEach(b => b.onclick = () => { const s = state.signatures.find(x => x.id === b.dataset.sig); closeSheet(); placeOverlay('signature', s.canvas); });
    },
  });
}

/* ---------------- Stamps ---------------- */
async function fontsReady() { try { await Promise.all(['700 40px Oswald', '500 40px Oswald'].map(f => document.fonts.load(f))); } catch (e) {} }
async function openStampSheet({ place }) {
  await fontsReady();
  const presets = Stamps.presets().map(p => ({ spec: p, c: Stamps.render(p) }));
  const spec = { shape: 'rect', main: 'APPROVED', ring: 'Your Company Name', sub: '', date: true, color: STAMP_COLORS[0], texture: true };
  let upload = null, removeBg = true, tab = 'presets';
  const finish = (c, rot = 0, save = false) => {
    if (save) state.stamps.unshift({ id: uid(), canvas: c, url: c.toDataURL('image/png'), rot });
    closeSheet();
    if (place) placeOverlay('stamp', c, { rot }); else { renderLibrary(); toast('Stamp saved'); }
  };
  const el = openSheet({
    title: place ? 'Add Stamp' : 'New Stamp',
    body: `<div class="segmented"><button class="on" data-tab="presets">Presets</button><button data-tab="custom">Custom</button><button data-tab="image">Image</button></div>
      <div data-panel="presets">
        ${state.stamps.length && place ? `<div class="field-label">My Stamps</div><div class="pick-grid">${state.stamps.map(s => `<button class="pick-item" data-mine="${s.id}"><img src="${s.url}" alt="My stamp"></button>`).join('')}</div><div class="field-label">Presets</div>` : ''}
        <div class="pick-grid">${presets.map((p, i) => `<button class="pick-item" data-preset="${i}"><img src="${p.c.toDataURL()}" alt="${esc(p.spec.main)} stamp"></button>`).join('')}</div>
      </div>
      <div data-panel="custom" class="hidden">
        <div class="stamp-preview"><img id="stampPrev" alt="Stamp preview"></div>
        <div class="segmented" style="margin-top:14px"><button class="on" data-shape="rect">Rectangle</button><button data-shape="round">Round Seal</button><button data-shape="oval">Oval</button></div>
        <input class="text-field" data-k="main" value="APPROVED" placeholder="Main text" maxlength="22">
        <div data-ringwrap class="hidden"><div class="field-label">Ring Text</div><input class="text-field" data-k="ring" value="Your Company Name" placeholder="Company or organisation" maxlength="36"></div>
        <div class="field-label">Second Line</div><input class="text-field" data-k="sub" placeholder="Optional, e.g. Accounts Dept." maxlength="30">
        <div class="toggle-row">Add today's date<label class="switch"><input type="checkbox" data-k="date" checked><span></span></label></div>
        <div class="toggle-row">Ink texture<label class="switch"><input type="checkbox" data-k="texture" checked><span></span></label></div>
        <div class="field-label">Color</div>${swatchesHTML(STAMP_COLORS, spec.color)}
        <button class="btn-filled sheet-cta" data-add-custom>${place ? 'Add Stamp' : 'Save Stamp'}</button>
      </div>
      <div data-panel="image" class="hidden">
        <div class="stamp-preview" id="uploadPrev"><span style="color:var(--label-2);font-size:15px">Upload a photo of your stamp or company seal</span></div>
        <button class="btn-tinted sheet-cta" data-pick><i data-lucide="image-plus"></i>Choose Image</button>
        <div class="toggle-row">Remove white background<label class="switch"><input type="checkbox" data-removebg checked><span></span></label></div>
        <button class="btn-filled sheet-cta" data-add-upload disabled>${place ? 'Add Stamp' : 'Save Stamp'}</button>
      </div>`,
    onMount: el => {
      $$('[data-tab]', el).forEach(b => b.onclick = () => { tab = b.dataset.tab; $$('[data-tab]', el).forEach(x => x.classList.toggle('on', x === b)); $$('[data-panel]', el).forEach(p => p.classList.toggle('hidden', p.dataset.panel !== tab)); });
      $$('[data-preset]', el).forEach(b => b.onclick = () => { const p = presets[+b.dataset.preset]; finish(p.c, p.spec.rot, !place); });
      $$('[data-mine]', el).forEach(b => b.onclick = () => { const s = state.stamps.find(x => x.id === b.dataset.mine); finish(s.canvas, s.rot || 0); });
      const build = () => { const sub = [spec.sub, spec.date ? Stamps.today() : ''].filter(Boolean).join(' · '); return Stamps.render({ ...spec, main: (spec.main || 'STAMP').toUpperCase(), sub }); };
      const refresh = () => { $('#stampPrev', el).src = build().toDataURL(); $('[data-ringwrap]', el).classList.toggle('hidden', spec.shape === 'rect'); };
      $$('[data-shape]', el).forEach(b => b.onclick = () => { spec.shape = b.dataset.shape; $$('[data-shape]', el).forEach(x => x.classList.toggle('on', x === b)); refresh(); });
      $$('[data-k]', el).forEach(i => i.oninput = i.onchange = () => { spec[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; refresh(); });
      $$('[data-color]', el).forEach(b => b.onclick = () => { spec.color = b.dataset.color; $$('[data-color]', el).forEach(x => x.classList.toggle('on', x === b)); refresh(); });
      $('[data-add-custom]', el).onclick = () => finish(build(), spec.shape === 'rect' ? -5 : 0, true);
      refresh();
      const showUpload = () => {
        if (!upload) return;
        const c = removeBg ? Imaging.removeWhite(upload) : upload;
        $('#uploadPrev', el).innerHTML = `<img src="${c.toDataURL()}" alt="Uploaded stamp">`;
        $('[data-add-upload]', el).disabled = false; return c;
      };
      $('[data-pick]', el).onclick = () => { const f = $('#fileStamp'); f.onchange = async () => { const [c] = await loadFiles(f.files); f.value = ''; if (c) { upload = Imaging.downscale(c, 900); showUpload(); } }; f.click(); };
      $('[data-removebg]', el).onchange = e => { removeBg = e.target.checked; showUpload(); };
      $('[data-add-upload]', el).onclick = () => { const c = Imaging.trim(removeBg ? Imaging.removeWhite(upload) : upload, 4) || upload; finish(c, 0, true); };
    },
  });
}

/* ---------------- Text ---------------- */
function openTextSheet() {
  let color = INK[0];
  openSheet({
    title: 'Add Text',
    body: `<input class="text-field" id="txtIn" placeholder="Type text" maxlength="60">
      <div class="field-label">Quick Insert</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${[Stamps.today().replace(/\b\w+\b/g, w => w[0] + w.slice(1).toLowerCase()), new Date().toLocaleDateString(), 'Approved', 'Received with thanks', 'N/A'].map(t => `<button class="btn-tinted" style="height:36px;padding:0 14px;font-size:15px" data-q="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <div class="field-label">Color</div>${swatchesHTML(INK, color)}
      <button class="btn-filled sheet-cta" data-add>Add Text</button>`,
    onMount: el => {
      setTimeout(() => $('#txtIn', el).focus(), 60);
      $$('[data-q]', el).forEach(b => b.onclick = () => { $('#txtIn', el).value = b.dataset.q; });
      $$('[data-color]', el).forEach(b => b.onclick = () => { color = b.dataset.color; $$('[data-color]', el).forEach(x => x.classList.toggle('on', x === b)); });
      const add = () => { const t = $('#txtIn', el).value.trim(); if (!t) return toast('Type some text first', 'info'); closeSheet(); placeOverlay('text', Stamps.textLabel(t, { color })); };
      $('[data-add]', el).onclick = add;
      $('#txtIn', el).onkeydown = e => { if (e.key === 'Enter') add(); };
    },
  });
}

/* ---------------- Rename ---------------- */
function renameDoc(doc) {
  openSheet({
    title: 'Rename',
    confirm: { icon: 'check', label: 'Save name', onClick: el => { const v = $('#renameIn', el).value.trim(); if (v) { doc.name = v; doc.updated = new Date(); } closeSheet(); $('#editorTitle').textContent = doc.name; renderHome(); } },
    body: `<input class="text-field" id="renameIn" value="${esc(doc.name)}" maxlength="80">`,
    onMount: el => { const i = $('#renameIn', el); setTimeout(() => { i.focus(); i.select(); }, 60); i.onkeydown = e => { if (e.key === 'Enter') $('[data-confirm]', el).click(); }; },
  });
}

/* ---------------- Rendering & export ---------------- */
async function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; }); }
async function renderPage(p, width) {
  const s = width ? width / p.canvas.width : 1;
  const c = Imaging.makeCanvas(p.canvas.width * s, p.canvas.height * s), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(p.canvas, 0, 0, c.width, c.height);
  for (const o of p.overlays) {
    const img = o.img && o.img.complete ? o.img : await loadImg(o.url);
    const w = o.w * c.width, h = w * o.aspect;
    x.save(); x.globalAlpha = o.opacity; x.translate(o.x * c.width, o.y * c.height); x.rotate(o.rot * Math.PI / 180);
    x.drawImage(img, -w / 2, -h / 2, w, h); x.restore();
  }
  return c;
}
async function updateThumb(doc) { if (doc && doc.pages[0]) doc.thumb = (await renderPage(doc.pages[0], 360)).toDataURL('image/jpeg', .8); }
const safeName = n => n.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Document';
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
async function buildPDF(doc) {
  const { jsPDF } = window.jspdf;
  let pdf;
  for (const p of doc.pages) {
    const c = await renderPage(p, Math.min(p.canvas.width, 1800));
    const W = 595.28, H = W * c.height / c.width;
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation: H >= W ? 'portrait' : 'landscape', compress: true });
    else pdf.addPage([W, H], H >= W ? 'portrait' : 'landscape');
    pdf.addImage(c.toDataURL('image/jpeg', .88), 'JPEG', 0, 0, W, H, undefined, 'FAST');
  }
  pdf.setProperties({ title: doc.name, creator: 'Scan & Sign' });
  return pdf.output('blob');
}
async function exportPDF(doc) {
  toast('Preparing PDF…', 'loader');
  const blob = await buildPDF(doc); download(blob, safeName(doc.name) + '.pdf'); toast('PDF downloaded');
}
async function exportImages(doc) {
  for (let i = 0; i < doc.pages.length; i++) {
    const c = await renderPage(doc.pages[i]);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .92));
    download(blob, `${safeName(doc.name)}${doc.pages.length > 1 ? ' - ' + (i + 1) : ''}.jpg`);
    await new Promise(r => setTimeout(r, 250));
  }
  toast(doc.pages.length > 1 ? 'Images downloaded' : 'Image downloaded');
}
async function sharePDF(doc) {
  try {
    const blob = await buildPDF(doc);
    const file = new File([blob], safeName(doc.name) + '.pdf', { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: doc.name });
    else { download(blob, file.name); toast('Sharing unavailable — PDF downloaded', 'info'); }
  } catch (e) { if (e.name !== 'AbortError') toast('Could not share', 'alert-circle'); }
}
function openExport() {
  const doc = state.editor.doc; select(null);
  const n = doc.pages.reduce((a, p) => a + p.overlays.length, 0);
  actionSheet('Export', [
    { icon: 'file-text', label: 'Save as PDF', sub: `${doc.pages.length} ${doc.pages.length === 1 ? 'page' : 'pages'}${n ? ` · ${n} signature/stamp${n === 1 ? '' : 's'} applied` : ''}`, color: '#FF3B30', run: () => exportPDF(doc) },
    { icon: 'image', label: 'Save as Images', sub: 'High-quality JPEG per page', color: '#34C759', run: () => exportImages(doc) },
    { icon: 'share', label: 'Share PDF…', sub: 'Mail, Messages, Files and more', color: '#007AFF', run: () => sharePDF(doc) },
  ]);
}

/* ---------------- Actions ---------------- */
const actions = {
  'scan': () => openScanner(),
  'import-home': () => { importMode = 'home'; $('#fileImport').click(); },
  'import-scan': () => { importMode = 'scan'; $('#fileImport').click(); },
  'capture-file': () => { importMode = 'scan'; $('#fileCapture').click(); },
  'close-scanner': () => { stopCamera(); state.scan.pages = []; show(state.scan.targetDoc ? 'editor' : 'home'); if (state.scan.targetDoc) renderPages(); },
  'finish-scan': () => { if (!state.scan.pages.length) return; stopCamera(); openReview(0); },
  'review-prev': () => { state.review.idx--; state.review.crop = false; renderReview(); },
  'review-next': () => { state.review.idx++; state.review.crop = false; renderReview(); },
  'review-crop': () => { state.review.crop = !state.review.crop; renderReview(); },
  'review-rotate': () => { const p = state.scan.pages[state.review.idx]; p.rot = (p.rot + 90) % 360; state.review.crop = false; renderReview(); },
  'review-auto': () => { const p = state.scan.pages[state.review.idx]; const q = Imaging.detectQuad(p.src); p.quad = q || Imaging.fullQuad(); toast(q ? 'Edges detected' : 'No edges found — using full image', q ? 'sparkles' : 'info'); renderReview(); },
  'review-delete': () => { state.scan.pages.splice(state.review.idx, 1); if (!state.scan.pages.length) { openScanner(state.scan.targetDoc); return; } openReview(Math.min(state.review.idx, state.scan.pages.length - 1)); },
  'review-retake': () => { const keep = state.scan.pages; keep.splice(state.review.idx, 1); const t = state.scan.targetDoc; openScanner(t).then(() => {}); state.scan.pages = keep; updateThumbStack(); },
  'review-done': () => finishReview(),
  'editor-back': async () => { select(null); const d = state.editor.doc; await updateThumb(d); state.editor.doc = null; show('home'); $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'home')); },
  'rename-doc': () => renameDoc(state.editor.doc),
  'export': () => openExport(),
  'add-signature': () => { select(null); openSignaturePicker(); },
  'add-stamp': () => { select(null); openStampSheet({ place: true }); },
  'add-text': () => { select(null); openTextSheet(); },
  'add-pages': () => { select(null); openScanner(state.editor.doc); },
  'new-signature': () => openSignatureCreator({ place: false }),
  'new-stamp': () => openStampSheet({ place: false }),
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
  const fn = actions[b.dataset.action]; if (fn) fn();
});

icons(); renderHome();
// load stamp + signature fonts early so canvases render with them
setTimeout(() => ['700 40px Oswald', '500 40px Oswald', '40px "Great Vibes"', '600 40px "Dancing Script"', '40px Allura', '600 40px Caveat'].forEach(f => document.fonts.load(f).catch(() => {})), 300);
})();
