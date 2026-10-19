// Figma node tree (compact JSON from tools/convert.mjs) -> DOM.
// Geometry is exact: every node is absolutely positioned with its Figma relativeTransform.

export const images = {}; // ref -> file name (filled by loader)
export const lqip = {};   // ref -> tiny blurred preview (data URI), shown instantly while the full image loads

// ---- image layers: every original is kept; loading is staged so nothing blocks and nothing ever shows blank ------------
// 1. the first screens load first (near-viewport check, works in every engine incl. Safari)
// 2. everything else is fetched in the background, a few at a time
// 3. an image is only applied once it is DECODED, so it never pops in half-painted or flashes while scrolling
export const lazy = { on: false, pending: new Set(), reg: new Set() };
const decodedUrls = new Map();
const urlsOf = (img) => [...img.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/^["']|["']$/g, ''));
export function predecode(url) {
  let p = decodedUrls.get(url);
  if (!p) { const i = new Image(); i.decoding = 'async'; i.src = url; p = i.decode().catch(() => {}); decodedUrls.set(url, p); }
  return p;
}
function applyBg(el) {
  const f = el._bgFull; if (!f) return;
  el._bgFull = null; lazy.reg.delete(el);
  el.style.backgroundImage = f.img; el.style.backgroundSize = f.size; el.style.backgroundPosition = f.pos; el.style.backgroundRepeat = f.rep;
  if (f.blend) el.style.backgroundBlendMode = f.blend;
}
export function loadBg(el) {
  if (!el._bgFull) return el._bgLoading || Promise.resolve();
  if (el._bgLoading) return el._bgLoading;
  const p = Promise.all(urlsOf(el._bgFull.img).map(predecode)).then(() => { el._bgLoading = null; if (el._bgFull) applyBg(el); });
  el._bgLoading = p; lazy.pending.add(p); p.then(() => lazy.pending.delete(p));
  return p;
}
export function forceBg(el) { if (el._bgFull) applyBg(el); }            // synchronous (used while morphing)
export function lazyIdle() {                       // true when every *visible* deferred layer has been painted
  if (lazy.pending.size) return false;
  for (const el of lazy.reg) { if (!el.isConnected || el._bgLoading) { if (el._bgLoading) return false; continue; } const r = el.getBoundingClientRect(); if (r.width > 0 || r.height > 0) return false; }
  return true;
}
export function loadNear() { drainBackground(); }                       // the scheduler below is always nearest-first
// resolves once everything within `margin` px of the viewport is painted (bounded by `max` ms)
export function waitNear(margin = 300, max = 2500) {
  const t0 = performance.now();
  return new Promise((res) => {
    const check = () => {
      let waiting = false; const vh = innerHeight;
      for (const el of lazy.reg) {
        if (!el.isConnected) continue;
        const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue;
        if (r.bottom > -margin && r.top < vh + margin) { waiting = true; break; }
      }
      if (!waiting || performance.now() - t0 > max) res(); else setTimeout(check, 50);
    };
    check();
  });
}

// continuous pool: always keeps POOL images in flight, always picking the one nearest the viewport next
const POOL = 6;
let inflight = 0, pumping = false;
function nearest() {
  const vh = innerHeight; let best = null, bd = Infinity;
  for (const el of lazy.reg) {
    if (!el.isConnected) { lazy.reg.delete(el); continue; }
    if (el._bgLoading) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const d = r.bottom < 0 ? -r.bottom : r.top > vh ? r.top - vh : 0;
    if (d < bd) { bd = d; best = el; if (d === 0) break; }
  }
  return best;
}
export function drainBackground() {
  if (pumping) return; pumping = true;
  const pump = () => {
    while (inflight < POOL) {
      const el = nearest();
      if (!el) { if (inflight === 0) pumping = false; return; }
      inflight++;
      loadBg(el).finally(() => { inflight--; pump(); });
    }
  };
  pump();
}

const px = (v) => (Math.round(v * 1000) / 1000) + 'px';
const rgba = (c, a = 1) => {
  const al = Math.round(((c[3] ?? 1) * a) * 1000) / 1000;
  return `rgba(${c[0]},${c[1]},${c[2]},${al})`;
};

const BLEND = {
  MULTIPLY: 'multiply', SCREEN: 'screen', OVERLAY: 'overlay', DARKEN: 'darken', LIGHTEN: 'lighten',
  COLOR_DODGE: 'color-dodge', COLOR_BURN: 'color-burn', HARD_LIGHT: 'hard-light', SOFT_LIGHT: 'soft-light',
  DIFFERENCE: 'difference', EXCLUSION: 'exclusion', HUE: 'hue', SATURATION: 'saturation', COLOR: 'color',
  LUMINOSITY: 'luminosity', LINEAR_BURN: 'plus-darker', LINEAR_DODGE: 'plus-lighter',
};

// ---- paints -> css background layers ---------------------------------------
function gradientCss(p, w, h) {
  const [h0, h1, h2] = p.hp;
  const S = [h0[0] * w, h0[1] * h], E = [h1[0] * w, h1[1] * h];
  if (p.t === 'L') {
    const dx = E[0] - S[0], dy = E[1] - S[1];
    const len = Math.hypot(dx, dy) || 1;
    const dir = [dx / len, dy / len];
    const ang = Math.atan2(dir[0], -dir[1]) * 180 / Math.PI; // css: 0deg = up
    const Lcss = Math.abs(w * dir[0]) + Math.abs(h * dir[1]) || 1;
    const c = [w / 2, h / 2];
    const base = ((S[0] - c[0]) * dir[0] + (S[1] - c[1]) * dir[1]) / Lcss + 0.5;
    const stops = p.st.map(s => `rgba(${s[1]},${s[2]},${s[3]},${s[4] * (p.op ?? 1)}) ${((base + s[0] * len / Lcss) * 100).toFixed(3)}%`);
    return `linear-gradient(${ang.toFixed(3)}deg,${stops.join(',')})`;
  }
  if (p.t === 'R') {
    const rx = Math.hypot(E[0] - S[0], E[1] - S[1]);
    const rY = Math.hypot(h2[0] * w - S[0], h2[1] * h - S[1]);
    const stops = p.st.map(s => `rgba(${s[1]},${s[2]},${s[3]},${s[4] * (p.op ?? 1)}) ${(s[0] * 100).toFixed(3)}%`);
    return `radial-gradient(${rx.toFixed(2)}px ${rY.toFixed(2)}px at ${S[0].toFixed(2)}px ${S[1].toFixed(2)}px,${stops.join(',')})`;
  }
  // angular / diamond (not used heavily): conic approximation
  const stops = p.st.map(s => `rgba(${s[1]},${s[2]},${s[3]},${s[4]}) ${(s[0] * 360).toFixed(2)}deg`);
  return `conic-gradient(from 90deg at ${S[0]}px ${S[1]}px,${stops.join(',')})`;
}

function imageLayer(p, w, h) {
  const url = `url(/img/${images[p.ref]})`;
  let size = 'cover', pos = 'center', repeat = 'no-repeat';
  if (p.sm === 'FIT') size = 'contain';
  else if (p.sm === 'TILE') { repeat = 'repeat'; size = 'auto'; }
  else if ((p.sm === 'CROP' || p.sm === 'STRETCH') && p.tr) {
    const [a, b, tx, c, d, ty] = p.tr; // node uv -> image uv
    const bw = w / a, bh = h / d;
    size = `${bw}px ${bh}px`; pos = `${-tx * bw}px ${-ty * bh}px`;
  }
  return { img: url, size, pos, repeat };
}

// returns {bgImage[], bgSize[], bgPos[], bgRepeat[], bgBlend[], color}
export function fillsToCss(fills, w, h) {
  const out = { img: [], size: [], pos: [], rep: [], blend: [], color: null };
  const list = [...fills].reverse(); // css: first = top
  for (const p of list) {
    const blend = BLEND[p.bm] || 'normal';
    if (p.t === 'S') {
      const col = rgba(p.c, p.op ?? 1);
      out.img.push(`linear-gradient(${col},${col})`); out.size.push('auto'); out.pos.push('0 0'); out.rep.push('no-repeat'); out.blend.push(blend);
    } else if (p.t === 'I') {
      if (!images[p.ref]) continue;
      const l = imageLayer(p, w, h);
      out.img.push(l.img); out.size.push(l.size); out.pos.push(l.pos); out.rep.push(l.repeat); out.blend.push(blend);
    } else if (p.hp) {
      out.img.push(gradientCss(p, w, h)); out.size.push('auto'); out.pos.push('0 0'); out.rep.push('no-repeat'); out.blend.push(blend);
    }
  }
  return out;
}

export function applyFills(el, fills, w, h) {
  // image paints with partial opacity cannot be expressed as a css background layer:
  // they are drawn as their own child layer (kept in paint order relative to opaque ones).
  el.querySelectorAll(':scope > .fillop').forEach(x => x.remove());
  const plain = [];
  let layerIdx = 0;
  for (const p of fills || []) {
    if (p.t === 'I' && p.op !== undefined && p.op < 1 && images[p.ref]) {
      const d = document.createElement('div');
      d.className = 'n fillop'; d.style.left = '0'; d.style.top = '0'; d.style.width = '100%'; d.style.height = '100%';
      d.style.opacity = p.op; d.style.borderRadius = 'inherit';
      applyFills(d, [{ ...p, op: undefined }], w, h);
      if (BLEND[p.bm]) d.style.mixBlendMode = BLEND[p.bm];
      el.insertBefore(d, el.firstChild);
    } else plain.push(p);
  }
  fills = plain;
  const o = fillsToCss(fills || [], w, h);
  if (!o.img.length) { el.style.backgroundImage = ''; return; }
  const full = { img: o.img.join(','), size: o.size.join(','), pos: o.pos.join(','), rep: o.rep.join(','), blend: o.blend.some(b => b !== 'normal') ? o.blend.join(',') : '' };
  const hasUrl = /url\(/.test(full.img);
  if (lazy.on && hasUrl) {
    // keep layer count/order, defer the actual image fetch
    el._bgFull = full;
    const preview = (x) => { const m = /\/img\/([0-9a-f]{40})\./.exec(x); const u = m && lqip[m[1]]; return u ? `url(${u})` : 'linear-gradient(transparent,transparent)'; };
    el.style.backgroundImage = o.img.map(x => (x.startsWith('url(') ? preview(x) : x)).join(',');
    el.style.backgroundSize = full.size; el.style.backgroundPosition = full.pos; el.style.backgroundRepeat = full.rep;
    if (full.blend) el.style.backgroundBlendMode = full.blend;
    lazy.reg.add(el);
    return;
  }
  el.style.backgroundImage = full.img;
  el.style.backgroundSize = full.size;
  el.style.backgroundPosition = full.pos;
  el.style.backgroundRepeat = full.rep;
  if (full.blend) el.style.backgroundBlendMode = full.blend;
}

// ---- effects ----------------------------------------------------------------
function applyEffects(el, n, shapeAware) {
  const filters = [], shadows = [];
  let bd = null;
  const boxy = n.ty === 'R' || n.ty === 'F' || n.ty === 'E' || n.ty === 'C' || n.ty === 'I';
  const hasFill = n.fl && n.fl.length;
  for (const e of n.ef || []) {
    if (e.t === 'DROP_SHADOW') {
      const [ox, oy] = e.o || [0, 0];
      if (!shapeAware && boxy && hasFill && !n.ch?.length) shadows.push(`${ox}px ${oy}px ${e.r}px ${e.sp || 0}px ${rgba(e.c)}`);
      else filters.push(`drop-shadow(${ox}px ${oy}px ${e.r}px ${rgba(e.c)})`);
    } else if (e.t === 'INNER_SHADOW') {
      const [ox, oy] = e.o || [0, 0];
      shadows.push(`inset ${ox}px ${oy}px ${e.r}px ${e.sp || 0}px ${rgba(e.c)}`);
    } else if (e.t === 'LAYER_BLUR') filters.push(`blur(${e.r / 2}px)`);
    else if (e.t === 'BACKGROUND_BLUR') bd = `blur(${e.r / 2}px)`;
  }
  if (shadows.length) el.style.boxShadow = shadows.join(',');
  if (filters.length) el.style.filter = filters.join(' ');
  if (bd) { el.style.backdropFilter = bd; el.style.webkitBackdropFilter = bd; }
}

// ---- strokes (exact: figma's strokeGeometry is the outlined stroke) -------------
function strokeSvg(n) {
  if (!n.sk || !n.sg) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', n.w); svg.setAttribute('height', n.h);
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
  const d = n.sg.map(g => g.p).join(' ');
  const rule = n.sg[0].w === 'EVENODD' ? 'evenodd' : 'nonzero';
  const defs = document.createElementNS(NS, 'defs'); svg.appendChild(defs);
  n.sk.forEach((p, i) => {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d); path.setAttribute('fill-rule', rule);
    if (p.t === 'S') { path.setAttribute('fill', `rgb(${p.c[0]},${p.c[1]},${p.c[2]})`); path.setAttribute('fill-opacity', (p.c[3] ?? 1) * (p.op ?? 1)); }
    else if (p.hp && (p.t === 'L' || p.t === 'R')) {
      const id = `g${n.id.replace(/[^\w]/g, '_')}_${i}`;
      const g = document.createElementNS(NS, p.t === 'L' ? 'linearGradient' : 'radialGradient');
      g.setAttribute('id', id); g.setAttribute('gradientUnits', 'userSpaceOnUse');
      const [a, b, c] = p.hp;
      if (p.t === 'L') { g.setAttribute('x1', a[0] * n.w); g.setAttribute('y1', a[1] * n.h); g.setAttribute('x2', b[0] * n.w); g.setAttribute('y2', b[1] * n.h); }
      else { g.setAttribute('cx', a[0] * n.w); g.setAttribute('cy', a[1] * n.h); g.setAttribute('r', Math.hypot((b[0] - a[0]) * n.w, (b[1] - a[1]) * n.h)); }
      for (const s of p.st) { const st = document.createElementNS(NS, 'stop'); st.setAttribute('offset', s[0]); st.setAttribute('stop-color', `rgb(${s[1]},${s[2]},${s[3]})`); st.setAttribute('stop-opacity', s[4] * (p.op ?? 1)); g.appendChild(st); }
      defs.appendChild(g); path.setAttribute('fill', `url(#${id})`);
    } else return;
    svg.appendChild(path);
  });
  return svg;
}

// ---- text ---------------------------------------------------------------------
const CASE = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' };
const AH = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
const AV = { TOP: 'flex-start', CENTER: 'center', BOTTOM: 'flex-end' };

function textStyle(el, t, fillCss) {
  el.style.fontFamily = `"${t.ff}", sans-serif`;
  el.style.fontSize = t.fs + 'px';
  el.style.fontWeight = t.fw;
  el.style.fontStyle = t.it ? 'italic' : 'normal';
  el.style.letterSpacing = t.ls + 'px';
  if (t.lh) el.style.lineHeight = (t.lu && Math.abs((t.lh % 1) - 0.5) < 1e-6 ? Math.ceil(t.lh) : t.lh) + 'px';
  if (CASE[t.tc]) el.style.textTransform = CASE[t.tc];
  if (t.td === 'UNDERLINE') el.style.textDecoration = 'underline';
  else if (t.td === 'STRIKETHROUGH') el.style.textDecoration = 'line-through';
  if (fillCss) Object.assign(el.style, fillCss);
}

function textFill(n) {
  const f = n.fl || [];
  if (!f.length) return { color: 'transparent' };
  const top = f[f.length - 1];
  if (top.t === 'S') return { color: rgba(top.c, top.op ?? 1) };
  const o = fillsToCss(f, n.w, n.h);
  return { color: 'transparent', backgroundImage: o.img.join(','), backgroundSize: o.size.join(','), backgroundPosition: o.pos.join(','), backgroundRepeat: o.rep.join(','), webkitBackgroundClip: 'text', backgroundClip: 'text' };
}

function buildText(el, n) {
  const t = n.tx;
  el.classList.add('t');
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.justifyContent = AV[t.av] || 'flex-start';
  el.style.textAlign = AH[t.ah] || 'left';
  if (t.ar === 'WIDTH_AND_HEIGHT') el.style.whiteSpace = 'pre';
  const inner = document.createElement('div');
  inner.className = 'tt';
  inner.style.width = '100%';
  const base = textFill(n);
  textStyle(inner, t, base);
  if (t.ov && t.ot) {
    // rich text: split by override ids
    let cur = null, buf = '';
    const flush = () => { if (buf) { const s = document.createElement('span'); s.textContent = buf; const o = t.ot[cur]; if (o) { const ov = { ...t, ff: o.fontFamily ?? t.ff, fs: o.fontSize ?? t.fs, fw: o.fontWeight ?? t.fw, it: o.italic ?? t.it, ls: o.letterSpacing ?? t.ls }; textStyle(s, ov); if (o.fills && o.fills[0] && o.fills[0].color) { const c = o.fills[0].color; s.style.color = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a ?? 1})`; } } inner.appendChild(s); buf = ''; } };
    [...t.c].forEach((ch, i) => { const id = t.ov[i] || 0; if (id !== cur) { flush(); cur = id; } buf += ch; });
    flush();
  } else inner.textContent = t.c;
  el.appendChild(inner);
}

// ---- main builder -------------------------------------------------------------
const matOf = (n) => (n.tf ? [n.tf[0], n.tf[1], n.tf[2], n.tf[3], n.x, n.y] : [1, 0, 0, 1, n.x, n.y]);
const mmul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const minv = (M) => { const det = M[0] * M[3] - M[1] * M[2]; const a = M[3] / det, b = -M[1] / det, c = -M[2] / det, d = M[0] / det; return [a, b, c, d, -(a * M[4] + c * M[5]), -(b * M[4] + d * M[5])]; };

export function applyGeometry(el, n, pre) {
  el.style.width = px(n.w); el.style.height = px(n.h);
  if (pre) {
    const m = mmul(pre, matOf(n));
    el.style.left = '0'; el.style.top = '0';
    el.style.transform = `matrix(${m.map(v => Math.round(v * 1e6) / 1e6).join(',')})`;
    return;
  }
  if (n.tf) {
    el.style.left = '0'; el.style.top = '0';
    el.style.transform = `matrix(${n.tf[0]},${n.tf[1]},${n.tf[2]},${n.tf[3]},${n.x},${n.y})`;
  } else {
    el.style.left = px(n.x); el.style.top = px(n.y); el.style.transform = '';
  }
}

export function applyRadius(el, n) {
  if (n.ty === 'E') { el.style.borderRadius = '50%'; return; }
  if (n.rads) el.style.borderRadius = n.rads.map(px).join(' ');
  else if (n.rad) el.style.borderRadius = px(n.rad);
  else el.style.borderRadius = '';
}

export function buildNode(n, opts = {}) {
  const el = document.createElement('div');
  el.className = 'n';
  el._n = n;
  el.dataset.id = n.id;
  applyGeometry(el, n, opts.pre);
  if (n.hd) el.style.display = 'none';
  if (n.op !== undefined) el.style.opacity = n.op;
  if (n.bm && BLEND[n.bm]) el.style.mixBlendMode = BLEND[n.bm];
  applyRadius(el, n);
  if (n.cl) el.style.overflow = 'hidden';
  if (n.od === 'VERTICAL_SCROLLING') { el.style.overflowX = 'hidden'; el.style.overflowY = 'auto'; el.style.scrollbarWidth = 'none'; el.style.pointerEvents = 'auto'; el.style.overscrollBehavior = 'auto'; el.classList.add('scroller'); }
  else if (n.od === 'HORIZONTAL_SCROLLING') { el.style.overflowY = 'hidden'; el.style.overflowX = 'auto'; el.style.scrollbarWidth = 'none'; el.style.pointerEvents = 'auto'; el.classList.add('scroller'); }

  if (n.ty === 'T') {
    buildText(el, n);
  } else if (n.fg) {
    // vector: css fills clipped by the exact path
    const d = n.fg.map(g => g.p).join(' ');
    const rule = n.fg[0].w === 'EVENODD' ? 'evenodd' : 'nonzero';
    const inner = el;
    if (n.fl && n.fl.length) applyFills(inner, n.fl, n.w, n.h);
    inner.style.clipPath = `path(${rule === 'evenodd' ? "evenodd," : ''}'${d}')`;
    if (n.ef && n.ef.length) {
      // effects must not be clipped: wrap
      const wrap = document.createElement('div'); wrap.className = 'n'; wrap._n = n; wrap.dataset.id = n.id;
      applyGeometry(wrap, n); inner.style.left = '0'; inner.style.top = '0'; inner.style.transform = '';
      if (n.hd) wrap.style.display = 'none';
      if (n.op !== undefined) { wrap.style.opacity = n.op; inner.style.opacity = ''; }
      if (n.bm && BLEND[n.bm]) { wrap.style.mixBlendMode = BLEND[n.bm]; inner.style.mixBlendMode = ''; }
      applyEffects(wrap, n, true); wrap.appendChild(inner); inner.style.opacity = '';
      const s = strokeSvg(n); if (s) wrap.appendChild(s);
      return wrap;
    }
  } else if (n.fl && n.fl.length) {
    applyFills(el, n.fl, n.w, n.h);
  }
  applyEffects(el, n);

  // children (with alpha-mask support: later siblings are masked by an ALPHA mask node)
  if (n.ch) {
    let container = el;
    let pre = null;
    for (const c of n.ch) {
      if (c.mk) { container = buildMaskWrapper(el, c); pre = minv(matOf(c)); continue; }
      const ce = buildNode(c, pre ? { ...opts, pre } : { ...opts, pre: undefined });
      container.appendChild(ce);
    }
  }
  const s = strokeSvg(n); if (s) el.appendChild(s);
  return el;
}

function buildMaskWrapper(parentEl, m) {
  const wrap = document.createElement('div');
  wrap.className = 'n mask';
  wrap._n = m; wrap.dataset.id = m.id;
  applyGeometry(wrap, m);
  const f = (m.fl || []).find(p => p.t === 'I');
  if (f && images[f.ref]) {
    const l = imageLayer(f, m.w, m.h);
    const css = wrap.style;
    css.webkitMaskImage = css.maskImage = l.img;
    css.webkitMaskSize = css.maskSize = l.size;
    css.webkitMaskPosition = css.maskPosition = l.pos;
    css.webkitMaskRepeat = css.maskRepeat = l.repeat;
    if (f.op !== undefined) wrap.style.opacity = f.op;
  } else {
    // solid / gradient / vector shape mask: the shape only clips, it is never painted
    wrap.style.overflow = 'hidden';
  }
  applyRadius(wrap, m);
  parentEl.appendChild(wrap);
  return wrap;
}
