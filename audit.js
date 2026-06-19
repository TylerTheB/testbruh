// Full audit: render every $...$ segment with real KaTeX
const fs = require('fs');
const katex = require('katex');
global.window = {};
eval(fs.readFileSync('data.js', 'utf8').replace(/const /g, 'var '));

const segRe = /\$+([^\$\n]+?)\$+/g;
const errors = [];
const segReG = new RegExp(segRe.source, 'g');

function tryRender(label, text) {
  if (typeof text !== 'string') return;
  segReG.lastIndex = 0;
  let m;
  while ((m = segReG.exec(text)) !== null) {
    const math = m[1];
    try {
      katex.renderToString(math, { throwOnError: true, strict: true });
    } catch (e) {
      errors.push({ label, math, msg: e.message });
    }
  }
}

for (const c of CONCEPTS) tryRender(`concept ${c.id}`, c.body);
for (const q of QUESTIONS) {
  tryRender(`q ${q.id} text`, q.q);
  q.opts.forEach((o, i) => tryRender(`q ${q.id} opt ${i}`, o));
  tryRender(`q ${q.id} exp`, q.exp);
}
for (const [k, sheet] of Object.entries(CHEATSHEETS)) {
  for (const sec of sheet.sections) {
    for (const line of sec.lines) tryRender(`cheat ${k} ${sec.heading}`, line);
  }
}

if (errors.length === 0) {
  console.log('✓ All math segments render cleanly through real KaTeX');
} else {
  console.log(`✗ Found ${errors.length} KaTeX errors:\n`);
  for (const e of errors) {
    console.log(`[${e.label}]`);
    console.log(`  $${e.math}$`);
    console.log(`  ${e.msg}\n`);
  }
}