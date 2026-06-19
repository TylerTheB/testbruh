// =============================================================
// LaTeX helper — render $...$ and $$...$$ inside text content.
// Usage: latex.typeset(element) — element is any DOM node
// Safe to call before KaTeX loads (will retry when ready).
// =============================================================
(function () {
  const DELIM_INLINE = /(^|[^$])\$([^\n$]+?)\$(?!\$)/g;
  const DELIM_BLOCK  = /\$\$([\s\S]+?)\$\$/g;

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function unescapeHtml(s) {
    return s.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, c => ({
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'"
    })[c]);
  }

  function renderMath(tex, displayMode) {
    if (typeof katex === "undefined") return null;
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        displayMode: !!displayMode,
        output: "html",
        strict: "ignore",
      });
    } catch (e) {
      return `<code>${escapeHtml(tex)}</code>`;
    }
  }

  // Convert a single text string with $...$ / $$...$$ into HTML.
  function renderString(text) {
    if (typeof text !== "string" || text.indexOf("$") === -1) return null;
    // Process block first, then inline.
    let html = escapeHtml(text);
    html = html.replace(DELIM_BLOCK, (_, tex) => {
      const r = renderMath(unescapeHtml(tex), true);
      return r !== null ? r : `<pre>${tex}</pre>`;
    });
    html = html.replace(DELIM_INLINE, (_, prefix, tex) => {
      const r = renderMath(unescapeHtml(tex), false);
      return r !== null ? `${prefix}${r}` : `${prefix}<code>${tex}</code>`;
    });
    return html;
  }

  // Walk text nodes inside `root` and replace those whose parent is not
  // already inside a <script>, <style>, or KaTeX output.
  function processTextNode(node) {
    const parent = node.parentNode;
    if (!parent) return;
    const tag = parent.nodeName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "CODE" || tag === "PRE") return;
    if (parent.closest && parent.closest(".katex")) return;
    const rendered = renderString(node.nodeValue);
    if (rendered === null) return;
    const tmp = document.createElement("span");
    tmp.innerHTML = rendered;
    const frag = document.createDocumentFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    parent.replaceChild(frag, node);
  }

  function typeset(root) {
    if (!root) return;
    const doIt = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      for (const t of nodes) processTextNode(t);
    };
    if (typeof katex === "undefined") {
      // Wait for the KaTeX script (loaded with defer) to be ready.
      const start = Date.now();
      const tryLater = () => {
        if (typeof katex !== "undefined") return doIt();
        if (Date.now() - start > 5000) return; // give up
        setTimeout(tryLater, 50);
      };
      tryLater();
    } else {
      doIt();
    }
  }

  window.latex = { typeset, renderString };
})();
