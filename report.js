/* Morph Map report: scores and findings worked out from real scan data.
   Every rule here is plain and visible on purpose, so people can check why a finding appears.
   Used by index.html, and by node for tests (module.exports). */
(function (root) {
  const SEC = { red: 3, amber: 2, info: 1, green: 0 };
  const pl = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  /* ---------- map score: same formula for Today and Planned ---------- */
  function mapMetrics(m) {
    const nodes = (m && m.nodes) || [], edges = ((m && m.edges) || []).filter(e => nodes.some(n => n.id === e.from) && nodes.some(n => n.id === e.to));
    const boxes = nodes.length, arrows = edges.length, per = boxes ? arrows / boxes : 0;
    // depth: most steps needed to reach a box from the top (boxes nothing points to), following solid arrows
    const out = {}, inc = {}; edges.filter(e => !e.dash).forEach(e => { (out[e.from] = out[e.from] || []).push(e.to); inc[e.to] = 1; });
    let tops = nodes.filter(n => !inc[n.id] && out[n.id]).map(n => n.id);
    if (!tops.length && nodes.length) tops = [nodes.slice().sort((a, b) => (out[b.id] || []).length - (out[a.id] || []).length)[0].id];
    const dist = {}, q = []; tops.forEach(t => { dist[t] = 0; q.push(t); });
    while (q.length) { const c = q.shift(); (out[c] || []).forEach(t => { if (dist[t] == null) { dist[t] = dist[c] + 1; q.push(t); } }); }
    const depth = Math.max(0, ...Object.values(dist));
    // copies: dashed arrows between two of your own boxes where one is a data store (the same data kept in two places)
    const kind = {}; nodes.forEach(n => kind[n.id] = n.kind);
    const copies = edges.filter(e => e.dash && kind[e.from] !== 'out' && kind[e.to] !== 'out' && (kind[e.from] === 'data' || kind[e.to] === 'data')).length;
    const size = 30 * Math.min(1, boxes / 40), tangle = 35 * Math.min(1, per / 3), chain = 20 * Math.min(1, depth / 6), copy = 15 * Math.min(1, copies / 3);
    const score = Math.round(size + tangle + chain + copy);
    return { boxes, arrows, per: Math.round(per * 10) / 10, depth, copies, score, level: score < 35 ? 'Light' : score < 65 ? 'Medium' : 'Heavy',
      parts: { size: Math.round(size), tangle: Math.round(tangle), chain: Math.round(chain), copies: Math.round(copy) } };
  }

  /* ---------- AI blast radius: everything reachable by following arrows from one box ---------- */
  function blast(m, start) {
    const out = {}; ((m && m.edges) || []).forEach(e => (out[e.from] = out[e.from] || []).push(e.to));
    const seen = new Set([start]), q = [start], hops = { [start]: 0 };
    while (q.length) { const c = q.shift(); (out[c] || []).forEach(t => { if (!seen.has(t)) { seen.add(t); hops[t] = hops[c] + 1; q.push(t); } }); }
    seen.delete(start); return { ids: [...seen], hops };
  }

  /* ---------- plan brief for an AI coder: only what the maps and scan actually say ---------- */
  function brief(doc) {
    const T = doc.today || { nodes: [], edges: [] }, P = doc.planned || { nodes: [], edges: [] }, meta = doc.meta || {};
    const byT = {}, byP = {}; T.nodes.forEach(n => byT[n.id] = n); P.nodes.forEach(n => byP[n.id] = n);
    const nm = (n) => (n.label || n.id) + (n.sub ? ' (' + n.sub + ')' : '');
    const ek = e => e.from + '>' + e.to, eT = new Set(T.edges.map(ek)), eP = new Set(P.edges.map(ek));
    const L = [];
    L.push('# Change plan from Morph Map');
    L.push('');
    L.push('Project: ' + (meta.name || 'unnamed') + (meta.mode ? ' (' + (meta.mode === 'web' ? 'website' : 'codebase') + ')' : ''));
    L.push('Goal: change the system from the Today map to the Planned map below. Work in small steps, keep behaviour working, and ask before deleting anything you are unsure about.');
    L.push('');
    const add = P.nodes.filter(n => !byT[n.id]), del = T.nodes.filter(n => !byP[n.id]);
    const chg = P.nodes.filter(n => { const o = byT[n.id]; return o && ((n.label || '') !== (o.label || '') || (n.sub && n.sub !== o.sub) || (n.note && n.note !== o.note)); });
    if (add.length) { L.push('## Add'); add.forEach(n => L.push('- ' + nm(n) + (n.note ? ': ' + n.note : ''))); L.push(''); }
    if (chg.length) { L.push('## Change'); chg.forEach(n => { const o = byT[n.id]; L.push('- ' + (o.label || o.id) + (o.label !== n.label ? ' becomes ' + n.label : '') + (n.sub && n.sub !== o.sub ? '. Now: ' + n.sub : '') + (n.note ? '. Notes: ' + n.note : '') + (doc.meta && doc.meta.mode === 'code' ? ' [path: ' + n.id + ']' : '')); }); L.push(''); }
    if (del.length) { L.push('## Remove or merge'); del.forEach(n => L.push('- ' + nm(n) + (doc.meta && doc.meta.mode === 'code' ? ' [path: ' + n.id + ']' : ''))); L.push(''); }
    const lab = id => ((byP[id] || byT[id] || {}).label || id);
    const ea = P.edges.filter(e => !eT.has(ek(e))), er = T.edges.filter(e => !eP.has(ek(e)));
    if (ea.length) { L.push('## New connections'); ea.forEach(e => L.push('- ' + lab(e.from) + ' to ' + lab(e.to) + (e.label ? ' (' + e.label + ')' : ''))); L.push(''); }
    if (er.length) { L.push('## Connections to remove'); L.push('- ' + er.length + ' connections go away, for example: ' + er.slice(0, 6).map(e => lab(e.from) + ' to ' + lab(e.to)).join('; ')); L.push(''); }
    const r = doc.scans && doc.scans.today ? report(doc.scans.today) : null, h = (meta.handled || []);
    if (r) { const fx = r.findings.filter(f => h.includes(f.title));
      if (fx.length) { L.push('## Findings this plan must fix (from the scan)'); fx.forEach(f => L.push('- ' + f.title + '. ' + f.detail + (f.fix ? ' Fix: ' + f.fix : ''))); L.push(''); } }
    const a = mapMetrics(T), b = mapMetrics(P);
    L.push('## Check when done');
    L.push('- Re-scan with Morph Map. Expected: about ' + b.boxes + ' boxes and ' + b.arrows + ' arrows (now ' + a.boxes + ' and ' + a.arrows + '), complexity ' + b.score + ' (now ' + a.score + ').');
    if (r && h.length) L.push('- The findings listed above should no longer appear.');
    return L.join('\n');
  }

  /* ---------- Learn-mode quiz, built from the scan ---------- */
  function quiz(s, seed) {
    if (!s || s.kind !== 'code') return [];
    const files = s.files || [], Q = [], usedBy = {}; files.forEach(f => f.imp.forEach(t => usedBy[t] = (usedBy[t] || 0) + 1));
    let r = seed || 1; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    const pick = (arr, n, not) => { const a = arr.filter(x => !not.includes(x)); const o = []; while (a.length && o.length < n) o.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return o; };
    const mix = (right, wrong) => { const o = [right, ...wrong]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
    const names = files.map(f => f.f);
    const top = Object.entries(usedBy).sort((a, b) => b[1] - a[1])[0];
    if (top && names.length >= 4) Q.push({ q: 'Which file is used by the most other files?', a: top[0], opts: mix(top[0], pick(names, 3, [top[0]])), why: top[0] + ' is imported by ' + top[1] + ' files, so it is a core building block.' });
    const big = files.slice().sort((a, b) => b.lines - a.lines)[0];
    if (big && names.length >= 4) Q.push({ q: 'Which file is the biggest?', a: big.f, opts: mix(big.f, pick(names, 3, [big.f])), why: big.f + ' has ' + big.lines + ' lines. Big files usually do several jobs.' });
    const entry = files.find(f => f.entry);
    if (entry && names.length >= 4) Q.push({ q: 'Where does the program start?', a: entry.f, opts: mix(entry.f, pick(names, 3, [entry.f])), why: entry.f + ' is the entry point. Read it first, then follow its imports.' });
    const pk = {}; files.forEach(f => f.ext.forEach(e => pk[e] = (pk[e] || 0) + 1)); const tp = Object.entries(pk).sort((a, b) => b[1] - a[1])[0];
    if (tp && names.length >= 4) { const others = ['lodash', 'react', 'axios', 'moment', 'chalk', 'express', 'debug', 'uuid'].filter(x => x !== tp[0] && !pk[x]); Q.push({ q: 'Which outside package does this project use the most?', a: tp[0], opts: mix(tp[0], pick(others, 3, [])), why: tp[0] + ' is imported in ' + tp[1] + ' files.' }); }
    return Q;
  }

  /* ---------- websites ---------- */
  function webReport(s) {
    const F = [], pages = s.pages || [], N = pages.length || 1, paths = new Set(pages.map(p => p.path));
    // 1. same menu on every page
    const cnt = {}; pages.forEach(p => new Set(p.links).forEach(l => cnt[l] = (cnt[l] || 0) + 1));
    const menu = Object.keys(cnt).filter(l => cnt[l] >= N * 0.8);
    if (N >= 5 && menu.length >= 15) F.push({ sev: 'amber', area: 'Structure', title: 'Same ' + menu.length + '-link menu on every page', detail: menu.length + ' links appear on at least 80% of the ' + N + ' pages read. Visitors face a wall of choices everywhere.', fix: 'Group the menu into 4 to 6 headings.' });
    // 2. look-alike sibling pages
    const fam = {}; [...paths].forEach(p => { const parts = p.split('/').filter(Boolean); if (parts.length < 1) return;
      const last = parts[parts.length - 1].replace(/\.html?$/, ''), stem = last.split(/[-_]/)[0], key = parts.slice(0, -1).join('/') + '|' + stem;
      if (stem.length >= 3) (fam[key] = fam[key] || []).push(last); });
    const fams = Object.values(fam).filter(v => v.length >= 3).sort((a, b) => b.length - a.length);
    if (fams.length) { const n = fams.reduce((a, v) => a + v.length, 0);
      F.push({ sev: 'amber', area: 'Structure', title: n + ' look-alike pages could be ' + fams.length, detail: fams.slice(0, 3).map(v => v.join(', ')).join('; ') + '. Each group shares a name, so it is likely one page with filters.', fix: 'Merge each group into one page with filter buttons.' }); }
    // 3. buy path
    const all = new Set([...paths, ...pages.flatMap(p => p.links)]);
    const shop = [...all].some(p => /\/(products?|shop|collections?)\//i.test(p));
    const cart = [...all].some(p => /(cart|checkout|basket|bag)(\/|$|\.)/i.test(p));
    if (shop && !cart) F.push({ sev: 'red', area: 'Structure', title: 'Checkout cannot be reached by a link', detail: 'Product pages exist, but no page links to a cart or checkout. Only scripts open it, so search engines and some assistive tools never find it.', fix: 'Add a plain link to the cart in the header.' });
    // 4. clicks from home
    const byPath = {}; pages.forEach(p => byPath[p.path] = p);
    const dist = { '/': 0 }, q = ['/'];
    while (q.length) { const c = q.shift(); ((byPath[c] || {}).links || []).forEach(l => { if (dist[l] == null && byPath[l]) { dist[l] = dist[c] + 1; q.push(l); } }); }
    const far = pages.filter(p => dist[p.path] > 3), lost = pages.filter(p => dist[p.path] == null && p.path !== '/');
    if (far.length) F.push({ sev: 'amber', area: 'Structure', title: pl(far.length, 'page is', 'pages are') + ' more than 3 clicks deep', detail: 'For example ' + far[0].path + '.', fix: 'Link important pages closer to home.' });
    if (lost.length) F.push({ sev: 'info', area: 'Structure', title: pl(lost.length, 'page', 'pages') + ' not reachable from the home page', detail: 'Found only through other routes, for example ' + lost[0].path + '.', fix: 'Check they are meant to be reachable.' });
    if (s.dead) F.push({ sev: 'amber', area: 'Structure', title: pl(s.dead, 'broken link', 'broken links'), detail: 'Links that returned an error while reading the site.', fix: 'Fix or remove them.' });
    // 5. outside scripts
    const loads = new Set(); pages.forEach(p => (p.hosts || []).forEach(h => { if (h.startsWith('load:')) loads.add(h.slice(5)); }));
    if (loads.size >= 5) F.push({ sev: 'amber', area: 'Speed and privacy', title: loads.size + ' outside services load on the site', detail: [...loads].slice(0, 5).join(', ') + '. Each one slows pages and can see visitors.', fix: 'Remove the ones nobody uses.' });
    // 6. security, site-wide, from what any browser already receives
    const h = s.headers || {}, sec = [];
    if (s.https === false) sec.push({ sev: 'red', title: 'Site is not on HTTPS', detail: 'Everything travels unencrypted.' });
    if (s.mixed) sec.push({ sev: 'red', title: s.mixed + ' insecure (http) files on secure pages', detail: 'Browsers may block them, and they can be tampered with.' });
    const hsts = h['strict-transport-security'], age = hsts ? Number((hsts.match(/max-age=(\d+)/) || [])[1] || 0) : 0;
    if (!hsts) sec.push({ sev: 'amber', title: 'HTTPS is not enforced (no HSTS)', detail: 'Browsers are not told to always use the secure version.' });
    else if (age < 86400) sec.push({ sev: 'red', title: 'HSTS lasts only ' + Math.round(age / 60) + ' minutes', detail: 'The protection expires almost straight away. Common practice is at least 6 months.' });
    else if (age < 15552000) sec.push({ sev: 'amber', title: 'HSTS is short (' + Math.round(age / 86400) + ' days)', detail: 'Common practice is at least 6 months.' });
    const csp = h['content-security-policy'];
    if (!csp) sec.push({ sev: 'amber', title: 'No Content Security Policy', detail: 'Nothing limits which scripts can run if one is injected.' });
    else if (!/(script-src|default-src)/.test(csp)) sec.push({ sev: 'amber', title: 'Content Security Policy does not limit scripts', detail: 'It exists but has no script-src or default-src rule.' });
    if (!h['x-frame-options'] && !/frame-ancestors/.test(csp || '')) sec.push({ sev: 'amber', title: 'Pages can be framed by other sites', detail: 'Enables click-jacking tricks.' });
    if (!h['x-content-type-options']) sec.push({ sev: 'info', title: 'No X-Content-Type-Options header', detail: 'A small hardening step.' });
    if (!h['referrer-policy']) sec.push({ sev: 'info', title: 'No Referrer-Policy', detail: 'Full page addresses may leak to other sites.' });
    const sess = (s.cookies || []).filter(c => /sess|sid|auth|token|login/i.test(c));
    if (sess.length) sec.push({ sev: 'red', title: 'Session cookie readable by scripts', detail: sess.join(', ') + ' can be read by any script on the page, so an injected script could take over a visitor\'s session.' });
    if (!sec.some(x => SEC[x.sev] >= 2)) sec.push({ sev: 'green', title: 'Core security settings look fine', detail: 'HTTPS and the main headers are in place.' });
    sec.forEach(x => F.push(Object.assign({ area: 'Security' }, x)));
    const worst = Math.max(...sec.map(x => SEC[x.sev]));
    return { kind: 'web', name: s.name, grade: worst >= 3 ? 'red' : worst >= 2 ? 'amber' : 'green',
      stats: [['Pages read', pages.length], ['Max clicks from home', Math.max(0, ...Object.values(dist))], ['Outside services', loads.size]],
      findings: F.sort((a, b) => SEC[b.sev] - SEC[a.sev]) };
  }

  /* ---------- code (for learners) ---------- */
  function codeReport(s) {
    const files = s.files || [], F = [], by = {}; files.forEach(f => by[f.f] = f);
    const usedBy = {}; files.forEach(f => f.imp.forEach(t => (usedBy[t] = usedBy[t] || []).push(f.f)));
    const lines = files.reduce((a, f) => a + f.lines, 0), pk = {}; files.forEach(f => f.ext.forEach(e => pk[e] = (pk[e] || 0) + 1));
    const entries = files.filter(f => f.entry), roots = files.filter(f => !usedBy[f.f] && f.imp.length).sort((a, b) => b.imp.length - a.imp.length);
    const start = (entries[0] || roots[0]); if (start) F.push({ sev: 'info', area: 'Where to start', title: 'Start reading at ' + start.f, detail: 'It is where the program begins and it pulls in ' + start.imp.length + ' other files. Follow its imports from here.', file: start.f });
    const core = Object.entries(usedBy).filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
    core.forEach(([f, v]) => F.push({ sev: 'info', area: 'Where to start', title: f + ' is used by ' + v.length + ' files', detail: 'A core building block. Understand it early and the rest gets easier.', file: f }));
    // circular imports (Tarjan)
    let idx = 0; const st = [], on = {}, ix = {}, low = {}, cyc = [];
    const sc = v => { ix[v] = low[v] = idx++; st.push(v); on[v] = 1; (by[v] ? by[v].imp : []).forEach(w => { if (!by[w]) return; if (ix[w] == null) { sc(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], ix[w]); });
      if (low[v] === ix[v]) { const c = []; let w; do { w = st.pop(); on[w] = 0; c.push(w); } while (w !== v); if (c.length > 1) cyc.push(c); } };
    files.forEach(f => { if (ix[f.f] == null) sc(f.f); });
    cyc.slice(0, 2).forEach(c => F.push({ sev: 'amber', area: 'Tangles', title: c.length + ' files depend on each other in a loop', detail: c.slice(0, 4).join(', ') + '. Loops make code harder to follow and change.', fix: 'Move the shared part into its own file.' }));
    files.filter(f => f.lines > 400).sort((a, b) => b.lines - a.lines).slice(0, 3).forEach(f => F.push({ sev: 'amber', area: 'Big files', title: f.f + ' has ' + f.lines + ' lines', detail: 'Big files do many jobs. Read it in sections.', fix: 'Read it one section at a time; bigger projects often split files like this by job.', file: f.f }));
    const lonely = files.filter(f => !f.entry && !usedBy[f.f] && !f.imp.length);
    if (lonely.length) F.push({ sev: 'info', area: 'Tangles', title: pl(lonely.length, 'file connects', 'files connect') + ' to nothing', detail: lonely.slice(0, 3).map(f => f.f).join(', ') + '. Possibly unused, or loaded in a way the scan cannot see.' });
    const top = Object.entries(pk).sort((a, b) => b[1] - a[1]);
    if (top.length) F.push({ sev: 'info', area: 'Outside packages', title: pl(top.length, 'outside package', 'outside packages'), detail: 'Most used: ' + top.slice(0, 3).map(x => x[0]).join(', ') + '. Look these up to learn what the project borrows.' });
    if (!cyc.length) F.push({ sev: 'green', area: 'Tangles', title: 'No import loops', detail: 'Every file can be read in a clear order.' });
    return { kind: 'code', name: s.name, stats: [['Files', files.length], ['Lines', lines], ['Outside packages', top.length]], findings: F.sort((a, b) => SEC[b.sev] - SEC[a.sev]) };
  }

  function report(scan) { return !scan ? null : scan.kind === 'web' ? webReport(scan) : codeReport(scan); }
  const api = { mapMetrics, report, blast, brief, quiz };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MorphReport = api;
})(this);
