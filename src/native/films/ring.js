import { Kinetic, mod, sectionLoop, reduced, clamp } from './util.js';
import ring from '../../data/ring.json';
import discs from '../../data/discs.json';

const byId = Object.fromEntries(discs.map((d) => [d.id, d]));
const N = ring.cards.length, F = ring.frames.length;
const AUTO = 0.6;                       // ring variants (10 degrees each) per second: one slow turn in about a minute

export function createRing(root, { u, onOpen }) {
  const layer = root.querySelector('.nf-cards');
  const prev = root.querySelector('.nf-prev'), pt = root.querySelector('.nf-pt'), pd = root.querySelector('.nf-pd');
  let U = u, hovering = false, overCard = false, dragging = false, near = false;
  const k = new Kinetic({ friction: 2.4 });
  const cards = ring.cards.map((c, i) => {
    const d = byId[c.disc] || null;
    const el = document.createElement('div'); el.className = 'nf-card3'; el._i = i; el._d = d; el.setAttribute('role', 'img'); el.setAttribute('aria-label', d ? `${d.title} (${d.year})` : c.name);
    el.style.transform = 'translate3d(-999px,0,0)'; el.style.zIndex = 0;
    layer.appendChild(el); return el;
  });
  // which way do front cards move when the angle variant grows? (so dragging follows the finger)
  const frontIdx = (fr) => { let b = 0; for (let i = 1; i < N; i++) if (fr[i * 6 + 5] > fr[b * 6 + 5]) b = i; return b; };
  const fi = frontIdx(ring.frames[0]);
  const dirFront = Math.sign(ring.frames[1][fi * 6 + 4] - ring.frames[0][fi * 6 + 4]) || 1;

  function paint() {
    const p = mod(k.pos, F), i = Math.floor(p), f = p - i, A = ring.frames[i], B = ring.frames[(i + 1) % F], Z = ring.z[Math.round(p) % F];   // draw order = Figma's child order of the nearest variant
    for (let c = 0; c < N; c++) {
      const o = c * 6, m = new Array(6);
      for (let q = 0; q < 6; q++) m[q] = A[o + q] + (B[o + q] - A[o + q]) * f;
      const el = cards[c];
      el.style.transform = `matrix(${m[0].toFixed(4)},${m[1].toFixed(4)},${m[2].toFixed(4)},${m[3].toFixed(4)},${(m[4] * U).toFixed(2)},${(m[5] * U).toFixed(2)})`;
      const z = Z[c]; if (z !== el._z) { el._z = z; el.style.zIndex = z; }
    }
  }
  function load() {
    if (load.done) return; load.done = true;
    cards.forEach((el) => { const d = el._d; if (!d) return; const im = new Image(); im.alt = ''; im.decoding = 'async'; im.draggable = false; im.src = `/img/films/${d.id}-240.webp`; im.srcset = `/img/films/${d.id}-160.webp 160w, /img/films/${d.id}-240.webp 240w`; im.sizes = `${Math.round(86 * U)}px`; el.appendChild(im); });
  }
  const io = new IntersectionObserver((e) => { near = e[e.length - 1].isIntersecting; if (near) { load(); loop.kick(); } }, { rootMargin: '250px 0px' }); io.observe(root);

  let shown = null;
  function show(d) {
    if (!d || shown === d.id) return; shown = d.id;
    prev.src = `/img/films/${d.id}-480.webp`; prev.srcset = `/img/films/${d.id}-240.webp 240w, /img/films/${d.id}-480.webp 480w, /img/films/${d.id}-900.webp 900w`; prev.sizes = `${Math.round(150 * U)}px`; prev.alt = `${d.title} poster`;
    pt.textContent = d.title; pd.textContent = `${d.by} · ${d.year}`;
  }
  show(byId[ring.cards.find((c) => /Fight Club/.test(c.name))?.disc] || byId[ring.cards[0].disc]);

  const loop = sectionLoop(root, {
    step(dt) {
      if (!dragging) { const moving = k.step(dt); if (!moving && !overCard && !reduced()) k.pos += AUTO * dt; }
      paint();
    },
    needs: () => dragging || Math.abs(k.vel) > 0.004 || (!overCard && !reduced()),
  });

  let x0 = 0, p0 = 0, lastX = 0, lastT = 0, v = 0, moved = 0, pid = -1, downCard = null;
  const step = () => 80 * U;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pid = e.pointerId; x0 = lastX = e.clientX; p0 = k.pos; moved = 0; v = 0; lastT = performance.now(); downCard = e.target.closest('.nf-card3');
    k.vel = 0; dragging = true; loop.kick(); try { root.setPointerCapture(pid); } catch (_) { /* */ }
  });
  root.addEventListener('pointermove', (e) => {
    if (dragging && e.pointerId === pid) {
      const dx = e.clientX - x0; moved = Math.max(moved, Math.abs(dx)); if (moved > 6) root.classList.add('drag');
      const now = performance.now(), dt = Math.max(1, now - lastT);
      v = 0.8 * v + 0.2 * (dirFront * (e.clientX - lastX) / step() / (dt / 1000)); lastX = e.clientX; lastT = now;
      k.pos = p0 + dirFront * dx / step(); return;
    }
    const c = e.target.closest && e.target.closest('.nf-card3'); if (c && c._d) show(c._d);
    const was = overCard; overCard = !!c; if (was && !overCard) loop.kick();
  });
  const up = (e) => {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false; root.classList.remove('drag'); try { root.releasePointerCapture(pid); } catch (_) { /* */ }
    if (moved <= 6) { const c = downCard || (e.target.closest && e.target.closest('.nf-card3')); if (c && c._d) { show(c._d); onOpen && onOpen(c._d); } }
    else k.vel = clamp(performance.now() - lastT < 80 ? v : 0, -14, 14);
    loop.kick();
  };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  root.addEventListener('pointerenter', () => { hovering = true; });
  root.addEventListener('pointerleave', () => { hovering = false; overCard = false; loop.kick(); });
  root.addEventListener('wheel', (e) => {
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey; if (!horizontal) return;
    e.preventDefault(); const dx = (Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 16 : 1);
    k.pos += dirFront * -dx / step() * 1.1; k.vel = 0; loop.kick();
  }, { passive: false });
  paint();
  return { key(dir) { k.vel += dirFront * -dir * 3.2; loop.kick(); }, resize(nu) { U = nu; paint(); }, loop, get hovering() { return hovering; } };
}
