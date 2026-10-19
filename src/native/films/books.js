import data from '../../data/books.json';
import { sectionLoop, reduced } from './util.js';

const B = data.books, GAP = data.gap;
const AUTO_MS = 3500;                    // 2.6 s hold + 0.9 s turn, as in the Figma prototype

export function createBooks(root, { u, onOpen }) {
  const shelf = root.querySelector('.nf-shelf');
  let U = u, open = 1, hover = false, visible = false, timer = 0;
  const els = B.map((b) => {
    const el = document.createElement('div'); el.className = 'nf-book'; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${b.title} by ${b.author}`);
    el.innerHTML = `<div class="sp" style="background:${b.bg}"><i class="sh"></i><span class="tt"></span><span class="au"></span><div class="chip"><img alt="" decoding="async" draggable="false"></div></div><div class="cv"><img alt="" decoding="async" draggable="false"></div>`;
    el.querySelector('.tt').textContent = b.title; el.querySelector('.au').textContent = b.author;
    shelf.appendChild(el); el._b = b; return el;
  });
  function style() {
    els.forEach((el, i) => {
      const b = B[i], sp = el.querySelector('.sp'), cv = el.querySelector('.cv'), tt = el.querySelector('.tt'), au = el.querySelector('.au'), ch = el.querySelector('.chip');
      sp.style.width = `${b.closedW * U}px`; cv.style.width = `${b.openW * U}px`;
      tt.style.cssText = `left:${b.tPos[0] * U}px;top:${b.tPos[1] * U}px;font:400 ${b.tSize * U}px/1 ${b.tFont},sans-serif;letter-spacing:${(b.tLS || 0) * U}px;color:${b.tColor}`;
      au.style.cssText = `left:${b.aPos[0] * U}px;top:${b.aPos[1] * U}px;font:${b.aWeight || 600} ${b.aSize * U}px/1 Inter,sans-serif;letter-spacing:${(b.aLS || 0) * U}px;color:${b.aColor}`;
      const c = b.chip[0]; ch.style.cssText = `left:${c[0] * U}px;top:${c[1] * U}px;width:${c[2] * U}px;height:${c[3] * U}px`;
      el.style.setProperty('--sw', `${b.closedW * U}px`);
    });
    place(true);
  }
  function place(instant) {
    const widths = B.map((b, i) => (i + 1 === open ? b.openW : b.closedW));
    const total = widths.reduce((a, w) => a + w, 0) + GAP * (B.length - 1);
    let x = (1440 - total) / 2;
    els.forEach((el, i) => {
      const b = B[i], isOpen = i + 1 === open, w = widths[i];
      if (instant) { el.style.transition = 'none'; }
      el.style.width = `${w * U}px`; el.style.transform = `translate3d(${(x * U).toFixed(2)}px,0,0)`;
      const sp = el.querySelector('.sp'), cv = el.querySelector('.cv');
      sp.style.transform = `translate3d(${isOpen ? -b.closedW * U : 0}px,0,0)`;
      cv.style.transform = `translate3d(${isOpen ? 0 : b.closedW * U}px,0,0)`;
      if (el.classList.contains('open') !== isOpen) { el.classList.toggle('open', isOpen); el.setAttribute('aria-expanded', String(isOpen)); }
      x += w + GAP;
      if (instant) { void el.offsetWidth; el.style.transition = ''; }
    });
  }
  const setOpen = (n) => { if (n === open) return; open = n; place(false); };
  function schedule() { clearTimeout(timer); if (!visible || hover || reduced() || document.hidden) return; timer = setTimeout(() => { setOpen((open % B.length) + 1); schedule(); }, AUTO_MS); }
  const loop = sectionLoop(root, { step() { /* books animate through CSS transitions; the visibility tracker only gates the timer */ }, needs: () => false });
  const ioLoad = new IntersectionObserver((e) => { if (e[e.length - 1].isIntersecting) load(); }, { rootMargin: '300px 0px' }); ioLoad.observe(root);
  const io = new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) schedule(); else clearTimeout(timer); }, { rootMargin: '-60px 0px' }); io.observe(root);
  function load() { if (load.done) return; load.done = true; els.forEach((el, i) => { const b = B[i]; const big = el.querySelector('.cv img'), small = el.querySelector('.chip img'); big.sizes = `${Math.round(b.openW * U)}px`; big.srcset = `/img/films/${b.id}-240.webp 240w, /img/films/${b.id}-640.webp 640w`; big.src = `/img/films/${b.id}-640.webp`; small.src = `/img/films/${b.id}-240.webp`; }); }
  shelf.addEventListener('pointerover', (e) => { const el = e.target.closest('.nf-book'); if (!el) return; hover = true; clearTimeout(timer); setOpen(+B.indexOf(el._b) + 1); });
  shelf.addEventListener('pointerleave', () => { hover = false; schedule(); });
  shelf.addEventListener('click', (e) => { const el = e.target.closest('.nf-book'); if (el) onOpen(el._b); });
  shelf.addEventListener('keydown', (e) => { const el = e.target.closest('.nf-book'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(el._b); } });
  shelf.addEventListener('focusin', (e) => { const el = e.target.closest('.nf-book'); if (el) { hover = true; clearTimeout(timer); setOpen(B.indexOf(el._b) + 1); } });
  shelf.addEventListener('focusout', () => { hover = false; schedule(); });
  style();
  return { key(dir) { setOpen(((open - 1 + dir + B.length) % B.length) + 1); }, resize(nu) { U = nu; style(); }, loop };
}
