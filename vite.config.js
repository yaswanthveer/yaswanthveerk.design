import fs from 'node:fs';
import path from 'node:path';

// figmaUrl lives in src/data/projects.json for me, but must never reach the public bundle (client work).
const stripProjects = {
  name: 'strip-internal-project-fields', enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('src/data/projects.json')) return null;
    const data = JSON.parse(code).map(({ figmaUrl, ...rest }) => rest);
    return { code: JSON.stringify(data), map: null };
  },
};

// Playlist: public/music/*.mp3 -> src/data/playlist.json, ordered by file name, title = ID3 title or the cleaned file name.
// Regenerated at dev start, on every request of the JSON (so a refresh picks up new files), when files change, and at build.
function id3Title(buf) {
  try {
    if (buf.toString('latin1', 0, 3) !== 'ID3') return '';
    const ver = buf[3], size = ((buf[6] & 127) << 21) | ((buf[7] & 127) << 14) | ((buf[8] & 127) << 7) | (buf[9] & 127);
    let p = 10; const end = Math.min(buf.length, 10 + size);
    while (p + 10 <= end) {
      const id = buf.toString('latin1', p, p + 4); if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const sz = ver === 4 ? ((buf[p + 4] & 127) << 21) | ((buf[p + 5] & 127) << 14) | ((buf[p + 6] & 127) << 7) | (buf[p + 7] & 127) : buf.readUInt32BE(p + 4);
      if (id === 'TIT2') {
        const enc = buf[p + 10], body = buf.subarray(p + 11, p + 10 + sz);
        let t = enc === 1 ? body.toString('utf16le') : enc === 2 ? Buffer.from(body).swap16().toString('utf16le') : enc === 3 ? body.toString('utf8') : body.toString('latin1');
        return t.replace(/^﻿/, '').replace(/\0/g, '').trim();
      }
      p += 10 + sz;
    }
  } catch (_) { /* unreadable tag: fall back to the file name */ }
  return '';
}
const clean = (f) => f.replace(/\.[^.]+$/, '').replace(/^\s*\d+\s*[-_.)\s]+/, '').replace(/\s_\s/g, ' ').replace(/_+/g, ' ').replace(/(\S)-(\S)/g, '$1 $2').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim() || f;
function buildPlaylist(root) {
  const dir = path.join(root, 'public/music'); let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.(mp3|m4a|aac|ogg|wav)$/i.test(f)); } catch (_) { /* no folder yet */ }
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return files.map((f) => { let t = ''; try { const fd = fs.openSync(path.join(dir, f), 'r'); const b = Buffer.alloc(65536); const n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); t = id3Title(b.subarray(0, n)); } catch (_) { /* skip */ } return { src: '/music/' + encodeURIComponent(f), title: t || clean(f) }; });
}
let rootDir = '';
const playlist = {
  name: 'music-playlist', enforce: 'pre',
  buildStart() { this.__root = process.cwd(); write(this.__root); },
  configureServer(server) {
    const root = server.config.root; write(root);
    const dir = path.join(root, 'public/music'); fs.mkdirSync(dir, { recursive: true }); server.watcher.add(dir);
    const touch = (f) => { if (f.includes(path.sep + 'music' + path.sep)) { write(root); const m = server.moduleGraph.getModuleById(path.join(root, 'src/data/playlist.json')); if (m) server.moduleGraph.invalidateModule(m); } };
    for (const ev of ['add', 'unlink', 'change']) server.watcher.on(ev, touch);
  },
  configResolved(c) { rootDir = c.root; },
  transformIndexHtml() {
    const tags = [];
    // crash guard: if the previous load never reached "ready" and never said goodbye (no pagehide: the phone's browser killed the tab),
    // this load starts in lite mode (no intro, no idle animation loops) for 24 hours. A refresh or a closed tab fires pagehide, so it never
    // counts as a crash. ?lite=0 clears it, ?lite forces it. The old sticky 'lite' key is removed.
    const lite = "(function(){var L=false;try{var ls=window.localStorage,n=Date.now(),t=+ls.getItem('bootAt')||0;ls.removeItem('lite');if(/[?&]lite=0/.test(location.search)){ls.removeItem('liteUntil');ls.removeItem('bootAt');t=0}if(t&&n-t<180000)ls.setItem('liteUntil',String(n+864e5));L=(+ls.getItem('liteUntil')||0)>n;ls.setItem('bootAt',String(n));addEventListener('pagehide',function(){try{ls.removeItem('bootAt')}catch(e){}})}catch(e){}if(/[?&]lite(&|=1|$)/.test(location.search))L=true;window.__lite=L})();";
    tags.unshift({ tag: 'script', attrs: { id: 'lite-guard' }, children: lite, injectTo: 'head-prepend' });
    // link-preview cover: absolute URL (crawlers need one). On Vercel the production domain is provided at build time.
    const host = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://yaswanthveerk-design.vercel.app');
    const m = (k, v, attr = 'property') => ({ tag: 'meta', attrs: { [attr]: k, content: v }, injectTo: 'head' });
    return tags.concat([m('og:image', host + '/og-cover.jpg?v=1'), m('og:image:width', '1200'), m('og:image:height', '630'), m('og:image:alt', 'yaswanthveer.k'), m('og:type', 'website'), m('og:url', host + '/'), m('twitter:card', 'summary_large_image', 'name'), m('twitter:title', 'yaswanthveer.k', 'name'), m('twitter:image', host + '/og-cover.jpg?v=1', 'name')]);
  },
  transform(code, id) { if (id.endsWith('src/data/playlist.json')) return { code: JSON.stringify(buildPlaylist(path.dirname(path.dirname(path.dirname(id))))), map: null }; return null; },
};
function write(root) { try { fs.writeFileSync(path.join(root, 'src/data/playlist.json'), JSON.stringify(buildPlaylist(root), null, 1)); } catch (_) { /* ignore */ } }

export default { plugins: [stripProjects, playlist] };
