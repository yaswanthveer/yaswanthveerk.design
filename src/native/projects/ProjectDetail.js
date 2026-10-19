import './projects.css';
import projects from '../../data/projects.json';

// ONE reusable component: every Projects-screen card opens ProjectDetail with ONLY its own entry from src/data/projects.json.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EASE = 'cubic-bezier(.22,1,.36,1)';
const SOCIALS = [['Instagram', 'https://www.instagram.com/yaswanthveer.k/'], ['X', 'https://x.com/YaswanthVeer1']];
const FOLDER = '<svg class="pd-folder" viewBox="0 0 56 48" aria-hidden="true"><path d="M2 8a6 6 0 0 1 6-6h13l6 6h21a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z" fill="#1e88e5"/><path d="M2 16h52v24a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z" fill="#42a5f5"/></svg>';

export function findProject(name) {
  const n = norm(name); if (!n) return null;
  return projects.find((p) => p.match.some((m) => norm(m) === n)) || projects.find((p) => norm(p.name) === n) || null;
}

// preload the first screen of every project (1x files, a few hundred KB in total) once the Projects page is idle
export function warm() { projects.forEach((p) => { const s = p.screens[0]; if (!s) return; const i = new Image(); i.decoding = 'async'; i.fetchPriority = 'low'; i.srcset = `${s.src}-1x.webp ${Math.round(s.w / 2)}w, ${s.src}.webp ${s.w}w`; i.sizes = `${Math.round(340 * s.w / s.h)}px`; i.src = `${s.src}-1x.webp`; }); }
let opening = false;
let current = null;                                   // { scrim, win, p, from, onKey, onPop, restore }
export function isOpen() { return !!current; }

function render(p) {
  const meta = [p.role, p.type, p.year].filter(Boolean).map((v) => `<b>${esc(v)}</b>`).join('<s>·</s>');
  const strip = p.screens.map((s, i) => `<li><figure style="margin:0;height:100%"><img src="${s.src}-1x.webp" srcset="${s.src}-1x.webp ${Math.round(s.w / 2)}w, ${s.src}.webp ${s.w}w" sizes="${Math.round(340 * s.w / s.h)}px" width="${s.w}" height="${s.h}" alt="${esc(s.alt)}" decoding="async" ${i < 2 ? '' : 'loading="lazy"'}><figcaption>${esc(s.caption)}</figcaption></figure></li>`).join('');
  const col = (title, body) => (body ? `<section><h3>${title}</h3>${body}</section>` : '');
  const bullets = p.whatIDid && p.whatIDid.length ? `<ul>${p.whatIDid.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
  return `<div class="pd-win" role="document" tabindex="-1">
    <div class="pd-bar"><button class="c pd-x" aria-label="Close" style="all:unset;width:12px;height:12px;border-radius:50%;background:#ff5f57;cursor:pointer;display:block"></button><i class="m"></i><i class="z"></i><span>Info</span></div>
    <div class="pd-body">
      <header class="pd-head">${FOLDER}
        <div class="pd-titles"><h2 id="pd-title">${esc(p.name)}</h2><p class="pd-one">${esc(p.oneLiner)}</p><p class="pd-meta">${meta}</p></div>
        ${p.liveUrl ? `<a class="pd-visit" href="${esc(p.liveUrl)}" target="_blank" rel="noopener noreferrer">Visit site <span aria-hidden="true">↗</span></a>` : ''}
      </header>
      <ul class="pd-strip" role="list" aria-label="${esc(p.name)} screens" tabindex="0">${strip}</ul>
      <div class="pd-cols">${col('Problem', p.problem ? `<p>${esc(p.problem)}</p>` : '')}${col('What I did', bullets)}${col('Outcome', p.outcome ? `<p>${esc(p.outcome)}</p>` : '')}${col('Built with', p.stack && p.stack.length ? `<div class="pd-chips">${p.stack.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : '')}</div>
    </div>
    <footer class="pd-foot"><div class="kv"><span>Kind</span><b>Folder</b><span>Where</span><b>yaswanthveer_projects</b></div><nav aria-label="Social links">${SOCIALS.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${n}</a>`).join('')}</nav></footer>
  </div>`;
}

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function openProject(project, fromEl) {
  const p = typeof project === 'string' ? findProject(project) : project;
  if (!p) return false;
  if (opening) return false;
  if (current) closeNow();
  opening = true;
  const scrim = document.createElement('div');
  scrim.className = 'pd-scrim'; scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-labelledby', 'pd-title');
  scrim.innerHTML = render(p);
  scrim.style.visibility = 'hidden';
  document.body.appendChild(scrim);
  // wait (briefly) for the first screen to decode so the pop-up never opens half-painted
  const first = scrim.querySelector('.pd-strip img');
  if (first && first.decode) await Promise.race([first.decode().catch(() => {}), new Promise((r) => setTimeout(r, 450))]);
  opening = false;
  scrim.style.visibility = '';
  const win = scrim.querySelector('.pd-win');
  const st = { scrim, win, p, from: fromEl, restore: document.activeElement, popped: false };
  current = st;
  // open: soft scale + fade from the clicked card (transform and opacity only)
  scrim.style.opacity = '1';
  if (!reduce()) {
    const to = win.getBoundingClientRect(); const fr = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
    const sx = fr ? Math.max(0.12, Math.min(1, fr.width / to.width)) : 0.94, sy = fr ? Math.max(0.12, Math.min(1, fr.height / to.height)) : 0.94;
    const dx = fr ? fr.left - to.left : 0, dy = fr ? fr.top - to.top + (fr ? 0 : 10) : 10;
    st.openAnim = win.animate([{ transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, easing: EASE });
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: EASE });
  }
  st.onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'Tab') trap(e, win); };
  addEventListener('keydown', st.onKey, true);
  scrim.addEventListener('pointerdown', (e) => { if (!win.contains(e.target)) close(); });
  scrim.querySelector('.pd-x').addEventListener('click', () => close());
  history.pushState({ pd: p.id }, ''); st.onPop = () => { if (current === st) { st.popped = true; close(); } }; addEventListener('popstate', st.onPop);
  win.focus({ preventScroll: true });
  return true;
}

function trap(e, win) {
  const f = [...win.querySelectorAll('a[href],button,[tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null); if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === win)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function closeNow() {
  const st = current; if (!st) return; current = null;
  removeEventListener('keydown', st.onKey, true); removeEventListener('popstate', st.onPop); st.scrim.remove();
}

export function close() {
  const st = current; if (!st) return false;
  current = null;
  removeEventListener('keydown', st.onKey, true); removeEventListener('popstate', st.onPop);
  if (!st.popped && history.state && history.state.pd) history.back();          // keep browser history in step when closed from the UI
  const done = () => { st.scrim.remove(); const r = st.restore; r && r.focus && r.isConnected && r.focus({ preventScroll: true }); };
  if (reduce()) return done(), true;
  const fr = st.from && st.from.isConnected ? st.from.getBoundingClientRect() : null, to = st.win.getBoundingClientRect();
  const sx = fr ? Math.max(0.12, Math.min(1, fr.width / to.width)) : 0.96, sy = fr ? Math.max(0.12, Math.min(1, fr.height / to.height)) : 0.96;
  const dx = fr ? fr.left - to.left : 0, dy = fr ? fr.top - to.top : 8;
  st.scrim.style.pointerEvents = 'none';
  st.win.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 0 }], { duration: 260, easing: EASE, fill: 'forwards' });
  const a = st.scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: EASE, fill: 'forwards' });
  a.onfinish = done; setTimeout(done, 400);
  return true;
}
