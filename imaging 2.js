/* Image processing: edge detection, perspective warp, scan filters */
const Imaging = (() => {
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  function downscale(src, maxSide) {
    const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
    const s = Math.min(1, maxSide / Math.max(sw, sh));
    const c = makeCanvas(sw * s, sh * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  // ---- Document edge detection (Otsu + largest bright component + extreme corners)
  function detectQuad(src) {
    const c = downscale(src, 220);
    const w = c.width, h = c.height;
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = d[i*4]*0.299 + d[i*4+1]*0.587 + d[i*4+2]*0.114;
    // box blur
    const b = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += g[yy*w+xx]; n++; }
      }
      b[y*w+x] = s / n;
    }
    // Otsu
    const hist = new Array(256).fill(0);
    for (let i = 0; i < b.length; i++) hist[b[i] | 0]++;
    const total = b.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break;
      sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = t; }
    }
    const bin = new Uint8Array(w * h);
    for (let i = 0; i < b.length; i++) bin[i] = b[i] > thr ? 1 : 0;
    // largest component
    const lab = new Int32Array(w * h); let bestLab = 0, bestSize = 0, cur = 0;
    const stack = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (!bin[i] || lab[i]) continue;
      cur++; let sp = 0, size = 0; stack[sp++] = i; lab[i] = cur;
      while (sp) {
        const p = stack[--sp]; size++;
        const x = p % w, y = (p / w) | 0;
        if (x > 0 && bin[p-1] && !lab[p-1]) { lab[p-1] = cur; stack[sp++] = p-1; }
        if (x < w-1 && bin[p+1] && !lab[p+1]) { lab[p+1] = cur; stack[sp++] = p+1; }
        if (y > 0 && bin[p-w] && !lab[p-w]) { lab[p-w] = cur; stack[sp++] = p-w; }
        if (y < h-1 && bin[p+w] && !lab[p+w]) { lab[p+w] = cur; stack[sp++] = p+w; }
      }
      if (size > bestSize) { bestSize = size; bestLab = cur; }
    }
    const frac = bestSize / (w * h);
    if (frac < 0.12 || frac > 0.97) return null;
    let tl = [0,0,1e9], tr = [0,0,-1e9], br = [0,0,-1e9], bl = [0,0,1e9];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (lab[y*w+x] !== bestLab) continue;
      const s = x + y, df = x - y;
      if (s < tl[2]) tl = [x, y, s];
      if (s > br[2]) br = [x, y, s];
      if (df > tr[2]) tr = [x, y, df];
      if (df < bl[2]) bl = [x, y, df];
    }
    const pts = [tl, tr, br, bl].map(p => ({ x: (p[0] + .5) / w, y: (p[1] + .5) / h }));
    const area = Math.abs(polyArea(pts));
    if (area < 0.1 || !isConvex(pts)) return null;
    // reject when component is essentially the full frame (background)
    const touches = pts.filter(p => p.x < .02 || p.x > .98 || p.y < .02 || p.y > .98).length;
    if (touches >= 4) return null;
    return pts;
  }
  function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i].x * p[j].y - p[j].x * p[i].y; } return a / 2; }
  function isConvex(p) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i+1)%4], c = p[(i+2)%4];
      const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(z) < 1e-6) continue;
      const s = Math.sign(z); if (!sign) sign = s; else if (s !== sign) return false;
    }
    return true;
  }
  function defaultQuad() { return [{x:.06,y:.05},{x:.94,y:.05},{x:.94,y:.95},{x:.06,y:.95}]; }
  function fullQuad() { return [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]; }

  // ---- Perspective warp (unit square -> quad homography)
  function warp(src, quadN, maxSide = 2000) {
    const sw = src.width, sh = src.height;
    const q = quadN.map(p => ({ x: p.x * sw, y: p.y * sh }));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    let W = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
    let H = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
    const s = Math.min(1, maxSide / Math.max(W, H)); W = Math.max(2, Math.round(W * s)); H = Math.max(2, Math.round(H * s));
    const [p0, p1, p2, p3] = q;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
    let g = 0, hh = 0;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
      const det = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / det; hh = (dx1 * dy3 - dx3 * dy1) / det;
    }
    const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + hh * p3.x, c = p0.x;
    const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + hh * p3.y, f = p0.y;
    const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const out = makeCanvas(W, H); const octx = out.getContext('2d');
    const od = octx.createImageData(W, H); const o = od.data;
    for (let y = 0; y < H; y++) {
      const v = (y + .5) / H;
      for (let x = 0; x < W; x++) {
        const u = (x + .5) / W;
        const den = g * u + hh * v + 1;
        let sx = (a * u + b * v + c) / den - .5, sy = (d * u + e * v + f) / den - .5;
        if (sx < 0) sx = 0; if (sy < 0) sy = 0; if (sx > sw - 1.001) sx = sw - 1.001; if (sy > sh - 1.001) sy = sh - 1.001;
        const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        const oi = (y * W + x) * 4;
        for (let k = 0; k < 3; k++) {
          const top = sd[i00+k] + (sd[i10+k] - sd[i00+k]) * fx;
          const bot = sd[i01+k] + (sd[i11+k] - sd[i01+k]) * fx;
          o[oi+k] = top + (bot - top) * fy;
        }
        o[oi+3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  function rotate(src, deg) {
    deg = ((deg % 360) + 360) % 360;
    if (!deg) return src;
    const swap = deg === 90 || deg === 270;
    const c = makeCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180);
    x.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }

  // ---- Filters
  function filter(src, kind) {
    const W = src.width, H = src.height;
    const out = makeCanvas(W, H); const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    if (kind === 'photo') return out;
    const id = ctx.getImageData(0, 0, W, H); const p = id.data;
    // background (paper) estimate via block maxima
    const B = Math.max(8, Math.round(Math.max(W, H) / 60));
    const bw = Math.ceil(W / B), bh = Math.ceil(H / B);
    let bg = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const vals = [];
      for (let y = by * B; y < Math.min(H, (by + 1) * B); y += 2) for (let x = bx * B; x < Math.min(W, (bx + 1) * B); x += 2) {
        const i = (y * W + x) * 4; vals.push(p[i]*.299 + p[i+1]*.587 + p[i+2]*.114);
      }
      vals.sort((m, n) => m - n);
      bg[by * bw + bx] = vals[Math.floor(vals.length * .9)] || 255;
    }
    // dilate + blur background map
    for (let pass = 0; pass < 3; pass++) {
      const nb = new Float32Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        let s = 0, n = 0, mx = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          const v = bg[yy * bw + xx]; s += v; n++; if (v > mx) mx = v;
        }
        nb[y * bw + x] = pass === 0 ? mx : s / n;
      }
      bg = nb;
    }
    const sample = (x, y) => {
      let fx = x / B - .5, fy = y / B - .5; if (fx < 0) fx = 0; if (fy < 0) fy = 0;
      if (fx > bw - 1) fx = bw - 1; if (fy > bh - 1) fy = bh - 1;
      const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(bw - 1, x0 + 1), y1 = Math.min(bh - 1, y0 + 1);
      const ax = fx - x0, ay = fy - y0;
      const t = bg[y0*bw+x0] + (bg[y0*bw+x1] - bg[y0*bw+x0]) * ax;
      const b2 = bg[y1*bw+x0] + (bg[y1*bw+x1] - bg[y1*bw+x0]) * ax;
      return t + (b2 - t) * ay;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const k = 255 / Math.max(60, sample(x, y));
      let r = Math.min(255, p[i] * k), g = Math.min(255, p[i+1] * k), b = Math.min(255, p[i+2] * k);
      // deepen ink
      r = 255 * Math.pow(r / 255, 1.6); g = 255 * Math.pow(g / 255, 1.6); b = 255 * Math.pow(b / 255, 1.6);
      if (kind === 'color') {
        const l = r*.299 + g*.587 + b*.114;
        r = l + (r - l) * 1.35; g = l + (g - l) * 1.35; b = l + (b - l) * 1.35;
        p[i] = r; p[i+1] = g; p[i+2] = b;
      } else {
        let l = r*.299 + g*.587 + b*.114;
        if (kind === 'bw') l = Math.max(0, Math.min(255, (l - 150) * 4.2 + 128));
        p[i] = p[i+1] = p[i+2] = l;
      }
    }
    ctx.putImageData(id, 0, 0);
    return out;
  }

  // ---- Trim transparent margins
  function trim(c, pad = 8) {
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const { width: w, height: h } = c; const d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y*w+x)*4+3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  // ---- Remove white background from uploaded stamp/signature images
  function removeWhite(src, strength = 1) {
    const c = makeCanvas(src.width, src.height); const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height); const p = id.data;
    for (let i = 0; i < p.length; i += 4) {
      const l = p[i]*.299 + p[i+1]*.587 + p[i+2]*.114;
      const a = Math.max(0, Math.min(1, (235 - l) / (90 / strength)));
      // un-premultiply against white so ink color stays saturated
      if (a > 0) { for (let k = 0; k < 3; k++) p[i+k] = Math.max(0, Math.min(255, 255 - (255 - p[i+k]) / a)); }
      p[i+3] = Math.round(p[i+3] * a);
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  return { makeCanvas, downscale, detectQuad, defaultQuad, fullQuad, warp, rotate, filter, trim, removeWhite };
})();
