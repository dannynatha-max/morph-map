/* node test/run.js : checks for the scanner and the change-alarm rules. No dependencies. */
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const core = require('../scanner/scan-core.js'), report = require('../report.js'), cli = require('../scanner/morph-scan.js');
const pad = n => Array.from({ length: n }, (_, i) => '// line ' + i).join('\n');
const F = (f, imps, n) => ({ f, src: imps.map(i => "import x from '" + i + "';").join('\n') + '\n' + pad(n) });
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

const before = [F('src/index.js', ['express', './routes/a', './routes/b', './db/store'], 30), F('src/routes/a.js', ['../db/store', '../lib/util'], 80),
  F('src/routes/b.js', ['../db/store'], 60), F('src/db/store.js', ['pg'], 100), F('src/lib/util.js', [], 40)];
const A = core.scanFiles(before, 'app', 22);

t('scanner reads files, imports and outside packages', () => {
  assert.strictEqual(A.stats.files, 5);
  const idx = A.scan.files.find(f => f.f === 'src/index.js');
  assert.deepStrictEqual(idx.imp.slice().sort(), ['src/db/store.js', 'src/routes/a.js', 'src/routes/b.js']);
  assert.deepStrictEqual(idx.ext, ['express']); assert.strictEqual(idx.entry, true);
  assert.ok(A.nodes.some(x => x.id === 'ext:pg' && x.kind === 'out'));
});
t('ignored folders and non-code files are skipped', () => {
  assert.ok(!core.wanted('node_modules/pg/index.js')); assert.ok(!core.wanted('.git/hooks/x.js')); assert.ok(!core.wanted('src/app.test.js'));
  assert.ok(!core.wanted('README.md')); assert.ok(core.wanted('src/app.tsx')); assert.ok(!core.wantedDir('dist')); assert.ok(core.wantedDir('src/lib'));
});
t('big projects are grouped into at most the box limit', () => {
  const many = []; for (let d = 0; d < 12; d++) for (let i = 0; i < 15; i++) many.push(F('src/mod' + d + '/f' + i + '.js', [], 5));
  const m = core.scanFiles(many, 'big', 22); assert.strictEqual(m.stats.files, 180); assert.ok(m.nodes.length <= 22, 'boxes: ' + m.nodes.length);
});
t('no change gives Looks safe', () => {
  const c = report.changes(A.scan, A.scan, A, A); assert.strictEqual(c.verdict, 'pass'); assert.ok(/Nothing changed/.test(c.summary));
});
t('a new import loop gives Stop and check', () => {
  const after = before.map(e => e.f === 'src/routes/b.js' ? F('src/routes/b.js', ['../db/store', './a'], 60) : e.f === 'src/routes/a.js' ? F('src/routes/a.js', ['../db/store', '../lib/util', './b'], 80) : e);
  const B = core.scanFiles(after, 'app', 22, A), c = report.changes(A.scan, B.scan, A, B);
  assert.strictEqual(c.verdict, 'alarm'); assert.ok(c.lines.some(l => l.sev === 'red' && /loop/.test(l.title)));
});
t('new package, data file and leftover give Worth a look', () => {
  const after = before.concat([F('src/db/cache.js', ['redis'], 50), F('src/lib/old_util.js', [], 40)]);
  const B = core.scanFiles(after, 'app', 22, A), c = report.changes(A.scan, B.scan, A, B), titles = c.lines.map(l => l.title).join(' | ');
  assert.strictEqual(c.verdict, 'check'); assert.ok(/new outside package: redis/.test(titles)); assert.ok(/new data file/.test(titles)); assert.ok(/connect to nothing/.test(titles));
  assert.ok(/redis/.test(report.changeMessage(c, 'app')));
});
t('a small tidy edit stays Looks safe', () => {
  const after = before.map(e => e.f === 'src/lib/util.js' ? F('src/lib/util.js', [], 44) : e);
  const B = core.scanFiles(after, 'app', 22, A); assert.strictEqual(report.changes(A.scan, B.scan, A, B).verdict, 'pass');
});
t('boxes keep their place between scans', () => {
  const moved = JSON.parse(JSON.stringify(A)); moved.nodes[0].x = 1234; moved.nodes[0].y = 987;
  const B = core.scanFiles(before.concat([F('src/lib/new.js', [], 10)]), 'app', 22, moved), same = B.nodes.find(x => x.id === moved.nodes[0].id);
  assert.strictEqual(same.x, 1234); assert.strictEqual(same.y, 987);
});
t('the plan check counts planned removals that happened', () => {
  const plan = { today: { nodes: A.nodes, edges: A.edges }, planned: { nodes: A.nodes.filter(x => x.id !== 'src/lib'), edges: [] } };
  const after = before.filter(e => e.f !== 'src/lib/util.js').map(e => e.f === 'src/routes/a.js' ? F('src/routes/a.js', ['../db/store'], 80) : e);
  const B = core.scanFiles(after, 'app', 22, A), c = report.changes(A.scan, B.scan, A, B, plan);
  assert.ok(c.lines.some(l => /Your plan: 1 of 1/.test(l.title) && l.sev === 'green'));
});
t('the command line scanner matches the shared core', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morph-test-')), root = path.join(dir, 'app');
  before.forEach(e => { const p = path.join(root, e.f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, e.src); });
  fs.mkdirSync(path.join(root, 'node_modules/pg'), { recursive: true }); fs.writeFileSync(path.join(root, 'node_modules/pg/index.js'), 'x');
  const m = cli.scan(root, 22); fs.rmSync(dir, { recursive: true, force: true });
  assert.deepStrictEqual(m.scan.files, A.scan.files);
});
t('index.html carries the current report.js and scan-core.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const f of ['report.js', 'scanner/scan-core.js']) assert.ok(html.includes(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')), f + ' is out of date in index.html. Run: node tools/inline.js');
});
console.log('\n' + n + ' checks passed');
