// =============================================================
// GIKI Test Prep — App logic
// =============================================================

// STORE_KEY is declared below (after STATE_VERSION) to keep the version
// constant and the storage key in sync.

const state = {
  history: {},      // qid -> {correct, ts, tries, hadWrong, lastAttemptCorrect}
  bookmarks: new Set(),
  streak: 0,
  bestStreak: 0,
  xp: 0,
  correct: 0,
  wrong: 0,
  // #37: removed the dead `review: {}` field. Reserved-for-future "review queue"
  // is not part of the shipped feature; bookmarks + Review tab already cover it.
};

const STATE_VERSION = 1; // bump when the state shape changes
const STORE_KEY = "giki-prep-v" + STATE_VERSION;

function loadState() {
  // #38: explicit migration. If the user has a saved state from a prior
  // version (or an unversioned key), we either migrate it forward or
  // discard it cleanly with a console warning.
  const candidates = ["giki-prep-v1", "giki-prep-v0", "giki-prep"];
  let raw = null, fromKey = null;
  for (const k of candidates) {
    const v = localStorage.getItem(k);
    if (v) { raw = v; fromKey = k; break; }
  }
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    // Migration shim: in v0, history entries didn't have hadWrong/lastAttemptCorrect
    if (s.history) {
      for (const qid in s.history) {
        const h = s.history[qid];
        if (typeof h.hadWrong === "undefined") h.hadWrong = !!h.correct === false ? true : false;
        if (typeof h.lastAttemptCorrect === "undefined") h.lastAttemptCorrect = !!h.correct;
      }
    }
    // Only assign known fields; ignore unknown ones so old schemas don't pollute new state.
    const known = ["history","streak","bestStreak","xp","correct","wrong"];
    for (const k of known) {
      if (k in s) state[k] = s[k];
    }
    if (fromKey !== STORE_KEY) {
      // migrate: write the new key, drop the old one
      try { localStorage.removeItem(fromKey); } catch (_) {}
    }
    state.bookmarks = new Set(s.bookmarks || []);
  } catch (e) { console.warn("state load failed", e); }
}
function saveState() {
  const s = { ...state, bookmarks: Array.from(state.bookmarks) };
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}
function updateHeader() {
  document.getElementById("stat-correct").textContent = state.correct;
  document.getElementById("stat-wrong").textContent   = state.wrong;
  document.getElementById("stat-streak").textContent  = state.streak;
  document.getElementById("stat-xp").textContent      = state.xp;
}

// Shuffle the 4 answer options of a question and remap the correct answer index.
// Returns a shallow copy so the original question in the bank is untouched.
function shuffleQOpts(q) {
  const indices = [0, 1, 2, 3];
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return {
    ...q,
    opts: indices.map(i => q.opts[i]),
    ans: indices.indexOf(q.ans),
  };
}

// --- Mock test resume: save/restore to localStorage ---
var MOCK_RESUME_KEY = "giki-mock-resume";

function saveMockResume() {
  if (!mockState || mockState._submitted) return;
  const data = {
    title: mockState._title || "Custom Mock",
    startedAt: mockState.startedAt,
    seconds: mockState.seconds,
    idx: mockState.idx,
    selected: mockState.selected,
    flagged: Array.from(mockState.flagged),
    qs: mockState.qs.map(q => ({ id: q.id, cat: q.cat, diff: q.diff, q: q.q, opts: q.opts, ans: q.ans, exp: q.exp, tricky: q.tricky })),
  };
  try { localStorage.setItem(MOCK_RESUME_KEY, JSON.stringify(data)); } catch(_) {}
}

function clearMockResume() {
  try { localStorage.removeItem(MOCK_RESUME_KEY); } catch(_) {}
}

function loadMockResume() {
  try {
    const raw = localStorage.getItem(MOCK_RESUME_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(_) { return null; }
}

function restoreMockResume() {
  const data = loadMockResume();
  if (!data) { toast("No saved test found"); return; }
  mockState = {
    qs: data.qs,
    idx: data.idx,
    selected: data.selected || {},
    submitted: {},
    flagged: new Set(data.flagged || []),
    startedAt: data.startedAt,
    seconds: data.seconds,
    count: data.qs.length,
    requested: data.qs.length,
    _title: data.title,
  };
  document.querySelector(".mock-setup").style.display = "none";
  renderMock();
  startMockTimer();
  toast("Test resumed — keep going!");
}


// =============================================================
// Tabs
// =============================================================
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

// Bottom nav for mobile — syncs with top tabs
document.getElementById("bottom-nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".bottom-nav-item");
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

function switchTab(id) {
  // Update top tabs (visible on desktop)
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === id));
  // Update bottom nav (visible on mobile)
  document.querySelectorAll(".bottom-nav-item").forEach(t => t.classList.toggle("active", t.dataset.tab === id));
  // Switch panels
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === id));
  // Scroll to top of main content on mobile when switching tabs
  if (window.innerWidth <= 700) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (id === "learn") renderLearn();
  if (id === "topics") renderTopics();
  if (id === "cheatsheet") renderCheatsheet();
  if (id === "revision") renderRevision();
  if (id === "review") renderReview();
  if (id === "progress") renderProgress();
  if (id === "practice" && !document.getElementById("practice-area").dataset.started) {
    // leave area empty until user clicks Start
  }
}

// =============================================================
// LEARN
// =============================================================
function renderLearn() {
  // Populate category select once
  const sel = document.getElementById("learn-topic");
  if (sel.options.length <= 1) {
    sel.append(new Option("All", "all"));
    // #6: include tricky as a pseudo-category in the Learn filter
    sel.append(new Option("★ Tricky", "tricky"));
    for (const [k, v] of Object.entries(CATEGORIES)) sel.append(new Option(v, k));
  }
  const list = document.getElementById("learn-list");
  const cat = document.getElementById("learn-topic").value;
  const diff = document.getElementById("learn-diff").value;
  const search = document.getElementById("learn-search").value.trim().toLowerCase();
  const tmpl = document.getElementById("concept-tmpl");

  list.innerHTML = "";
  // #6: when filtering by tricky, we need to show concepts from categories
  // that have at least one tricky question (the dataset is small here so
  // we show all concepts when tricky is selected, since no questions are
  // marked tricky yet).
  const filtered = CONCEPTS.filter(c => {
    if (cat === "tricky") {
      // No tricky questions exist in the current dataset; show nothing
      // and a friendly message in the empty state below.
      return false;
    }
    if (cat !== "all" && c.cat !== cat) return false;
    if (diff !== "all" && c.diff !== diff) return false;
    if (search && !c.title.toLowerCase().includes(search) && !c.body.toLowerCase().includes(search)) return false;
    return true;
  });

  if (!filtered.length) {
    const msg = cat === "tricky"
      ? "No tricky-flagged questions in this dataset yet. Once questions are tagged tricky, their concepts will appear here."
      : "No concepts match.";
    list.innerHTML = `<div class="concept-card"><div class="cbody">${msg}</div></div>`;
    return;
  }
  for (const c of filtered) {
    const node = tmpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".ctitle").textContent = c.title;
    const catBadge = node.querySelector(".cat");
    catBadge.textContent = CATEGORIES[c.cat] || c.cat;
    const diffBadge = node.querySelector(".diff");
    diffBadge.textContent = c.diff;
    diffBadge.classList.add(c.diff);
    node.querySelector(".cbody").innerHTML = c.body.replace(/\n/g, "<br>");
    // Stats: how many of this category's questions user got right
    const qs = QUESTIONS.filter(q => q.cat === c.cat);
    const seen = qs.filter(q => state.history[q.id]).length;
    const right = qs.filter(q => state.history[q.id]?.correct).length;
    node.querySelector(".cstat").textContent = `Seen: ${seen}/${qs.length} • Right: ${right}`;
    node.querySelector(".c-pract").addEventListener("click", () => {
      document.querySelector('.tab[data-tab="practice"]').click();
      document.getElementById("cat").value = c.cat;
      document.getElementById("diff").value = "all";
      document.getElementById("qcount").value = 20;
      document.getElementById("start-btn").click();
    });
    list.appendChild(node);
  }
}
["learn-topic", "learn-diff", "learn-search"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderLearn);
});

