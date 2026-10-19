// Small shared helpers for the native Films page.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const mod = (n, m) => ((n % m) + m) % m;
export const lerp = (a, b, t) => a + (b - a) * t;
const STATIC = /[?&]static\b/.test(location.search);       // ?static freezes all idle motion (used for pixel comparisons)
export const reduced = () => STATIC || matchMedia('(prefers-reduced-motion: reduce)').matches;
export const px = (n) => n.toFixed(2) + 'px';

// One requestAnimationFrame loop per section. It only runs while the section is on screen, the tab is visible, and
// the section says it has something to animate (needs()).
export function sectionLoop(el, { step, needs = () => true, margin = '-80px 0px' }) {
  let id = 0, last = 0, visible = false;
  const frame = (now) => {
    id = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt, now);
    if (visible && !document.hidden && needs()) id = requestAnimationFrame(frame);
  };
  const kick = () => { if (!id && visible && !document.hidden) { last = performance.now(); id = requestAnimationFrame(frame); } };
  const io = new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) kick(); else if (id) { cancelAnimationFrame(id); id = 0; } }, { rootMargin: margin });
  io.observe(el);
  const vis = () => { if (document.hidden) { if (id) { cancelAnimationFrame(id); id = 0; } } else kick(); };
  document.addEventListener('visibilitychange', vis);
  return { kick, get visible() { return visible; }, destroy() { io.disconnect(); document.removeEventListener('visibilitychange', vis); if (id) cancelAnimationFrame(id); } };
}

// Catmull-Rom through evenly spaced anchors (anchor i sits at x = i + lo); linear extrapolation outside
export function spline(vals, lo) {
  const n = vals.length;
  return (x) => {
    let t = x - lo;
    if (t <= 0) return vals[0] + (vals[1] - vals[0]) * t;
    if (t >= n - 1) return vals[n - 1] + (vals[n - 1] - vals[n - 2]) * (t - (n - 1));
    const i = Math.floor(t), f = t - i;
    const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(n - 1, i + 2)];
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  };
}

// responsive-image attributes for a poster / cover
export const imgSet = (id, widths = [240, 480, 640, 900]) => widths.map((w) => `/img/films/${id}-${w}.webp ${w}w`).join(', ');

// wheel / drag / key gestures share this tiny "kinetic scroller" (position in item units, velocity, spring to a target)
export class Kinetic {
  constructor({ friction = 3.2, spring = 120, damp = 2 * Math.sqrt(120) * 0.92 } = {}) { this.pos = 0; this.vel = 0; this.target = null; this.friction = friction; this.spring = spring; this.damp = damp; }
  // returns true while still moving
  step(dt) {
    if (this.target !== null) {
      const x = this.target - this.pos;
      this.vel += (x * this.spring - this.vel * this.damp) * dt;
      this.pos += this.vel * dt;
      if (Math.abs(x) < 0.0008 && Math.abs(this.vel) < 0.01) { this.pos = this.target; this.vel = 0; this.target = null; return false; }
      return true;
    }
    if (Math.abs(this.vel) > 0.004) { this.pos += this.vel * dt; this.vel *= Math.exp(-this.friction * dt); return true; }
    this.vel = 0; return false;
  }
  settleToNearest(extra = 0) { this.target = Math.round(this.pos + this.vel * 0.18 + extra); }
}
