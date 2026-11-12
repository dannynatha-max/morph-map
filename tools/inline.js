/* node tools/inline.js
   Copies report.js and scanner/scan-core.js into index.html, so the app stays one file.
   Run it after editing either of those two files. */
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const f of ['report.js', 'scanner/scan-core.js']) {
  const a = '/*inline:' + f + '*/', b = '/*end:' + f + '*/', i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error('Marker missing in index.html for ' + f);
  html = html.slice(0, i + a.length) + '\n' + fs.readFileSync(path.join(root, f), 'utf8') + html.slice(j);
}
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('index.html updated');
