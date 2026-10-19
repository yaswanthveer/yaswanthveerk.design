// Handoff half of the intro. The first half (name builds, shortens to a red V, roles pop in) is pure CSS inside index.html so
// it paints on the very first frame; this module waits for the real home page, then rebuilds the name around the V,
// FLIPs it onto the home page's big name, reveals the page and swaps. Transform, opacity and clip-path only.
import name from './name.json';

const EASE = 'cubic-bezier(.215,.61,.355,1)', EXPO = 'cubic-bezier(.22,1,.36,1)', WIPE = 'cubic-bezier(.76,0,.24,1)';
export const T = { handoff: 3150 };           // ms on the CSS clock: V centred, all five roles in, small hold
const V_INDEX = 8;
const pl = () => window.__pl;
export const active = () => !!(pl() && pl().on && document.getElementById('pl'));

const elapsed = () => {
  const a = document.getAnimations().find((x) => x.animationName === 'pl-clock');
  return a && a.startTime != null ? document.timeline.currentTime - a.startTime : performance.now() - pl().t0;
};
const frame = () => new Promise((r) => requestAnimationFrame(r));
async function until(cond) { while (!cond()) await frame(); }
const once = (a) => a.finished.catch(() => {});

function homeLetters(view) {
  const inst = [...view.el.querySelectorAll('.n')].find((e) => e._n && e._n.id === '93:2587');
  if (!inst) return null;
  const L = [...inst.children].filter((c) => c._n && /^L\d+$/.test(c._n.nm)).sort((a, b) => +a._n.nm.slice(1) - +b._n.nm.slice(1));
  return L.length === name.letters.length ? L : null;
}

// While the intro runs the real page underneath is staged: black background, every layer except the name hidden. When the name has
// landed the overlay is swapped for this staged page (identical pixels: black + the same letters), then the layers reveal around the
// name in their real stacking order, so the hair, headphones and cap that overlap the letters appear in front of them exactly as designed.
function stage(view, letters) {
  const fig = view.el, inst = letters[0].parentElement;
  const saved = { bg: fig.style.backgroundImage, kids: [] };
  fig.style.backgroundImage = 'linear-gradient(#0c0b09,#0c0b09)';
  const paper = document.createElement('div');
  paper.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;background:#fff;pointer-events:none;clip-path:inset(100% 0 0 0)';
  fig.insertBefore(paper, fig.firstChild);
  for (const k of fig.children) { if (k === inst || k === paper || !k._n) continue; saved.kids.push([k, k.style.opacity]); k.style.opacity = '0'; }
  return { fig, inst, paper, saved };
}
function unstage(st) {
  st.fig.style.backgroundImage = st.saved.bg; st.paper.remove();
  for (const [k, op] of st.saved.kids) { k.getAnimations().filter((a) => a._pl).forEach((a) => a.cancel()); k.style.opacity = op; }
}
async function reveal(st, skipped) {
  const fig = st.fig, sc = fig.getBoundingClientRect().width / fig.offsetWidth, vh = innerHeight / sc;
  const wipe = st.paper.animate([{ clipPath: `inset(${vh}px 0 0 0)` }, { clipPath: 'inset(0px 0 0 0)' }], { duration: 620, easing: WIPE, fill: 'forwards' });
  const anims = [wipe]; wipe._pl = true;
  for (const [k] of st.saved.kids) {
    const top = k.offsetTop, f = Math.max(0, Math.min(1, 1 - top / vh));              // layers nearer the bottom of the screen arrive first
    const a = k.animate([{ opacity: 0, translate: '0 36px' }, { opacity: 1, translate: '0 0' }], { duration: 520, delay: f * 260, easing: EASE, fill: 'both' });
    a._pl = true; anims.push(a);
  }
  await Promise.race([Promise.all(anims.map(once)), until(() => skipped())]);
}

