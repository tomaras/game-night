#!/usr/bin/env node
// Puts a build into the one site that both channels share:   <site>/ = Stable,   <site>/nightly/ = Nightly.
//
//   node scripts/assemble.mjs root     <build-dir> <site-dir>   Stable: replace everything in the site root EXCEPT nightly/
//   node scripts/assemble.mjs nightly  <build-dir> <site-dir>   Nightly: replace only <site>/nightly/
//   node scripts/assemble.mjs restore-root <old-site-dir> <site-dir>   put an earlier site's root back (rollback), nightly/ untouched
//   node scripts/assemble.mjs media    <videos-dir> <site-dir>   replace <site>/media/videos (the how-to-play videos both versions share)
//
// A Nightly publish therefore cannot change a single Stable file, and promoting to Stable cannot lose Nightly.
// media/ is shared by both and is only ever touched by the `media` mode.
import fs from 'node:fs';
import path from 'node:path';

const [mode, src, site] = process.argv.slice(2).map((p, i) => (i ? path.resolve(p) : p));
if (!['root', 'nightly', 'restore-root', 'media'].includes(mode) || !src || !site) { console.error('usage: assemble.mjs root|nightly|restore-root <src> <site>'); process.exit(1); }
if (!fs.existsSync(src)) { console.error('missing ' + src); process.exit(1); }
if (mode !== 'media' && (!fs.existsSync(path.join(src, 'index.html')) || !fs.existsSync(path.join(src, 'build.json')))) { console.error('refusing: ' + src + ' does not look like a build (no index.html / build.json)'); process.exit(1); } // never wipe a site with an empty folder
fs.mkdirSync(site, { recursive: true });

const KEEP = new Set(['.git', 'nightly', 'media']);
if (mode === 'media') {
  if (!fs.readdirSync(src).some((f) => f.endsWith('.mp4'))) { console.error('refusing: no .mp4 files in ' + src); process.exit(1); }
  fs.mkdirSync(path.join(site, 'media'), { recursive: true });
  fs.rmSync(path.join(site, 'media/videos'), { recursive: true, force: true });
  fs.cpSync(src, path.join(site, 'media/videos'), { recursive: true });
} else if (mode === 'nightly') {
  fs.rmSync(path.join(site, 'nightly'), { recursive: true, force: true });
  fs.cpSync(src, path.join(site, 'nightly'), { recursive: true, filter: (f) => path.basename(f) !== 'CNAME' });
} else {
  for (const e of fs.readdirSync(site)) if (!KEEP.has(e)) fs.rmSync(path.join(site, e), { recursive: true, force: true });
  for (const e of fs.readdirSync(src)) if (!KEEP.has(e)) fs.cpSync(path.join(src, e), path.join(site, e), { recursive: true });
}
console.log(`assembled ${mode}: ${src} → ${site}`);