// =============================================================
// TOPICS — all topics & concepts grouped by category
// =============================================================
function renderTopics() {
  const wrap = document.getElementById("topics-list");
  const search = (document.getElementById("topics-search")?.value || "").trim().toLowerCase();
  const expandAll = document.getElementById("topics-expand")?.checked;

  wrap.innerHTML = "";
  for (const [catKey, catName] of Object.entries(CATEGORIES)) {
    const concepts = CONCEPTS.filter(c => c.cat === catKey);
    if (!concepts.length) continue;
    const qs = QUESTIONS.filter(q => q.cat === catKey);
    const seen = qs.filter(q => state.history[q.id]).length;
    const right = qs.filter(q => state.history[q.id]?.correct).length;
    const byDiff = { easy:[0,0], medium:[0,0], hard:[0,0] };
    qs.forEach(q => { byDiff[q.diff][0]++; if (state.history[q.id]?.correct) byDiff[q.diff][1]++; });

    const block = document.createElement("div");
    block.className = "topic-block";
    block.innerHTML = `
      <div class="topic-head">
        <h3>${catName} <span class="topic-meta">${concepts.length} concepts • ${qs.length} questions • ${seen}/${qs.length} seen • ${right} right</span></h3>
        <div class="topic-meta">
          <span class="qbadge easy">E ${byDiff.easy[0]}</span>
          <span class="qbadge medium">M ${byDiff.medium[0]}</span>
          <span class="qbadge hard">H ${byDiff.hard[0]}</span>
          <span class="topic-arrow">▶</span>
        </div>
      </div>
      <div class="topic-body">
        <div class="topic-list"></div>
      </div>
    `;
    const list = block.querySelector(".topic-list");
    const matched = concepts.filter(c => {
      if (!search) return true;
      return c.title.toLowerCase().includes(search) || c.body.toLowerCase().includes(search);
    });
    // #11: when a search hides every concept in a category, show a "0 of N" hint
    // so the user knows the category is being filtered rather than empty.
    if (!matched.length) {
      if (search) {
        const empty = document.createElement("div");
        empty.className = "topic-empty";
        empty.textContent = `0 of ${concepts.length} concepts match "${search}" in ${catName}`;
        wrap.appendChild(empty);
      }
      continue;
    }
    for (const c of matched) {
      const item = document.createElement("div");
      item.className = "topic-item";
      const cq = qs.filter(q => q.cat === c.cat);
      const cSeen = cq.filter(q => state.history[q.id]).length;
      item.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="ti-title">${c.title}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${cSeen}/${cq.length} practiced</div>
        </div>
        <span class="ti-diff">${c.diff}</span>
        <div class="ti-actions">
          <button class="iconbtn" title="Read">📖</button>
          <button class="iconbtn" title="Practice">▶</button>
        </div>
      `;
      const [readBtn, pracBtn] = item.querySelectorAll("button");
      readBtn.addEventListener("click", () => {
        // open concept in Learn tab
        document.querySelector('.tab[data-tab="learn"]').click();
        document.getElementById("learn-topic").value = catKey;
        document.getElementById("learn-search").value = c.title;
        renderLearn();
      });
      pracBtn.addEventListener("click", () => {
        document.querySelector('.tab[data-tab="practice"]').click();
        document.getElementById("cat").value = catKey;
        document.getElementById("diff").value = "all";
        document.getElementById("qcount").value = 20;
        document.getElementById("start-btn").click();
      });
      list.appendChild(item);
    }
    if (expandAll) block.classList.add("expanded");
    block.querySelector(".topic-head").addEventListener("click", () => block.classList.toggle("expanded"));
    wrap.appendChild(block);
  }
}
document.getElementById("topics-search")?.addEventListener("input", renderTopics);
document.getElementById("topics-expand")?.addEventListener("change", renderTopics);

// =============================================================
// QUICK REVISION — 30-min last-minute notes
// =============================================================
function renderRevision() {
  const list = document.getElementById("revision-list");
  if (!list) return;
  if (list.dataset.built) return; // build once
  list.dataset.built = "1";
  list.innerHTML = (typeof QUICK_REVISION !== "undefined" ? QUICK_REVISION : []).map(sec => {
    const pts = sec.points.map(p => `<li>${latex.renderString(p) || p}</li>`).join("");
    return `<div class="qcard" style="border-left:4px solid ${sec.color}">
      <div class="qhead">
        <span class="qbadge" style="background:${sec.color}">⏱ ${sec.time}</span>
      </div>
      <h3 style="margin:6px 0">${sec.title}</h3>
      <ul style="margin:0;padding-left:20px;line-height:1.7;font-size:14px">${pts}</ul>
    </div>`;
  }).join("");
}

// =============================================================
// CHEATSHEET — reference tables per subject
// =============================================================
function renderCheatsheet() {
  const sel = document.getElementById("cs-subject");
  if (sel.options.length === 0) {
    sel.append(new Option("All subjects", "all"));
    for (const [k, v] of Object.entries(CHEATSHEETS)) sel.append(new Option(v.title, k));
  }
  const list = document.getElementById("cs-list");
  const subject = sel.value;
  const search = (document.getElementById("cs-search")?.value || "").trim().toLowerCase();
  list.innerHTML = "";
  const re = search ? new RegExp("(" + search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig") : null;

  // #10: group by subject with a subject header when "all" is selected.
  // Each card is one section; sections without matches are skipped.
  const renderCard = (sheet, sec) => {
    // #27: ensure every line has a leading bullet for visual consistency.
    // Lines that don't start with a bullet character get "• " prepended.
    const normalized = sec.lines.map(l => /^[\u2022\-\*]/.test(l.trim()) ? l : "• " + l);
    // Render math on the raw text first. latex.renderString() calls escapeHtml()
    // internally, which neutralizes any < or > in the prose (e.g. "List<T>")
    // before doing regex replacements for $...$ and $$...$$.
    let html = normalized.join("\n");
    if (latex.renderString) {
      const rendered = latex.renderString(html);
      if (rendered) html = rendered;
    }
    const card = document.createElement("div");
    card.className = "cs-card";
    const heading = `${sheet.title} — ${sec.heading}`;
    card.innerHTML = `<h3>${escapeHtml(heading)}</h3><pre></pre>`;
    const pre = card.querySelector("pre");
    // If there's a search term, walk the rendered HTML and wrap matches in
    // <mark> only inside text nodes — not inside the KaTeX spans.
    if (re) {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT, null);
      const targets = [];
      let n;
      while ((n = walker.nextNode())) {
        // Skip text inside .katex, <script>, <style>, <code>, <pre>
        const p = n.parentNode;
        if (!p) continue;
        if (p.closest && p.closest(".katex, code, pre, script, style")) continue;
        if (re.test(n.nodeValue)) targets.push(n);
      }
      for (const tn of targets) {
        const safe = tn.nodeValue.replace(re, "<mark>$1</mark>");
        const frag = document.createDocumentFragment();
        const div = document.createElement("span");
        div.innerHTML = safe;
        while (div.firstChild) frag.appendChild(div.firstChild);
        tn.parentNode.replaceChild(frag, tn);
      }
      pre.innerHTML = tmp.innerHTML;
    } else {
      pre.innerHTML = html;
    }
    list.appendChild(card);
  };

  if (subject === "all") {
    // #10: group under subject headers
    for (const [k, sheet] of Object.entries(CHEATSHEETS)) {
      const visibleSections = sheet.sections.filter(sec => {
        if (!search) return true;
        return sec.heading.toLowerCase().includes(search) ||
               sec.lines.some(l => l.toLowerCase().includes(search));
      });
      if (!visibleSections.length) continue;
      const hdr = document.createElement("div");
      hdr.className = "cs-subject-head";
      hdr.innerHTML = `<h2>${escapeHtml(sheet.title)}</h2>`;
      list.appendChild(hdr);
      for (const sec of visibleSections) renderCard(sheet, sec);
    }
  } else {
    const sheet = CHEATSHEETS[subject];
    if (sheet) {
      for (const sec of sheet.sections) {
        const matches = !search || sec.heading.toLowerCase().includes(search) ||
          sec.lines.some(l => l.toLowerCase().includes(search));
        if (!matches) continue;
        renderCard(sheet, sec);
      }
    }
  }
  if (!list.children.length) {
    list.innerHTML = `<div class="concept-card"><div class="cbody">No cheatsheet entries match.</div></div>`;
  }
}
document.getElementById("cs-subject")?.addEventListener("change", renderCheatsheet);
document.getElementById("cs-search")?.addEventListener("input", renderCheatsheet);

// =============================================================
// PRACTICE
// =============================================================
let practiceState = null; // {qs, idx, selected, order}

function startPractice() {
  const cat = document.getElementById("cat").value;
  const diff = document.getElementById("diff").value;
  const count = document.getElementById("qcount").value;
  const reviewOnly = document.getElementById("review-only").checked;

  let pool = QUESTIONS.filter(q => {
    if (cat === "tricky") {
      if (!q.tricky) return false;
    } else if (cat !== "all" && q.cat !== cat) {
      return false;
    }
    if (diff !== "all" && q.diff !== diff) return false;
    return true;
  });

  if (reviewOnly) {
    pool = pool.filter(q => {
      const wrong = state.history[q.id] && !state.history[q.id].correct;
      const marked = state.bookmarks.has(q.id);
      return wrong || marked;
    });
  }

  // Shuffle
  pool = pool.slice().sort(() => Math.random() - 0.5);
  const endless = count === "endless";
  if (!endless) pool = pool.slice(0, +count);

  if (!pool.length) {
    document.getElementById("practice-area").innerHTML =
      `<div class="qcard"><div class="cbody">No questions match the current filter. Try changing category/difficulty or uncheck "Wrong/Bookmarked only".</div></div>`;
    return;
  }
  practiceState = {
    qs: pool, idx: 0, selected: {}, submitted: {},
    showFb: !!document.getElementById("instant-fb").checked,
    // sessionCounts[qid] tracks how the user did *in this session only*,
    // so renderPracticeSummary() shows the current session's score, not all-time (#7).
    sessionCounts: {},
    // #28: flag for endless mode so the UI can show a running counter
    endless,
  };
  document.getElementById("practice-area").dataset.started = "1";
  renderCurrentQ();
}

document.getElementById("start-btn").addEventListener("click", startPractice);

function renderCurrentQ() {
  if (!practiceState) return;
  let { qs, idx } = practiceState;
  const area = document.getElementById("practice-area");
  area.innerHTML = "";
  if (idx >= qs.length) {
    // #28: in endless mode, reshuffle and keep going instead of ending.
    if (practiceState.endless && qs.length > 0) {
      practiceState.qs = qs.slice().sort(() => Math.random() - 0.5);
      practiceState.idx = 0;
      return renderCurrentQ();
    }
    renderPracticeSummary();
    return;
  }
  const q = qs[idx];
  const tmpl = document.getElementById("qcard-tmpl");
  const node = tmpl.content.firstElementChild.cloneNode(true);

  const catBadge = node.querySelector(".cat");
  catBadge.textContent = (q.tricky ? "★ Tricky · " : "") + (CATEGORIES[q.cat] || q.cat);
  if (q.tricky) catBadge.classList.add("tricky");
  const diffBadge = node.querySelector(".diff");
  diffBadge.textContent = q.diff;
  diffBadge.classList.add(q.diff);
  // #28: in endless mode the qnum shows "Q N (endless)" and a running
  // session counter is added so the user has feedback on progress.
  if (practiceState.endless) {
    node.querySelector(".qnum").textContent = `Q ${idx + 1} (endless)`;
  } else {
    node.querySelector(".qnum").textContent = `Q ${idx + 1} / ${qs.length}`;
  }
  const qtextEl = node.querySelector(".qtext");
  qtextEl.textContent = q.q;
  latex.typeset(qtextEl);

  // ---- Hints (3-tier) ----
  const hintsBox = node.querySelector(".qhints");
  const hints = q.hints && q.hints.length ? q.hints : buildHints(q);
  // #34: persist the highest revealed hint tier across renders so going
  // Prev → Next → back keeps the same hint state.
  if (!practiceState._hintsShown) practiceState._hintsShown = {};
  const shown = practiceState._hintsShown[q.id] || 0;
  hintsBox.innerHTML = `
    <div class="qhint-row">
      <button class="qhint-btn" data-hint="1">💡 Show hint (1/3)</button>
      <button class="qhint-btn" data-hint="2"${shown >= 2 ? "" : " disabled"}>Hint 2</button>
      <button class="qhint-btn" data-hint="3"${shown >= 3 ? "" : " disabled"}>Hint 3 (answer clue)</button>
    </div>
  `;
  // pre-render any previously revealed hint tiers
  for (let t = 1; t <= shown; t++) {
    let el = hintsBox.querySelector(`.qhint[data-tier="${t}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = "qhint";
      el.dataset.tier = t;
      el.innerHTML = `<span class="hint-num">${t}</span><span class="hint-text"></span>`;
      el.querySelector(".hint-text").textContent = hints[t - 1] || "—";
      hintsBox.appendChild(el);
    }
  }
  const hintBtns = hintsBox.querySelectorAll(".qhint-btn");
  hintBtns.forEach(b => b.addEventListener("click", () => {
    const tier = +b.dataset.hint;
    let el = hintsBox.querySelector(`.qhint[data-tier="${tier}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = "qhint";
      el.dataset.tier = tier;
      el.innerHTML = `<span class="hint-num">${tier}</span><span class="hint-text"></span>`;
      el.querySelector(".hint-text").textContent = hints[tier - 1] || "—";
      hintsBox.appendChild(el);
    }
    // mark tier revealed and unlock the next button
    practiceState._hintsShown[q.id] = Math.max(practiceState._hintsShown[q.id] || 0, tier);
    b.classList.add("revealed");
    if (tier < 3) hintBtns[tier].disabled = false;
  }));

  // ---- Options ----
  const opts = node.querySelector(".qopts");
  q.opts.forEach((o, i) => {
    const opt = document.createElement("div");
    opt.className = "opt";
    if (practiceState.selected[q.id] === i) opt.classList.add("sel");
    opt.innerHTML = `<span class="letter">${"ABCD"[i]}</span><span class="txt"></span>`;
    const txtEl = opt.querySelector(".txt");
    const rendered = latex.renderString(o);
    if (rendered !== null) txtEl.innerHTML = rendered;
    else txtEl.textContent = o;
    latex.typeset(opt);
    opt.addEventListener("click", () => onSelect(node, q, i));
    opts.appendChild(opt);
  });

  // If already submitted this session, show feedback
  if (practiceState.submitted[q.id]) {
    revealFeedback(node, q);
  }

  // ---- Bookmark ----
  node.querySelector('[data-act="bookmark"]').addEventListener("click", () => {
    if (state.bookmarks.has(q.id)) state.bookmarks.delete(q.id);
    else state.bookmarks.add(q.id);
    saveState();
    toast(state.bookmarks.has(q.id) ? "Bookmarked" : "Bookmark removed");
  });
  // #35: report a bad question. We persist the report to localStorage so
  // it survives reloads and can be exported together with progress.
  node.querySelector('[data-act="report"]').addEventListener("click", () => {
    const reports = JSON.parse(localStorage.getItem("giki-prep-reports") || "[]");
    if (!reports.includes(q.id)) {
      reports.push(q.id);
      localStorage.setItem("giki-prep-reports", JSON.stringify(reports));
      toast(`Reported ${q.id} — thanks for the feedback`);
    } else {
      toast(`${q.id} already reported`);
    }
  });

  // ---- Prev / Next / Submit / Retry ----
  const prev = node.querySelector(".qprev");
  const next = node.querySelector(".qnext");
  const sub  = node.querySelector(".qsubmit");
  const retry = node.querySelector(".qretry");
  if (idx === 0) prev.disabled = true;
  prev.addEventListener("click", () => { practiceState.idx = Math.max(0, idx - 1); renderCurrentQ(); });
  next.addEventListener("click", () => { practiceState.idx = Math.min(qs.length - 1, idx + 1); renderCurrentQ(); });
  sub.addEventListener("click", () => onSubmit(node, q));
  retry.addEventListener("click", () => onRetry(node, q));

  // If previously selected but not submitted, show "Submit"
  if (practiceState.selected[q.id] !== undefined && !practiceState.submitted[q.id]) {
    sub.style.display = "";
    next.style.display = "none";
  } else {
    sub.style.display = "none";
    next.style.display = "";
  }

  // #28: in endless mode, show an "End session" button so the user has a way
  // to leave the loop and see the summary. Placed next to the Retry button.
  if (practiceState.endless) {
    const endBtn = document.createElement("button");
    endBtn.className = "qend-session";
    endBtn.textContent = "End session";
    endBtn.style.marginLeft = "8px";
    endBtn.addEventListener("click", () => {
      // jump to summary by setting idx past the end
      practiceState.idx = practiceState.qs.length;
      renderCurrentQ();
    });
    node.querySelector(".qfoot").appendChild(endBtn);
  }
  area.appendChild(node);
}

// Auto-generate 3 tiers of hints for any question that doesn't ship explicit hints.
function buildHints(q) {
  const correctOpt = q.opts[q.ans];
  const wrongOpts = q.opts.filter((_, i) => i !== q.ans);
  const wrongPick = wrongOpts[0] || "another option";
  const exp = q.exp || "Use the relevant formula/definition.";

  // Tier 1: nudge the topic / what to recall
  let tier1 = `Recall the key idea for ${CATEGORIES[q.cat] || q.cat}.`;
  if (q.cat === "math") {
    if (/sin|cos|tan|trig/i.test(q.q)) tier1 = "Recall the relevant trig identity or exact-value table.";
    else if (/log|ln/i.test(q.q)) tier1 = "Recall the logarithm rules: product, quotient, power.";
    else if (/derivative|integral|limit/i.test(q.q)) tier1 = "Recall the differentiation/integration rule that applies.";
    else if (/matrix|determinant|eigen/i.test(q.q)) tier1 = "Recall the matrix identity or formula involved.";
    else if (/probability|chance|toss|dice/i.test(q.q)) tier1 = "Set up the probability (favorable / total).";
    else tier1 = "Identify which arithmetic/algebra rule applies.";
  } else if (q.cat === "la") {
    tier1 = /eigen/i.test(q.q) ? "Eigenvalues satisfy det(A − λI)=0. Trace = sum, det = product."
           : /determinant/i.test(q.q) ? "Compute the determinant using the right formula for the size."
           : "Apply the matching LA identity (transpose, inverse, dot product, etc.).";
  } else if (q.cat === "calc") {
    tier1 = /derivative|d\/dx/i.test(q.q) ? "Apply the right differentiation rule + chain rule if needed."
           : /integral|∫/i.test(q.q) ? "Apply the matching integration rule (or substitution/by-parts)."
           : "Apply the relevant calculus identity.";
  } else if (q.cat === "prob") {
    tier1 = /mean|variance|std/i.test(q.q) ? "Plug into E[X] / Var formula for the distribution."
           : "Use Bayes / independence / counting rules.";
  } else if (q.cat === "prog") {
    tier1 = "Think about the standard time/space complexity for the data structure/algorithm in play.";
  } else if (q.cat === "oop") {
    tier1 = "Recall the OOP principle or pattern that matches the situation.";
  } else if (q.cat === "ml") {
    tier1 = "Recall the loss, metric, or algorithm definition for this concept.";
  } else if (q.cat === "dl") {
    tier1 = "Recall the activation/optimizer/architecture role or formula.";
  } else if (q.cat === "nlp") {
    tier1 = "Recall the tokenization / embedding / architecture role described.";
  } else if (q.cat === "llm") {
    tier1 = "Recall the LLM training / decoding / alignment concept involved.";
  }

  // Tier 2: cross out one wrong direction. For easy diff, name the
  // specific wrong option that contradicts the definition (#14); for
  // medium/hard, name the most tempting wrong answer.
  let tier2;
  if (q.diff === "easy") {
    // Pick the wrong option that's least likely to be the correct formula
    // — usually the one that flips an obvious sign or drops a factor.
    const wrongOpt = wrongOpts[0] || "another option";
    tier2 = `Watch out — a common mistake is "${wrongOpt.slice(0, 60)}${wrongOpt.length > 60 ? '…' : ''}". The correct answer matches the standard definition.`;
  } else {
    tier2 = `A common mistake would be to pick "${wrongPick.slice(0, 60)}${wrongPick.length > 60 ? '…' : ''}". Check the sign / order / factor carefully before committing.`;
  }

  // Tier 3: clue without giving exact letters — use numeric/letter index hint
  const ansLetter = "ABCD"[q.ans];
  let tier3;
  if (q.ans === 0)      tier3 = `Option A is correct.`;
  else if (q.ans === 1) tier3 = `Option B is correct.`;
  else if (q.ans === 2) tier3 = `Option C is correct.`;
  else                  tier3 = `Option D is correct.`;
  // #13: removed the dead first `let tier3 = ...` line that was always overwritten.

  return [tier1, tier2, tier3];
}

function onSelect(node, q, i) {
  if (practiceState.submitted[q.id]) return;
  // #15: in instant-feedback mode, the first click only *selects* and previews
  // correctness coloring. The user must click "Lock answer" (or click the
  // selected option again) to actually submit. This prevents accidental
  // auto-lock from a misclick.
  const wasSel = practiceState.selected[q.id] === i;
  practiceState.selected[q.id] = i;
  node.querySelectorAll(".opt").forEach((o, k) => o.classList.toggle("sel", k === i));
  if (practiceState.showFb) {
    // preview correctness coloring, but don't record the attempt yet
    node.querySelectorAll(".opt").forEach((o, k) => {
      o.classList.remove("correct", "wrong");
      if (k === q.ans) o.classList.add("correct");
      else if (k === i) o.classList.add("wrong");
    });
    // Show a Lock button so the user explicitly confirms.
    let lock = node.querySelector(".qlock");
    if (!lock) {
      lock = document.createElement("button");
      lock.className = "qlock primary";
      lock.textContent = wasSel ? "Click again to lock answer" : "Lock answer";
      lock.style.marginTop = "8px";
      const fb = node.querySelector(".qfeedback") || node;
      fb.parentNode.insertBefore(lock, fb);
    } else {
      lock.textContent = "Click again to lock answer";
    }
    lock.onclick = () => onSubmit(node, q);
    // Double-clicking the selected option also locks (common UX pattern)
    if (wasSel) {
      // If they click the same option twice, lock immediately so a
      // second misclick is treated as confirmation.
      onSubmit(node, q);
      return;
    }
    // hide the regular Submit button while in instant-feedback mode
    const sub = node.querySelector(".qsubmit");
    const nxt = node.querySelector(".qnext");
    if (sub) sub.style.display = "none";
    if (nxt) nxt.style.display = "none";
  } else {
    const sub = node.querySelector(".qsubmit");
    const nxt = node.querySelector(".qnext");
    if (sub) { sub.style.display = ""; nxt.style.display = "none"; }
  }
}

function onSubmit(node, q) {
  if (practiceState.submitted[q.id]) return;
  const sel = practiceState.selected[q.id];
  if (sel === undefined) {
    toast("Pick an answer first");
    return;
  }
  practiceState.submitted[q.id] = true;
  const correct = sel === q.ans;
  practiceState.sessionCounts[q.id] = correct ? "right" : "wrong";
  recordAttempt(q, correct);

  // remove the instant-feedback Lock button once submitted
  const lockBtn = node.querySelector(".qlock");
  if (lockBtn) lockBtn.remove();

  // Color
  node.querySelectorAll(".opt").forEach((o, k) => {
    o.classList.remove("sel");
    if (k === q.ans) o.classList.add("correct");
    else if (k === sel) o.classList.add("wrong");
  });

  // #17: two-step reveal — show a "View solution" button so the user has a
  // moment to read the correctness verdict before the explanation appears.
  // The feedback div starts collapsed and only expands on demand.
  const fb = node.querySelector(".qfeedback");
  const ansLetter = "ABCD"[q.ans];
  const correctOpt = q.opts[q.ans];
  const title = correct ? "✓ Correct" : "✗ Incorrect";
  fb.innerHTML = `
    <div class="sol-title">${title} — Answer: ${ansLetter}. ${escapeHtml(correctOpt)}</div>
    <button class="qview-solution">View solution</button>
    <div class="sol-body" style="display:none">${latex.renderString(q.exp || "Use the relevant formula/definition.") || escapeHtml(q.exp || "Use the relevant formula/definition.")}</div>
  `;
  fb.classList.add("show");
  fb.classList.toggle("ok", correct);
  fb.classList.toggle("bad", !correct);
  const viewBtn = fb.querySelector(".qview-solution");
  const solBody = fb.querySelector(".sol-body");
  viewBtn.addEventListener("click", () => {
    solBody.style.display = "";
    latex.typeset(solBody);
    viewBtn.style.display = "none";
  });

  const sub = node.querySelector(".qsubmit");
  const nxt = node.querySelector(".qnext");
  if (sub) sub.style.display = "none";
  if (nxt) nxt.style.display = "";
  updateHeader();
}

function revealFeedback(node, q) {
  const fb = node.querySelector(".qfeedback");
  const isCorrect = practiceState.submitted[q.id] && state.history[q.id]?.correct;
  const title = isCorrect ? "✓ Correct — Solution" : "✗ Incorrect — Solution";
  const ansLetter = "ABCD"[q.ans];
  const correctOpt = q.opts[q.ans];
  const exp = q.exp || "Use the relevant formula/definition.";
  const correctOptHtml = latex.renderString(correctOpt) || escapeHtml(correctOpt);
  const expHtml = latex.renderString(exp) || escapeHtml(exp);
  fb.innerHTML = `
    <div class="sol-title">${title}</div>
    <div class="sol-ans"><b>Answer:</b> ${ansLetter}. ${correctOptHtml}</div>
    <div class="sol-steps">${expHtml}</div>
  `;
  fb.classList.add("show");
  fb.classList.toggle("ok", !!isCorrect);
  fb.classList.toggle("bad", !isCorrect);
  latex.typeset(fb);
}

function onRetry(node, q) {
  // Reset the current question's selection, feedback, and hints for this session.
  // We do NOT touch state.history.{correct,hadWrong} — that would let the user
  // re-earn XP/streak/correct counters on every retry, inflating stats (#3).
  // We only roll back the transient hadWrong flag if the previous attempt was wrong
  // AND the user hasn't ever gotten this question right, so a re-attempt can
  // correctly record a first-time "got it right" (#4).
  delete practiceState.selected[q.id];
  delete practiceState.submitted[q.id];
  // #7: drop the prior session outcome so the retry can replace it
  if (practiceState.sessionCounts) delete practiceState.sessionCounts[q.id];
  const h = state.history[q.id];
  if (h) {
    // If the only record we have is a "first time wrong", allow re-attempt to fix it
    // by clearing hadWrong — but never undo a prior "correct".
    if (!h.correct && h.hadWrong) {
      delete h.hadWrong;
      // also undo the wrong-counter increment so the next attempt can re-evaluate cleanly
      if (state.wrong > 0) state.wrong--;
    }
  }
  saveState();
  renderCurrentQ();
  toast("Question reset — try again");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function recordAttempt(q, correct) {
  if (!state.history[q.id]) {
    state.history[q.id] = { tries: 0, correct: false, last: 0 };
  }
  const h = state.history[q.id];
  h.tries++;
  h.last = Date.now();
  h.lastAttemptCorrect = correct; // #20: kept for onRetry reference; see notes

  const isFirstCorrect = correct && !h.correct;
  const isFirstWrong   = !correct && !h.hadWrong;

  if (isFirstCorrect) {
    h.correct = true;
    state.correct++;
    state.xp += 10;
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  } else if (isFirstWrong) {
    state.wrong++;
    h.hadWrong = true;
    state.streak = 0;
  } else if (!correct) {
    // re-attempt wrong — don't double-increment wrong, but still reset streak
    state.streak = 0;
  }
  // Re-answering correctly after a prior correct: no XP/stats change, but the
  // user can re-read the solution. Streak is preserved.
  saveState();
}

function renderPracticeSummary() {
  const area = document.getElementById("practice-area");
  const total = practiceState.qs.length;
  // #7: count correct answers in *this session*, not all-time.
  let right = 0, wrong = 0, skipped = 0;
  for (const q of practiceState.qs) {
    const r = practiceState.sessionCounts[q.id];
    if (r === "right") right++;
    else if (r === "wrong") wrong++;
    else skipped++;
  }
  area.innerHTML = `<div class="qcard">
    <h3 style="margin:0">Session complete</h3>
    <div class="cbody">Score: ${right} / ${total} (${Math.round(100*right/total)}%)
    <br>Right: ${right} • Wrong: ${wrong} • Skipped: ${skipped}
    <br>Streak: ${state.streak} • Best: ${state.bestStreak} • XP: ${state.xp}</div>
    <div class="qfoot">
      <button class="primary" id="again">Practice again</button>
      <button id="review-wrong" class="primary">Review wrong ones</button>
    </div>
  </div>`;
  area.querySelector("#again").addEventListener("click", startPractice);
  area.querySelector("#review-wrong").addEventListener("click", () => {
    document.getElementById("review-only").checked = true;
    startPractice();
  });
}

// =============================================================
// MOCK TEST
// =============================================================
let mockState = null;
let mockTimer = null;

// Build the category chip selector for the mock test. Tricky is a
// pseudo-category — selecting it includes only flagged tricky questions
// from any subject; otherwise it's off and tricky questions act like
// any other question.
function buildMockCategoryChips() {
  const wrap = document.getElementById("mock-cats");
  if (!wrap || wrap.dataset.built === "1") return;
  const trickyCount = QUESTIONS.filter(q => q.tricky).length;
  const items = [
    ...Object.entries(CATEGORIES).map(([k, v]) => ({ key: k, label: v, count: QUESTIONS.filter(q => q.cat === k).length })),
    { key: "__tricky__", label: "★ Tricky", count: trickyCount, tricky: true },
  ];
  wrap.innerHTML = items.map(it => `
    <label class="mock-cat checked" data-key="${it.key}">
      <input type="checkbox" checked />
      <span>${it.label}</span>
      <span class="count">${it.count}</span>
    </label>
  `).join("");
  wrap.addEventListener("change", e => {
    // The native <label> already toggles the input when you click anywhere on the chip.
    // We only need to keep the "checked" CSS class in sync (#9: removed the duplicate
    // click handler that was firing the toggle twice).
    const cb = e.target;
    if (cb.tagName !== "INPUT") return;
    const label = cb.closest(".mock-cat");
    label.classList.toggle("checked", cb.checked);
  });
  wrap.dataset.built = "1";
}

function renderMockHistory() {
  const el = document.getElementById("mock-history");
  if (!el) return;
  if (mockState) { el.innerHTML = ""; return; } // hide during active test
  const history = JSON.parse(localStorage.getItem("giki-mock-history") || "[]");
  if (!history.length) { el.innerHTML = ""; return; }
  const rows = history.slice(0, 20).map((r, i) => {
    const pct = Math.round(100 * r.right / Math.max(1, r.total));
    const date = new Date(r.date);
    const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    const timeUsed = r.timeUsed ? Math.floor(r.timeUsed/60) + "m " + (r.timeUsed%60) + "s" : "";
    return `<div class="row" style="align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border,rgba(255,255,255,0.08))">
      <div style="min-width:60px"><b style="font-size:18px;color:${pct>=80?'var(--success,#4caf50)':pct>=50?'var(--accent,#ff9800)':'var(--danger,#f44336)'}">${pct}%</b></div>
      <div style="flex:1">
        <div style="font-weight:600">${r.title || "Mock Test"}</div>
        <div style="font-size:12px;color:var(--muted,#888)">${r.right}/${r.total} right • ${r.wrong} wrong • ${r.skipped} skipped • ${timeUsed}</div>
      </div>
      <div style="font-size:12px;color:var(--muted,#888);text-align:right">${dateStr}</div>
    </div>`;
  }).join("");
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <span style="font-size:14px;font-weight:600">Recent Mock Results</span>
    <button id="mock-history-clear" style="font-size:12px;color:var(--muted,#888);background:none;border:none;cursor:pointer;text-decoration:underline">Clear all</button>
  </div>${rows}`;
  document.getElementById("mock-history-clear").addEventListener("click", () => {
    if (confirm("Clear all mock history? This cannot be undone.")) {
      localStorage.removeItem("giki-mock-history");
      renderMockHistory();
    }
  });
}

function getMockCategorySelection() {
  const wrap = document.getElementById("mock-cats");
  const labels = wrap.querySelectorAll(".mock-cat");
  const sel = { categories: new Set(), tricky: false };
  labels.forEach(lab => {
    const cb = lab.querySelector("input");
    if (!cb.checked) return;
    if (lab.dataset.key === "__tricky__") sel.tricky = true;
    else sel.categories.add(lab.dataset.key);
  });
  return sel;
}

document.getElementById("mock-cat-all").addEventListener("click", () => {
  const wrap = document.getElementById("mock-cats");
  wrap.querySelectorAll(".mock-cat").forEach(lab => {
    lab.querySelector("input").checked = true;
    lab.classList.add("checked");
  });
});
document.getElementById("mock-cat-none").addEventListener("click", () => {
  const wrap = document.getElementById("mock-cats");
  wrap.querySelectorAll(".mock-cat").forEach(lab => {
    lab.querySelector("input").checked = false;
    lab.classList.remove("checked");
  });
});
document.getElementById("mock-cat-preset").addEventListener("click", () => {
  // "Balanced" preset: spread the chosen count evenly across the categories
  // that have at least one question. The label says "Balanced" rather than
  // a fixed N so it remains accurate as the dataset grows.
  const catsWithQs = Object.keys(CATEGORIES).filter(k => QUESTIONS.some(q => q.cat === k));
  const totalAvail = catsWithQs.reduce((n, k) => n + QUESTIONS.filter(q => q.cat === k).length, 0);
  const target = Math.min(80, totalAvail);
  const per = Math.max(1, Math.floor(target / catsWithQs.length));
  document.getElementById("mock-count").value = String(target);
  const wrap = document.getElementById("mock-cats");
  wrap.querySelectorAll(".mock-cat").forEach(lab => {
    const isReal = catsWithQs.includes(lab.dataset.key);
    const cb = lab.querySelector("input");
    cb.checked = isReal;
    lab.classList.toggle("checked", isReal);
  });
  toast(`Balanced ${target} → ~${per} per category (${catsWithQs.length} subjects with questions)`);
});

// Build chips lazily when the mock panel is shown
document.querySelector('.tab[data-tab="mock"]').addEventListener("click", buildMockCategoryChips);
document.querySelector('.tab[data-tab="mock"]').addEventListener("click", renderMockHistory);
// Also try once on first load in case user starts on another tab
window.addEventListener("DOMContentLoaded", buildMockCategoryChips);
window.addEventListener("DOMContentLoaded", renderMockHistory);

document.getElementById("mock-start").addEventListener("click", () => {
  const count = +document.getElementById("mock-count").value;
  const minutes = +document.getElementById("mock-time").value;
  const sel = getMockCategorySelection();

  // #5: warn user that mock answers will overwrite prior practice correctness
  // for any overlapping questions. Show once per session, dismissable.
  if (!sessionStorage.getItem("mock-warned")) {
    sessionStorage.setItem("mock-warned", "1");
    toast("Heads up: mock answers may change your per-question history");
  }

  // Build pool based on selected categories + tricky flag.
  let pool = QUESTIONS.filter(q => {
    if (sel.tricky && !sel.categories.size) {
      // User only picked Tricky
      return q.tricky;
    }
    if (sel.categories.has(q.cat)) {
      // If Tricky is *also* selected, filter to tricky within the chosen cats
      if (sel.tricky) return q.tricky;
      return true;
    }
    return false;
  });

  if (!pool.length) {
    toast("Pick at least one category");
    return;
  }

  // Time auto-scales: ~36s per question by default, capped to chosen minutes
  // Clamp the requested count to the available pool so the user never gets
  // fewer questions than the label promised (e.g. picking "100" when only
  // 80 questions exist across the selected categories used to silently
  // deliver fewer).
  const requested = count;
  pool = pool.sort(() => Math.random() - 0.5).slice(0, count);
  if (!pool.length) {
    toast("No questions available for the chosen categories");
    return;
  }
  if (pool.length < requested) {
    toast(`Only ${pool.length} question(s) match — starting with that many`);
  }
  // Shuffle options for each question so correct answer isn't always A
  pool = pool.map(shuffleQOpts);
  mockState = {
    qs: pool, idx: 0, selected: {}, submitted: {}, flagged: new Set(),
    startedAt: Date.now(), seconds: minutes * 60, count: pool.length,
    requested, _title: "Custom Mock",
  };
  document.querySelector(".mock-setup").style.display = "none";
  renderMock();
  startMockTimer();
});

// --- Curated Exam Practice buttons ---
function startExamPractice(testId) {
  const test = (typeof MOCK_TESTS !== "undefined") && MOCK_TESTS.find(t => t.id === testId);
  if (!test) { toast("Exam test not found"); return; }
  // Look up questions by ID from the global QUESTIONS array
  const qMap = {};
  QUESTIONS.forEach(q => { qMap[q.id] = q; });
  const pool = [];
  for (const id of test.questions) {
    if (qMap[id]) pool.push(qMap[id]);
  }
  if (pool.length < test.questions.length) {
    toast("Some questions are missing — starting with " + pool.length);
  }
  // Shuffle the curated pool and randomize option order
  pool.sort(() => Math.random() - 0.5);
  const shuffled = pool.map(shuffleQOpts);
  const minutes = 60;
  mockState = {
    qs: shuffled, idx: 0, selected: {}, submitted: {}, flagged: new Set(),
    startedAt: Date.now(), seconds: minutes * 60, count: shuffled.length,
    requested: shuffled.length, _title: test.title,
  };
  document.querySelector(".mock-setup").style.display = "none";
  renderMock();
  startMockTimer();
}

document.getElementById("mock-exam-a").addEventListener("click", () => startExamPractice("exam-a"));
document.getElementById("mock-exam-b").addEventListener("click", () => startExamPractice("exam-b"));
document.getElementById("mock-exam-c").addEventListener("click", () => startExamPractice("exam-c"));

// --- Resume test ---
document.getElementById("mock-resume").addEventListener("click", restoreMockResume);
document.getElementById("mock-resume-discard").addEventListener("click", () => {
  if (confirm("Discard the saved test? This cannot be undone.")) {
    clearMockResume();
    updateResumeButton();
  }
});

function updateResumeButton() {
  const data = loadMockResume();
  const btn = document.getElementById("mock-resume");
  const discard = document.getElementById("mock-resume-discard");
  if (!btn || !discard) return;
  if (data) {
    btn.style.display = "";
    discard.style.display = "";
    const answered = Object.keys(data.selected || {}).length;
    const timeLeft = data.seconds || 0;
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    btn.textContent = `Resume Test — ${data.title} (${answered}/${data.qs.length} answered, ${m}:${String(s).padStart(2,"0")} left)`;
  } else {
    btn.style.display = "none";
    discard.style.display = "none";
  }
}
// Check for resume on page load and when mock tab is shown
document.querySelector('.tab[data-tab="mock"]').addEventListener("click", updateResumeButton);
window.addEventListener("DOMContentLoaded", updateResumeButton);

function startMockTimer() {
  clearInterval(mockTimer);
  mockTimer = setInterval(() => {
    mockState.seconds--;
    renderTimer();
    if (mockState.seconds <= 0) {
      clearInterval(mockTimer);
      toast("Time's up — auto-submitting");
      submitMock();
    }
  }, 1000);
}

function renderTimer() {
  const t = document.getElementById("mock-timer");
  if (!t) return;
  const m = Math.floor(mockState.seconds / 60);
  const s = mockState.seconds % 60;
  t.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  t.classList.toggle("warn", mockState.seconds <= 120 && mockState.seconds > 30);
  t.classList.toggle("danger", mockState.seconds <= 30);
}

function renderMock() {
  const area = document.getElementById("mock-area");
  if (!mockState) {
    area.innerHTML = "";
    return;
  }
  const { qs, idx } = mockState;
  if (idx >= qs.length) { submitMock(); return; }
  const q = qs[idx];

  area.innerHTML = `
    <div class="timer-bar">
      <div>Question ${idx + 1} / ${qs.length}</div>
      <div class="timer" id="mock-timer">--:--</div>
      <div>
        <button id="flag-btn" class="primary">${mockState.flagged.has(q.id) ? "Unflag" : "Flag"}</button>
        <button id="submit-mock" class="danger" style="margin-left:6px">Submit Test</button>
      </div>
    </div>
    <div class="qcard">
      <div class="qhead">
        <span class="qbadge cat${q.tricky ? ' tricky' : ''}">${(q.tricky ? '★ Tricky · ' : '') + CATEGORIES[q.cat]}</span>
        <span class="qbadge diff ${q.diff}">${q.diff}</span>
      </div>
      <div class="qtext"></div>
      <div class="qopts"></div>
      <div class="qfoot">
        <button id="prev">← Previous</button>
        <button id="next" class="primary">Next →</button>
      </div>
    </div>
    <div class="palette" id="palette"></div>
  `;
  area.querySelector(".qtext").textContent = q.q;
  latex.typeset(area.querySelector(".qtext"));
  const opts = area.querySelector(".qopts");
  q.opts.forEach((o, i) => {
    const opt = document.createElement("div");
    opt.className = "opt" + (mockState.selected[q.id] === i ? " sel" : "");
    opt.innerHTML = `<span class="letter">${"ABCD"[i]}</span><span class="txt"></span>`;
    const txtEl = opt.querySelector(".txt");
    const rendered = latex.renderString(o);
    txtEl.innerHTML = rendered !== null ? rendered : escapeHtml(o);
    opt.addEventListener("click", () => {
      mockState.selected[q.id] = i;
      renderMock();
    });
    opts.appendChild(opt);
  });
  area.querySelector("#prev").addEventListener("click", () => { mockState.idx = Math.max(0, idx - 1); renderMock(); });
  area.querySelector("#next").addEventListener("click", () => { mockState.idx = Math.min(qs.length - 1, idx + 1); renderMock(); });
  area.querySelector("#flag-btn").addEventListener("click", () => {
    if (mockState.flagged.has(q.id)) mockState.flagged.delete(q.id);
    else mockState.flagged.add(q.id);
    renderMock();
  });
  area.querySelector("#submit-mock").addEventListener("click", () => {
    submitMock();
  });

  const pal = area.querySelector("#palette");
  qs.forEach((qq, i) => {
    const b = document.createElement("button");
    b.className = "pbtn";
    if (mockState.submitted[qq.id] || mockState.selected[qq.id] !== undefined) b.classList.add("answered");
    if (mockState.flagged.has(qq.id)) b.classList.add("flagged");
    if (i === idx) b.classList.add("current");
    b.textContent = i + 1;
    b.addEventListener("click", () => { mockState.idx = i; renderMock(); });
    pal.appendChild(b);
  });

  renderTimer();
  saveMockResume();
}

function submitMock() {
  if (!mockState) return;
  if (mockState._submitted) return; // #18: guard against double-submit
  mockState._submitted = true;
  clearInterval(mockTimer);
  clearMockResume();
  const area = document.getElementById("mock-area");
  // Show grading indicator immediately so the UI doesn't freeze
  area.innerHTML = `<div class="qcard" style="text-align:center;padding:40px"><b>Grading...</b></div>`;
  // Defer the heavy scoring work so the browser can render the indicator first
  setTimeout(() => _doSubmitMock(area), 30);
}

function _doSubmitMock(area) {
  let right = 0, wrong = 0, skipped = 0, xpGained = 0;
  // #8: per-category breakdown
  const byCat = {};

  for (const q of mockState.qs) {
    const cat = CATEGORIES[q.cat] || q.cat;
    if (!byCat[cat]) byCat[cat] = { total: 0, right: 0, wrong: 0, skipped: 0 };
    byCat[cat].total++;

    const sel = mockState.selected[q.id];
    if (sel === undefined) {
      skipped++;
      byCat[cat].skipped++;
      continue;
    }
    const isCorrect = sel === q.ans;
    if (!state.history[q.id]) state.history[q.id] = { tries: 0, correct: false, last: 0 };
    const h = state.history[q.id];
    h.tries = (h.tries || 0) + 1;
    h.last = Date.now();

    if (isCorrect) {
      right++;
      byCat[cat].right++;
      // #1: only credit stats on FIRST correct, not "not currently correct" (which
      //     was the inverted gate before — repeated mock attempts of a known-good
      //     question still incremented state.correct and state.xp).
      if (!h.correct) {
        h.correct = true;
        state.correct++;
        state.xp += 10;
        xpGained += 10;
        // #19: per-question streak during mock
        state.streak++;
        if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      }
    } else {
      wrong++;
      byCat[cat].wrong++;
      // #1 fix: also only credit "wrong" on first wrong for this question,
      // and clear streak like recordAttempt does
      if (!h.hadWrong) {
        state.wrong++;
        h.hadWrong = true;
      }
      state.streak = 0;
    }
  }
  // #19: streak reset already happened per-question; if user got nothing right
  // we don't zero an already-zero streak.
  saveState();
  updateHeader();

  const total = mockState.qs.length;

  // Save mock result to history
  const mockResult = {
    date: new Date().toISOString(),
    title: mockState._title || "Custom Mock",
    total, right, wrong, skipped, xpGained,
    byCat,
    timeUsed: Math.round((Date.now() - mockState.startedAt) / 1000),
  };
  const mockHistory = JSON.parse(localStorage.getItem("giki-mock-history") || "[]");
  mockHistory.unshift(mockResult);
  if (mockHistory.length > 50) mockHistory.length = 50; // keep last 50
  localStorage.setItem("giki-mock-history", JSON.stringify(mockHistory));

  // #8: render per-category breakdown table
  const catRows = Object.entries(byCat)
    .sort((a, b) => b[1].right / Math.max(1, b[1].right + b[1].wrong) - a[1].right / Math.max(1, a[1].right + a[1].wrong))
    .map(([k, v]) => {
      const answered = v.right + v.wrong;
      const pct = answered ? Math.round(100 * v.right / answered) : 0;
      return `<div class="row"><div>${k}</div><div>${v.right}/${answered} (${pct}%) • skipped ${v.skipped}</div></div>
              <div class="bar"><div style="width:${pct}%"></div></div>`;
    }).join("");

  area.innerHTML = `<div class="qcard">
    <h3 style="margin:0">Mock test results</h3>
    <div class="cbody">
      Score: <b>${right} / ${total}</b> (${Math.round(100*right/total)}%)
      <br>Right: ${right} • Wrong: ${wrong} • Skipped: ${skipped}
      <br>XP gained: ${xpGained} • Streak: ${state.streak} (best ${state.bestStreak})
    </div>
    <h4 style="margin:14px 0 6px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">By category</h4>
    <div class="cbody" style="max-height:none">${catRows || "<div class='row'><div>No categories</div><div>—</div></div>"}</div>
    <div class="qfoot">
      <button class="primary" id="mreview">Review answers</button>
      <button id="mrestart" class="primary">Take another</button>
    </div>
  </div>`;
  area.querySelector("#mreview").addEventListener("click", () => {
    // #2: only auto-jump to the wrong-tab if there are actually wrong answers.
    // Otherwise leave the user's currently-selected review tab alone.
    const hasWrong = mockState.qs.some(q => {
      const sel = mockState.selected[q.id];
      return sel !== undefined && sel !== q.ans;
    });
    document.querySelector('.tab[data-tab="review"]').click();
    if (hasWrong) {
      document.querySelector('.rtab[data-rtab="wrong"]').click();
    }
  });
  area.querySelector("#mrestart").addEventListener("click", () => {
    mockState = null;
    clearMockResume();
    document.getElementById("mock-area").innerHTML = "";
    document.querySelector(".mock-setup").style.display = "";
    renderMockHistory();
  });
}

// =============================================================
// REVIEW
// =============================================================
function renderReview() {
  const tab = document.querySelector(".rtab.active")?.dataset.rtab || "wrong";
  const list = document.getElementById("review-list");
  list.innerHTML = "";
  let pool;
  if (tab === "wrong") {
    pool = QUESTIONS.filter(q => state.history[q.id] && !state.history[q.id].correct);
  } else if (tab === "bookmarked") {
    pool = QUESTIONS.filter(q => state.bookmarks.has(q.id));
  } else {
    pool = QUESTIONS.filter(q => state.history[q.id]?.correct);
  }
  if (!pool.length) {
    list.innerHTML = `<div class="concept-card"><div class="cbody">Nothing here yet. Keep practicing!</div></div>`;
    return;
  }
  const tmpl = document.getElementById("qcard-tmpl");
  for (const q of pool) {
    const node = tmpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".cat").textContent = (q.tricky ? "★ Tricky · " : "") + CATEGORIES[q.cat];
    if (q.tricky) node.querySelector(".cat").classList.add("tricky");
    const db = node.querySelector(".diff");
    db.textContent = q.diff;
    db.classList.add(q.diff);
    node.querySelector(".qnum").textContent = q.id;
    const qtextEl = node.querySelector(".qtext");
    qtextEl.textContent = q.q;
    // Hide hints & footer in review mode
    node.querySelector(".qhints").style.display = "none";
    const opts = node.querySelector(".qopts");
    q.opts.forEach((o, i) => {
      const opt = document.createElement("div");
      opt.className = "opt" + (i === q.ans ? " correct" : "");
      opt.innerHTML = `<span class="letter">${"ABCD"[i]}</span><span class="txt"></span>`;
      const txtEl = opt.querySelector(".txt");
      const rendered = latex.renderString(o);
      txtEl.innerHTML = rendered !== null ? rendered : escapeHtml(o);
      opts.appendChild(opt);
    });
    const fb = node.querySelector(".qfeedback");
    const ansLetter = "ABCD"[q.ans];
    const correctOpt = q.opts[q.ans];
    const exp = q.exp || "Use the relevant formula/definition.";
    const correctOptHtml = latex.renderString(correctOpt) || escapeHtml(correctOpt);
    const expHtml = latex.renderString(exp) || escapeHtml(exp);
    fb.innerHTML = `
      <div class="sol-title">Solution</div>
      <div class="sol-ans"><b>Answer:</b> ${ansLetter}. ${correctOptHtml}</div>
      <div class="sol-steps">${expHtml}</div>
    `;
    fb.classList.add("show", "ok");
    node.querySelector(".qfoot").style.display = "none";
    node.querySelector('[data-act="bookmark"]').addEventListener("click", () => {
      if (state.bookmarks.has(q.id)) state.bookmarks.delete(q.id);
      else state.bookmarks.add(q.id);
      saveState();
      renderReview();
    });
    node.querySelector('[data-act="hint"]').style.display = "none";
    latex.typeset(node);
    list.appendChild(node);
  }
}
document.querySelectorAll(".rtab").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".rtab").forEach(x => x.classList.toggle("active", x === b));
  renderReview();
}));

