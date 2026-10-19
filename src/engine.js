// Figma prototype runtime: variants (CHANGE_TO + Smart Animate), navigate, overlay, back, close, url, timers, keys, drag.
import { buildNode, images, lqip, forceBg } from './render.js';
import LINKS from './links.config.js';

const cache = new Map();      // topId -> {root, index:Map(id->node)}
const pending = new Map();
export const meta = {};
let ixTable = [];

let FILMS = {};
export async function initData() {
  const [m, ix, im, fl, lq] = await Promise.all(['meta', 'interactions', 'images', 'films', 'lqip'].map(n => fetch(`/data/${n}.json`).then(r => r.json())));
  Object.assign(meta, m); ixTable = ix; Object.assign(images, im); Object.assign(lqip, lq);
  FILMS = Object.fromEntries(Object.entries(fl).map(([k, v]) => [norm(k), v]));
  buildSetIndex();
}
const norm = (s) => String(s).replace(/[\u2018\u2019]/g, "'");

export function loadTop(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (pending.has(id)) return pending.get(id);
  const p = fetch(`/data/${id.replace(':', '_')}.json`).then(r => r.json()).then(root => {
    const index = new Map();
    const walk = (n) => { index.set(n.id, n); (n.ch || []).forEach(walk); };
    walk(root);
    const e = { root, index }; cache.set(id, e); pending.delete(id); return e;
  });
  pending.set(id, p); return p;
}
export function peekNode(id) {
  const top = meta.owner[id]; const e = top && cache.get(top);
  return e ? e.index.get(id) || null : null;
}
export async function getNode(id) {
  const top = meta.owner[id];
  if (!top) return null;
  const e = await loadTop(top);
  return e.index.get(id) || null;
}
const ixOf = (n) => (n.ix || []).map(i => ixTable[i]);

// ---------- easing / transition ----------------------------------------------------
export function easing(t) {
  if (!t) return 'ease';
  switch (t.type) {
    case 'LINEAR': return 'linear';
    case 'EASE_IN': return 'cubic-bezier(.42,0,1,1)';
    case 'EASE_OUT': return 'cubic-bezier(0,0,.58,1)';
    case 'EASE_IN_AND_OUT': return 'cubic-bezier(.42,0,.58,1)';
    case 'EASE_IN_BACK': return 'cubic-bezier(.3,-.05,.68,-.2)';
    case 'EASE_OUT_BACK': return 'cubic-bezier(.34,1.56,.64,1)';
    case 'EASE_IN_AND_OUT_BACK': return 'cubic-bezier(.68,-.6,.32,1.6)';
    case 'CUSTOM_CUBIC_BEZIER': { const b = t.easingFunctionCubicBezier; return `cubic-bezier(${b.x1},${b.y1},${b.x2},${b.y2})`; }
    default: return 'cubic-bezier(.42,0,.58,1)';
  }
}

// ---------- matrix interpolation -----------------------------------------------------------------------
// CSS interpolates matrix() by decomposing it, which goes wild when a card flips orientation (faux-3D ring cards pass
// through edge-on). Figma's result is a straight component-wise blend, so transforms are sampled as exact lerps.
const IDENT = [1, 0, 0, 1, 0, 0];
export function parseMatrix(t) {
  if (!t || t === 'none') return IDENT;
  const m = /^matrix\(([^)]+)\)$/.exec(t.trim()); if (!m) return null;
  const v = m[1].split(',').map(Number); return v.length === 6 && v.every(Number.isFinite) ? v : null;
}
const mstr = (m) => `matrix(${m.map(v => Math.round(v * 1e5) / 1e5).join(',')})`;
const lerpM = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-6) break; const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; } let lo = 0, hi = 1; if (t < 0 || t > 1) { t = x; for (let i = 0; i < 24; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-6) break; if (e > 0) hi = t; else lo = t; t = (lo + hi) / 2; } } return Y(t); };
}
export function easeFn(e) {
  if (!e) return bezier(.25, .1, .25, 1);
  switch (e.type) {
    case 'LINEAR': return (x) => x;
    case 'EASE_IN': return bezier(.42, 0, 1, 1);
    case 'EASE_OUT': return bezier(0, 0, .58, 1);
    case 'EASE_IN_AND_OUT': return bezier(.42, 0, .58, 1);
    case 'EASE_IN_BACK': return bezier(.3, -.05, .68, -.2);
    case 'EASE_OUT_BACK': return bezier(.34, 1.56, .64, 1);
    case 'EASE_IN_AND_OUT_BACK': return bezier(.68, -.6, .32, 1.6);
    case 'CUSTOM_CUBIC_BEZIER': { const b = e.easingFunctionCubicBezier; return bezier(b.x1, b.y1, b.x2, b.y2); }
    default: return bezier(.42, 0, .58, 1);
  }
}
function sampledTransform(el, fromT, toT, dur, spec) {
  const A = parseMatrix(fromT), B = parseMatrix(toT); if (!A || !B) return false;
  const f = easeFn(spec.easing), N = Math.max(8, Math.min(40, Math.round(dur / 25)));
  const kf = []; for (let i = 0; i <= N; i++) kf.push({ offset: i / N, transform: mstr(lerpM(A, B, f(i / N))) });
  el.animate(kf, { duration: dur, easing: 'linear' });
  return true;
}

