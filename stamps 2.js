/* Stamp, signature-text and text-label renderers (all return transparent canvases) */
const Stamps = (() => {
  const C = (w, h) => Imaging.makeCanvas(w, h);
  const today = () => new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  function ink(c, amount = 1, seed = 1) {
    const x = c.getContext('2d');
    let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    x.save(); x.globalCompositeOperation = 'destination-out';
    const n = Math.round(c.width * c.height / 260 * amount);
    for (let i = 0; i < n; i++) {
      x.globalAlpha = rnd() * .55;
      x.beginPath(); x.arc(rnd() * c.width, rnd() * c.height, rnd() * 2.6 + .4, 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < 8 * amount; i++) {
      x.globalAlpha = .12 + rnd() * .2; x.lineWidth = 6 + rnd() * 16;
      x.beginPath(); const y = rnd() * c.height; x.moveTo(-10, y); x.lineTo(c.width + 10, y + (rnd() - .5) * 80); x.stroke();
    }
    x.restore();
    return c;
  }

  function fitFont(ctx, text, weight, family, maxW, start) {
    let size = start;
    do { ctx.font = `${weight} ${size}px ${family}`; size -= 2; } while (ctx.measureText(text).width > maxW && size > 10);
    return size + 2;
  }

  function rect({ main = 'APPROVED', sub = '', color = '#D7263D', texture = true, seed = 3 }) {
    const tmp = C(10, 10).getContext('2d');
    tmp.font = '700 128px Oswald, Impact, sans-serif';
    const tw = Math.min(1500, tmp.measureText(main).width);
    const w = Math.round(tw + 150), h = sub ? 300 : 230;
    const c = C(w, h), x = c.getContext('2d');
    x.strokeStyle = x.fillStyle = color; x.lineJoin = 'round';
    rr(x, 12, 12, w - 24, h - 24, 26); x.lineWidth = 14; x.stroke();
    rr(x, 34, 34, w - 68, h - 68, 14); x.lineWidth = 4; x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    fitFont(x, main, 700, 'Oswald, Impact, sans-serif', w - 120, 128);
    x.fillText(main, w / 2, sub ? h / 2 - 26 : h / 2 + 4);
    if (sub) { fitFont(x, sub, 500, 'Oswald, sans-serif', w - 140, 46); x.fillText(sub, w / 2, h / 2 + 68); }
    return texture ? ink(c, 1, seed) : c;
  }

  function round({ ring = 'YOUR COMPANY NAME', main = 'APPROVED', sub = '', color = '#1F4FBF', texture = true, seed = 5 }) {
    const S = 640, c = C(S, S), x = c.getContext('2d'), m = S / 2;
    x.strokeStyle = x.fillStyle = color;
    x.lineWidth = 14; x.beginPath(); x.arc(m, m, 300, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 4; x.beginPath(); x.arc(m, m, 278, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(m, m, 192, 0, Math.PI * 2); x.stroke();
    // ring text around the circle
    const text = (ring.toUpperCase() + '  ★  ').repeat(1);
    x.font = '700 50px Oswald, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const R = 236; const circ = 2 * Math.PI * R;
    let total = x.measureText(text).width;
    let fs = 50; while (total > circ * .96 && fs > 20) { fs -= 2; x.font = `700 ${fs}px Oswald, sans-serif`; total = x.measureText(text).width; }
    const spacing = (circ - total) / text.length;
    let ang = -Math.PI / 2 - (total + spacing * text.length) / R / 2;
    for (const ch of text) {
      const cw = x.measureText(ch).width + spacing; ang += cw / 2 / R;
      x.save(); x.translate(m + Math.cos(ang) * R, m + Math.sin(ang) * R); x.rotate(ang + Math.PI / 2); x.fillText(ch, 0, 0); x.restore();
      ang += cw / 2 / R;
    }
    // center band
    x.lineWidth = 4;
    x.beginPath(); x.moveTo(m - 170, m - 62); x.lineTo(m + 170, m - 62); x.moveTo(m - 170, m + 62); x.lineTo(m + 170, m + 62); x.stroke();
    fitFont(x, main, 700, 'Oswald, sans-serif', 330, 92);
    x.fillText(main, m, m + 4);
    x.font = '700 34px sans-serif'; x.fillText('★ ★ ★', m, m - 112);
    if (sub) { fitFont(x, sub, 500, 'Oswald, sans-serif', 230, 34); x.fillText(sub, m, m + 108); }
    return texture ? ink(c, .9, seed) : c;
  }

  function oval({ ring = 'OFFICIAL', main = 'RECEIVED', sub = '', color = '#0B7A43', texture = true, seed = 7 }) {
    const W = 760, H = 440, c = C(W, H), x = c.getContext('2d');
    x.strokeStyle = x.fillStyle = color;
    x.lineWidth = 14; x.beginPath(); x.ellipse(W/2, H/2, W/2 - 14, H/2 - 14, 0, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 4; x.beginPath(); x.ellipse(W/2, H/2, W/2 - 38, H/2 - 38, 0, 0, Math.PI * 2); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    fitFont(x, ring.toUpperCase(), 500, 'Oswald, sans-serif', 380, 40); x.fillText(ring.toUpperCase(), W/2, 112);
    fitFont(x, main, 700, 'Oswald, sans-serif', 560, 120); x.fillText(main, W/2, H/2 + 4);
    if (sub) { fitFont(x, sub, 500, 'Oswald, sans-serif', 380, 40); x.fillText(sub, W/2, H - 104); }
    return texture ? ink(c, 1, seed) : c;
  }

  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }

  function render(spec) { return spec.shape === 'round' ? round(spec) : spec.shape === 'oval' ? oval(spec) : rect(spec); }

  const presets = () => [
    { shape: 'rect', main: 'APPROVED', sub: today(), color: '#1E8E3E', rot: -6 },
    { shape: 'rect', main: 'PAID', sub: today(), color: '#D7263D', rot: -8 },
    { shape: 'oval', ring: 'Document', main: 'RECEIVED', sub: today(), color: '#1F4FBF', rot: 0 },
    { shape: 'round', ring: 'Your Company Name', main: 'SEAL', sub: 'EST. 2026', color: '#1F4FBF', rot: 0 },
    { shape: 'rect', main: 'CONFIDENTIAL', sub: '', color: '#D7263D', rot: -4 },
    { shape: 'rect', main: 'ORIGINAL', sub: '', color: '#1F4FBF', rot: -3 },
    { shape: 'round', ring: 'Verified Document', main: 'VERIFIED', sub: today(), color: '#6B2FB3', rot: 0 },
    { shape: 'rect', main: 'VOID', sub: '', color: '#3A3A3C', rot: -10 },
  ];

  function signatureText(text, font, color) {
    const size = 160;
    const tmp = C(10, 10).getContext('2d'); tmp.font = `${size}px ${font}`;
    const w = Math.ceil(tmp.measureText(text).width + size), h = Math.ceil(size * 1.8);
    const c = C(w, h), x = c.getContext('2d');
    x.font = `${size}px ${font}`; x.fillStyle = color; x.textBaseline = 'middle';
    x.fillText(text, size / 2, h / 2);
    return Imaging.trim(c, 12) || c;
  }

  function textLabel(text, { color = '#111111', weight = 500, font = 'Inter, sans-serif' } = {}) {
    const size = 96;
    const tmp = C(10, 10).getContext('2d'); tmp.font = `${weight} ${size}px ${font}`;
    const w = Math.ceil(tmp.measureText(text).width + 40), h = Math.ceil(size * 1.45);
    const c = C(w, h), x = c.getContext('2d');
    x.font = `${weight} ${size}px ${font}`; x.fillStyle = color; x.textBaseline = 'middle';
    x.fillText(text, 20, h / 2);
    return c;
  }

  return { render, presets, signatureText, textLabel, today };
})();