export async function play(getView) {
  const root = document.getElementById('pl'), g = document.getElementById('pl-g');
  const reds = [...g.querySelectorAll('.pl-r')];
  let skipped = false, view = null, letters = null, finished = false, st = null;
  const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
  const skip = (e) => {
    if (finished) return;
    if (e && e.target && e.target.closest && e.target.closest('.pl-music')) return;        // the music controls are not a skip
    if (window.__musicTapAt && performance.now() - window.__musicTapAt < 600) return;     // this tap only started the music; the next one skips
    if (e && e.cancelable && (e.type === 'wheel' || e.type === 'touchmove')) e.preventDefault();
    if (e && e.type === 'keydown') { if (e.metaKey || e.ctrlKey || e.altKey) return; e.preventDefault(); }          // the key press only skips; it must not scroll or act on the page
    if (e && (e.type === 'pointerdown' || e.type === 'touchstart')) {                                                  // ... and neither must the click that skips
      for (const t of ['pointerup', 'mouseup', 'click', 'touchend']) { addEventListener(t, swallow, { capture: true, once: true }); setTimeout(() => removeEventListener(t, swallow, { capture: true }), 700); }
    }
    skipped = true;
  };
  const evs = [['pointerdown', {}], ['keydown', {}], ['wheel', { passive: false }], ['touchstart', {}], ['touchmove', { passive: false }]];
  evs.forEach(([t, o]) => addEventListener(t, skip, { capture: true, ...o }));
  scrollTo(0, 0);

  const removeOverlay = () => {
    root.remove(); const css = document.getElementById('pl-css'); css && css.remove(); const js = document.getElementById('pl-js'); js && js.remove();
  };
  const finish = (how) => {                                       // everything back to the page exactly as designed
    finished = true;
    evs.forEach(([t, o]) => removeEventListener(t, skip, { capture: true, ...o }));
    if (st) unstage(st);
    if (letters) letters.forEach((l) => { l.style.visibility = ''; });
    if (document.getElementById('pl')) removeOverlay();
    document.documentElement.classList.remove('pl-on', 'pl-lock');
    try { sessionStorage.setItem('plSeen', '1'); } catch (_) { /* private mode */ }
    window.__pl.on = false; window.__pl.done = performance.now(); window.__pl.how = how;
  };

  view = await getView();                                         // the real home page, built and settled underneath
  letters = homeLetters(view);
  if (!letters || skipped) return finish(skipped ? 'skip' : 'no-target');
  letters.forEach((l) => { l.style.visibility = 'hidden'; });     // hidden until the swap so no double text can show

  if (pl().reduce) {                                              // reduced motion: 600 ms fade of the name, then the page
    await until(() => elapsed() >= 650 || skipped);
    if (!skipped) { const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'linear', fill: 'forwards' }); await once(a); }
    return finish(skipped ? 'skip' : 'reduced');
  }
  st = stage(view, letters);

  await until(() => elapsed() >= T.handoff || skipped);           // holds calmly on V + roles if the page was slower than the intro
  if (skipped) return finish('skip');

  // landing transform = where the home page's own name is drawn: exact page scale and exact layout numbers (not the 1/64px-rounded client rects)
  const fig = view.el, fr = fig.getBoundingClientRect(), inst = letters[0].parentElement;
  const s = parseFloat((fig.style.transform.match(/scale\(([^)]+)\)/) || [0, 1])[1]);
  const Px = fr.left + s * (parseFloat(inst.style.left) + name.minx), Py = fr.top + s * (parseFloat(inst.style.top) + name.miny);
  const cur = getComputedStyle(g).transform;
  g.style.transform = cur; g.getAnimations().forEach((a) => a.cancel());       // freeze the CSS zoom where it is, then FLIP onward
  const anims = [];
  document.querySelectorAll('#pl-roles li span, #pl-sn span').forEach((n, i) => anims.push(n.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,-102%,0)' }], { duration: 380, delay: i * 30, easing: EASE, fill: 'forwards' })));
  reds.forEach((r, i) => { if (i === V_INDEX) return; anims.push(r.animate([{ transform: 'translate3d(0,102%,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: 500, delay: 200 + Math.abs(i - V_INDEX) * 34, easing: EASE, fill: 'forwards' })); });
  anims.push(g.animate([{ transform: cur }, { transform: `translate(${Px}px,${Py}px) scale(${s})` }], { duration: 820, delay: 80, easing: EXPO, fill: 'forwards' }));
  await Promise.race([Promise.all(anims.map(once)), until(() => skipped)]);
  if (skipped) return finish('skip');

  // paint the landed name exactly the way the page paints it: letters absolutely placed in the page's own coordinates inside one
  // scale(s) box (no translate, no clip boxes, no compositor layers). Then the raster is identical to the page's letters.
  const instL = parseFloat(inst.style.left), instT = parseFloat(inst.style.top);
  g.getAnimations().forEach((a) => a.cancel());
  g.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;transform:${fr.left || fr.top ? `translate(${fr.left}px,${fr.top}px) ` : ''}scale(${s})`;
  g.querySelectorAll('.pl-w').forEach((w) => { w.style.display = 'none'; });
  g.querySelectorAll('.pl-l').forEach((w, i) => {                // each red letter becomes a plain copy of the page's own letter element
    const h = letters[i], r = w.querySelector('.pl-r'); r.getAnimations().forEach((a) => a.cancel());
    r.className = ''; r.removeAttribute('style'); r.style.cssText = h.style.cssText;
    r.style.position = 'absolute'; r.style.left = `${instL + parseFloat(h.style.left)}px`; r.style.top = `${instT + parseFloat(h.style.top)}px`; r.style.visibility = 'visible';
    g.appendChild(r); w.remove();
  });
  document.querySelectorAll('#pl-roles, #pl-sn').forEach((n) => { n.style.display = 'none'; });
  const hold = new URLSearchParams(location.search).has('plhold');
  if (hold) await new Promise((r) => { window.__plRelease = r; window.__plHeld = 'beforeSwap'; });   // test hook
  // THE SWAP: overlay -> staged page. Same pixels (black + the same letters); the home letters appear, the overlay goes, in one frame.
  letters.forEach((l) => { l.style.visibility = ''; });
  removeOverlay();
  if (hold) await new Promise((r) => { window.__plRelease = r; window.__plHeld = 'swapped'; });
  await reveal(st, () => skipped);
  finish(skipped ? 'skip' : 'played');
}