// ---------- smart animate: morph an existing DOM subtree into a new one -------------------
const ANIM_PROPS = ['left', 'top', 'width', 'height', 'transform', 'opacity', 'borderRadius', 'filter', 'boxShadow', 'clipPath',
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'color',
  'maskSize', 'maskPosition', 'webkitMaskSize', 'webkitMaskPosition', 'translate', 'letterSpacing', 'fontSize', 'lineHeight', 'display'];

const snap = (el) => { const s = el.style, o = {}; for (const p of ANIM_PROPS) o[p] = s[p]; return o; };

function cloneTree(el) {
  const c = el.cloneNode(false);
  if (el._n) { c._n = el._n; }
  for (const k of el.childNodes) c.appendChild(k.nodeType === 1 ? cloneTree(k) : k.cloneNode(true));
  return c;
}

function kids(el) { return [...el.children].filter(c => c._n || c.classList.contains('fillop')); }

function matchChildren(oldEl, newEl) {
  const oldK = kids(oldEl), newK = kids(newEl);
  const key = (c) => (c.classList.contains('fillop') ? '#fillop' : c._n.nm + '|' + (c.classList.contains('mask') ? 'm' : ''));
  const buckets = new Map();
  for (const o of oldK) { const k = key(o); (buckets.get(k) || buckets.set(k, []).get(k)).push(o); }
  const pairs = [], fresh = [];
  const used = new Set();
  for (const nw of newK) {
    const b = buckets.get(key(nw));
    if (b && b.length) { const o = b.shift(); used.add(o); pairs.push([o, nw]); } else fresh.push(nw);
  }
  const gone = oldK.filter(o => !used.has(o));
  return { pairs, fresh, gone, newK };
}

export function morph(oldEl, newEl, spec, opts = {}) {
  // ONE pass up-front (not per element, which forces a style recalculation each time):
  // an interrupted transition continues from where it visually is (Figma behaviour), not from its end state
  const running = oldEl.getAnimations({ subtree: true }).filter(a => a.playState === 'running');
  for (const a of running) { try { a.commitStyles(); } catch (e) { /* element not rendered */ } }
  for (const a of oldEl.getAnimations({ subtree: true })) a.cancel();
  morphNode(oldEl, newEl, spec, opts);
}

