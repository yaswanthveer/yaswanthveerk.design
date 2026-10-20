import './player.css';
import playlist from '../data/playlist.json';

// One shared <audio> for the whole site. Buttons live in a layer on top of the About-page headphones (Figma image 25 "glint": the
// three icons). Music starts only from a press. The audio element is created once, so it keeps playing across navigation.
const ARTIST = 'YASWANTH VEER.K';
const FADE = 300, VOL = 0.6, KEY = 'musicPaused';
const ss = { get: () => { try { return sessionStorage.getItem(KEY); } catch (_) { return null; } }, set: (v) => { try { v ? sessionStorage.setItem(KEY, '1') : sessionStorage.removeItem(KEY); } catch (_) { /* private mode */ } } };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- icon geometry in Figma page coordinates (1440 wide): element 'image 25 (glint)' at (1269, 32), 134 x 89, icons from its 1536x1024 bitmap
const K = 134 / 1536, EX = 1269, EY = 32;
const C = { prev: [311 * K + EX, 468 * K + EY], mid: [775 * K + EX, 472 * K + EY], next: [1253 * K + EX, 468 * K + EY] };
const PAUSE = [[683, 360, 74, 225], [790, 360, 76, 225]].map(([x, y, w, h]) => [x * K + EX, y * K + EY, w * K, h * K]);

// ---- state (module level = one per page load)
const audio = new Audio(); audio.preload = 'metadata'; audio.setAttribute('playsinline', ''); try { audio.volume = VOL; } catch (_) { /* iOS */ }
// The site opens with the song whose file name starts with 01 (found by name, not position); then 02, 03 … and back to 01.
const list = playlist.slice(); const bad = new Set();
{ const SONG2 = /^\s*0*1(?!\d)/, nm = (x) => { try { return decodeURIComponent(x.src.split('/').pop()); } catch (_) { return x.src; } };
  const k = list.findIndex((x) => SONG2.test(nm(x)));
  if (k > 0) list.push(...list.splice(0, k)); else if (k < 0 && list.length) console.warn('[player] no song starting with "01" in public/music: starting with the first song'); }
let idx = 0, playing = false, fadeRaf = 0, started = false, ours = 0;       // ours > 0: a pause / track change we started ourselves
const subs = new Set(); const emit = () => subs.forEach((f) => f());
const cur = () => list[idx];

