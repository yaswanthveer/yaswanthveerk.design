import './films.css';
import discs from '../../data/discs.json';
import page from '../../data/page.json';
import { createWall } from './wall.js';
import { createRing } from './ring.js';
import { createCdRow } from './cdrow.js';
import { createBooks } from './books.js';
import { createSheets } from './sheet.js';

// Native rebuild of Figma frame 1:430 (Books, Movies & Films). No Figma runtime, no page-wide scale(): everything is laid
// out in "design units" (--u = container width / 1440) with real text, real <img> elements and one rAF loop per section.
const T = page.text;
const html = (u) => `
<section class="nf-sec nf-wall" aria-label="Disc wall: films and music">
  <div class="nf-discs"></div>
  <button class="nf-tab" data-k="film" aria-selected="true">Films</button><button class="nf-tab" data-k="album" aria-selected="false">Music</button><i class="nf-dot"></i>
  <div class="nf-card"><h2 class="nf-title"></h2><div class="rows"></div></div>
  <div class="nf-note a" style="left:calc(445 * var(--u))"><i>★ ★ ★ ★ ★</i><b></b><span></span></div>
  <div class="nf-note b" style="left:calc(745 * var(--u))"><i>★ ★ ★ ★ ★</i><b></b><span></span></div>
  <div class="nf-count"></div><div class="nf-hint">${T.wallHint}</div>
</section>
<section class="nf-sec nf-ring" aria-label="Films I live by: 100 posters in a ring">
  <div class="nf-cards"></div>
  <img class="nf-prev" alt="" width="150" height="225"><div class="nf-text nf-pt"></div><div class="nf-text nf-pd"></div>
  <div class="nf-chip"><i></i>Hover a film</div>
  <div class="nf-text nf-big" aria-hidden="true">Films I live by</div>
  <div class="nf-text nf-tag"><b>${T.ringTag.split('\n')[0]}</b>\n${T.ringTag.split('\n')[1] || ''}</div>
</section>
<section class="nf-sec nf-music" aria-label="Music on loop: album CDs">
  <div class="nf-text nf-mh">Music on loop <span>${T.musicHint}</span></div>
  <div class="nf-cds"></div>
</section>
<section class="nf-sec nf-books" aria-label="Favourite books">
  <div class="nf-text nf-bt">FAVORITE BOOKS</div>
  <div class="nf-shelf" role="group" aria-label="Books"></div>
  <div class="nf-text nf-bh">${T.booksHint}</div>
</section>`;

const unit = () => Math.min(document.documentElement.clientWidth || innerWidth, 1920) / 1440;
const ch = (k, extra = '') => { const c = page[k]; return `<div class="nf-char ${extra}" style="left:calc(${c.x} * var(--u));top:calc(${c.y} * var(--u));width:calc(${c.w} * var(--u));height:calc(${c.h} * var(--u))"><img src="${c.src}" alt="" width="${c.iw}" height="${c.ih}" decoding="async"></div>`; };

export function createFilmsView({ navigate }) {
  const el = document.createElement('div'); el.className = 'nf';
  let u = unit(); el.style.setProperty('--u', u + 'px');
  el.innerHTML = html(u) + ch('popcorn') + ch('chair') + (() => { const c = page.standing; return `<div class="nf-char" style="left:calc(${c.x} * var(--u));top:calc((898 + ${c.y}) * var(--u));width:calc(${c.w} * var(--u));height:calc(${c.h} * var(--u))"><img src="${c.src}" alt="" width="${c.iw}" height="${c.ih}" decoding="async"></div>`; })()
    + `<button class="nf-tiger" aria-label="Back to About me" style="left:calc(${page.tiger.x} * var(--u));top:calc(${page.tiger.y} * var(--u));width:calc(${page.tiger.w} * var(--u));height:calc(${page.tiger.h} * var(--u))"><img src="${page.tiger.src}" alt="" width="288" height="288"></button>`;

  const sheets = createSheets({});
  const wall = createWall(el.querySelector('.nf-wall'), { u, data: discs, onOpen: (d) => sheets.disc(d) });
  const ring = createRing(el.querySelector('.nf-ring'), { u });
  const cd = createCdRow(el.querySelector('.nf-music'), { u, onPlay: (a) => openNow(a) });
  const albums = discs.filter((d) => d.kind === 'album');
  const openNow = (a) => sheets.now(a, { step: (dir) => { const i = albums.findIndex((x) => x.id === a.id); openNow(albums[(i + dir + albums.length) % albums.length]); } });
  const books = createBooks(el.querySelector('.nf-books'), { u, onOpen: (b) => sheets.book(b) });

  el.querySelector('.nf-tiger').addEventListener('click', () => { if (!sheets.close()) navigate('1:26'); });
  // keys: Esc closes whatever is open; arrows steer the section that is in the middle of the screen
  const secs = [['.nf-wall', wall], ['.nf-ring', ring], ['.nf-music', cd], ['.nf-books', books]].map(([s, api]) => [el.querySelector(s), api]);
  const onKey = (e) => {
    if (e.key === 'Escape') { if (sheets.close()) e.preventDefault(); return; }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (sheets.open) return;
    const mid = innerHeight / 2; const hit = secs.find(([s]) => { const r = s.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; }) || secs.find(([s]) => { const r = s.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
    if (!hit) return; e.preventDefault(); hit[1].key(e.key === 'ArrowRight' ? 1 : -1);
  };
  addEventListener('keydown', onKey);
  const onResize = () => { const nu = unit(); if (Math.abs(nu - u) < 1e-4) return; u = nu; el.style.setProperty('--u', u + 'px'); wall.resize(u); ring.resize(u); cd.resize(u); books.resize(u); };
  addEventListener('resize', onResize);

  const stage = document.createElement('div'); stage.className = 'stage view nf-stage'; stage.dataset.page = '1:430'; stage.style.height = 'auto'; stage.appendChild(el); stage._fit = onResize;
  document.documentElement.classList.add('nf-on');
  return {
    id: '1:430', el, stage, native: true, root: { id: '1:430', w: 1440, h: 3743, fl: [{ t: 'S', c: [7, 7, 7] }] },
    destroy() { removeEventListener('keydown', onKey); removeEventListener('resize', onResize); sheets.close(true); [wall, ring, cd, books].forEach((s) => s.loop && s.loop.destroy && s.loop.destroy()); document.documentElement.classList.remove('nf-on'); },
    api: { wall, ring, cd, books, sheets },
  };
}