function morphNode(oldEl, newEl, spec, opts = {}) {
  // identical subtree (same structural hash, no variable bindings): nothing to animate or restyle
  if (!opts.keepNode && oldEl._n && newEl._n && oldEl._n.hs && oldEl._n.hs === newEl._n.hs) { oldEl._n = newEl._n; oldEl._busyUntil = 0; return; }
  forceBg(oldEl);
  const dur = (spec.duration || 0) * 1000;
  const ease = easing(spec.easing);
  oldEl._busyUntil = performance.now() + dur;   // 'after delay' timers count from the END of the transition
  const from = snap(oldEl), to = snap(newEl);
  const textual = oldEl.classList.contains('t');
  // final state
  const keepGeom = opts.keepPos ? { left: oldEl.style.left, top: oldEl.style.top, transform: oldEl.style.transform } : null;
  if (oldEl.style.cssText !== newEl.style.cssText) oldEl.style.cssText = newEl.style.cssText;
  if (keepGeom) { oldEl.style.left = keepGeom.left; oldEl.style.top = keepGeom.top; oldEl.style.transform = keepGeom.transform; to.left = keepGeom.left; to.top = keepGeom.top; to.transform = keepGeom.transform; }
  if (!opts.keepNode) { oldEl._n = newEl._n; oldEl.dataset.id = newEl.dataset.id; }
  else { const n = oldEl._n; oldEl._n = { ...newEl._n, id: n.id, nm: n.nm, cp: newEl._n.cp ?? n.cp }; }
  // keyframes
  if (dur > 0) {
    const a = {}, b = {};
    for (const p of ANIM_PROPS) {
      if (from[p] === to[p]) continue;
      if (p === 'backgroundImage') continue; // handled by cross-fade below
      a[p] = from[p] || (p === 'opacity' ? '1' : 'initial'); b[p] = to[p] || (p === 'opacity' ? '1' : 'initial');
      if (p === 'transform') { a[p] = from[p] || 'none'; b[p] = to[p] || 'none'; }
    }
    // left/top <-> transform mixes: always pass both ends explicitly
    if ('transform' in a || 'left' in a || 'top' in a) {
      for (const p of ['left', 'top']) { a[p] = from[p] || '0px'; b[p] = to[p] || '0px'; }
      a.transform = from.transform || 'none'; b.transform = to.transform || 'none';
    }
    if ('transform' in a && sampledTransform(oldEl, from.transform, to.transform, dur, spec)) { delete a.transform; delete b.transform; }
    if (Object.keys(a).length) oldEl.animate([a, b], { duration: dur, easing: ease });
    if (from.backgroundImage !== to.backgroundImage && !textual) crossfadeBg(oldEl, from, dur, ease);
  }
  // text content
  if (textual && newEl.firstChild) {
    if (oldEl.textContent !== newEl.textContent || oldEl.innerHTML !== newEl.innerHTML) oldEl.innerHTML = newEl.innerHTML;
    return;
  }
  // children — fast path: every child subtree is identical (only this node moved), nothing to match
  const curK = kids(oldEl), nxtK = kids(newEl);
  if (curK.length === nxtK.length && curK.every((c, i) => c._n && c._n.hs && nxtK[i] && nxtK[i]._n && c._n.hs === nxtK[i]._n.hs)) {
    curK.forEach((c, i) => { c._n = nxtK[i]._n; });
    [...oldEl.children].filter(c => !c._n && !c.classList.contains('fillop')).forEach(c => c.remove());
    [...newEl.children].filter(c => !c._n && !c.classList.contains('fillop')).forEach(c => oldEl.appendChild(c.cloneNode(true)));
    rebind(oldEl);
    return;
  }
  const { pairs, fresh, gone, newK } = matchChildren(oldEl, newEl);
  for (const [o, nw] of pairs) morphNode(o, nw, spec);
  for (const g of gone) {
    if (dur > 0) { const an = g.animate([{ opacity: getComputedStyle(g).opacity }, { opacity: 0 }], { duration: dur, easing: ease }); an.onfinish = () => g.remove(); g.style.pointerEvents = 'none'; }
    else g.remove();
  }
  // stroke svgs are plain children without _n: replace
  [...oldEl.children].filter(c => !c._n && !c.classList.contains('fillop')).forEach(c => c.remove());
  [...newEl.children].filter(c => !c._n && !c.classList.contains('fillop')).forEach(c => oldEl.appendChild(c.cloneNode(true)));
  // z-order
  const order = [];
  const made = new Map(fresh.map(f => [f, cloneTree(f)]));
  for (const nk of newK) { const p = pairs.find(x => x[1] === nk); order.push(p ? p[0] : made.get(nk)); }
  const cur0 = [...oldEl.children].filter(x => (x._n || x.classList.contains('fillop')) && !gone.includes(x));
  if (cur0.length !== order.length || order.some((c, i) => cur0[i] !== c)) {
    order.forEach((c, i) => {
      const cur = [...oldEl.children].filter(x => x._n || x.classList.contains('fillop')).filter(x => !gone.includes(x));
      if (cur[i] !== c) oldEl.insertBefore(c, cur[i] || null);
    });
  }
  for (const f of made.values()) { if (dur > 0) f.animate([{ opacity: 0 }, { opacity: f.style.opacity || 1 }], { duration: dur, easing: ease }); }
  for (const [o] of pairs) rebind(o);
  for (const f of made.values()) rebindTree(f);
  rebind(oldEl);
}

function crossfadeBg(el, from, dur, ease) {
  if (!from.backgroundImage) return;
  const ghost = document.createElement('div');
  ghost.className = 'n xfade';
  Object.assign(ghost.style, { left: '0', top: '0', width: '100%', height: '100%', backgroundImage: from.backgroundImage, backgroundSize: from.backgroundSize, backgroundPosition: from.backgroundPosition, backgroundRepeat: 'no-repeat', borderRadius: 'inherit', pointerEvents: 'none' });
  el.insertBefore(ghost, el.firstChild);
  const a = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: ease });
  a.onfinish = () => ghost.remove();
}

// ---------- interaction binding -------------------------------------------------------------
const STATIC = new URLSearchParams(location.search).has('static');
const POINTER = new Set(['ON_HOVER', 'ON_CLICK', 'DRAG', 'MOUSE_ENTER', 'MOUSE_LEAVE', 'ON_PRESS', 'MOUSE_DOWN', 'MOUSE_UP']);
function triggersOf(el) { return ixOf(el._n).filter(i => i && i.trigger); }

