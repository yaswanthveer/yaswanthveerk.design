import { MOBILE, trimFar, buildNode, lazy, lazyIdle, loadNear, drainBackground, loadBg, predecode, waitNear } from './render.js';
import { mountTools } from './tools/mount.js';
import { mountHeadphones } from './player/index.js';
import { active as plActive, play as plPlay } from './preloader/index.js';
import { initData, loadTop, getNode, hooks, rebindTree, meta, easing, cullLoops } from './engine.js';
import { images } from './render.js';

const app = document.getElementById('app');
window.__lazy = lazy; window.__lazyIdle = lazyIdle;   // test hooks
const HOME = '1:26';           // "about me" is the hub every page links back to
const history = [];
let current = null;            // { id, el, stage }
const overlays = [];           // [{ id, root, layer }]

const scale = (w) => innerWidth / w;

const LEGACY = new URLSearchParams(location.search).has('legacy');   // ?legacy renders 1:430 through the Figma runtime again
async function makeView(id) {
  // Books, Movies & Films is a native page (see src/native/films); every other page still plays back through the Figma runtime
  if (id === '1:430' && !LEGACY) { const { createFilmsView } = await import('./native/films/index.js'); return createFilmsView({ navigate: (dest) => hooks.navigate(dest, { transition: { duration: 0.5 } }) }); }   // loaded on demand
  const { root } = await loadTop(id);
  lazy.on = true;
  const stage = document.createElement('div');
  stage.className = 'stage view';
  stage.dataset.page = id;
  const el = buildNode(root);
  el.classList.add('fig');
  stage.appendChild(el);
  const fit = () => { const s = scale(root.w); stage.style.height = root.h * s + 'px'; el.style.transform = `scale(${s})`; };
  fit(); stage._fit = fit;
  lazy.on = false;
  return { id, el, stage, root };
}

// destinations referenced by variant swaps must be loaded before they are needed
async function preloadVariants(root) {
  const ids = new Set();
  const { default: _ } = { default: 0 };
  const walk = (n) => { if (n.ix) n.ix.forEach(i => ids.add(i)); (n.ch || []).forEach(walk); };
  walk(root);
  const table = await (await fetch('/data/interactions.json')).json();
  const tops = new Set();
  for (const i of ids) for (const it of [table[i]]) for (const a of it.actions || []) {
    if (a && a.type === 'NODE' && a.navigation === 'CHANGE_TO') { const o = meta.owner[a.destinationId]; if (o) tops.add(o); }
  }
  await Promise.all([...tops].map(t => loadTop(t)));
}

// wait for fonts and the above-the-fold images (bounded) so a page never pops in half-painted
async function settle(max = 2500) {
  drainBackground();
  await Promise.race([Promise.all([document.fonts.ready, waitNear(250, max)]), new Promise(r => setTimeout(r, max))]);
}