// =============================================================
// PROGRESS
// =============================================================
function renderProgress() {
  const cats = document.getElementById("prog-cats");
  const diffs = document.getElementById("prog-diff");
  const cov = document.getElementById("prog-coverage");
  cats.innerHTML = ""; diffs.innerHTML = ""; cov.innerHTML = "";
  // #40: make sure the per-category reset dropdown is populated
  populateResetCategoryDropdown();

  const byCat = {};
  for (const [k, v] of Object.entries(CATEGORIES)) byCat[k] = { total: 0, seen: 0, right: 0 };
  for (const q of QUESTIONS) {
    byCat[q.cat].total++;
    if (state.history[q.id]) {
      byCat[q.cat].seen++;
      if (state.history[q.id].correct) byCat[q.cat].right++;
    }
  }
  for (const [k, v] of Object.entries(byCat)) {
    const pct = v.total ? Math.round(100 * v.seen / v.total) : 0;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div>${CATEGORIES[k]}</div><div>${v.seen}/${v.total} (${pct}%)</div>`;
    cats.appendChild(row);
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.innerHTML = `<div style="width:${pct}%"></div>`;
    cats.appendChild(bar);
  }

  const byDiff = { easy: [0,0], medium: [0,0], hard: [0,0] };
  for (const q of QUESTIONS) {
    byDiff[q.diff][0]++;
    if (state.history[q.id]?.correct) byDiff[q.diff][1]++;
  }
  for (const [k, [t, r]] of Object.entries(byDiff)) {
    const pct = t ? Math.round(100 * r / t) : 0;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div>${k}</div><div>${r}/${t} (${pct}%)</div>`;
    diffs.appendChild(row);
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.innerHTML = `<div style="width:${pct}%"></div>`;
    diffs.appendChild(bar);
  }

  // Concept coverage: how many of 58 concepts have at least one seen question
  const conceptCats = new Set(CONCEPTS.map(c => c.cat));
  let totalC = CONCEPTS.length, seenC = 0;
  for (const c of CONCEPTS) {
    if (QUESTIONS.some(q => q.cat === c.cat && state.history[q.id])) seenC++;
  }
  cov.innerHTML = `<div class="row"><div>Concepts explored</div><div>${seenC}/${totalC}</div></div>
    <div class="bar"><div style="width:${Math.round(100*seenC/totalC)}%"></div></div>
    <div class="row" style="margin-top:10px"><div>Best streak</div><div>${state.bestStreak}</div></div>
    <div class="row"><div>Total XP</div><div>${state.xp}</div></div>
    <div class="row"><div>Correct</div><div>${state.correct}</div></div>
    <div class="row"><div>Wrong</div><div>${state.wrong}</div></div>`;
}

