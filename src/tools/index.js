import './tools.css';

// "Tools I use": a small video-editor timeline. A playhead sweeps 8 s; each tool pops in as it is passed, then it keeps looping slowly,
// bouncing every tile it passes. Transform and opacity only, one rAF loop, paused off-screen.
const TOOLS = [
  { n: 'Figma', f: '/tools/figma.svg', multi: true },
  { n: 'Framer', f: '/tools/framer.svg', c: '#0055ff' },
  { n: 'Blender', f: '/tools/blender.svg', c: '#ea7600' },
  { n: 'Claude', f: '/tools/claude.svg', c: '#d97757' },
  { n: 'Adobe XD', f: '/tools/adobe-xd.svg', c: '#ff2bc2' },
  { n: 'Apple Notes', f: '/tools/apple-notes.png', c: '#ffc928', img: true },
  { n: 'VS Code', f: '/tools/vs-code.svg', c: '#007acc' },
  { n: 'Warp', f: '/tools/warp.svg', c: '#01a4ff' },
];
const SWEEP = 8, LOOP = 14;                               // seconds: first reveal sweep, then slow loops
const EASE_POP = 'cubic-bezier(.34,1.56,.64,1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (t) => { const s = Math.floor(t), c = Math.floor((t - s) * 100); return `00:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };

export function createTools() {
  const root = document.createElement('section'); root.className = 'tl'; root.setAttribute('aria-label', 'Tools I use');
  const ticks = Array.from({ length: SWEEP * 4 + 1 }, (_, i) => `<i class="${i % 4 === 0 ? 's' : ''}" style="left:${(i / (SWEEP * 4) * 100).toFixed(3)}%"></i>`).join('');
  const labels = Array.from({ length: SWEEP + 1 }, (_, i) => `<em style="left:${(i / SWEEP * 100).toFixed(3)}%">${i}s</em>`).join('');
  root.innerHTML = `<div class="tl-panel"><div class="tl-head"><h2>Tools I use</h2><span>8 tools · hover a tile</span></div>
    <div class="tl-bar"><button class="tl-play" type="button" aria-label="Pause"><svg class="i-pause" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor"/></svg><svg class="i-play" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.2v11.6L12.6 7z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg></button>
      <div class="tl-time"><b class="tl-now">00:00.00</b> / 00:08</div></div>
    <div class="tl-scroll"><div class="tl-inner"><div class="tl-ruler" aria-hidden="true">${ticks}${labels}</div><div class="tl-ph" aria-hidden="true"></div>
      <ul class="tl-row">${TOOLS.map((t, i) => `<li class="tl-tile pre" data-i="${i}"><div class="tl-face${t.multi ? ' multi' : ''}" tabindex="0" role="img" aria-label="${t.n}" style="--c:${t.c || '#a259ff'}">${t.img ? `<img class="tl-img" src="${t.f}" alt="" width="512" height="512" decoding="async">` : `<i class="tl-logo" style="--m:url(${t.f})"></i>`}<i class="tl-gloss"></i></div><span class="tl-name">${t.n}</span></li>`).join('')}</ul></div></div></div>`;
  const panel = root.querySelector('.tl-panel'), ph = root.querySelector('.tl-ph'), inner = root.querySelector('.tl-inner'), now = root.querySelector('.tl-now'), btn = root.querySelector('.tl-play');
  const tiles = [...root.querySelectorAll('.tl-tile')], faces = tiles.map((t) => t.querySelector('.tl-face'));
  const ruler = root.querySelector('.tl-ruler');

  let t = 0, running = true, seen = false, popped = new Array(8).fill(false), visible = false, raf = 0, last = 0, rm = reduced(), short = false;
  const pop = (i) => { if (popped[i]) return; popped[i] = true; const el = tiles[i]; el.classList.remove('pre');
    el.animate([{ opacity: 0, transform: 'translate3d(0,14px,0) scale(.6)' }, { opacity: 1, transform: 'translate3d(0,-3px,0) scale(1.05)', offset: .6 }, { opacity: 1, transform: 'none' }], { duration: 620, easing: EASE_POP, fill: 'backwards' }); };
  const bounce = (i) => tiles[i].animate([{ transform: 'none' }, { transform: 'scale(1.04)', offset: .4 }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
  const centre = (i) => { const r = tiles[i].getBoundingClientRect(), b = inner.getBoundingClientRect(); return (r.left + r.width / 2 - b.left) / b.width; };
  let cx = [], prevP = 0, phase = 0;
  const measure = () => {
    const bw = inner.getBoundingClientRect().width; cx = tiles.map((el) => { const r = el.getBoundingClientRect(); return (r.left + r.width / 2 - inner.getBoundingClientRect().left) / bw; });
    short = getComputedStyle(root.querySelector('.tl-row')).gridTemplateColumns.split(' ').length < 8 && innerWidth > 640;   // tablet: playhead only over the ruler
    ph.classList.toggle('short', short);
  };
  const frame = (now0) => {
    raf = 0; const dt = Math.min(0.05, (now0 - last) / 1000); last = now0;
    if (running && !rm) t += dt;
    const sweeping = t < SWEEP, p = sweeping ? t / SWEEP : ((t - SWEEP) % LOOP) / LOOP, w = inner.clientWidth, ph2 = sweeping ? 0 : 1;
    if (ph2 !== phase) { phase = ph2; prevP = 0; }
    ph.style.transform = `translate3d(${(p * w).toFixed(2)}px,0,0)`;
    now.textContent = fmt(sweeping ? t : p * SWEEP);
    for (let i = 0; i < 8; i++) {
      if (sweeping) { if (!popped[i] && p >= cx[i]) pop(i); }
      else if ((prevP < cx[i] && p >= cx[i]) || (p < prevP && (cx[i] > prevP || cx[i] <= p))) bounce(i);       // passed this frame (or the loop wrapped)
    }
    prevP = p;
    if (visible && running && !document.hidden && !rm) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && visible && running && !rm && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  const io = new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) { seen = true; kick(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } }, { threshold: .35 });
  btn.addEventListener('click', () => { running = !running; panel.classList.toggle('paused', !running); btn.setAttribute('aria-label', running ? 'Pause' : 'Play'); kick(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  // hover: lift and tilt toward the cursor (max 8 deg), gloss follows
  faces.forEach((f) => {
    f.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; const r = f.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      f.classList.add('hov'); f.style.setProperty('--ry', (x * 16).toFixed(2) + 'deg'); f.style.setProperty('--rx', (-y * 16).toFixed(2) + 'deg'); f.style.setProperty('--gx', (x * 10).toFixed(1) + 'px'); f.style.setProperty('--gy', (y * 8).toFixed(1) + 'px'); });
    f.addEventListener('pointerleave', () => { f.classList.remove('hov'); ['--rx', '--ry', '--gx', '--gy'].forEach((k) => f.style.removeProperty(k)); });
  });
  const setup = () => { measure(); if (rm) { tiles.forEach((el, i) => { popped[i] = true; el.classList.remove('pre'); }); ph.style.display = 'none'; btn.style.display = 'none'; now.textContent = '00:00.00'; } };
  setup(); addEventListener('resize', measure);
  const mount = (host) => { host.appendChild(root); io.observe(root); measure(); };
  return { root, mount, io, get height() { return root.offsetHeight; }, measure, get state() { return { t, running, popped: popped.slice() }; } };
}
