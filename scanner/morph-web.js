/* morph-web: map a public website into a Morph Map file.
   For learning only. Use it on public pages, respect the site's terms and robots.txt,
   and keep the page limit low so you never load a site heavily.

   How to run:
   1. Open the website's home page in your browser.
   2. Open the browser console (Cmd+Option+J on Mac, Ctrl+Shift+J on Windows).
   3. Paste this whole file and press Enter. It reads up to 40 pages, one at a time.
   4. When it finishes it prints a map and copies it. Save it as map.json and Import it in Morph Map.

   What it finds: sections (grouped pages), forms, outside services the site loads
   (analytics, widgets, CRMs, video) and the links between sections.
   What it cannot see: server code, databases, anything behind a login. */
(async (LIMIT = 40, MAX_BOXES = 14, DELAY_MS = 300) => {
  const host = location.hostname.replace(/^www\./, ''), seen = new Map(), queue = [location.origin + location.pathname];
  const norm = (h, base) => { try { const u = new URL(h, base); u.hash = ''; u.search = ''; if (u.hostname.replace(/^www\./, '') === host) { u.protocol = location.protocol; u.hostname = location.hostname; } return u; } catch (e) { return null; } };
  while (queue.length && seen.size < LIMIT) {
    const url = queue.shift(); if (seen.has(url)) continue;
    let html = '';
    try { const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) { seen.set(url, { dead: 1 }); continue; } if (!(r.headers.get('content-type') || '').includes('html')) { seen.set(url, { skip: 1 }); continue; } html = await r.text(); }
    catch (e) { seen.set(url, { err: 1 }); continue; }
    const doc = new DOMParser().parseFromString(html, 'text/html'), links = new Set(), hosts = new Set();
    doc.querySelectorAll('a[href]').forEach(a => { const u = norm(a.getAttribute('href'), url); if (!u || !/^https?:/.test(u.protocol)) return;
      if (u.hostname === location.hostname) { const k = u.origin + u.pathname; links.add(u.pathname); if (!seen.has(k) && !queue.includes(k) && !/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?|mp4|svg|txt|xml)$/i.test(u.pathname)) queue.push(k); }
      else hosts.add('link:' + u.hostname.replace(/^www\./, '')); });
    doc.querySelectorAll('script[src],iframe[src],link[rel=stylesheet][href]').forEach(e => { const u = norm(e.getAttribute('src') || e.getAttribute('href'), url); if (u && u.hostname !== location.hostname && u.hostname) hosts.add((e.tagName === 'IFRAME' ? 'iframe:' : 'load:') + u.hostname.replace(/^www\./, '')); });
    const inline = [...doc.querySelectorAll('script:not([src])')].map(s => s.textContent).join(' ');
    if (/gtag\(|googletagmanager/.test(inline)) hosts.add('load:googletagmanager.com');
    if (/fbq\(/.test(inline)) hosts.add('load:facebook pixel');
    seen.set(url, { path: new URL(url).pathname, title: (doc.title || '').trim().slice(0, 50), links: [...links], hosts: [...hosts],
      forms: [...doc.forms].map(f => ({ action: (f.getAttribute('action') || '').slice(0, 60), fields: [...f.elements].filter(x => x.name && x.type !== 'hidden').map(x => x.name).slice(0, 5) })).filter(f => f.fields.length) });
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  const pages = [...seen.values()].filter(p => p.path);
  const NAMES = { 'googletagmanager.com': 'Google Tag Manager', 'google-analytics.com': 'Google Analytics', 'facebook pixel': 'Facebook Pixel', 'connect.facebook.net': 'Facebook Pixel', 'fonts.googleapis.com': 'Google Fonts', 'maps.googleapis.com': 'Google Maps', 'youtube.com': 'YouTube', 'vimeo.com': 'Vimeo', 'js.stripe.com': 'Stripe', 'static.hotjar.com': 'Hotjar' };
  const seg = (p, d) => { const s = p.split('/').filter(Boolean); return s.length ? '/' + s.slice(0, d).join('/') : '/'; };
  let depth = 2; while (depth > 1 && new Set(pages.map(p => seg(p.path, depth))).size > MAX_BOXES) depth--;
  const G = {}; pages.forEach(p => { const g = p.path === '/' ? '/' : seg(p.path, depth); (G[g] = G[g] || []).push(p); });
  const order = Object.keys(G).sort((a, b) => G[b].length - G[a].length);
  if (order.length > MAX_BOXES) { const keep = new Set(order.slice(0, MAX_BOXES - 1)); keep.add('/'); Object.keys(G).forEach(k => { if (!keep.has(k)) { (G.other = G.other || []).push(...G[k]); delete G[k]; } }); }
  const gOf = path => { if (path === '/') return '/'; for (const k of Object.keys(G)) if (k !== '/' && k !== 'other' && (path === k || path.startsWith(k + '/'))) return k; return G.other ? 'other' : null; };
  const nodes = [], edges = {}, hostCount = {}, forms = [];
  for (const [g, ps] of Object.entries(G)) {
    const lead = ps.slice().sort((a, b) => a.path.length - b.path.length)[0];
    const label = g === '/' ? 'Home' : g === 'other' ? 'Other pages' : decodeURIComponent(g.split('/').pop()).replace(/[-_]/g, ' ').replace(/\.html?$/, '').slice(0, 24);
    nodes.push({ id: g, label, sub: ps.length > 1 ? ps.length + ' pages' : (lead.title || g).slice(0, 30), kind: g === '/' ? 'page' : 'tab', note: 'Example page: ' + lead.path });
    ps.forEach(p => {
      p.links.forEach(l => { const h = gOf(l); if (h && h !== g) edges[g + '>' + h] = (edges[g + '>' + h] || 0) + 1; });
      p.hosts.forEach(h => { const [kind, name] = h.split(':'); const v = hostCount[name] = hostCount[name] || { n: 0, kind, from: new Set() }; v.n++; v.from.add(g); if (kind !== 'link') v.kind = kind; });
      p.forms.forEach(f => forms.push({ g, f }));
    });
  }
  const fseen = new Set();
  forms.forEach(({ g, f }) => { const k = f.fields.join(','); if (fseen.has(k) || fseen.size >= 4) return; fseen.add(k); const id = 'form:' + fseen.size;
    nodes.push({ id, label: /search|keyword|^q$|^s$/i.test(k) ? 'Search form' : /email|phone|message|comment|enquir/i.test(k) ? 'Enquiry form' : /pass|login|user/i.test(k) ? 'Login form' : 'Form', sub: f.fields.join(', ').slice(0, 30), kind: 'data', note: 'Sends to: ' + (f.action || 'same page') }); edges[g + '>' + id] = 1; });
  Object.entries(hostCount).sort((a, b) => (a[1].kind === 'link') - (b[1].kind === 'link') || b[1].n - a[1].n).slice(0, 8).forEach(([name, v]) => {
    const id = 'ext:' + name; nodes.push({ id, label: NAMES[name] || name.replace(/\.(com|net|org|io)(\.au)?$/, ''), sub: v.kind === 'link' ? 'linked out' : 'loaded on ' + v.n + ' pages', kind: 'out', note: name });
    [...v.from].slice(0, 3).forEach(g => edges[g + '>' + id] = 1); });
  const ids = new Set(nodes.map(n => n.id));
  let E = Object.entries(edges).map(([k, n]) => { const [from, to] = k.split('>'); return { from, to, label: n > 3 ? n + ' links' : '', dash: to.startsWith('ext:') }; }).filter(e => ids.has(e.from) && ids.has(e.to));
  if (E.length > 55) E = E.filter(e => e.dash || e.from === '/' || edges[e.from + '>' + e.to] >= 3);
  const layer = { '/': 0 }; for (let i = 0; i < 10; i++) E.forEach(e => { if (!e.dash && layer[e.from] != null && layer[e.to] == null) layer[e.to] = layer[e.from] + 1; });
  nodes.forEach(n => { if (layer[n.id] == null) layer[n.id] = n.kind === 'data' ? 2 : 1; layer[n.id] = Math.min(layer[n.id], 2); if (n.kind === 'data') layer[n.id] = 2; if (n.kind === 'out') layer[n.id] = 3; });
  const rows = {}; nodes.forEach(n => (rows[layer[n.id]] = rows[layer[n.id]] || []).push(n));
  Object.entries(rows).forEach(([l, row]) => row.forEach((n, i) => { const per = 7, r = Math.floor(i / per), c = i % per, cnt = Math.min(per, row.length - r * per); n.x = Math.round(620 - (cnt - 1) * 90 + c * 180); n.y = 60 + Number(l) * 190 + r * 90 + (c % 2 ? 22 : 0); }));
  const map = { today: { nodes, edges: E }, planned: JSON.parse(JSON.stringify({ nodes, edges: E })) };
  const text = JSON.stringify(map, null, 1);
  try { copy(text); console.log('Map copied. Paste it into a file called map.json, then Import it in Morph Map.'); } catch (e) { console.log(text); }
  console.log(pages.length + ' pages read, ' + [...seen.values()].filter(p => p.dead).length + ' dead links, ' + nodes.length + ' boxes.');
  return map;
})();
