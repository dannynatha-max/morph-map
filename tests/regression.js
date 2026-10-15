// Regression check: every fixture must produce the same findings and score as expected.json.
// Run: node tests/regression.js          (compare)
//      node tests/regression.js --update (accept current output as expected)
const fs = require('fs'), path = require('path');
const R = require('../report.js');
const dir = path.join(__dirname, 'fixtures');
const expPath = path.join(__dirname, 'expected.json');
const out = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const scan = doc.scans && doc.scans.today;
  const m = R.mapMetrics(doc.today);
  const r = scan ? R.report(scan) : { findings: [] };
  out[f] = { score: m.score, level: m.level, findings: r.findings.map(x => x.sev + ' | ' + x.area + ' | ' + x.title) };
}
if (process.argv.includes('--update')) { fs.writeFileSync(expPath, JSON.stringify(out, null, 2) + '\n'); console.log('expected.json updated'); process.exit(0); }
const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
let bad = 0;
for (const k of Object.keys(out)) {
  const a = JSON.stringify(out[k]), b = JSON.stringify(exp[k]);
  if (a === b) console.log('PASS', k); else { bad++; console.log('FAIL', k, '\n  expected', b, '\n  got     ', a); }
}
console.log(bad ? bad + ' fixture(s) changed' : 'All fixtures match');
process.exit(bad ? 1 : 0);