export function rebindTree(el) { rebind(el); for (const c of el.children) if (c._n) rebindTree(c); }

export function rebind(el) {
  const n = el._n; if (!n) return;
  if (n.bv) register(el);
  const list = triggersOf(el);
  const pointer = list.some(i => POINTER.has(i.trigger.type));
  el.classList.toggle('hit', pointer);
  if (list.some(i => i.trigger.type === 'DRAG')) el.style.touchAction = 'pan-y';
  // timers
  clearTimers(el);
  let looped = false;
  if (!STATIC && n.ty === 'I' && el._loopTried !== n.cp && list.some(i => i.trigger.type === 'AFTER_TIMEOUT')) {
    el._loopTried = n.cp;
    looped = compileLoop(el, list);
  }
  for (const it of list) if (it.trigger.type === 'AFTER_TIMEOUT' && !n.hd && !STATIC && !looped) {
    const wait = Math.max(0, (el._busyUntil || 0) - performance.now()) + (it.trigger.timeout || 0) * 1000;
    // a layer that is nowhere near the screen does not advance (nothing to see; saves a lot of work on the page that is in view)
    const fire = () => {
      if (!el.isConnected || el._n !== n) return;
      const r = el.getBoundingClientRect();
      if (r.width && (r.bottom < -innerHeight * 0.5 || r.top > innerHeight * 1.5)) { (el._timers ||= []).push(setTimeout(fire, 600)); return; }
      run(el, it, 'timeout');
    };
    const t = setTimeout(fire, wait);
    (el._timers ||= []).push(t);
  }
  if (list.some(i => i.trigger.type === 'ON_KEY_DOWN')) el.dataset.kd = '1'; else delete el.dataset.kd;
  if (!pointer || el._bound) return;
  el._bound = true;
  el.addEventListener('pointerenter', () => onEnter(el));
  el.addEventListener('pointerleave', () => onLeave(el));
  el.addEventListener('click', (e) => onClick(el, e));
  el.addEventListener('pointerdown', (e) => onDown(el, e));
}
// ---------- compiled loops ---------------------------------------------------------------------------
// A chain  state0 -(after delay, linear)-> state1 -> ... -> stateN -> state0  is a continuous animation. Instead of
// morphing the whole subtree every step (main-thread work + a hitch each step) it is compiled into ONE multi-keyframe
// animation per layer: same poses, same easing, same timing, but compositor-driven. Any other trigger (key, drag, hover…)
// calls morph(), which commits the current visual pose and cancels the loop, then the loop is rebuilt from the new state.
const LOOP_PROPS = ['transform', 'left', 'top', 'width', 'height', 'opacity', 'borderRadius', 'filter', 'clipPath'];
function pathMap(root) {
  const m = new Map();
  const walk = (el, path) => {
    const counts = new Map();
    for (const c of el.children) {
      if (!c._n) continue;
      const k = c._n.nm + (c.classList.contains('mask') ? '|m' : '');
      const i = counts.get(k) || 0; counts.set(k, i + 1);
      const p = path + '/' + k + '#' + i;
      m.set(p, c); walk(c, p);
    }
  };
  m.set('', root); walk(root, '');
  return m;
}
// Idle loops (film ring, orbiting stickers…) keep hundreds of layers animating. Off-screen they only steal main-thread /
// decode time (Safari does not cull them), so they are paused while far from the viewport and resumed when near.
const loopRoots = new Set();
export function cullLoops(hold = false) {   // hold: pause every loop (the page is busy painting images)
  const m = -60;   // a loop counts as visible only once 60px of it is on screen
  for (const el of loopRoots) {
    if (!el.isConnected) { loopRoots.delete(el); continue; }
    const r = el.getBoundingClientRect(), vis = !hold && r.bottom > -m && r.top < innerHeight + m && r.right > 0 && r.left < innerWidth;
    for (const a of el._loopAnims || []) { if (vis && a.playState === 'paused' && a._culled) { a._culled = false; a.play(); } else if (!vis && a.playState === 'running') { a._culled = true; a.pause(); } }
  }
}
function compileLoop(el, list) {
  const first = list.find(i => i.trigger.type === 'AFTER_TIMEOUT'); if (!first) return false;
  const act = (first.actions || []).find(a => a && a.navigation === 'CHANGE_TO'); if (!act) return false;
  const tr0 = act.transition; if (!tr0 || tr0.type !== 'SMART_ANIMATE' || !tr0.easing || tr0.easing.type !== 'LINEAR') return false;
  const states = [el._n.cp]; const seen = new Set(states);
  let nextId = act.destinationId;
  for (let guard = 0; guard < 400; guard++) {
    if (nextId === states[0]) break;                       // cycle closed
    if (seen.has(nextId)) return false;
    const D = peekNode(nextId); if (!D) { el._loopTried = null; return false; }   // variant data still loading: retry later
    states.push(nextId); seen.add(nextId);
    const it = ixOf(D).find(i => i && i.trigger && i.trigger.type === 'AFTER_TIMEOUT'); if (!it) return false;
    const a = (it.actions || []).find(x => x && x.navigation === 'CHANGE_TO'); if (!a) return false;
    const t = a.transition; if (!t || t.type !== 'SMART_ANIMATE' || t.easing?.type !== 'LINEAR' || t.duration !== tr0.duration) return false;
    nextId = a.destinationId;
    if (guard === 399) return false;
  }
  if (states.length < 2) return false;
  const step = (tr0.duration + (first.trigger.timeout || 0)) * 1000;
  const live = pathMap(el);
  const maps = states.map(id => { const D = peekNode(id); return D ? pathMap(builtOf(variantFor(el, D))) : null; });
  if (maps.some(m => !m)) { el._loopTried = null; return false; }
  const snaps = maps.map(m => { const o = new Map(); for (const [p, e] of m) o.set(p, snap(e)); return o; });
  let n = 0;
  for (const [p, node] of live) {
    if (p === '') continue;
    const fr = snaps.map(sn => sn.get(p));
    if (fr.some(f => !f)) return false;                    // layer missing in some state -> use the regular engine
    const changed = LOOP_PROPS.filter(k => fr.some(f => f[k] !== fr[0][k]));
    if (fr.some(f => f.backgroundImage !== fr[0].backgroundImage || f.display !== fr[0].display)) return false;
    if (!changed.length) continue;
    const k = states.length;
    const kf = fr.map((f, i) => { const o = { offset: i / k, easing: 'linear' }; changed.forEach(c => { o[c] = f[c] || (c === 'transform' ? 'none' : c === 'opacity' ? '1' : ''); }); return o; });
    const last = { offset: 1 }; changed.forEach(c => { last[c] = kf[0][c]; }); kf.push(last);
    if (changed.includes('transform') || changed.includes('left') || changed.includes('top')) kf.forEach((f, i) => { const src = fr[i % k]; f.left = src.left || '0px'; f.top = src.top || '0px'; f.transform = src.transform || 'none'; });
    if (changed.includes('transform')) {
      // exact component-wise blend between consecutive states (see matrix note above)
      const M = 8, out = [];
      for (let i = 0; i < k; i++) {
        const A = parseMatrix(fr[i].transform), B = parseMatrix(fr[(i + 1) % k].transform);
        if (!A || !B) { out.length = 0; break; }
        out.push(kf[i]);
        for (let j = 1; j < M; j++) out.push({ offset: (i + j / M) / k, easing: 'linear', transform: mstr(lerpM(A, B, j / M)) });
      }
      if (out.length) { out.push(kf[k]); kf.length = 0; kf.push(...out); }
    }
    (el._loopAnims ||= []).push(node.animate(kf, { duration: step * k, iterations: Infinity }));
    n++;
  }
  el._loop = true; loopRoots.add(el);
  return n > 0;
}