function loadTrack(i) {
  idx = ((i % list.length) + list.length) % list.length;
  if (!audio.src || new URL(list[idx].src, location.href).href !== audio.src) { audio.src = list[idx].src; audio.load(); }   // song 01 is already loading from the head script
  if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = new MediaMetadata({ title: list[idx].title, artist: ARTIST, album: 'YASWANTH VEER.K — Portfolio' }); } catch (_) { /* old browser */ } }
  emit();
}
function ramp(to, done, dur = FADE) {
  cancelAnimationFrame(fadeRaf); const from = audio.volume, t0 = performance.now();
  const step = (now) => { const k = Math.min(1, (now - t0) / dur); try { audio.volume = from + (to - from) * k; } catch (_) { k < 1 ? 0 : 0; } if (k < 1) fadeRaf = requestAnimationFrame(step); else done && done(); };
  fadeRaf = requestAnimationFrame(step);
}
async function play() {
  ss.set(false); audio.muted = false;
  if (!list.length) { console.warn('[player] no songs in public/music'); return; }
  if (!audio.src) loadTrack(idx);
  playing = true; emit(); try { audio.volume = 0; } catch (_) { /* iOS: read-only */ }
  try { await audio.play(); ramp(VOL); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; }
  catch (e) { playing = false; emit(); console.warn('[player] could not play', cur() && cur().src, e && e.name); }
}
function pause() {
  ss.set(true);                                                      // the visitor's choice is remembered for the session
  playing = false; emit(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  ramp(0, () => { if (!playing) { ours++; audio.pause(); setTimeout(() => ours--, 50); } });
}
const toggle = () => (playing ? pause() : play());
function go(i) {                                                     // keep the current play/pause state when the song changes
  if (!list.length) return; const was = playing; ours++; setTimeout(() => ours--, 400); loadTrack(i);
  if (was) { try { audio.volume = 0; } catch (_) { /* iOS */ } audio.play().then(() => ramp(VOL)).catch((e) => console.warn('[player] could not play', cur().src, e && e.name)); }
}
const next = () => go(idx + 1);
const prev = () => { if (audio.currentTime > 3) audio.currentTime = 0; else go(idx - 1); };
audio.addEventListener('ended', () => { go(idx + 1); });
// the browser paused us (an interruption): show the truth and wait for the visitor to press play again
audio.addEventListener('pause', () => {
  if (!playing || ours || audio.ended) return;
  playing = false; emit(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
audio.addEventListener('error', () => {                              // broken / missing file: skip it quietly
  if (!audio.src) return; console.warn('[player] skipping unreadable file', list[idx] && list[idx].src); bad.add(idx);
  if (bad.size >= list.length) { playing = false; emit(); return; } go(idx + 1);
});
if ('mediaSession' in navigator) {
  const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (_) { /* unsupported action */ } };
  set('play', play); set('pause', pause); set('nexttrack', next); set('previoustrack', prev);
}
if (list.length) loadTrack(0);

// The site opens paused: music starts only when the visitor presses play.
export const player = { play, pause, toggle, next, prev, audio, get playing() { return playing; }, get title() { return cur() ? cur().title : ''; }, get count() { return list.length; }, subscribe: (f) => { subs.add(f); return () => subs.delete(f); } };
window.__player = player;                                            // test hook

// ---- UI layer on the About page ------------------------------------------------------------------------------------------
const SVG = (inner, w, h) => `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" aria-hidden="true">${inner}</svg>`;
export function mountHeadphones(view) {
  const stage = view.stage, fig = view.el; if (!stage || !fig) return;
  stage.querySelectorAll('.hp-layer').forEach((n) => n.remove());
  const layer = document.createElement('div'); layer.className = 'hp-layer';
  const mk = (cls, label, svg) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'hp-btn ' + cls; b.setAttribute('aria-label', label); b.innerHTML = svg ? `<span class="hp-hit"></span>` : ''; return b; };
  const bPrev = mk('prev', 'Previous song'), bMid = mk('mid', 'Play'), bNext = mk('next', 'Next song');
  const title = document.createElement('div'); title.className = 'hp-title'; title.setAttribute('aria-live', 'polite');
  const icons = document.createElement('div'); icons.className = 'hp-icons'; icons.setAttribute('aria-hidden', 'true');
  const pausePath = PAUSE.map(([x, y, w, h]) => `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="1" fill="#000"/>`).join('');
  const pm = C.mid, ph = PAUSE[0][3], pw = PAUSE[1][0] + PAUSE[1][2] - PAUSE[0][0];
  const play = `<path d="M${(pm[0] - pw * 0.36).toFixed(2)} ${(pm[1] - ph / 2).toFixed(2)} L${(pm[0] + pw * 0.5).toFixed(2)} ${pm[1].toFixed(2)} L${(pm[0] - pw * 0.36).toFixed(2)} ${(pm[1] + ph / 2).toFixed(2)} Z" fill="#000" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/>`;
  icons.innerHTML = `<svg viewBox="0 0 1440 4811" width="100%" height="100%" preserveAspectRatio="none"><g class="hp-i hp-pause">${pausePath}</g><g class="hp-i hp-play">${play}</g></svg>`;
  layer.append(icons, bPrev, bMid, bNext, title); stage.appendChild(layer);

  bMid.addEventListener('click', toggle); bNext.addEventListener('click', next); bPrev.addEventListener('click', prev);
  // hover/glint of the picture underneath keeps working: forward enter/leave to the Figma element
  const target = () => [...fig.querySelectorAll('.n')].find((e) => e._n && e._n.id === '29:741');
  for (const b of [bPrev, bMid, bNext]) { b.addEventListener('pointerenter', () => target()?.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))); b.addEventListener('pointerleave', () => target()?.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))); }
  for (const b of [bPrev, bMid, bNext]) { b.addEventListener('pointerdown', () => b.classList.add('press')); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => b.classList.remove('press')); }

  const place = () => {
    const m = /scale\(([\d.]+)\)/.exec(fig.style.transform), s = m ? +m[1] : stage.clientWidth / 1440; layer.style.setProperty('--s', s);
    const MIN = 44, dd = (C.mid[0] - C.prev[0]) * s, side = dd >= MIN;
    const put = (b, cx, cy) => { b.style.width = b.style.height = MIN + 'px'; b.style.left = (cx - MIN / 2) + 'px'; b.style.top = (cy - MIN / 2) + 'px'; };
    let cy = C.mid[1] * s, cm = C.mid[0] * s;
    if (side) { put(bMid, cm, cy); put(bPrev, C.prev[0] * s, cy); put(bNext, C.next[0] * s, cy); }
    else {
      // phones: the three icons are ~11px apart, so 44px targets cannot all sit on their icons. Play/pause stays exactly on its icon
      // (it must never be shadowed by a neighbour); previous sits beside it, next right under it. All three are fully on screen.
      cy = Math.max(cy, MIN / 2); cm = Math.min(Math.max(cm, MIN * 1.5 + 2), stage.clientWidth - MIN / 2);
      put(bMid, cm, cy); put(bPrev, cm - MIN, cy); put(bNext, cm, cy + MIN);
    }
    title.style.right = Math.max(4, stage.clientWidth - 1436 * s) + 'px'; title.style.top = 216 * s + 'px'; title.style.maxWidth = (1436 - 1190) * s + 'px';
    title.style.fontSize = Math.max(7, 9 * s) + 'px';
  };
  place(); const ro = new ResizeObserver(place); ro.observe(stage); addEventListener('resize', place);

  const pulseEls = () => ['29:724', '29:741'].map((id) => [...fig.querySelectorAll('.n')].find((e) => e._n && e._n.id === id)).filter(Boolean);
  let pulses = [];
  const startPulse = () => { stopPulse(); if (reduced()) return; pulses = pulseEls().map((el) => { const mkA = () => { const a = el.animate([{ scale: 1 }, { scale: 1.018, offset: 0.12 }, { scale: 1 }], { duration: 500, iterations: Infinity, easing: 'cubic-bezier(.22,1,.36,1)' }); a.oncancel = () => { if (playing && pulses.includes(a)) { const i = pulses.indexOf(a); pulses[i] = mkA(); } }; return a; }; return mkA(); }); };
  const stopPulse = () => { const p = pulses; pulses = []; p.forEach((a) => { a.oncancel = null; a.cancel(); }); };
  let lastTitle = '';
  const render = () => {
    layer.classList.toggle('on', playing); bMid.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (player.title !== lastTitle) { lastTitle = player.title; title.textContent = player.title; }
    if (playing) startPulse(); else stopPulse();
  };
  const off = player.subscribe(() => { if (!layer.isConnected) { off(); stopPulse(); return; } render(); });
  render();
}
