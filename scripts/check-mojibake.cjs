'use strict';
// Detects CP1252 mojibake and BOMs in shipped files.
const fs = require('fs');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/check-mojibake.cjs <file>...');
  process.exit(2);
}

// Common mojibake sequences produced by CP1252 mis-decoding of UTF-8.
const MOJIBAKE = [
  '\u00C3\u00A2', // Ã¢
  '\u00C3\u00A9', // Ã©
  '\u00C3\u00A8', // Ã¨
  '\u00E2\u20AC', // â€
  '\u00C3\u2014', // Ã—
];

let bad = 0;
for (const f of files) {
  let buf;
  try { buf = fs.readFileSync(f); } catch (e) { console.error('cannot read ' + f); bad = 1; continue; }
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    console.error('BOM found in ' + f);
    bad = 1;
  }
  const text = buf.toString('utf8');
  for (const m of MOJIBAKE) {
    if (text.includes(m)) {
      console.error('mojibake detected in ' + f + ': ' + JSON.stringify(m));
      bad = 1;
    }
  }
}
if (bad) process.exit(1);
console.log('mojibake check OK (' + files.length + ' files)');