function clearTimers(el) { if (el._timers) { el._timers.forEach(clearTimeout); el._timers = null; } }

// hover must follow the pointer, not the page: while the page scrolls under a still mouse the browser fires synthetic
// enter/leave events — those are ignored until the user really moves the pointer again
let lastScroll = 0, lastMove = 0, lastX = -1, lastY = -1;
const deferred = new Set();
addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true, capture: true });
addEventListener('pointermove', (e) => {
  if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) < 1.5) return;
  lastX = e.clientX; lastY = e.clientY; lastMove = performance.now();
  if (deferred.size) for (const el of [...deferred]) { deferred.delete(el); if (el.isConnected && el.matches(':hover')) enterNow(el); }
}, { passive: true, capture: true });

function onEnter(el) {
  const now = performance.now();
  if (now - lastMove > 160) { deferred.add(el); return; }   // a genuine enter always comes with pointer movement
  enterNow(el);
}
function enterNow(el) {
  if (el._hover) return;
  el._hover = true;
  for (const it of triggersOf(el)) if (it.trigger.type === 'ON_CLICK') for (const a of it.actions || []) if (a && a.navigation === 'OVERLAY' && a.destinationId) hooks.warmOverlay?.(a.destinationId);
  for (const it of triggersOf(el)) {
    if (it.trigger.type === 'ON_HOVER') { el._hoverRevert = run(el, it, 'hover'); }
    else if (it.trigger.type === 'MOUSE_ENTER') setTimeout(() => el._hover && run(el, it, 'enter'), (it.trigger.delay || 0) * 1000);
  }
}
function onLeave(el) {
  deferred.delete(el);
  if (!el._hover) return;
  el._hover = false;
  for (const it of triggersOf(el)) if (it.trigger.type === 'MOUSE_LEAVE') setTimeout(() => run(el, it, 'leave'), (it.trigger.delay || 0) * 1000);
  const r = el._hoverRevert; el._hoverRevert = null;
  if (r) r.then?.(f => f && f());
}
function onClick(el, e) {
  if (e._figHandled || el._dragged) return;
  const its = triggersOf(el).filter(i => i.trigger.type === 'ON_CLICK');
  if (!its.length) return;
  e._figHandled = true;
  its.forEach(it => run(el, it, 'click'));
}
function onDown(el, e) {
  const its = triggersOf(el).filter(i => i.trigger.type === 'DRAG');
  if (!its.length) return;
  const sx = e.clientX, sy = e.clientY; el._dragged = false;
  const mv = (m) => {
    if (Math.hypot(m.clientX - sx, m.clientY - sy) > 14) {
      el._dragged = true; cleanup();
      its.forEach(it => run(el, it, 'drag', { dx: m.clientX - sx, dy: m.clientY - sy }));
      setTimeout(() => (el._dragged = false), 0);
    }
  };
  const up = () => cleanup();
  const cleanup = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

addEventListener('keydown', (e) => {
  document.querySelectorAll('[data-kd]').forEach(el => {
    if (!el.isConnected || !el._n) return;
    for (const it of triggersOf(el)) if (it.trigger.type === 'ON_KEY_DOWN' && (it.trigger.keyCodes || []).includes(e.keyCode)) run(el, it, 'key');
  });
});

// ---------- running actions ---------------------------------------------------------------------
export const hooks = { navigate: null, overlay: null, close: null, back: null, warmOverlay: null, project: null };

// returns a promise resolving to a "revert" function (for while-hovering)
export async function run(el, it, kind, extra) {
  const reverts = [];
  for (const a of it.actions || []) {
    if (!a) continue;
    const r = await doAction(el, a, kind, extra);
    if (r) reverts.push(r);
  }
  return () => reverts.forEach(f => f());
}

async function doAction(el, a, kind) {
  switch (a.type) {
    case 'URL': {
      const url = a.url in LINKS ? LINKS[a.url] : a.url;
      if (!url || /YOUR[-_]|yourdomain/i.test(url)) { toast('This link isn\u2019t set yet \u2014 add it in src/links.config.js'); return; }
      window.open(url, a.openInNewTab && !url.startsWith('mailto:') ? '_blank' : '_self', 'noopener'); return;
    }
    case 'PROJECT': return hooks.project?.(el, a);      // a Projects-screen card: opened natively by main.js (ProjectDetail)
    case 'BACK': hooks.back?.(); return;
    case 'CLOSE': hooks.close?.(el); return;
    case 'SET_VARIABLE': {
      const id = String(a.variableId).replace('VariableID:', '');
      const vv = a.variableValue || {};
      const val = vv.resolvedType === 'COLOR' ? vv.value : valueFor(id, el);
      if (val == null) return;
      const prev = vars.get(id);
      setVar(id, val);
      return kind === 'hover' && prev !== undefined ? () => setVar(id, prev) : undefined;
    }
    case 'NODE': break;
    default: return;
  }
  const nav = a.navigation, dest = a.destinationId;
  if (nav === 'CHANGE_TO') return changeTo(el, dest, a.transition, kind === 'hover');
  if (nav === 'NAVIGATE') return hooks.navigate?.(dest, a);
  if (nav === 'OVERLAY') return hooks.overlay?.(dest, a, el);
  if (nav === 'SWAP') return hooks.overlay?.(dest, a, el);
}

function setOf(compId) { return meta.components[compId]?.s || compId; }

export async function changeTo(el, destId, tr, whileHover = false) {
  const D = await getNode(destId);
  if (!D) return;
  const dset = setOf(destId);
  let inst = el;
  while (inst && !(inst._n && inst._n.cp && setOf(inst._n.cp) === dset)) inst = inst.parentElement;
  if (!inst) { // the element itself may be the variant root (top-level component copy)
    inst = el;
  }
  const prev = inst._n.cp;
  if (prev === destId) return;
  const keep = whileHover ? inst._n.ix : undefined;   // 'while hovering' is temporary: the source node keeps its own interactions
  swap(inst, D, tr, keep);
  const prevD = prev;
  return () => { getNode(prevD).then(P => P && inst.isConnected && swap(inst, P, tr, keep)); };
}

// ---------- instances that were resized ----------------------------------------------------------------
// Figma keeps an instance's scale when its variant changes (the design ticker is a 900x292 component shown at 225x73,
// every disc / CD is squashed per axis). A swap therefore scales the destination variant by the instance's own ratio.
const scalePath = (d, sx, sy) => { let i = 0; return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (m) => (+m * (i++ % 2 ? sy : sx)).toFixed(3)); };
function scaleNode(n, sx, sy) {
  const s = (sx + sy) / 2, o = { ...n };
  delete o.hs;                                             // geometry changed: never treat as identical to an unscaled subtree
  o.x = n.x * sx; o.y = n.y * sy; o.w = n.w * sx; o.h = n.h * sy;
  if (n.tf) o.tf = [n.tf[0], n.tf[1] * sy / sx, n.tf[2] * sx / sy, n.tf[3]];   // S·L·S⁻¹
  if (n.rad) o.rad = n.rad * s;
  if (n.rads) o.rads = n.rads.map(v => v * s);
  if (n.sw) o.sw = n.sw * s;
  if (n.fg) o.fg = n.fg.map(g => ({ ...g, p: scalePath(g.p, sx, sy) }));
  if (n.sg) o.sg = n.sg.map(g => ({ ...g, p: scalePath(g.p, sx, sy) }));
  if (n.ef) o.ef = n.ef.map(e => ({ ...e, r: e.r != null ? e.r * s : e.r, sp: e.sp ? e.sp * s : e.sp, o: e.o ? [e.o[0] * sx, e.o[1] * sy] : e.o }));
  if (n.tx) o.tx = { ...n.tx, fs: n.tx.fs * s, ls: n.tx.ls * s, lh: n.tx.lh ? n.tx.lh * s : n.tx.lh };
  if (n.ch) o.ch = n.ch.map(c => scaleNode(c, sx, sy));
  return o;
}
const scaledCache = new Map();
export function variantFor(inst, D) {
  const n = inst._n, D0 = peekNode(n.cp);
  if (!D0 || !D0.w || !D0.h || !D.w || !D.h) return D;
  // the scale Figma applied to this instance's content = how much its own first child differs from the component's.
  // (A resized instance whose layers are pinned top-left keeps full-size content: scale 1.)
  const c0 = (n.ch || []).find(c => c.w && c.h), d0 = (D0.ch || []).find(c => c.w && c.h);
  const sx = c0 && d0 ? c0.w / d0.w : n.w / D0.w, sy = c0 && d0 ? c0.h / d0.h : n.h / D0.h;
  if (Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002) {
    if (Math.abs(n.w - D.w) < 0.5 && Math.abs(n.h - D.h) < 0.5) return D;
    const k0 = `${D.id}|box|${n.w.toFixed(2)}|${n.h.toFixed(2)}`;     // content is full size but the instance box is not: keep the box
    let v0 = scaledCache.get(k0);
    if (!v0) { v0 = { ...D, w: n.w, h: n.h }; scaledCache.set(k0, v0); }
    return v0;
  }
  const k = `${D.id}|${sx.toFixed(4)}|${sy.toFixed(4)}`;
  let v = scaledCache.get(k);
  if (!v) { v = scaleNode(D, sx, sy); scaledCache.set(k, v); }
  return v;
}

