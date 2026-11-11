/* Morph Map scan core: turns a list of code files into a map.
   Runs in the browser (folder drop-in, nothing is uploaded) and in Node (scanner/morph-scan.js).
   Input: [{f: 'src/app.js', src: '...file text...'}]. Output: boxes, arrows and the raw scan.
   Boxes = files (small projects) or folders (big ones). Arrows = imports.
   Kinds: page = entry point, tab = screens/routes, data = models/db/stores, out = outside packages, mod = everything else. */
(function (root) {
  const IGNORE = /(\.config\.[mc]?[jt]s$|(^|\/)(eslint|prettier|babel|jest|vite|vitest|webpack|rollup|tailwind|postcss|playwright)\.[^/]*$)|(^|\/)(demo|node_modules|\.git|dist|build|out|coverage|vendor|\.next|\.nuxt|__pycache__|\.venv|venv|target|test|tests|__tests__|spec|e2e|examples?|fixtures?|docs?|benchmarks?|scripts?|\.github|public\/assets)(\/|$)/i;
  const CODE = /\.(m?[jt]sx?|cjs|py|vue|svelte|html)$/i;
  const SKIP = /\.(test|spec|d|min|stories)\.[a-z]+$/i;
  const MAX_BYTES = 400000;
  const BUILTIN = new Set('assert buffer child_process cluster crypto dgram dns events fs http http2 https net os path perf_hooks process querystring readline stream string_decoder timers tls tty url util v8 vm worker_threads zlib module sys re json typing collections itertools functools datetime math random time logging subprocess pathlib zipfile shlex signal platform traceback inspect contextlib warnings heapq bisect struct secrets statistics textwrap string types weakref operator queue select argparse dataclasses enum abc copy io unittest asyncio threading socket hashlib base64 uuid tempfile shutil glob pickle csv'.split(' '));

  /* small path helpers, so the same code runs without Node */
  const dirname = p => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i); };
  const basename = p => p.slice(p.lastIndexOf('/') + 1);
  const normalize = p => { const abs = p.startsWith('/'), out = [];
    for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..'); } else out.push(s); }
    return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.'); };
  const join = (a, b) => normalize(a + '/' + b);

  /* which folders to walk into and which files to read (path relative to the project folder) */
  const wantedDir = rel => !IGNORE.test(rel) && !rel.split('/').some(s => s.startsWith('.'));
  const wanted = rel => wantedDir(rel) && CODE.test(basename(rel)) && !SKIP.test(basename(rel));

  function imports(src, file) {
    const out = [];
    if (/\.py$/.test(file)) {
      for (const m of src.matchAll(/^\s*from\s+([.\w]+)\s+import|^\s*import\s+([\w.]+)/gm)) out.push(m[1] || m[2]);
    } else {
      for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|<script[^>]+src=['"]([^'"]+)['"]/g))
        out.push(m[1] || m[2] || m[3] || m[4] || m[5]);
    }
    return out;
  }

  function resolve(spec, from, files) {
    if (/\.py$/.test(from)) {
      if (spec.startsWith('.')) { const up = spec.match(/^\.+/)[0].length; let base = dirname(from); for (let i = 1; i < up; i++) base = dirname(base); spec = join(base, spec.slice(up).replace(/\./g, '/')); }
      else spec = spec.replace(/\./g, '/');
      for (const c of [spec + '.py', spec + '/__init__.py']) if (files.has(c)) return { file: c };
      const top = spec.split('/')[0]; if (files.has(top + '.py') || [...files].some(f => f.startsWith(top + '/'))) return null;
      return { ext: top };
    }
    if (/^(https?:)?\/\//.test(spec)) return { ext: spec.replace(/^(https?:)?\/\//, '').split('/')[0] };
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const p = normalize(spec.startsWith('/') ? spec.slice(1) : join(dirname(from), spec));
      for (const c of [p, p + '.js', p + '.ts', p + '.tsx', p + '.jsx', p + '.mjs', p + '.vue', p + '.svelte', p + '/index.js', p + '/index.ts', p + '/index.tsx', p + '/index.jsx'])
        if (files.has(c)) return { file: c };
      return null;
    }
    if (/^[@~]\//.test(spec)) { const p = spec.slice(2); for (const pre of ['src/', '']) for (const c of [p, p + '.ts', p + '.tsx', p + '.js', p + '.jsx', p + '/index.ts', p + '/index.tsx', p + '/index.js']) if (files.has(pre + c)) return { file: pre + c }; return null; }
    const sp = spec.startsWith('node:') ? spec.slice(5) : spec; const name = sp.startsWith('@') ? sp.split('/').slice(0, 2).join('/') : sp.split('/')[0];
    return { ext: name };
  }

  const isPage = s => /(^|\/)(pages?|routes?|views?|screens?|controllers?|handlers?|endpoints?|api)(\/|$)|\.(html|vue|svelte)$|(page|route|view|screen|controller)\.[a-z]+$/i.test(s);
  const isData = s => /(^|\/)(models?|db|database|schema|stores?|migrations?|supabase|prisma|repositor(y|ies)|entities|dao|state|data(Provider)?)(\/|$|\.)/i.test(s);
  const isEntry = s => /^(src\/)?(index|main|app|server|cli|manage|wsgi)\.[a-z]+$/i.test(s);

  /* entries: [{f, src}], name: project name, max: most boxes to draw,
     prev: an earlier map of the same project. Boxes that still exist keep their old place, so only real changes move. */
  function scanFiles(entries, name, max, prev) {
    max = max || 22;
    const text = {}; entries.forEach(e => text[e.f] = e.src || '');
    const list = Object.keys(text).sort(), files = new Set(list);
    // group into at most `max` boxes: keep splitting the biggest folder while it still fits
    const under = d => list.filter(f => d === '' || f.startsWith(d + '/'));
    const expand = (d, budget) => { const fs_ = under(d), subs = new Set(), direct = [];
      for (const f of fs_) { const rest = d === '' ? f : f.slice(d.length + 1), seg = rest.split('/'); if (seg.length > 1) subs.add((d ? d + '/' : '') + seg[0]); else direct.push(f); }
      const parts = [...subs].map(k => ({ key: k, dir: true }));
      if (direct.length && (direct.length <= 3 || direct.length <= budget - parts.length)) direct.forEach(f => parts.push({ key: f, dir: false }));
      else if (direct.length) parts.push({ key: (d || '.') + '/*', dir: false, files: direct });
      return parts; };
    let G = expand('', max), forced = 0;
    for (let guard = 0; guard < 300; guard++) {
      const N = list.length, cand = G.filter(g => g.dir).sort((a, b) => under(b.key).length - under(a.key).length).filter(g => under(g.key).length >= N * 0.06);
      let done = false;
      for (const g of cand) {
        const ex = expand(g.key, max - G.length + 1);
        if (ex.length === 1 && ex[0].dir) { G = G.filter(x => x !== g).concat(ex); done = true; break; }
        if (ex.length > 1 && G.length - 1 + ex.length <= max) { G = G.filter(x => x !== g).concat(ex); done = true; break; }
      }
      if (!done && cand[0] && under(cand[0].key).length > N * 0.4 && forced < 2) { forced++; G = G.filter(x => x !== cand[0]).concat(expand(cand[0].key, 99)); done = true; }
      if (!done) break;
    }
    const owner = {}; G.forEach(g => { if (g.files) g.files.forEach(f => owner[f] = g.key); else if (!g.dir) owner[g.key] = g.key; });
    const dirs = G.filter(g => g.dir).map(g => g.key).sort((a, b) => b.length - a.length);
    let keyOf = f => owner[f] || dirs.find(d => f.startsWith(d + '/')) || 'other';
    if (G.length > max) { const cnt = {}; list.forEach(f => cnt[keyOf(f)] = (cnt[keyOf(f)] || 0) + 1); const keep = new Set(Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, max - 1).map(x => x[0])); const k0 = keyOf; keyOf = f => keep.has(k0(f)) ? k0(f) : 'other'; }
    const groups = {}, edges = {}, ext = {}, raw = [];
    for (const f of list) {
      const g = keyOf(f); (groups[g] = groups[g] || { files: [], lines: 0 }).files.push(f);
      const src = text[f];
      const lines = src.split('\n').length, rf = { f, lines, imp: [], ext: [], entry: isEntry(f) }; raw.push(rf);
      groups[g].lines += lines;
      for (const spec of imports(src, f)) {
        const r = resolve(spec, f, files); if (!r) continue;
        if (r.file) { if (r.file !== f && !rf.imp.includes(r.file)) rf.imp.push(r.file); const h = keyOf(r.file); if (h !== g) { const k = g + '>' + h; edges[k] = (edges[k] || 0) + 1; } }
        else if (r.ext && !BUILTIN.has(r.ext) && /^[@a-z0-9][\w./-]*$/i.test(r.ext)) { if (!rf.ext.includes(r.ext)) rf.ext.push(r.ext); (ext[r.ext] = ext[r.ext] || { n: 0, from: new Set() }); ext[r.ext].n++; ext[r.ext].from.add(g); }
      }
    }
    const extTop = Object.entries(ext).sort((a, b) => b[1].n - a[1].n).slice(0, Math.max(3, Math.min(8, max - Object.keys(groups).length)));
    const label = g => g === 'other' ? 'Other files' : g.endsWith('/*') ? (g === './*' ? 'Root files' : basename(g.slice(0, -2)) + ' (top files)') : (/^(index|__init__|mod)\.[a-z]+$/i.test(basename(g)) && g.includes('/') ? basename(dirname(g)) : basename(g).replace(/\.[a-z]+$/i, ''));
    const nodes = Object.entries(groups).map(([g, v]) => {
      const kind = v.files.some(isEntry) && v.files.length === 1 ? 'page' : (v.files.filter(isPage).length * 2 > v.files.length ? 'tab' : (v.files.filter(isData).length * 2 > v.files.length || isData(g)) ? 'data' : 'mod');
      return { id: g, label: label(g), sub: (v.files.length > 1 ? v.files.length + ' files, ' : '') + v.lines + ' lines', kind, note: '' };
    });
    for (const [n, v] of extTop) { nodes.push({ id: 'ext:' + n, label: n, sub: 'outside package, used ' + v.n + 'x', kind: 'out', note: '' }); for (const g of v.from) edges[g + '>ext:' + n] = (edges[g + '>ext:' + n] || 0) + 1; }
    const ids = new Set(nodes.map(n => n.id));
    let E = Object.entries(edges).map(([k, n]) => { const [from, to] = k.split('>'); return { from, to, label: n > 2 ? n + ' imports' : '', dash: to.startsWith('ext:') }; }).filter(e => ids.has(e.from) && ids.has(e.to));
    if (E.length > 60) { const n = k => edges[k.from + '>' + k.to]; E = E.filter(e => !e.dash && n(e) >= 3); const extKeep = {}; Object.entries(edges).filter(([k]) => k.includes('>ext:')).sort((a, b) => b[1] - a[1]).forEach(([k]) => { const [f, t] = k.split('>'); if (ids.has(f) && ids.has(t) && (extKeep[t] = (extKeep[t] || 0) + 1) <= 2) E.push({ from: f, to: t, label: '', dash: true }); }); }
    // layer from entry points down, outside packages in the last row
    const inner = nodes.filter(n => n.kind !== 'out'), incoming = {}; E.forEach(e => { if (!e.to.startsWith('ext:')) (incoming[e.to] = incoming[e.to] || []).push(e.from); });
    const layer = {}; const tops = inner.filter(n => !incoming[n.id] || n.kind === 'page');
    (tops.length ? tops : inner.slice(0, 1)).forEach(n => layer[n.id] = 0);
    for (let pass = 0; pass < inner.length; pass++) for (const e of E) if (layer[e.from] != null && !e.to.startsWith('ext:') && (layer[e.to] == null || layer[e.to] < layer[e.from] + 1) && layer[e.from] + 1 < 6) layer[e.to] = layer[e.from] + 1;
    inner.forEach(n => { if (layer[n.id] == null) layer[n.id] = 0; });
    const maxL = Math.max(0, ...Object.values(layer));
    nodes.filter(n => n.kind === 'out').forEach(n => layer[n.id] = maxL + 1);
    const rows = {}; nodes.forEach(n => (rows[layer[n.id]] = rows[layer[n.id]] || []).push(n));
    for (const [l, row] of Object.entries(rows)) {
      row.sort((a, b) => a.id.localeCompare(b.id));
      const perRow = 7, gap = 180;
      row.forEach((n, i) => { const r = Math.floor(i / perRow), c = i % perRow, cnt = Math.min(perRow, row.length - r * perRow);
        n.x = Math.round(620 - (cnt - 1) * gap / 2 + c * gap); n.y = 60 + Number(l) * 170 + r * 90 + (c % 2 ? 20 : 0); });
    }
    if (prev && prev.nodes) keepPlaces(nodes, prev.nodes);
    return { nodes, edges: E, scan: { kind: 'code', name, files: raw }, stats: { files: list.length, boxes: nodes.length, arrows: E.length } };
  }

  /* boxes that were on the earlier map stay where they were; new boxes move down until they sit clear */
  function keepPlaces(nodes, old) {
    const was = {}; old.forEach(n => was[n.id] = n);
    const placed = [];
    nodes.forEach(n => { if (was[n.id]) { n.x = was[n.id].x; n.y = was[n.id].y; placed.push(n); } });
    const hit = n => placed.some(p => Math.abs(p.x - n.x) < 170 && Math.abs(p.y - n.y) < 74);
    nodes.forEach(n => { if (was[n.id]) return; let guard = 0; while (hit(n) && guard++ < 40) n.y += 90; placed.push(n); });
  }

  /* a full Morph Map file from one scan: Today and Planned start the same */
  function toDoc(m) {
    const map = { nodes: m.nodes, edges: m.edges };
    return { meta: { mode: 'code', name: m.scan.name }, today: map, planned: JSON.parse(JSON.stringify(map)), scans: { today: m.scan } };
  }

  const api = { scanFiles, toDoc, wanted, wantedDir, MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MorphScan = api;
})(this);