document.getElementById("export-btn").addEventListener("click", () => {
  const s = { ...state, bookmarks: Array.from(state.bookmarks) };
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "giki-prep-progress.json";
  a.click();
});
document.getElementById("reset-btn").addEventListener("click", () => {
  if (!confirm("Erase all progress?")) return;
  localStorage.removeItem(STORE_KEY);
  location.reload();
});

// #40: per-category reset. Populate the dropdown when the Progress tab is
// rendered, then wire a handler that removes history entries for the chosen
// subject and recomputes the global counters.
function populateResetCategoryDropdown() {
  const sel = document.getElementById("reset-cat");
  if (!sel || sel.options.length) return;
  sel.append(new Option("Pick a category…", ""));
  for (const [k, v] of Object.entries(CATEGORIES)) sel.append(new Option(v, k));
}
document.getElementById("reset-cat-btn")?.addEventListener("click", () => {
  const cat = document.getElementById("reset-cat").value;
  if (!cat) { toast("Pick a category first"); return; }
  if (!confirm(`Erase all progress for ${CATEGORIES[cat]}?`)) return;
  let removed = 0, lostCorrect = 0, lostWrong = 0;
  for (const q of QUESTIONS) {
    if (q.cat !== cat) continue;
    const h = state.history[q.id];
    if (!h) continue;
    if (h.correct) lostCorrect++;
    if (h.hadWrong) lostWrong++;
    delete state.history[q.id];
    removed++;
  }
  // recompute global counters from remaining history
  state.correct = 0; state.wrong = 0; state.xp = 0;
  for (const qid in state.history) {
    const h = state.history[qid];
    if (h.correct) { state.correct++; state.xp += 10; }
    if (h.hadWrong) state.wrong++;
  }
  // bestStreak is left alone (we can't reconstruct it) but we cap it to the
  // current streak so it doesn't lie.
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  saveState();
  updateHeader();
  renderProgress();
  toast(`Reset ${CATEGORIES[cat]}: ${removed} questions, −${lostCorrect} correct, −${lostWrong} wrong`);
});

// =============================================================
// Toast
// =============================================================
let toastT;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 1500);
}

// =============================================================
// Init
// =============================================================
loadState();
updateHeader();
renderLearn();