const builtCache = new WeakMap();
function builtOf(D) {
  let b = builtCache.get(D);
  if (!b) { b = buildNode({ ...D, ty: 'I' }); builtCache.set(D, b); }
  return b;
}

export function swap(inst, D0, tr, keepIx) {
  const __t0 = window.__prof ? performance.now() : 0;
  const n = inst._n;
  const D = variantFor(inst, D0);
  const nn = { ...D, x: n.x, y: n.y, nm: n.nm, id: n.id, cp: D0.id, tf: n.tf, hd: n.hd, bv: n.bv };
  if (n.op !== undefined) nn.op = n.op; else delete nn.op;
  const fresh = builtOf(D);
  const disp = inst.style.display;
  const spec = tr ? { duration: tr.type === 'INSTANT' ? 0 : tr.duration, easing: tr.easing } : { duration: 0 };
  if (tr && tr.type === 'DISSOLVE') {
    // cross-dissolve the whole instance
    const old = inst.cloneNode(true); old.style.pointerEvents = 'none';
    inst.parentElement.insertBefore(old, inst);
    inst.replaceChildren(...[...fresh.children]);
    Object.assign(inst.style, { width: fresh.style.width, height: fresh.style.height });
    inst._n = nn;
    inst.animate([{ opacity: 0 }, { opacity: 1 }], { duration: spec.duration * 1000, easing: easing(spec.easing) });
    old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: spec.duration * 1000, easing: easing(spec.easing) }).onfinish = () => old.remove();
    rebindTree(inst); return;
  }
  morph(inst, fresh, spec, { keepNode: true, keepPos: true });
  inst.style.display = disp;
  if (n.op !== undefined) inst.style.opacity = n.op;
  inst._n = { ...D, x: n.x, y: n.y, nm: n.nm, id: n.id, cp: D0.id, ty: 'I', tf: n.tf, hd: n.hd, bv: n.bv };
  if (keepIx !== undefined) { if (keepIx) inst._n.ix = keepIx; else delete inst._n.ix; }
  rebind(inst);
  if (window.__prof) (window.__prof.swaps ||= []).push({ nm: n.nm, ms: performance.now() - __t0, nodes: inst.querySelectorAll('*').length });
}

