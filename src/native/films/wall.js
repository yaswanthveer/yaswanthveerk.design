import { Kinetic, mod, spline, sectionLoop, reduced, clamp, imgSet } from './util.js';
import { makeDisc } from './disc.js';

// Figma "disc wall / kind=films, pos=0": centre + size of the 9 visible discs (d = -4..4), 1440x900 design units
const AX = [-562.6, -296.1, 5.1, 340.6, 709.7, 1093.6, 1440.3, 1750.2, 2023.8];
const AY = [843.0, 755.8, 669.3, 584.0, 500.4, 402.9, 307.0, 212.3, 118.4];
const AS = [324.9, 360.0, 403.6, 459.3, 532.8, 459.3, 403.6, 360.0, 324.9];
const fx = spline(AX, -4), fy = spline(AY, -4), fs = spline(AS, -4);
const TILT = 12, SQUASH = 0.86, POOL = 13, PRELOAD = 4;
const IDLE_MS = 2600, DRIFT = 0.055;      // discs per second

export function createWall(root, { u, data, onOpen }) {
  const kinds = { film: data.filter((d) => d.kind === 'film'), album: data.filter((d) => d.kind === 'album') };
  let kind = 'film', list = kinds.film;
  const k = new Kinetic();
  const pool = Array.from({ length: POOL }, () => makeDisc());
  const stage = root.querySelector('.nf-discs'); pool.forEach((d) => { d.style.display = 'none'; stage.appendChild(d); });
  const els = { title: root.querySelector('.nf-title'), card: root.querySelector('.nf-card'), count: root.querySelector('.nf-count'), n1: root.querySelector('.nf-note.a'), n2: root.querySelector('.nf-note.b'), dot: root.querySelector('.nf-dot'), tabs: [...root.querySelectorAll('.nf-tab')] };
  let U = u, centre = -1, lastInput = 0, hovering = false, dragging = false, wheelT = 0, loaded = new Set();
  const area = () => ({ w: root.clientWidth });

  // ---- details card (instant swap, 150 ms fade at most) ----
  function fill(d, animate) {
    const film = d.kind === 'film';
    const rows = film ? [['Directed by', d.by], ['Year', String(d.year)], ['Starring', d.starring.split(/,\s*/).join('\n')], ['Runtime', d.runtime]]
      : [['Artist', d.by], ['Year', String(d.year)], ['Label', d.starring], ['Produced by', d.runtime]];
    els.title.textContent = d.title;
    const rowsHtml = rows.map(([l, v]) => `<div class="nf-row"><b></b><span></span></div>`).join('');
    const holder = els.card.querySelector('.rows');
    if (holder.children.length !== rows.length) holder.innerHTML = rowsHtml;
    rows.forEach(([l, v], i) => { const r = holder.children[i]; r.children[0].textContent = l; r.children[1].textContent = v; });
    const n1 = film ? (d.honours ? ['Honours', d.honours] : ['Genre', d.genre]) : ['Genre', d.genre];
    const n2 = film ? ['Box office', d.box + ' worldwide'] : ['Sales', d.box];
    for (const [el, [l, v]] of [[els.n1, n1], [els.n2, n2]]) { el.querySelector('b').textContent = l; el.querySelector('span').textContent = v; el.classList.toggle('small', !film && el === els.n2); }
    els.count.textContent = `${String(d.n).padStart(3, '0')} / ${String(list.length).padStart(film ? 3 : 2, '0')}`;
    if (animate) for (const e of [els.card, els.n1, els.n2]) { e.classList.remove('nf-swap'); void e.offsetWidth; e.classList.add('nf-swap'); }
  }

  // ---- layout: every disc is positioned from one float (k.pos) ----
  function layout() {
    const N = list.length, c = Math.round(k.pos), base = Math.floor(k.pos);
    const used = new Set();
    for (let i = base - 5; i <= base + 6; i++) {
      const rel = i - k.pos, el = pool[mod(i, POOL)], d = list[mod(i, N)];
      const a = Math.abs(rel);
      if (a > 5.2) continue;
      used.add(el);
      if (el._k !== i) { el._k = i; el.setImage(d, `${Math.round(532.8 * U)}px`); el._d = d; }
      const s = fs(rel) / 360, o = a > 4 ? clamp(5 - a, 0, 1) : 1;
      const x = fx(rel) * U - 180 * U, y = fy(rel) * U - 180 * U;
      el.style.display = '';
      el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${TILT}deg) scale(${s.toFixed(4)},${(s * SQUASH).toFixed(4)})`;
      el.style.zIndex = 1000 - Math.round(a * 100);
      el.style.opacity = o === 1 ? '' : o.toFixed(3);
    }
    for (const el of pool) if (!used.has(el) && el.style.display !== 'none') { el.style.display = 'none'; el._k = null; el._id = null; }
    if (c !== centre) { centre = c; fill(list[mod(c, N)], true); preload(c); }
  }
  function preload(c) {
    const N = list.length;
    for (let i = c - PRELOAD; i <= c + PRELOAD; i++) {
      const d = list[mod(i, N)]; if (loaded.has(d.id)) continue; loaded.add(d.id);
      const im = new Image(); im.decoding = 'async'; im.sizes = `${Math.round(532.8 * U)}px`; im.srcset = imgSet(d.id); im.src = `/img/films/${d.id}-480.webp`;
    }
  }

  // ---- animation loop (rAF, only while the wall is visible and something moves) ----
  const idle = () => performance.now() - lastInput > IDLE_MS && !hovering && !dragging && !reduced() && k.target === null && Math.abs(k.vel) < 0.01;
  const loop = sectionLoop(root, {
    step(dt) {
      if (!dragging) { const moving = k.step(dt); if (!moving && idle()) k.pos += DRIFT * dt; }
      layout();
    },
    needs: () => dragging || k.target !== null || Math.abs(k.vel) > 0.004 || idle() || performance.now() - lastInput < IDLE_MS,
  });
  const poke = () => { lastInput = performance.now(); loop.kick(); };

  // ---- input: drag (inertia, then settle), wheel/trackpad, keys, tap ----
  let px0 = 0, pStart = 0, moved = 0, lastX = 0, lastT = 0, v = 0, downEl = null, pid = -1;
  const step = () => 360 * U;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.nf-tab, .nf-tiger')) return;
    pid = e.pointerId; downEl = e.target.closest('.nf-disc'); px0 = lastX = e.clientX; pStart = k.pos; moved = 0; v = 0; lastT = performance.now();
    k.vel = 0; k.target = null; dragging = true; poke();
    try { root.setPointerCapture(pid); } catch (_) { /* */ }
  });
  root.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pid) return;
    const dx = e.clientX - px0; moved = Math.max(moved, Math.abs(dx));
    if (moved > 6) root.classList.add('drag');
    const now = performance.now(), dt = Math.max(1, now - lastT);
    v = 0.8 * v + 0.2 * (-(e.clientX - lastX) / step() / (dt / 1000)); lastX = e.clientX; lastT = now;
    k.pos = pStart - dx / step(); lastInput = now; loop.kick();
  });
  const up = (e) => {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false; root.classList.remove('drag'); try { root.releasePointerCapture(pid); } catch (_) { /* */ }
    if (moved <= 6 && downEl) { tap(downEl); return poke(); }
    k.vel = clamp(performance.now() - lastT < 80 ? v : 0, -9, 9); k.settleToNearest(); poke();
  };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  root.addEventListener('pointerover', (e) => { hovering = true; const d = e.target.closest('.nf-disc'); if (d && !dragging) d.classList.add('hov'); });
  root.addEventListener('pointerout', (e) => { const d = e.target.closest('.nf-disc'); if (d) d.classList.remove('hov'); });
  root.addEventListener('pointerleave', () => { hovering = false; poke(); });
  root.addEventListener('wheel', (e) => {
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
    if (!horizontal) return;                                        // vertical wheel keeps scrolling the page
    e.preventDefault();
    const dx = (Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 16 : 1);
    k.target = null; k.vel = 0; k.pos += dx / step() * 1.15; poke();
    clearTimeout(wheelT); wheelT = setTimeout(() => { k.settleToNearest(); poke(); }, 140);
  }, { passive: false });
  function tap(el) {
    const i = el._k, N = list.length;
    if (Math.abs(i - k.pos) < 0.5) onOpen(list[mod(i, N)], root); else { k.target = i; k.vel = 0; }
  }
  const api = {
    key(dir) { const from = k.target !== null ? k.target : Math.round(k.pos); k.target = from + dir; k.vel = 0; poke(); },
    openCentre() { onOpen(list[mod(Math.round(k.pos), list.length)], root); },
    setKind(next) {
      if (next === kind) return; kind = next; list = kinds[next]; k.pos = 0; k.vel = 0; k.target = null; centre = -1; loaded = new Set();
      pool.forEach((el) => { el._k = null; el._id = null; });
      els.tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.k === next)));
      els.dot.classList.toggle('m', next === 'album'); poke();
    },
    resize(nu) { U = nu; pool.forEach((el) => { el._k = null; el._id = null; }); loaded = new Set(); layout(); },
    get kind() { return kind; }, get loop() { return loop; }, get centre() { return list[mod(Math.round(k.pos), list.length)]; },
    get pos() { return k.pos; }, set pos(v2) { k.pos = v2; poke(); },
  };
  els.tabs.forEach((t) => t.addEventListener('click', () => api.setKind(t.dataset.k)));
  layout(); poke();
  return api;
}
