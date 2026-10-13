// Join several short WebM recordings (what MediaRecorder gives us) into ONE playable file, without re-encoding:
// keep the first file's header + tracks, then append every file's clusters with their timecodes shifted.
// Returns null when the data isn't WebM we understand (callers then fall back to playing the parts one after another).

function vint(b, i, keepMarker) {
  const first = b[i];
  if (!first) return null;
  let n = 1, mask = 0x80;
  while (n <= 8 && !(first & mask)) { n++; mask >>= 1; }
  if (n > 8 || i + n > b.length) return null;
  let v = keepMarker ? first : first & (mask - 1), unknown = !keepMarker && (first & (mask - 1)) === mask - 1;
  for (let k = 1; k < n; k++) { v = v * 256 + b[i + k]; if (!keepMarker && b[i + k] !== 255) unknown = false; }
  return { n, v, unknown };
}
function element(b, i) {
  const id = vint(b, i, true);
  if (!id) return null;
  const sz = vint(b, i + id.n, false);
  if (!sz) return null;
  const head = id.n + sz.n;
  return { id: id.v, head, start: i, bodyStart: i + head, size: sz.unknown ? -1 : sz.v, end: sz.unknown ? -1 : i + head + sz.v };
}
const ID = { EBML: 0x1a45dfa3, SEGMENT: 0x18538067, INFO: 0x1549a966, TRACKS: 0x1654ae6b, CLUSTER: 0x1f43b675, TIMECODE: 0xe7, SIMPLEBLOCK: 0xa3, BLOCKGROUP: 0xa0, BLOCK: 0xa1 };
const CLUSTER_CHILD = new Set([0xe7, 0xa3, 0xa0, 0xa7, 0xab, 0x5854, 0xec, 0xbf]);

function sizeBytes(n) { // always 8-byte sizes: simple and valid
  const out = new Uint8Array(8);
  out[0] = 0x01;
  for (let k = 7; k >= 1; k--) { out[k] = n % 256; n = Math.floor(n / 256); }
  return out;
}
const concat = (parts) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const idBytes = (id) => { const o = []; while (id > 0) { o.unshift(id & 255); id = Math.floor(id / 256); } return Uint8Array.from(o); };
const uintBytes = (v, n = 4) => { const o = new Uint8Array(n); for (let k = n - 1; k >= 0; k--) { o[k] = v % 256; v = Math.floor(v / 256); } return o; };

/** Parse one WebM file: header bytes, info + tracks bytes, clusters {tc, body, end}. */
function parse(u8) {
  const eb = element(u8, 0);
  if (!eb || eb.id !== ID.EBML || eb.end < 0) return null;
  const seg = element(u8, eb.end);
  if (!seg || seg.id !== ID.SEGMENT) return null;
  const res = { header: u8.subarray(0, eb.end), info: null, tracks: null, clusters: [] };
  let i = seg.bodyStart;
  const limit = seg.end < 0 ? u8.length : Math.min(seg.end, u8.length);
  while (i < limit) {
    const e = element(u8, i);
    if (!e) break;
    if (e.id === ID.CLUSTER) {
      let j = e.bodyStart, tc = 0, end = e.end < 0 ? -1 : Math.min(e.end, u8.length), lastT = 0;
      const body = [];
      while (j < (end < 0 ? u8.length : end)) {
        const c = element(u8, j);
        if (!c || (end < 0 && !CLUSTER_CHILD.has(c.id))) break;
        const cEnd = c.end < 0 ? u8.length : Math.min(c.end, u8.length);
        if (c.id === ID.TIMECODE) { tc = 0; for (let k = c.bodyStart; k < cEnd; k++) tc = tc * 256 + u8[k]; }
        else {
          body.push(u8.subarray(j, cEnd));
          if (c.id === ID.SIMPLEBLOCK) { const tn = vint(u8, c.bodyStart, false); if (tn) { const rel = (u8[c.bodyStart + tn.n] << 8) | u8[c.bodyStart + tn.n + 1]; lastT = Math.max(lastT, rel > 32767 ? rel - 65536 : rel); } }
        }
        j = cEnd;
      }
      res.clusters.push({ tc, body: concat(body), lastT });
      i = end < 0 ? j : end;
      continue;
    }
    const eEnd = e.end < 0 ? limit : Math.min(e.end, u8.length);
    if (e.id === ID.INFO) res.info = u8.subarray(i, eEnd);
    else if (e.id === ID.TRACKS) res.tracks = u8.subarray(i, eEnd);
    i = eEnd;
  }
  if (!res.tracks || !res.clusters.length) return null;
  return res;
}

/** Add a Duration element (milliseconds) to an Info element, or build a minimal Info. */
function infoWithDuration(info, ms) {
  const dur = new Uint8Array(11);
  dur.set([0x44, 0x89, 0x88]);
  new DataView(dur.buffer).setFloat64(3, ms);
  if (!info) { const body = concat([Uint8Array.from([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]), dur]); return concat([idBytes(ID.INFO), sizeBytes(body.length), body]); }
  const e = element(info, 0);
  const kids = info.subarray(e.bodyStart);
  const kept = [];
  for (let j = 0; j < kids.length;) { const c = element(kids, j); if (!c || c.end < 0) break; if (!(c.id === 0x4489)) kept.push(kids.subarray(j, c.end)); j = c.end; }
  const body = concat([...kept, dur]);
  return concat([idBytes(ID.INFO), sizeBytes(body.length), body]);
}

/** @param {Uint8Array[]} files @returns {Uint8Array|null} */
export function joinWebm(files) {
  const parsed = [];
  for (const f of files) { try { const p = parse(f); if (p) parsed.push(p); } catch { /* skip a broken part */ } }
  if (!parsed.length) return null;
  const out = [];
  let offset = 0;
  for (const p of parsed) {
    let end = 0;
    for (const c of p.clusters) {
      const tc = offset + c.tc;
      const tcEl = concat([Uint8Array.from([0xe7, 0x84]), uintBytes(tc, 4)]);
      const body = concat([tcEl, c.body]);
      out.push(concat([idBytes(ID.CLUSTER), sizeBytes(body.length), body]));
      end = Math.max(end, c.tc + c.lastT);
    }
    offset += end + 40;
  }
  const first = parsed[0];
  return concat([first.header, idBytes(ID.SEGMENT), Uint8Array.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), infoWithDuration(first.info, offset), first.tracks, ...out]);
}