// ---------- variables ---------------------------------------------------------------------------
// The REST API returns `value: null` for STRING variables, so string values are derived from file data only:
// role of each string variable = the text it is bound to in the design ("Fight Club" / "1999" / "David Fincher" /
// "David Fincher · 1999"), value = taken from the hovered card's own name and the film directory (disc-detail frames).
const ROLE = { '269:38692': 'title', '184:19192': 'title', '184:19193': 'year', '184:19194': 'director', '184:19195': 'director_year' };
const vars = new Map();
const consumers = new Map();
const setIndex = new Map();

function buildSetIndex() {
  for (const [id, c] of Object.entries(meta.components)) {
    if (!c.s) continue;
    (setIndex.get(c.s) || setIndex.set(c.s, new Map()).get(c.s)).set(norm(c.n), id);
  }
}

function filmOf(el) {
  let e = el;
  while (e && !(e._n && /^card \d+ — /.test(e._n.nm))) e = e.parentElement;
  if (!e) return null;
  const m = e._n.nm.match(/^card \d+ — (.+) \((\d{4})\)$/);
  if (!m) return null;
  const title = m[1], year = m[2], f = FILMS[norm(title)];
  return { title, year, director: f ? f.director : '' };
}
function valueFor(id, el) {
  const f = filmOf(el); if (!f) return null;
  switch (ROLE[id]) {
    case 'title': return f.title;
    case 'year': return f.year;
    case 'director': return f.director;
    case 'director_year': return f.director ? `${f.director} · ${f.year}` : f.year;
  }
  return null;
}

