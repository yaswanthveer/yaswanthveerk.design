import { createTools } from './index.js';

// The Projects page is absolutely positioned Figma layers. The "Tools I use" panel needs real pixels, so it gets its own black band
// directly under the train / stop-sign group (the train image ends at y 1432, the Mac photo starts at y 1456): everything from the Mac
// photo down moves by the band height, in design units, recomputed on resize. Nothing above the band moves.
const BAND_Y = 1456, PAD = 36;
export function mountTools(view) {
  const fig = view.el, stage = view.stage, root = view.root;
  const tops = [...fig.children].filter((e) => e._n && e._n.y >= BAND_Y - 4);
  const base = new Map(tops.map((e) => [e, e._n.y])), baseH = root.h;
  const tool = createTools(); tool.mount(stage);
  const place = () => {
    const m = /scale\(([\d.]+)\)/.exec(fig.style.transform), s = m ? +m[1] : stage.clientWidth / 1440;
    const px = stage.clientWidth; tool.root.style.setProperty('--tl-g', Math.max(16, Math.min(40, px * 0.025)) + 'px');
    const hPx = tool.root.firstElementChild.offsetHeight, D = (hPx + PAD * 2) / s;      // band height in design units
    for (const [e, y] of base) { e._n.y = y + D; e.style.top = (y + D) + 'px'; }
    fig.style.height = (baseH + D) + 'px'; stage.style.height = (baseH + D) * s + 'px';
    tool.root.style.top = (BAND_Y * s + PAD) + 'px';
  };
  place(); const prevFit = stage._fit; stage._fit = () => { prevFit && prevFit(); place(); tool.measure(); };
  new ResizeObserver(() => { place(); tool.measure(); }).observe(tool.root.firstElementChild);
  document.fonts && document.fonts.ready.then(() => { place(); tool.measure(); });
}