// one navigation at a time (a second tap during a transition used to leave a stale page behind); the latest request wins
let busy = false, pendingNav = null;
async function show(id, opts = {}) {
  if (busy) { pendingNav = [id, opts]; return; }
  busy = true;
  try { await showNow(id, opts); } finally { busy = false; if (pendingNav) { const [i, o] = pendingNav; pendingNav = null; show(i, o); } }
}
async function showNow(id, { push = true, transition, url = true } = {}) {
  const T0 = performance.now(); const mark = (k) => { if (window.__prof) (window.__prof.nav ||= []).push([id, k, Math.round(performance.now() - T0)]); };
  const view = await makeView(id); mark('built');
  // variant data (can be many MB) is only needed once something swaps: load it in the background, then re-arm loops
  if (!view.native) preloadVariants(view.root).then(() => { mark('variants'); if (view.el.isConnected) rebindTree(view.el); }).catch(() => { /* navigation cancelled the request */ });
  const old = current;
  view.stage.style.position = 'relative';
  view.stage.style.visibility = 'hidden';
  app.appendChild(view.stage);
  if (!view.native) { rebindTree(view.el); loadNear(900); }
  await settle(); mark('settled');
  view.stage.style.visibility = '';
  if (old) {
    if (push) history.push(old.id);
    const dur = (transition?.duration ?? 0.5) * 1000;
    old.stage.style.position = 'absolute'; old.stage.style.top = '0'; old.stage.style.left = '0'; old.stage.style.width = '100%';
    window.scrollTo(0, 0);
    const ease = easing(transition?.easing);
    view.stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: ease });
    old.stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: ease }).onfinish = () => { old.destroy && old.destroy(); old.stage.remove(); };
  }
  current = view;
  if (url && old) { try { window.history.pushState({ site: id }, '', '#' + id.replace(':', '_')); } catch (_) { /* sandboxed */ } }   // the browser Back button walks back through the pages
  if (id === '1:26') mountHeadphones(view);
  if (id === '1:7') mountTools(view);
  if (id === '1:7' && !MOBILE) import('./native/projects/ProjectDetail.js').then((mod) => (window.requestIdleCallback || setTimeout)(mod.warm, { timeout: 3000 })).catch(() => {});   // warm the pop-up code and first screens
  drainBackground();
  if (!view.native && !MOBILE) setTimeout(() => prefetchLinked(view.root).catch(() => {}), 800);
  document.body.style.background = bgOf(view.root);
  history.length = Math.min(history.length, 50);
}

function bgOf(root) {
  const f = root.fl && root.fl[root.fl.length - 1];
  return f && f.t === 'S' ? `rgb(${f.c[0]},${f.c[1]},${f.c[2]})` : '#0c0b09';
}

// ---- warm the pages this page links to, while the browser is idle -------------------------------------
let ixTable = null;
function warm(node, ymax) {
  const urls = [];
  const walk = (n, oy) => {
    if (n.hd) return;
    const y = oy + n.y;
    if (y > ymax + 200) return;
    for (const p of n.fl || []) if (p.t === 'I' && images[p.ref]) urls.push(`/img/${images[p.ref]}`);
    for (const c of n.ch || []) walk(c, y);
  };
  walk(node, 0);
  for (const u of new Set(urls)) { const i = new Image(); i.fetchPriority = 'low'; i.decoding = 'async'; i.src = u; }
}
async function prefetchLinked(root) {
  ixTable ||= await (await fetch('/data/interactions.json')).json();
  const dests = new Set();
  const walk = (n) => { for (const i of n.ix || []) for (const a of ixTable[i].actions || []) if (a && a.type === 'NODE' && (a.navigation === 'NAVIGATE' || a.navigation === 'OVERLAY') && meta.owner[a.destinationId]) dests.add(a.destinationId); (n.ch || []).forEach(walk); };
  walk(root);
  const list = [...dests].filter(d => !d.startsWith('0:')).slice(0, 8);
  for (const d of list) {
    await new Promise(r => (window.requestIdleCallback || setTimeout)(r, { timeout: 1500 }));
    try { const top = meta.owner[d]; const { root: r } = await loadTop(top); warm(r, 2000); hooks.warmOverlay?.(d); } catch (e) { /* ignore */ }
  }
}

function imageUrls(node) {
  const out = new Set();
  const walk = (n) => { if (n.hd) return; for (const p of [...(n.fl || []), ...(n.sk || [])]) if (p.t === 'I' && images[p.ref]) out.add(`/img/${images[p.ref]}`); (n.ch || []).forEach(walk); };
  walk(node); return [...out];
}
// start fetching + decoding an overlay's images (and data) before it is asked for
const warmed = new Set();
hooks.warmOverlay = async (dest) => {
  if (warmed.has(dest)) return; warmed.add(dest);
  try { const node = (await getNode(dest)); if (node) imageUrls(node).forEach(predecode); } catch (e) { /* ignore */ }
};

// Projects screen: each card opens ProjectDetail with ONLY its own entry (matched by the card's visible name, never by layer name)
hooks.project = async (el) => {
  const name = (el.querySelector('.t') || {}).textContent;
  const { openProject } = await import('./native/projects/ProjectDetail.js');
  if (!(await openProject(name, el))) console.warn('[projects] no entry for card:', name);
};

