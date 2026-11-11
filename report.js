/* Morph Map report: scores and findings worked out from real scan data.
   Every rule here is plain and visible on purpose, so people can check why a finding appears.
   Used by index.html, and by node for tests (module.exports). */
(function (root) {
  const SEC = { red: 3, amber: 2, info: 1, green: 0 };
  const STOP = new Set('the and for how get set add use new about check find apply what why when who your my our all see view make pay buy can contact help report register sign log'.split(' '));
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
    if (!pages.length) F.push({ sev: 'info', area: 'Structure', title: s.skipped ? 'The site asks crawlers not to read its pages' : 'No pages could be read', detail: s.skipped ? 'Its robots.txt blocks every page, so Morph Map stopped. Only the security settings of the home page were checked.' : 'The site returned no readable pages. It may need a login or build its pages with scripts.' });
    // 1. same menu on every page
    const cnt = {}; pages.forEach(p => new Set(p.links).forEach(l => cnt[l] = (cnt[l] || 0) + 1));
    const menu = Object.keys(cnt).filter(l => cnt[l] >= N * 0.8);
    if (N >= 5 && menu.length >= 15) F.push({ sev: 'amber', area: 'Structure', title: 'Same ' + menu.length + '-link menu on every page', detail: menu.length + ' links appear on at least 80% of the ' + N + ' pages read. Visitors face a wall of choices everywhere.', fix: 'Group the menu into 4 to 6 headings.' });
    // 2. look-alike sibling pages
    // look-alike: a parent page plus variants that start with its name (living-room, living-room-sale, living-room-new)
    const fam = {}, byDir = {}; [...paths].forEach(p => { const parts = p.split('/').filter(Boolean); if (!parts.length) return;
      const last = parts[parts.length - 1].replace(/\.html?$/, ''), dir = parts.slice(0, -1).join('/'); (byDir[dir] = byDir[dir] || new Set()).add(last); });
    Object.entries(byDir).forEach(([dir, set]) => [...set].forEach(par => { if (par.length < 4 || STOP.has(par)) return;
      const kids = [...set].filter(x => x !== par && x.startsWith(par + '-')); if (kids.length >= 2) fam[dir + '|' + par] = [par, ...kids]; }));
    // keep only the largest family for any page
    Object.keys(fam).forEach(k => Object.keys(fam).forEach(j => { if (k !== j && fam[k] && fam[j] && fam[j].every(x => fam[k].includes(x))) delete fam[j]; }));
    const fams = Object.values(fam).filter(v => v.length >= 3).sort((a, b) => b.length - a.length);
    if (fams.length) { const n = fams.reduce((a, v) => a + v.length, 0);
      F.push({ sev: 'amber', area: 'Structure', title: n + ' look-alike pages could be ' + fams.length, detail: fams.slice(0, 3).map(v => v.join(', ')).join('; ') + '. Each group shares a name, so it is likely one page with filters.', fix: 'Merge each group into one page with filter buttons.' }); }
    // 3. buy path
    const all = new Set([...paths, ...pages.flatMap(p => p.links)]);
    const shop = [...all].filter(p => /\/(products?|shop)\/[^/]+/i.test(p)).length >= 3;
    const base = (s.name || '').split('.').slice(-2).join('.'), sub = new Set(); pages.forEach(p => (p.hosts || []).forEach(h => { const n = h.split(':')[1] || ''; if (n.endsWith(base)) sub.add(n); }));
    const cart = [...all].some(p => /(cart|checkout|basket|bag)(\/|$|\.)/i.test(p)) || [...sub].some(n => /^(cart|checkout|basket|bag)\./i.test(n));
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
    if (loads.size >= 5) F.push({ sev: 'amber', area: 'Speed and privacy', title: loads.size + ' outside services load on the site', detail: [...loads].slice(0, 5).join(', ') + (loads.size > 5 ? ' and ' + (loads.size - 5) + ' more' : '') + '. Some may be the company\'s own content servers. Each extra host adds load time, and trackers among them can see visitors.', fix: 'Check which are trackers and remove the unused ones.' });
    // 6. security, site-wide, from what any browser already receives
    const h = s.headers || {}, sec = [];
    if (s.https === false) sec.push({ sev: 'red', title: 'Site is not on HTTPS', detail: 'Everything travels unencrypted.' });
    if (s.mixed) sec.push({ sev: 'red', title: s.mixed + ' insecure (http) files on secure pages', detail: 'Browsers may block them, and they can be tampered with.' });
    const hsts = h['strict-transport-security'], age = hsts ? Number((hsts.match(/max-age=(\d+)/) || [])[1] || 0) : 0;
    if (!hsts) sec.push({ sev: 'amber', title: 'No HSTS header seen', detail: 'Browsers are not told to always use the secure version, unless the site is on the browsers\' built-in preload list. Worth checking at hstspreload.org.' });
    else if (age < 86400) sec.push({ sev: 'red', title: 'HSTS lasts only ' + Math.round(age / 60) + ' minutes', detail: 'The protection expires almost straight away. Common practice is at least 6 months.' });
    else if (age < 15552000) sec.push({ sev: 'amber', title: 'HSTS is short (' + Math.round(age / 86400) + ' days)', detail: 'Common practice is at least 6 months.' });
    const csp = h['content-security-policy'];
    if (!csp) sec.push({ sev: 'amber', title: 'No Content Security Policy', detail: 'Nothing limits which scripts can run if one is injected.' });
    else if (!/(script-src|default-src)/.test(csp)) sec.push({ sev: 'amber', title: 'Content Security Policy does not limit scripts', detail: 'It exists but has no script-src or default-src rule.' });
    if (!h['x-frame-options'] && !/frame-ancestors/.test(csp || '')) sec.push({ sev: 'amber', title: 'Pages can be framed by other sites', detail: 'Enables click-jacking tricks.' });
    if (!h['x-content-type-options']) sec.push({ sev: 'info', title: 'No X-Content-Type-Options header', detail: 'A small hardening step.' });
    if (!h['referrer-policy']) sec.push({ sev: 'info', title: 'No Referrer-Policy', detail: 'Full page addresses may leak to other sites.' });
    const sess = (s.cookies || []).filter(c => /sess|sid|auth|token|login/i.test(c));
    const strong = sess.filter(c => /^(sid|session|sessionid|phpsessid|jsessionid|connect\.sid|auth|auth_token|token|access_token)$/i.test(c));
    if (strong.length) sec.push({ sev: 'red', title: 'Session cookie readable by scripts', detail: strong.join(', ') + ' looks like a login session and can be read by any script on the page, so an injected script could take over a visitor\'s session.', fix: 'Set it HttpOnly.' });
    else if (sess.length) sec.push({ sev: 'info', title: 'Cookie named like a session is readable by scripts', detail: sess.join(', ') + '. Often this is analytics, not the login. If it is the login session, it should be HttpOnly.' });
    if (!sec.some(x => SEC[x.sev] >= 2)) sec.push({ sev: 'green', title: 'Core security settings look fine', detail: 'HTTPS and the main headers are in place.' });
    sec.forEach(x => F.push(Object.assign({ area: 'Security' }, x)));
    const worst = Math.max(...sec.map(x => SEC[x.sev]));
    return { kind: 'web', name: s.name, grade: worst >= 3 ? 'red' : worst >= 2 ? 'amber' : 'green',
      stats: [['Pages read', pages.length], ['Max clicks from home', Math.max(0, ...Object.values(dist))], ['Outside services', loads.size]],
      findings: F.sort((a, b) => SEC[b.sev] - SEC[a.sev]) };
  }

  /* ---------- import loops: groups of files that depend on each other in a circle (Tarjan) ---------- */
  function loops(files) {
    const by = {}; files.forEach(f => by[f.f] = f);
    let idx = 0; const st = [], on = {}, ix = {}, low = {}, cyc = [];
    const sc = v => { ix[v] = low[v] = idx++; st.push(v); on[v] = 1; (by[v] ? by[v].imp : []).forEach(w => { if (!by[w]) return; if (ix[w] == null) { sc(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], ix[w]); });
      if (low[v] === ix[v]) { const c = []; let w; do { w = st.pop(); on[w] = 0; c.push(w); } while (w !== v); if (c.length > 1) cyc.push(c); } };
    files.forEach(f => { if (ix[f.f] == null) sc(f.f); });
    return cyc;
  }

  /* ---------- change alarm: what one change did to a project, in plain words ----------
     a = the scan you approved, b = the scan now. mapA and mapB are their maps.
     plan (optional) = {today, planned}: the plan you drew, to check the change against.
     Every rule is a plain comparison of the two scans. Nothing is guessed.
     Verdict: any red line = alarm ("Stop and check"), else any amber = check ("Worth a look"), else pass ("Looks safe"). */
  const DATA = /(^|\/)(models?|db|database|schema|stores?|migrations?|supabase|prisma|repositor(y|ies)|entities|dao|state|data(Provider)?)(\/|$|\.)/i;
  function changes(a, b, mapA, mapB, plan) {
    const fa = (a && a.files) || [], fb = (b && b.files) || [], A = {}, B = {}; fa.forEach(f => A[f.f] = f); fb.forEach(f => B[f.f] = f);
    const some = (arr, n) => arr.slice(0, n || 4).join(', ') + (arr.length > (n || 4) ? ' and ' + (arr.length - (n || 4)) + ' more' : '');
    const usedBy = fs => { const u = {}; fs.forEach(f => f.imp.forEach(t => u[t] = (u[t] || 0) + 1)); return u; };
    const uA = usedBy(fa), uB = usedBy(fb), L = [], add = (sev, title, detail, fix) => L.push({ sev, title, detail: detail || '', fix: fix || '' });
    const added = fb.filter(f => !A[f.f]).map(f => f.f), removed = fa.filter(f => !B[f.f]).map(f => f.f);
    const sA = mapMetrics(mapA), sB = mapMetrics(mapB), d = sB.score - sA.score;
    // 1. complexity, same formula as the report
    if (d >= 10) add('red', 'Complexity jumped from ' + sA.score + ' to ' + sB.score, 'A rise of 10 points or more in one change usually means the app got more tangled, not just bigger.', 'Ask the AI why it needed the extra parts, and whether a simpler way exists.');
    else if (d >= 4) add('amber', 'Complexity rose from ' + sA.score + ' to ' + sB.score, 'A small rise is normal for a new feature. Keep an eye on it.');
    else if (d <= -4) add('green', 'Complexity fell from ' + sA.score + ' to ' + sB.score, 'The app got simpler.');
    // 2. import loops
    const key = c => c.slice().sort().join('|'), lA = new Set(loops(fa).map(key)), lB = loops(fb), newLoops = lB.filter(c => !lA.has(key(c)));
    newLoops.slice(0, 2).forEach(c => add('red', c.length + ' files now depend on each other in a loop', some(c) + '. Loops make every later change riskier, for you and for the AI.', 'Ask the AI to move the shared part into its own file.'));
    const goneLoops = lA.size - (lB.length - newLoops.length); if (goneLoops > 0) add('green', pl(goneLoops, 'import loop was', 'import loops were') + ' untangled');
    // 3. outside packages
    const pk = fs => { const s = new Set(); fs.forEach(f => f.ext.forEach(e => s.add(e))); return s; }, pA = pk(fa), pB = pk(fb);
    const pNew = [...pB].filter(x => !pA.has(x)), pGone = [...pA].filter(x => !pB.has(x));
    if (pNew.length) add('amber', pl(pNew.length, 'new outside package', 'new outside packages') + ': ' + some(pNew), 'Each one is code you did not write and now depend on.', 'Check the AI really needed ' + (pNew.length === 1 ? 'it' : 'them') + '.');
    if (pGone.length) add('info', pl(pGone.length, 'outside package', 'outside packages') + ' no longer used: ' + some(pGone));
    // 4. new places that store data
    const dNew = added.filter(f => DATA.test(f));
    if (dNew.length) add('amber', pl(dNew.length, 'new data file', 'new data files') + ': ' + some(dNew), 'New places to keep data are where copies creep in.', 'Check it does not keep a second copy of something you already store.');
    // 5. new starting points
    const eNew = added.filter(f => B[f].entry);
    if (eNew.length) add('amber', pl(eNew.length, 'new starting point', 'new starting points') + ': ' + some(eNew), 'The program can now begin from another file.');
    // 6. a core file removed, or changed a lot
    removed.filter(f => (uA[f] || 0) >= 3).slice(0, 2).forEach(f => add('amber', 'A core file was removed: ' + f, uA[f] + ' files used it before this change.', 'Check everything that relied on it still works.'));
    fb.filter(f => A[f.f] && (uB[f.f] || 0) >= 3 && Math.abs(f.lines - A[f.f].lines) >= Math.max(40, A[f.f].lines * 0.3)).slice(0, 3)
      .forEach(f => add('amber', 'Core file ' + f.f + ' changed a lot', A[f.f].lines + ' lines before, ' + f.lines + ' now. ' + uB[f.f] + ' files depend on it.', 'Test the parts that use it.'));
    // 7. files that grew past 400 lines
    fb.filter(f => A[f.f] && f.lines > 400 && A[f.f].lines <= 400).slice(0, 3).forEach(f => add('amber', f.f + ' grew past 400 lines', A[f.f].lines + ' lines before, ' + f.lines + ' now. Big files do many jobs and are harder to change safely.', 'Ask the AI to split it by job.'));
    // 8. leftovers: new files that nothing uses
    const lonely = (fs, u) => fs.filter(f => !f.entry && !u[f.f] && !f.imp.length).map(f => f.f), loA = new Set(lonely(fa, uA)), loNew = lonely(fb, uB).filter(f => !loA.has(f));
    if (loNew.length) add('amber', pl(loNew.length, 'new file connects', 'new files connect') + ' to nothing', some(loNew) + '. Often a leftover the AI never wired in, or an old version it forgot to delete.', 'Ask the AI whether ' + (loNew.length === 1 ? 'it is' : 'they are') + ' used. Delete if not.');
    // 9. size of the change
    if (added.length > Math.max(5, fa.length * 0.25)) add('amber', 'Large change: ' + added.length + ' files added in one go', 'Big changes are hard to check. Smaller steps are safer.');
    else if (added.length) add('info', pl(added.length, 'file', 'files') + ' added: ' + some(added));
    if (removed.length) add('info', pl(removed.length, 'file', 'files') + ' removed: ' + some(removed));
    // 10. rewiring between files that were already there
    const ek = fs => { const s = new Set(); fs.forEach(f => f.imp.forEach(t => s.add(f.f + '>' + t))); return s; }, eA = ek(fa), eB = ek(fb);
    const both = k => { const [x, y] = k.split('>'); return A[x] && A[y] && B[x] && B[y]; };
    const wNew = [...eB].filter(k => !eA.has(k) && both(k)).length, wGone = [...eA].filter(k => !eB.has(k) && both(k)).length;
    if (wNew || wGone) add('info', 'Existing files were rewired', pl(wNew, 'new connection', 'new connections') + ' and ' + pl(wGone, 'removed connection', 'removed connections') + ' between files that were already there.');
    // 11. the plan you drew, if there is one
    if (plan && plan.today && plan.planned) {
      const tn = plan.today.nodes || [], pn = plan.planned.nodes || [], nowIds = new Set(((mapB && mapB.nodes) || []).map(n => n.id)), nowLabels = new Set(((mapB && mapB.nodes) || []).map(n => (n.label || '').toLowerCase()));
      const pIds = new Set(pn.map(n => n.id)), tIds = new Set(tn.map(n => n.id));
      const toGo = tn.filter(n => !pIds.has(n.id)), toAdd = pn.filter(n => !tIds.has(n.id));
      if (toGo.length || toAdd.length) {
        const still = toGo.filter(n => nowIds.has(n.id)), missing = toAdd.filter(n => !nowIds.has(n.id) && !nowLabels.has((n.label || '').toLowerCase()));
        const done = toGo.length - still.length + toAdd.length - missing.length, all = toGo.length + toAdd.length;
        add(done === all ? 'green' : 'amber', 'Your plan: ' + done + ' of ' + all + ' planned changes are in the code',
          (still.length ? 'Still there: ' + some(still.map(n => n.label || n.id)) + '. ' : '') + (missing.length ? 'Not added yet: ' + some(missing.map(n => n.label || n.id)) + '. ' : '') + 'Your plan aimed for complexity ' + mapMetrics(plan.planned).score + '. The code is now at ' + sB.score + '.');
      }
    }
    const same = !added.length && !removed.length && !wNew && !wGone && !pNew.length && !pGone.length && fb.every(f => A[f.f] && A[f.f].lines === f.lines);
    if (same) add('green', 'Nothing changed', 'The code matches your approved map exactly.');
    else if (!L.some(l => l.sev === 'red' || l.sev === 'amber')) add('green', 'No warning signs', 'The structure changed, but none of the alarm rules fired.');
    L.sort((x, y) => SEC[y.sev] - SEC[x.sev]);
    const worst = Math.max(0, ...L.map(l => SEC[l.sev])), verdict = worst >= 3 ? 'alarm' : worst >= 2 ? 'check' : 'pass';
    const lines = fs => fs.reduce((n, f) => n + f.lines, 0), dl = lines(fb) - lines(fa);
    const bits = []; if (added.length) bits.push('added ' + pl(added.length, 'file', 'files')); if (removed.length) bits.push('removed ' + pl(removed.length, 'file', 'files')); if (pNew.length) bits.push('brought in ' + pl(pNew.length, 'outside package', 'outside packages'));
    const summary = same ? 'Nothing changed since you approved the map.' : 'This change ' + (bits.length ? bits.join(bits.length > 2 ? ', ' : ' and ') : 'edited existing files only') + '. ' + (dl ? Math.abs(dl) + ' lines ' + (dl > 0 ? 'more' : 'fewer') + ' overall. ' : '') + 'Complexity ' + (d ? 'went from ' + sA.score + ' to ' + sB.score : 'stayed at ' + sB.score) + '.';
    return { verdict, title: verdict === 'alarm' ? 'Stop and check' : verdict === 'check' ? 'Worth a look' : 'Looks safe', summary, lines: L,
      stats: { added: added.length, removed: removed.length, lines: dl, before: sA.score, after: sB.score } };
  }

  /* ---------- a message to paste to the AI coder about the change it just made ---------- */
  function changeMessage(c, name) {
    const ask = c.lines.filter(l => l.sev === 'red' || (l.sev === 'amber' && l.fix)), T = [];
    T.push('I checked your last change to ' + (name || 'my project') + ' with Morph Map, which compares the code before and after.');
    T.push(''); T.push(c.summary); T.push('');
    if (!ask.length) { T.push('Nothing worrying came up. In two or three plain sentences, tell me what you changed and why.'); return T.join('\n'); }
    T.push('Before I accept it, please go through these one by one. For each, explain in plain words why it was needed, or fix it:'); T.push('');
    ask.forEach((l, i) => T.push((i + 1) + '. ' + l.title + '. ' + l.detail + (l.fix ? ' ' + l.fix : '')));
    T.push(''); T.push('Do not add anything new while fixing these. When done, list exactly which files you changed.');
    return T.join('\n');
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
    const cyc = loops(files);
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
  const api = { mapMetrics, report, blast, brief, quiz, loops, changes, changeMessage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MorphReport = api;
})(this);
