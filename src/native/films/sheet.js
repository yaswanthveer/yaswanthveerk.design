import { imgSet, reduced } from './util.js';
import { makeDisc } from './disc.js';

// Overlays: disc detail sheet, now-playing card, book "off the shelf". One scrim at a time; Esc / backdrop / tiger close it.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// optional audio map: put real files in /public/audio and list them here (album id -> url). Until then the card is a silent preview.
export const AUDIO = {};

export function createSheets({ onClose } = {}) {
  let scrim = null, restore = null, cleanup = null;
  const su = () => Math.max(0.35, Math.min(innerWidth * 0.96 / 1320, innerHeight * 0.94 / 820, 1.5));

  function shell(inner, label) {
    close(true);
    scrim = document.createElement('div'); scrim.className = 'nf-scrim'; scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-label', label);
    scrim.innerHTML = inner;
    scrim.style.setProperty('--su', su() + 'px'); scrim.style.setProperty('--u', su() + 'px');
    scrim.addEventListener('pointerdown', (e) => { if (!e.target.closest('.nf-sheet, .nf-now, .nf-bookwrap')) close(); });
    document.body.appendChild(scrim);
    restore = document.activeElement;
    requestAnimationFrame(() => scrim && scrim.classList.add('on'));
    const rs = () => scrim && scrim.style.setProperty('--su', su() + 'px'); addEventListener('resize', rs); cleanup = () => removeEventListener('resize', rs);
    const x = scrim.querySelector('.nf-x'); if (x) { x.addEventListener('click', () => close()); try { x.focus({ preventScroll: true, focusVisible: false }); } catch (_) { x.focus({ preventScroll: true }); } }
    return scrim;
  }
  function close(silent) {
    if (!scrim) return false;
    const s = scrim; scrim = null; cleanup && cleanup(); cleanup = null; s.classList.remove('on');
    s.addEventListener('transitionend', () => s.remove(), { once: true }); setTimeout(() => s.remove(), 400);
    if (!silent) { onClose && onClose(); restore && restore.focus && restore.focus({ preventScroll: true }); }
    return true;
  }

  function disc(d) {
    const film = d.kind === 'film';
    // coordinates are Figma's detail frame (1440x900) minus the card offset (60, 40)
    const L = film ? { px: 120, py: 125, pw: 380, ph: 570, dc: [404, 500], dd: 490, tx: 650, ty: 135, tw: 610 }
      : { px: 120, py: 200, pw: 420, ph: 420, dc: [468.5, 475.5], dd: 361, tx: 690, ty: 210, tw: 570 };
    const sd = makeDisc(); sd.classList.add('static');
    const rows = d.rows.map(([l, v]) => `<div class="rw"><b>${esc(l)}</b><span>${esc(v)}</span></div>`).join('');
    const html = `<div class="nf-sheet">
      <div class="sd" style="left:calc(${L.dc[0] - L.dd / 2} * var(--su));top:calc(${L.dc[1] - L.dd / 2} * var(--su));width:calc(${L.dd} * var(--su));height:calc(${L.dd} * var(--su));transform:rotate(30deg);border-radius:0;overflow:visible"></div>
      <img class="poster" alt="${esc(d.title)} ${film ? 'poster' : 'cover'}" srcset="${imgSet(d.id)}" sizes="${Math.round(L.pw * su())}px" src="/img/films/${d.id}-900.webp" style="left:calc(${L.px} * var(--su));top:calc(${L.py} * var(--su));width:calc(${L.pw} * var(--su));height:calc(${L.ph} * var(--su))">
      <div class="col" style="left:calc(${L.tx} * var(--su));top:calc(${L.ty} * var(--su));width:calc(${L.tw} * var(--su))">
        <div class="ey">${esc(d.eyebrow.replace(/\s+/g, ' '))}</div>
        <h2 style="margin-top:calc(12 * var(--su))">${esc(d.head || d.title)}</h2>
        <p class="cr" style="margin-top:calc(16 * var(--su));width:calc(470 * var(--su))">${esc(d.craze)}</p>
        <div style="margin-top:calc(22 * var(--su))">${rows.replace('class="rw"', 'class="rw rule0"')}${d.dyk ? `<div class="rw dyk" style="margin-top:calc(10 * var(--su))"><b>Did you know</b><span>${esc(d.dyk)}</span></div>` : ''}</div>
      </div>
      <button class="nf-x" aria-label="Close" style="right:calc(30 * var(--su));top:calc(24 * var(--su))">×</button>
    </div>`;
    const s = shell(html, d.title);
    s.querySelector('.col').style.position = 'absolute';
    const holder = s.querySelector('.sd'); holder.appendChild(sd); sd.style.cssText += `;position:absolute;inset:0;width:100%;height:100%;transform:none;`;
    sd.setImage(d, `${Math.round(L.dd * su())}px`, 1);
    sd.querySelector('img').srcset = imgSet(d.id); sd.querySelector('img').sizes = `${Math.round(L.dd * su())}px`;
    // the disc's inner layers are sized in --u units elsewhere; inside the sheet they are percentage based so they scale with the holder
  }

  function now(a, { step } = {}) {
    const html = `<div class="nf-now" style="--p:0">
      <div class="nf-player" style="position:absolute;inset:0;background:#141414;border-radius:24px;box-shadow:0 30px 70px rgba(0,0,0,.5);color:#f2f2f2;font-family:Inter,sans-serif;overflow:hidden">
        <div style="position:absolute;left:32px;top:26px;font:500 10.5px/13px Inter;letter-spacing:.14em;color:rgba(242,242,242,.55)">NOW PLAYING</div>
        <div class="eq" style="position:absolute;left:131px;top:24px;width:30px;height:14px">${[6, 13, 9, 14, 5].map((h, i) => `<i style="position:absolute;left:${[0, 7, 13, 19, 26][i]}px;bottom:0;width:4px;height:${h}px;border-radius:1.5px;background:#d4ff4a;transform-origin:50% 100%"></i>`).join('')}</div>
        <button class="nf-x" aria-label="Close" style="position:absolute;right:26px;top:18px;width:32px;height:32px;background:rgba(255,255,255,.08);color:#f2f2f2;font-size:20px">×</button>
        <img alt="${esc(a.title)} cover" srcset="${imgSet(a.id)}" sizes="316px" src="/img/films/${a.id}-480.webp" style="position:absolute;left:32px;top:64px;width:316px;height:316px;object-fit:cover;border-radius:4px;box-shadow:0 10px 30px rgba(0,0,0,.45)">
        <div style="position:absolute;left:32px;top:402px;width:316px;font:600 22px/27px Inter;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.title)}</div>
        <div style="position:absolute;left:32px;top:433px;width:316px;font:400 14px/17px Inter;color:rgba(242,242,242,.6)">${esc(a.by)}</div>
        <div style="position:absolute;left:32px;top:470px;width:316px;height:4px;border-radius:2px;background:rgba(255,255,255,.15)"><div class="bar" style="width:100%;height:100%;border-radius:2px;background:#f2f2f2;transform-origin:0 50%;transform:scaleX(.35)"></div></div>
        <div style="position:absolute;left:32px;top:482px;font:400 11px/13px Inter;color:rgba(242,242,242,.5)" class="el">1:12</div><div style="position:absolute;right:32px;top:482px;font:400 11px/13px Inter;color:rgba(242,242,242,.5)">3:48</div>
        <button class="pv" aria-label="Previous album" style="position:absolute;left:98px;top:506px;width:28px;height:28px;border:0;background:none;cursor:pointer;padding:0"><svg width="28" height="28" viewBox="0 0 28 28"><rect x="6" y="6" width="3" height="16" rx="1" fill="#f2f2f2"/><path d="M22 6v16L11 14z" fill="#f2f2f2"/></svg></button>
        <button class="nx" aria-label="Next album" style="position:absolute;left:254px;top:506px;width:28px;height:28px;border:0;background:none;cursor:pointer;padding:0"><svg width="28" height="28" viewBox="0 0 28 28"><rect x="19" y="6" width="3" height="16" rx="1" fill="#f2f2f2"/><path d="M6 6v16l11-8z" fill="#f2f2f2"/></svg></button>
        <button class="pp" aria-label="Play or pause" style="position:absolute;left:160px;top:490px;width:60px;height:60px;border-radius:50%;border:0;background:#f2f2f2;cursor:pointer;display:grid;place-items:center"><svg width="26" height="26" viewBox="0 0 26 26"><g class="ic-pause"><rect x="6" y="4" width="5" height="18" rx="1.5" fill="#141414"/><rect x="15" y="4" width="5" height="18" rx="1.5" fill="#141414"/></g><path class="ic-play" d="M8 4l14 9-14 9z" fill="#141414" style="display:none"/></svg></button>
      </div></div>`;
    const s = shell(html, `Now playing: ${a.title}`);
    s.style.alignItems = 'center';
    const box = s.querySelector('.nf-now'); const fit = () => { const k = Math.min(1.25, innerHeight * 0.9 / 578, innerWidth * 0.92 / 380); box.style.transform = `scale(${k})`; }; fit(); addEventListener('resize', fit);
    const bars = [...s.querySelectorAll('.eq i')], bar = s.querySelector('.bar'), el = s.querySelector('.el');
    let playing = true, t0 = performance.now(), prog = 0.31, raf = 0, audio = null;
    if (AUDIO[a.id]) { audio = new Audio(AUDIO[a.id]); audio.play().catch(() => { /* needs a gesture */ }); }
    const tick = (now2) => {
      raf = requestAnimationFrame(tick);
      if (!playing || reduced()) return;
      const t = (now2 - t0) / 1000; prog = audio && audio.duration ? audio.currentTime / audio.duration : Math.min(1, prog + 1 / 228 / 60);
      bar.style.transform = `scaleX(${prog.toFixed(4)})`;
      const sec = Math.floor(prog * 228); el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      bars.forEach((b, i) => { b.style.transform = `scaleY(${(0.4 + 0.6 * Math.abs(Math.sin(t * (2.2 + i * 0.7) + i))).toFixed(3)})`; });
    };
    raf = requestAnimationFrame(tick);
    if (step) { s.querySelector('.pv').addEventListener('click', () => step(-1)); s.querySelector('.nx').addEventListener('click', () => step(1)); } else { s.querySelector('.pv').remove(); s.querySelector('.nx').remove(); }
    s.querySelector('.pp').addEventListener('click', () => {
      playing = !playing; s.querySelector('.ic-pause').style.display = playing ? '' : 'none'; s.querySelector('.ic-play').style.display = playing ? 'none' : '';
      if (audio) playing ? audio.play() : audio.pause();
    });
    const prevCleanup = cleanup; cleanup = () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); audio && audio.pause(); prevCleanup && prevCleanup(); };
  }

  function book(b) {
    const w = 330, h = 520;
    const html = `<div class="nf-bookov"><div class="nf-bookwrap" style="position:relative;width:${w}px;height:${h}px;transform-style:preserve-3d;transform:rotateY(-24deg) rotateX(4deg);transition:transform .9s cubic-bezier(.22,1,.36,1)">
      <div style="position:absolute;left:-30px;right:-30px;bottom:-70px;height:30px;border-radius:50%;background:rgba(0,0,0,.45);filter:blur(14px);transform:translateZ(-60px)"></div>
      <div style="position:absolute;left:0;top:0;width:44px;height:${h}px;background:${b.bg};transform-origin:0 50%;transform:rotateY(90deg) translateX(-44px)"></div>
      <img alt="${esc(b.title)} cover" src="/img/films/${b.id}-640.webp" srcset="/img/films/${b.id}-240.webp 240w, /img/films/${b.id}-640.webp 640w" sizes="${w}px" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;box-shadow:0 30px 60px rgba(0,0,0,.5)">
      <div style="position:absolute;right:0;top:4px;bottom:4px;width:14px;background:linear-gradient(90deg,#ddd,#fff 40%,#c9c9c9);transform-origin:100% 50%;transform:rotateY(90deg) translateX(14px)"></div>
      </div><button class="nf-x" aria-label="Close" style="position:absolute;right:30px;top:24px;width:40px;height:40px;background:rgba(255,255,255,.14);color:#fff">×</button></div>`;
    const s = shell(html, b.title);
    s.style.background = 'rgba(10,10,10,.55)';
    const x = s.querySelector('.nf-x'); x.addEventListener('click', () => close());
    const wrap = s.querySelector('.nf-bookwrap');
    s.addEventListener('pointermove', (e) => { if (reduced()) return; const rx = (e.clientX / innerWidth - 0.5), ry = (e.clientY / innerHeight - 0.5); wrap.style.transform = `rotateY(${-24 + rx * 16}deg) rotateX(${4 - ry * 10}deg)`; });
  }
  return { disc, now, book, close, get open() { return !!scrim; } };
}
