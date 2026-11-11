#!/usr/bin/env node
/* morph-scan: read a code folder and write a Morph Map file.

   Map a project:
     node morph-scan.js <folder> [--out map.json] [--max 22]

   Change alarm (what did the last change do to my project?):
     node morph-scan.js <folder> --since HEAD~1 [--out change.json]     compare with an earlier git commit
     node morph-scan.js <folder> --check approved.json [--out change.json]   compare with a map you approved earlier
   Prints the verdict in plain words and exits with code 1 when the verdict is "Stop and check",
   so it can sit in a git hook or a build step. Open the --out file in Morph Map to watch the change play.

   The scanning rules live in scan-core.js (shared with the browser). The change rules live in ../report.js. */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const core = require('./scan-core.js');

function read(root) {
  const out = [];
  (function go(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), rel = path.relative(root, p).split(path.sep).join('/');
      if (e.isDirectory()) { if (core.wantedDir(rel)) go(p); }
      else if (core.wanted(rel) && fs.statSync(p).size < core.MAX_BYTES) { let src = ''; try { src = fs.readFileSync(p, 'utf8'); } catch (err) {} out.push({ f: rel, src }); }
    }
  })(root);
  return out;
}

function scan(root, max, prev) { root = path.resolve(root); return core.scanFiles(read(root), path.basename(root), max, prev); }

/* the project as it was at an earlier git commit, unpacked into a temporary folder */
function scanAt(root, ref, max) {
  if (!/^[\w./~^@-]+$/.test(ref)) throw new Error('That does not look like a git commit or branch name: ' + ref);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'morph-'));
  try {
    const tar = cp.execFileSync('git', ['-C', root, 'archive', '--format=tar', ref, '.'], { maxBuffer: 1 << 30 });
    cp.execFileSync('tar', ['-x', '-C', tmp], { input: tar });
    const m = core.scanFiles(read(tmp), path.basename(path.resolve(root)), max);
    return m;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

module.exports = { scan, scanAt };

if (require.main === module) {
  const a = process.argv.slice(2), opt = k => a.includes(k) ? a[a.indexOf(k) + 1] : null;
  const root = a[0];
  if (!root || root.startsWith('--')) { console.error('Usage: node morph-scan.js <folder> [--out map.json] [--max 22] [--since HEAD~1 | --check approved.json]'); process.exit(2); }
  const out = opt('--out'), max = Number(opt('--max')) || 22, since = opt('--since'), check = opt('--check');
  const write = doc => { if (out) fs.writeFileSync(out, JSON.stringify(doc, null, 1)); else if (!since && !check) process.stdout.write(JSON.stringify(doc)); };

  if (since || check) {
    const report = require('../report.js');
    let base;   // the approved project: {today, planned, scans:{today}, meta}
    if (check) { base = JSON.parse(fs.readFileSync(check, 'utf8')); if (!base.today || !base.scans || !base.scans.today) { console.error(check + ' is not a scanned Morph Map file.'); process.exit(2); } }
    else base = core.toDoc(scanAt(path.resolve(root), since, max));
    const now = scan(root, max, base.today);
    const c = report.changes(base.scans.today, now.scan, base.today, { nodes: now.nodes, edges: now.edges }, base);
    console.error('\n' + c.title.toUpperCase() + '  ' + path.basename(path.resolve(root)) + (since ? ', compared with ' + since : ', compared with your approved map'));
    console.error(c.summary + '\n');
    c.lines.forEach(l => console.error((l.sev === 'red' ? '  [!!] ' : l.sev === 'amber' ? '  [! ] ' : l.sev === 'green' ? '  [ok] ' : '  [  ] ') + l.title + (l.detail ? '\n       ' + l.detail : '')));
    console.error('');
    base.review = { after: { map: { nodes: now.nodes, edges: now.edges }, scan: now.scan } };
    write(base);
    if (out) console.error('Open ' + out + ' in Morph Map (Import) to watch the change play.');
    process.exit(c.verdict === 'alarm' ? 1 : 0);
  }

  const m = scan(root, max);
  write(core.toDoc(m));
  console.error(m.scan.name + ': ' + m.stats.files + ' files read, ' + m.stats.boxes + ' boxes, ' + m.stats.arrows + ' arrows');
}
