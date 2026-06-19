// Strict audit: detect red-text errors KaTeX would show in browser
const fs = require('fs');
const katex = require('katex');
global.window = {};
eval(fs.readFileSync('data.js', 'utf8').replace(/const /g, 'var '));

const segRe = /\$+([^\$\n]+?)\$+/g;
const errors = [];

function tryRender(label, text) {
  if (typeof text !== 'string') return;
  let m;
  while ((m = segRe.exec(text)) !== null) {
    const math = m[1];
    try {
      // Match browser behavior: throwOnError: false, strict: "ignore"
      const html = katex.renderToString(math, { throwOnError: false, strict: "ignore" });
      // If the output contains katex-error class, it would show red in browser
      if (html.includes('katex-error')) {
        errors.push({ label, math });
      }
    } catch (e) {
      errors.push({ label, math, msg: e.message });
    }
  }
}

// Only check cheatsheets for now since user said "cheatsheet error"
for (const [k, sheet] of Object.entries(CHEATSHEETS)) {
  for (const sec of sheet.sections) {
    for (const line of sec.lines) tryRender(`[${k}/${sec.heading}]`, line);
  }
}

if (errors.length === 0) {
  console.log('✓ No cheatsheet math would render as red error text');
} else {
  console.log(`✗ Found ${errors.length} red-text errors:\n`);
  for (const e of errors) {
    console.log(`${e.label}`);
    console.log(`  $${e.math}$\n`);
  }
}
