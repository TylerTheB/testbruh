// Simulate exact browser renderString flow to find red errors
const fs = require('fs');
const katex = require('katex');
global.window = {};
eval(fs.readFileSync('data.js', 'utf8').replace(/const /g, 'var '));

const DELIM_INLINE = /(^|[^$])\$([^\n$]+?)\$(?!\$)/g;
const DELIM_BLOCK  = /\$\$([\s\S]+?)\$\$/g;

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;', "'": "&#39;"
  })[c]);
}

function renderMath(tex, displayMode) {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode: !!displayMode,
      output: "html",
      strict: "ignore",
    });
  } catch (e) {
    return null;
  }
}

function renderString(text) {
  if (typeof text !== "string" || text.indexOf("$") === -1) return null;
  let html = escapeHtml(text);
  html = html.replace(DELIM_BLOCK, (_, tex) => {
    const r = renderMath(tex.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"), true);
    return r !== null ? r : `<pre>${tex}</pre>`;
  });
  html = html.replace(DELIM_INLINE, (_, prefix, tex) => {
    const r = renderMath(tex.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"), false);
    return r !== null ? `${prefix}${r}` : `${prefix}<code>${tex}</code>`;
  });
  return html;
}

const errors = [];

for (const [k, sheet] of Object.entries(CHEATSHEETS)) {
  for (const sec of sheet.sections) {
    const fullText = sec.lines.join("\n");
    const rendered = renderString(fullText);
    if (rendered && rendered.includes('katex-error')) {
      // Find which specific math expression caused it
      for (const line of sec.lines) {
        const lineRendered = renderString(line);
        if (lineRendered && lineRendered.includes('katex-error')) {
          // Extract the error content
          const errMatch = lineRendered.match(/class="katex-error"[^>]*>([^<]*)/g);
          errors.push({ 
            label: `[${k}/${sec.heading}]`, 
            line,
            errorContent: errMatch ? errMatch.map(m => m.replace(/.*>([^<]*)/, '$1')).join(' | ') : 'unknown'
          });
        }
      }
    }
  }
}

if (errors.length === 0) {
  console.log('✓ No cheatsheet math renders as red error in browser simulation');
} else {
  console.log(`✗ Found ${errors.length} red-text errors:\n`);
  for (const e of errors) {
    console.log(`${e.label}`);
    console.log(`  Line: ${e.line}`);
    console.log(`  Error renders: ${e.errorContent}\n`);
  }
}
