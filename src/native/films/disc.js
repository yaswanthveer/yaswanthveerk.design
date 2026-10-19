// shared SVG clip: the disc label is a ring (centre hole = 18% of the radius, as in Figma's ellipse arc data)
export function ensureDefs() {
  if (document.getElementById('nf-defs')) return;
  const s = document.createElement('div'); s.id = 'nf-defs'; s.setAttribute('aria-hidden', 'true'); s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  s.innerHTML = '<svg width="0" height="0"><defs><clipPath id="nf-ring" clipPathUnits="objectBoundingBox"><path clip-rule="evenodd" d="M0,0.5 a0.5,0.5 0 1,0 1,0 a0.5,0.5 0 1,0 -1,0 Z M0.41,0.5 a0.09,0.09 0 1,1 0.18,0 a0.09,0.09 0 1,1 -0.18,0 Z"/></clipPath></defs></svg>';
  document.body.appendChild(s);
}
import { imgSet } from './util.js';
// One disc = poster clipped to a circle with a centre hole, clear ring, silver hub, gloss. Built once, reused (pooled).
export function makeDisc() {
  ensureDefs();
  const el = document.createElement('div'); el.className = 'nf-disc';
  el.innerHTML = '<div class="lift"><div class="sh"></div><div class="lw"><img class="lb" alt="" decoding="async" draggable="false"></div><img class="fx" alt="" src="/img/films/disc-fx.webp" decoding="async" draggable="false"><div class="sw"></div></div>';
  const img = el.querySelector('img.lb');
  // Figma fills the label with "cover" for the *final* (squashed) box, so the poster is sized for that aspect and the
  // squash that the disc element applies later is cancelled for the image only.
  el.setImage = (d, sizes, squash = 0.86) => {
    if (el._id === d.id && el._sq === squash) return; el._id = d.id; el._sq = squash;
    const k = Math.max(360 / d.w, 360 * squash / d.h);
    img.style.width = `${(d.w * k / 360 * 100).toFixed(3)}%`; img.style.height = `${(d.h * k / squash / 360 * 100).toFixed(3)}%`;
    img.sizes = sizes; img.srcset = imgSet(d.id); img.src = `/img/films/${d.id}-480.webp`;
  };
  return el;
}