function register(el) {
  const bv = el._n && el._n.bv; if (!bv) return;
  const ids = [bv.c, ...(bv.f || []), ...Object.values(bv.p || {})].filter(Boolean);
  for (const id of ids) {
    (consumers.get(id) || consumers.set(id, new Set()).get(id)).add(el);
    if (!vars.has(id)) {
      if (id === bv.c) { const t = el.querySelector(':scope > .tt'); vars.set(id, t ? t.textContent : ''); }
      else if (bv.p) { for (const [prop, vid] of Object.entries(bv.p)) if (vid === id) { const cn = meta.components[el._n.cp]?.n; if (cn) vars.set(id, cn.split(', ').map(x => x.split('=')).find(x => x[0] === prop)?.[1]); } }
    }
  }
}

export function setVar(id, val) {
  vars.set(id, val);
  for (const el of [...(consumers.get(id) || [])]) {
    if (!el.isConnected) { consumers.get(id).delete(el); continue; }
    const bv = el._n.bv; if (!bv) continue;
    if (bv.c === id && typeof val === 'string') {
      const t = el.querySelector(':scope > .tt');
      if (t) t.textContent = val;
    }
    if (bv.f && bv.f.includes(id) && val && typeof val === 'object') {
      const col = `rgba(${Math.round(val.r * 255)},${Math.round(val.g * 255)},${Math.round(val.b * 255)},${val.a})`;
      const t = el.querySelector(':scope > .tt');
      if (t) t.style.color = col; else el.style.backgroundImage = `linear-gradient(${col},${col})`;
    }
    if (bv.p) for (const [prop, vid] of Object.entries(bv.p)) {
      if (vid !== id) continue;
      const compId = setIndex.get(meta.components[el._n.cp]?.s)?.get(norm(`${prop}=${val}`));
      if (compId && compId !== el._n.cp) getNode(compId).then(D => D && el.isConnected && swap(el, D, null));
    }
  }
}

let toastEl;
function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.setAttribute('role', 'status'); Object.assign(toastEl.style, { position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', background: 'rgba(20,20,20,.92)', color: '#fff', font: '500 14px Inter,sans-serif', padding: '10px 16px', borderRadius: '999px', zIndex: 9999, transition: 'opacity .25s', opacity: 0, pointerEvents: 'none' }); document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.style.opacity = 1;
  clearTimeout(toastEl._t); toastEl._t = setTimeout(() => (toastEl.style.opacity = 0), 2600);
}
