import { Kinetic, mod, spline, sectionLoop, clamp } from './util.js';
import row from '../../data/cdrow.json';
import discs from '../../data/discs.json';

const byId = Object.fromEntries(discs.map((d) => [d.id, d]));
const S = row.slots, NS = S.length;                      // Figma "position=0": position + size of every slot along the diagonal
const fX = spline(S.map((s) => s[0]), 0), fY = spline(S.map((s) => s[1]), 0), fW = spline(S.map((s) => s[2]), 0);
// slots that can be on screen at all (section is 1440 x 1000 design units)
let LO = 0; for (let i = 0; i < NS; i++) { if (S[i][0] > -230 && S[i][1] < 1050) { LO = i; break; } }
const HI = NS + 2, SPAN = HI - LO + 2;
const BASE = row.size;                                    // the CD case component is 168.3 x 253.6

export function createCdRow(root, { u, onPlay }) {
  const layer = root.querySelector('.nf-cds');
  let U = u, near = false;
  const k = new Kinetic({ friction: 3.0 });
  const pool = Array.from({ length: SPAN + 2 }, () => {
    const el = document.createElement('div'); el.className = 'nf-cd'; el.style.display = 'none';
    el.innerHTML = '<i class="ht"></i><div class="case"><i class="er"></i><i class="et"></i><i class="fp"></i><i class="cv"><img alt="" decoding="async" draggable="false"></i><i class="hg"></i><i class="gs"></i></div>';
    el.img = el.querySelector('img'); el.layers = [...el.querySelectorAll('.case > i')];
    layer.appendChild(el); return el;
  });
  const NAMES = ['er', 'et', 'fp', 'cv', 'hg', 'gs'];
  const shape = () => pool.forEach((el) => { const l = row.layers[2], n = el.querySelector('.ht'), m = l.m; n.style.width = `${(l.w * U).toFixed(2)}px`; n.style.height = `${(l.h * U).toFixed(2)}px`; n.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${(m[4] * U).toFixed(2)},${(m[5] * U).toFixed(2)})`; row.layers.forEach((l, i) => {
    const n = el.layers[i]; n.style.width = `${(l.w * U).toFixed(2)}px`; n.style.height = `${(l.h * U).toFixed(2)}px`;
    const m = l.m; n.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${(m[4] * U).toFixed(2)},${(m[5] * U).toFixed(2)})`;
  }); });
  shape();
  const warm = () => { if (warm.done) return; warm.done = true; row.order.forEach((id) => { const i = new Image(); i.decoding = 'async'; i.sizes = `${Math.round(160 * U)}px`; i.srcset = `/img/films/${id}-240.webp 240w, /img/films/${id}-480.webp 480w`; i.src = `/img/films/${id}-240.webp`; }); };
  const io = new IntersectionObserver((e) => { near = e[e.length - 1].isIntersecting; if (near) { warm(); paint(); loop.kick(); } }, { rootMargin: '250px 0px' }); io.observe(root);

  let slotFor = (u2) => u2;
  function paint() {
    const F = k.pos, gLo = Math.ceil(LO - 1 - F), gHi = Math.floor(HI - F);
    let used = 0;
    for (let g = gLo; g <= gHi; g++) {
      const el = pool[mod(g, pool.length)], uu = g + F;
      if (el._g !== g) {
        el._g = g; const id = row.order[mod(g, 50)]; el._id = id; el._img = null;
        el.setAttribute('aria-label', byId[id] ? `${byId[id].title} — ${byId[id].by}` : 'album');
      }
      if (near && el._img !== el._id) {            // covers are only requested once the section is close to the viewport
        el._img = el._id; const id = el._id;
        el.img.srcset = `/img/films/${id}-240.webp 240w, /img/films/${id}-480.webp 480w`; el.img.sizes = `${Math.round(160 * U)}px`; el.img.src = `/img/films/${id}-240.webp`;
      }
      const w = fW(uu), s = w / BASE[0];
      el.style.display = '';
      el.style.transform = `translate3d(${(fX(uu) * U).toFixed(2)}px,${(fY(uu) * U).toFixed(2)}px,0) scale(${s.toFixed(4)})`;
      el.style.zIndex = 1000 - Math.round(uu * 4);
      used++;
    }
    for (const el of pool) if (el._g !== undefined && (el._g < gLo || el._g > gHi)) { el.style.display = 'none'; el._g = undefined; el.classList.remove('pull'); }
  }
  const loop = sectionLoop(root, { step(dt) { if (!dragging) k.step(dt); paint(); }, needs: () => dragging || k.target !== null || Math.abs(k.vel) > 0.004 });
  let dragging = false, x0 = 0, p0 = 0, lastX = 0, lastT = 0, v = 0, moved = 0, pid = -1, downEl = null;
  const step = () => 26 * U;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; pid = e.pointerId; x0 = lastX = e.clientX; p0 = k.pos; moved = 0; v = 0; lastT = performance.now(); downEl = e.target.closest('.nf-cd');
    k.vel = 0; k.target = null; dragging = true; loop.kick(); try { root.setPointerCapture(pid); } catch (_) { /* */ }
  });
  root.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pid) return;
    const dx = e.clientX - x0; moved = Math.max(moved, Math.abs(dx)); if (moved > 6) root.classList.add('drag');
    const now = performance.now(), dt = Math.max(1, now - lastT); v = 0.8 * v + 0.2 * ((e.clientX - lastX) / step() / (dt / 1000)); lastX = e.clientX; lastT = now;
    k.pos = p0 + dx / step();
  });
  const up = (e) => {
    if (!dragging || e.pointerId !== pid) return; dragging = false; root.classList.remove('drag'); try { root.releasePointerCapture(pid); } catch (_) { /* */ }
    if (moved <= 6 && downEl && downEl._id) onPlay(byId[downEl._id]);
    else k.vel = clamp(performance.now() - lastT < 80 ? v : 0, -40, 40);
    loop.kick();
  };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  let hot = null;
  root.addEventListener('pointerover', (e) => { if (dragging) return; const c = e.target.closest('.nf-cd'); if (c !== hot) { hot && hot.classList.remove('pull'); hot = c; c && c.classList.add('pull'); } });
  root.addEventListener('pointerleave', () => { hot && hot.classList.remove('pull'); hot = null; });
  root.addEventListener('wheel', (e) => {
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey; if (!horizontal) return;
    e.preventDefault(); const dx = (Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 16 : 1);
    k.target = null; k.vel = 0; k.pos -= dx / step() * 1.1; loop.kick();
  }, { passive: false });
  paint();
  return { key(dir) { const from = k.target !== null ? k.target : k.pos; k.target = from + dir * 4; k.vel = 0; loop.kick(); }, resize(nu) { U = nu; shape(); pool.forEach((el) => { el._g = undefined; el._img = null; }); paint(); }, loop };
}