hooks.navigate = (dest, action) => { if (dest === current.id) return; return show(dest, { transition: action.transition }); };
hooks.back = () => { if (overlays.length) return closeOverlay(); const prev = history.pop(); if (prev) show(prev, { push: false, url: false }); };
// browser Back / Forward (and manual hash edits)
function route() {
  const st = window.history.state; if (st && st.pd) return;              // a project pop-up owns this history entry
  const id = location.hash.slice(1).replace('_', ':') || HOME;
  if (current && id !== current.id && meta.pages[id]) { if (overlays.length) closeOverlay(); show(id, { push: false, url: false }); }
}
addEventListener('popstate', route); addEventListener('hashchange', route);

// ---- overlays -------------------------------------------------------------------------------
hooks.overlay = async (dest, action) => {
  const { root } = await loadTop(meta.owner[dest]);
  const node = (await getNode(dest)) || root;
  await preloadVariants(node);
  // never show a half-painted overlay: wait (bounded) until its images are decoded
  await Promise.race([Promise.all(imageUrls(node).map(predecode)), new Promise(r => setTimeout(r, 1800))]);
  const layer = document.createElement('div');
  layer.className = 'overlay-layer';
  Object.assign(layer.style, { position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', zIndex: 100 + overlays.length, overflow: 'hidden', pointerEvents: 'none' });
  const el = buildNode(node);
  el.classList.add('fig');
  const place = () => {
    const s = scale(current.root.w);
    el.style.left = (innerWidth - node.w * s) / 2 + 'px'; el.style.top = (innerHeight - node.h * s) / 2 + 'px';
    el.style.transform = `scale(${s})`;
    el.style.pointerEvents = 'none';
  };
  place(); layer._place = place;
  layer.appendChild(el);
  document.body.appendChild(layer);
  rebindTree(el);
  el.style.pointerEvents = 'none';
  const dur = (action.transition?.duration ?? 0.25) * 1000;
  layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: easing(action.transition?.easing) });
  overlays.push({ id: dest, el, layer });
};

function closeOverlay(from) {
  let idx = overlays.length - 1;
  if (from) { const i = overlays.findIndex(o => o.layer.contains(from)); if (i >= 0) idx = i; }
  const o = overlays[idx]; if (!o) return;
  overlays.splice(idx, 1);
  const a = o.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out' });
  a.onfinish = () => o.layer.remove();
}
hooks.close = (el) => closeOverlay(el);

let scrollT = 0;
addEventListener('scroll', () => { if (scrollT) return; scrollT = setTimeout(() => { scrollT = 0; trimFar(); settleUntil = performance.now() + 5000; tick(); loadNear(1400); drainBackground(); }, 120); }, { passive: true });
// Idle loops are paused while far off-screen, and while newly visible images are still being painted (Safari decodes
// images on the same thread that renders hundreds of animated layers, so a spinning ring makes every image slow)
let settleUntil = performance.now() + 6000;
function tick() { const hold = performance.now() < settleUntil && !lazyIdle(); cullLoops(hold); }
setInterval(tick, 350);
addEventListener('resize', () => { current?.stage._fit(); overlays.forEach(o => o.layer._place()); });

(async function boot() {
  const intro = plActive();                                   // the preloader (index.html) is on screen: it owns the loading state
  let bar = null;
  if (!intro) { bar = document.createElement('div'); bar.id = 'loadbar'; document.body.appendChild(bar); }
  await initData();
  const start = (location.hash.slice(1).replace('_', ':')) || HOME;
  const shown = show(start, { push: false });                 // the real home page renders underneath while the intro plays
  if (intro) await Promise.all([plPlay(async () => { await shown; return current; }), shown]); else await shown;
  if (bar) { bar.style.opacity = '0'; setTimeout(() => bar.remove(), 400); }
  document.body.dataset.ready = '1';
  try { localStorage.removeItem('bootAt'); } catch (_) { /* private mode */ }
})();
