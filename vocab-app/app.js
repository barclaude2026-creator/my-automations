/* Lingua — vocabulary learning from articles
 * Vanilla JS, stored in localStorage, talks to the Claude API directly from the browser.
 */

const STORAGE_KEYS = {
  settings: "lingua.settings.v1",
  articles: "lingua.articles.v1",
  terms: "lingua.terms.v1",
};

const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "claude-sonnet-4-6",
};

const state = {
  settings: loadJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  articles: loadJSON(STORAGE_KEYS.articles, []),
  terms: loadJSON(STORAGE_KEYS.terms, []),
  currentView: "home",
  currentArticleId: null,
  currentCardIndex: 0,
  cardAnswered: false,
  quizCorrect: 0,
  quizTotal: 0,
  vocabFilter: "all",
};

/* ───────────────────  storage  ─────────────────── */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
const saveSettings = () => saveJSON(STORAGE_KEYS.settings, state.settings);
const saveArticles = () => saveJSON(STORAGE_KEYS.articles, state.articles);
const saveTerms = () => saveJSON(STORAGE_KEYS.terms, state.terms);

/* ───────────────────  helpers  ─────────────────── */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toast(message, ms = 2600) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), ms);
}

function showLoading(msg, sub = "") {
  $("#loading-msg").textContent = msg;
  $("#loading-sub").textContent = sub;
  $("#loading").classList.remove("hidden");
}
function hideLoading() { $("#loading").classList.add("hidden"); }

function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }
function closeAllModals() { $$(".modal").forEach((m) => m.classList.add("hidden")); }

function prettyHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

/* ───────────────────  view routing  ─────────────────── */
function setView(view) {
  state.currentView = view;
  $$(".view").forEach((el) => el.classList.add("hidden"));
  $(`#view-${view}`).classList.remove("hidden");
  $$(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === view);
  });
  window.scrollTo(0, 0);
  const container = $(`#view-${view}`);
  if (container) container.scrollTop = 0;

  if (view === "home") renderHome();
  if (view === "vocabulary") renderVocabulary();
}

/* ───────────────────  article fetching  ─────────────────── */
async function fetchArticleText(url) {
  // r.jina.ai returns clean markdown extracted from the URL, with permissive CORS.
  const readerUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(readerUrl, {
    headers: { "Accept": "text/plain" },
  });
  if (!res.ok) {
    throw new Error(`Couldn't fetch the article (${res.status}). Check the URL and try again.`);
  }
  const text = await res.text();
  if (!text || text.length < 200) {
    throw new Error("That page didn't return enough readable text. Try a different URL.");
  }
  return text;
}

function parseReaderOutput(text) {
  // r.jina.ai output starts with Title:/URL Source:/Markdown Content: blocks.
  const titleMatch = text.match(/^Title:\s*(.+)$/m);
  const contentIdx = text.indexOf("Markdown Content:");
  const body = contentIdx >= 0 ? text.slice(contentIdx + "Markdown Content:".length).trim() : text;
  return {
    title: (titleMatch?.[1] || "Untitled article").trim(),
    body: body.slice(0, 14000), // keep prompt reasonable
  };
}

/* ───────────────────  Claude API  ─────────────────── */
function buildPrompt({ level, count, articleTitle, articleBody }) {
  const levelDescriptor = {
    intermediate: "intermediate (B1–B2)",
    advanced: "advanced (C1)",
    proficient: "proficient (C2, near-native)",
  }[level] || "advanced (C1)";

  return `You are building a vocabulary-learning quiz for an English learner at ${levelDescriptor} level.

Pick ${count} sophisticated, useful vocabulary items from the article below. Favor terms the learner likely does NOT already know at their level: precise verbs, abstract nouns, idiomatic phrases, collocations, and domain-specific words. AVOID very common words (e.g. "store", "customer", "business", "people"). If the article is technical, include 2–3 domain terms.

For each item, produce:
- "term": the exact surface form as it appears in the article (lowercase unless a proper noun). May be a multi-word phrase or collocation.
- "partOfSpeech": one of noun | verb | adjective | adverb | phrase | idiom.
- "correctDefinition": a concise English definition (12–22 words) that fits the sense used in the article.
- "distractorDefinition": a plausible but INCORRECT definition of similar length. It should be believable — e.g. the meaning of a similar-looking word, a near-synonym that's actually wrong in this context, or a common misconception. Never trivially silly.
- "contextSnippet": a short excerpt (max ~18 words) from the article showing the term in use. Replace the term itself with "___" so the quiz doesn't give away the answer.

Return ONLY valid JSON, no prose, no markdown fences, matching:
{"items":[{"term":"...","partOfSpeech":"...","correctDefinition":"...","distractorDefinition":"...","contextSnippet":"..."}, ...]}

Article title: ${articleTitle}

Article:
${articleBody}`;
}

async function generateQuiz({ level, count, articleTitle, articleBody }) {
  const { apiKey, model } = state.settings;
  if (!apiKey) throw new Error("Please add your Anthropic API key in Settings first.");

  const prompt = buildPrompt({ level, count, articleTitle, articleBody });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let friendly = `Claude API error (${res.status})`;
    if (res.status === 401) friendly = "Your API key looks invalid. Check it in Settings.";
    else if (res.status === 429) friendly = "Rate limited by Anthropic — wait a moment and try again.";
    else if (errText) friendly += `: ${errText.slice(0, 180)}`;
    throw new Error(friendly);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b) => b.type === "text")?.text || "";
  const parsed = extractJSON(textBlock);
  if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error("Claude's response couldn't be parsed. Try again.");
  }
  return parsed.items.filter(validItem);
}

function validItem(i) {
  return i && typeof i.term === "string" && i.term.trim()
    && typeof i.correctDefinition === "string" && i.correctDefinition.trim()
    && typeof i.distractorDefinition === "string" && i.distractorDefinition.trim();
}

function extractJSON(text) {
  // Be lenient: accept raw JSON, fenced JSON, or a JSON object somewhere in the text.
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryParse(text.trim());
  if (parsed) return parsed;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { parsed = tryParse(fence[1].trim()); if (parsed) return parsed; }
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    parsed = tryParse(text.slice(braceStart, braceEnd + 1));
    if (parsed) return parsed;
  }
  return null;
}

/* ───────────────────  home / article list  ─────────────────── */
function renderHome() {
  const list = $("#article-list");
  const empty = $("#home-empty");
  list.innerHTML = "";

  const sorted = [...state.articles].sort((a, b) => b.createdAt - a.createdAt);

  $("#articles-count").textContent = sorted.length;
  $("#fav-count").textContent = `${state.terms.filter((t) => t.favorite).length} terms`;
  $("#recent-article-meta").textContent = sorted[0] ? sorted[0].title : "No quizzes yet";

  if (sorted.length === 0) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    for (const a of sorted) list.appendChild(renderArticleItem(a));
  }
}

function renderArticleItem(article) {
  const li = document.createElement("li");
  li.className = "article-item";
  const total = article.items.length;
  const done = article.items.filter((i) => i.answered).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  li.innerHTML = `
    <div class="article-thumb">📖</div>
    <div class="article-info">
      <div class="article-title"></div>
      <div class="article-meta">
        <span></span>
        <span>•</span>
        <span>${total} terms</span>
      </div>
    </div>
    <div class="article-progress">
      <div class="article-bar"><div class="article-bar-fill" style="width:${pct}%"></div></div>
      <span>${done}/${total}</span>
    </div>
    <button class="article-delete" aria-label="Delete article" title="Remove">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
    </button>
  `;
  li.querySelector(".article-title").textContent = article.title;
  li.querySelector(".article-meta span:first-child").textContent = prettyHost(article.url);

  li.addEventListener("click", (e) => {
    if (e.target.closest(".article-delete")) return;
    startQuiz(article.id);
  });
  li.querySelector(".article-delete").addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm(`Remove "${article.title}"?`)) {
      state.articles = state.articles.filter((a) => a.id !== article.id);
      saveArticles();
      renderHome();
    }
  });
  return li;
}

/* ───────────────────  add-article flow  ─────────────────── */
async function handleAddArticle() {
  const urlInput = $("#article-url-input");
  const url = urlInput.value.trim();
  if (!url) return toast("Paste an article URL first.");
  try { new URL(url); } catch { return toast("That doesn't look like a valid URL."); }

  if (!state.settings.apiKey) {
    closeAllModals();
    openModal("#modal-settings");
    toast("Add your Anthropic API key first.");
    return;
  }

  const level = $("#level-select").value;
  const count = parseInt($("#count-select").value, 10);
  closeAllModals();

  try {
    showLoading("Reading the article…", prettyHost(url));
    const raw = await fetchArticleText(url);
    const { title, body } = parseReaderOutput(raw);

    showLoading("Crafting your quiz…", "Claude is picking useful vocabulary");
    const items = await generateQuiz({ level, count, articleTitle: title, articleBody: body });

    if (items.length === 0) throw new Error("No usable vocabulary was extracted. Try a longer article.");

    const article = {
      id: uid(),
      url,
      title,
      level,
      createdAt: Date.now(),
      items: items.map((it) => ({
        id: uid(),
        term: it.term,
        partOfSpeech: it.partOfSpeech || "",
        correctDefinition: it.correctDefinition,
        distractorDefinition: it.distractorDefinition,
        contextSnippet: it.contextSnippet || "",
        answered: false,
        lastResult: null,
      })),
    };
    state.articles.push(article);
    saveArticles();

    urlInput.value = "";
    hideLoading();
    toast(`Ready! ${items.length} terms to learn.`);
    startQuiz(article.id);
  } catch (err) {
    hideLoading();
    toast(err.message || "Something went wrong.");
    console.error(err);
  }
}

/* ───────────────────  quiz flow  ─────────────────── */
function startQuiz(articleId) {
  const article = state.articles.find((a) => a.id === articleId);
  if (!article) return;
  state.currentArticleId = articleId;
  state.currentCardIndex = 0;
  state.quizCorrect = 0;
  state.quizTotal = article.items.length;
  state.cardAnswered = false;

  $("#quiz-title").textContent = article.title.length > 28 ? article.title.slice(0, 28) + "…" : article.title;
  setView("quiz");
  renderCard();
}

function currentArticle() {
  return state.articles.find((a) => a.id === state.currentArticleId);
}
function currentCard() {
  const article = currentArticle();
  return article ? article.items[state.currentCardIndex] : null;
}

function renderCard() {
  const article = currentArticle();
  const card = currentCard();
  if (!article || !card) return;

  const total = article.items.length;
  const idx = state.currentCardIndex;

  $("#quiz-counter").textContent = `${idx + 1}/${total}`;
  $("#progress-fill").style.width = `${((idx) / total) * 100}%`;
  $("#term-display").textContent = card.term;
  $("#pos-display").textContent = card.partOfSpeech || "term";
  $("#context-display").textContent = card.contextSnippet ? `“${card.contextSnippet}”` : "";
  $("#context-display").classList.toggle("hidden", !card.contextSnippet);

  const savedTerm = findSavedTerm(card.term, article.id);
  updateStar(savedTerm?.favorite || false);

  state.cardAnswered = false;
  $("#feedback").classList.add("hidden");
  $("#next-card-btn").classList.add("hidden");

  const container = $("#options-container");
  container.innerHTML = "";
  const options = shuffle([
    { text: card.correctDefinition, correct: true },
    { text: card.distractorDefinition, correct: false },
  ]);
  options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + i)}</span><span class="option-text"></span>`;
    btn.querySelector(".option-text").textContent = opt.text;
    btn.addEventListener("click", () => handleAnswer(btn, opt.correct, options));
    container.appendChild(btn);
  });
}

function updateStar(active) {
  const star = $("#favorite-term");
  star.classList.toggle("active", active);
}

function handleAnswer(btn, correct, options) {
  if (state.cardAnswered) return;
  state.cardAnswered = true;

  const article = currentArticle();
  const card = currentCard();
  if (!article || !card) return;

  // Mark all buttons
  const buttons = $$("#options-container .option");
  buttons.forEach((b) => b.classList.add("disabled"));
  buttons.forEach((b, i) => {
    if (options[i].correct) b.classList.add("correct");
    else if (b === btn && !correct) b.classList.add("wrong");
  });

  card.answered = true;
  card.lastResult = correct ? "correct" : "wrong";
  saveArticles();

  if (correct) state.quizCorrect++;

  // Update feedback
  const fb = $("#feedback");
  fb.classList.remove("hidden", "ok", "bad");
  if (correct) {
    fb.classList.add("ok");
    fb.textContent = "✓ Exactly. Saved to your vocabulary.";
  } else {
    fb.classList.add("bad");
    fb.textContent = `✗ Not quite. The correct meaning: ${card.correctDefinition}`;
  }

  // Save the term (creates if new, marks mastered if correct on first seen)
  upsertLearnedTerm(article, card, correct);

  const next = $("#next-card-btn");
  next.classList.remove("hidden");
  const isLast = state.currentCardIndex >= article.items.length - 1;
  next.textContent = isLast ? "See results →" : "Next →";
}

function nextCard() {
  const article = currentArticle();
  if (!article) return;
  if (state.currentCardIndex >= article.items.length - 1) {
    showSummary();
    return;
  }
  state.currentCardIndex++;
  renderCard();
}

function showSummary() {
  const total = state.quizTotal;
  const correct = state.quizCorrect;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  $("#summary-correct").textContent = correct;
  $("#summary-total").textContent = total;

  let emoji, msg;
  if (pct === 100) { emoji = "🏆"; msg = "Flawless! You're clearly ready for the next level."; }
  else if (pct >= 80) { emoji = "🎉"; msg = "Great work — you've got most of these. Review the tricky ones in your vocabulary list."; }
  else if (pct >= 50) { emoji = "💪"; msg = "Solid effort. A few of these are worth revisiting tomorrow."; }
  else { emoji = "📚"; msg = "Lots of new ground here — perfect material for tomorrow's review."; }
  $("#summary-emoji").textContent = emoji;
  $("#summary-message").textContent = msg;

  setView("summary");
}

/* ───────────────────  learned terms  ─────────────────── */
function findSavedTerm(term, articleId) {
  return state.terms.find(
    (t) => t.term.toLowerCase() === term.toLowerCase() && t.articleId === articleId
  );
}

function upsertLearnedTerm(article, card, correct) {
  let existing = findSavedTerm(card.term, article.id);
  if (!existing) {
    existing = {
      id: uid(),
      term: card.term,
      partOfSpeech: card.partOfSpeech || "",
      definition: card.correctDefinition,
      contextSnippet: card.contextSnippet || "",
      articleId: article.id,
      articleTitle: article.title,
      articleUrl: article.url,
      favorite: false,
      timesSeen: 0,
      timesCorrect: 0,
      mastered: false,
      addedAt: Date.now(),
    };
    state.terms.push(existing);
  }
  existing.timesSeen += 1;
  if (correct) existing.timesCorrect += 1;
  existing.mastered = existing.timesCorrect >= 1;
  saveTerms();
}

function toggleFavoriteCurrent() {
  const article = currentArticle();
  const card = currentCard();
  if (!article || !card) return;
  let t = findSavedTerm(card.term, article.id);
  if (!t) {
    // Favoriting before answering — create a stub.
    t = {
      id: uid(),
      term: card.term,
      partOfSpeech: card.partOfSpeech || "",
      definition: card.correctDefinition,
      contextSnippet: card.contextSnippet || "",
      articleId: article.id,
      articleTitle: article.title,
      articleUrl: article.url,
      favorite: false,
      timesSeen: 0,
      timesCorrect: 0,
      mastered: false,
      addedAt: Date.now(),
    };
    state.terms.push(t);
  }
  t.favorite = !t.favorite;
  saveTerms();
  updateStar(t.favorite);
  toast(t.favorite ? "Added to favorites ⭐" : "Removed from favorites");
}

/* ───────────────────  vocabulary list  ─────────────────── */
function renderVocabulary() {
  const list = $("#vocab-list");
  const empty = $("#vocab-empty");
  list.innerHTML = "";

  let items = [...state.terms];
  if (state.vocabFilter === "favorites") items = items.filter((t) => t.favorite);
  if (state.vocabFilter === "mastered") items = items.filter((t) => t.mastered);
  items.sort((a, b) => b.addedAt - a.addedAt);

  $("#vocab-total").textContent = items.length;

  if (items.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (const t of items) list.appendChild(renderVocabItem(t));
}

function renderVocabItem(term) {
  const li = document.createElement("li");
  li.className = "vocab-item";
  li.innerHTML = `
    <div class="vocab-term-col">
      <div class="vocab-term">
        <span class="vocab-term-text"></span>
        <span class="vocab-badge"></span>
      </div>
      <div class="vocab-def"></div>
    </div>
    ${term.mastered ? '<div class="vocab-mastered" title="Mastered">✓</div>' : ""}
    <div class="vocab-star ${term.favorite ? "active" : ""}">${term.favorite ? "⭐" : "☆"}</div>
  `;
  li.querySelector(".vocab-term-text").textContent = term.term;
  li.querySelector(".vocab-badge").textContent = term.partOfSpeech || "term";
  li.querySelector(".vocab-def").textContent = term.definition;

  li.querySelector(".vocab-star").addEventListener("click", (e) => {
    e.stopPropagation();
    term.favorite = !term.favorite;
    saveTerms();
    renderVocabulary();
  });

  li.addEventListener("click", () => openTermDetail(term));
  return li;
}

function openTermDetail(term) {
  const el = $("#term-detail");
  el.innerHTML = `
    <span class="pos"></span>
    <div class="term"></div>
    <div class="def-block">
      <div class="def-label">Definition</div>
      <div class="def-text"></div>
    </div>
    ${term.contextSnippet ? `
      <div class="def-block">
        <div class="def-label">In context</div>
        <div class="context-text"></div>
      </div>` : ""}
    <div class="def-block">
      <div class="def-label">From</div>
      <div class="def-text"><a href="${term.articleUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--primary)"></a></div>
    </div>
    <div class="def-block">
      <div class="def-label">Stats</div>
      <div class="def-text">Seen ${term.timesSeen} × · ${term.timesCorrect} correct${term.mastered ? " · Mastered ✓" : ""}</div>
    </div>
  `;
  el.querySelector(".pos").textContent = term.partOfSpeech || "term";
  el.querySelector(".term").textContent = term.term;
  el.querySelector(".def-text").textContent = term.definition;
  if (term.contextSnippet) {
    el.querySelector(".context-text").textContent = `"${term.contextSnippet.replace(/___/g, term.term)}"`;
  }
  el.querySelector("a").textContent = term.articleTitle;

  $("#delete-term").onclick = () => {
    state.terms = state.terms.filter((t) => t.id !== term.id);
    saveTerms();
    closeModal("#modal-term");
    renderVocabulary();
    toast("Term removed");
  };

  openModal("#modal-term");
}

/* ───────────────────  wiring  ─────────────────── */
function attachEvents() {
  // Navigation
  document.addEventListener("click", (e) => {
    const navBtn = e.target.closest("[data-nav]");
    if (navBtn) {
      e.preventDefault();
      setView(navBtn.dataset.nav);
    }
    if (e.target.closest("[data-close-modal]")) closeAllModals();
  });

  // Add article
  $("#add-article-trigger").addEventListener("click", () => {
    if (!state.settings.apiKey) {
      toast("Add your Anthropic API key first.");
      openModal("#modal-settings");
      return;
    }
    openModal("#modal-add");
    setTimeout(() => $("#article-url-input").focus(), 80);
  });
  $("#submit-article-btn").addEventListener("click", handleAddArticle);
  $("#article-url-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddArticle();
  });

  // Recent article tile
  $("#recent-article-tile").addEventListener("click", () => {
    const sorted = [...state.articles].sort((a, b) => b.createdAt - a.createdAt);
    if (sorted[0]) startQuiz(sorted[0].id);
    else toast("Add an article to get started.");
  });

  // Settings
  $("#open-settings").addEventListener("click", () => {
    $("#api-key-input").value = state.settings.apiKey || "";
    $("#model-select").value = state.settings.model || "claude-sonnet-4-6";
    openModal("#modal-settings");
  });
  $("#save-settings-btn").addEventListener("click", () => {
    state.settings.apiKey = $("#api-key-input").value.trim();
    state.settings.model = $("#model-select").value;
    saveSettings();
    closeAllModals();
    toast("Settings saved ✨");
  });
  $("#reset-data").addEventListener("click", () => {
    if (!confirm("This will delete all your articles and saved vocabulary. Continue?")) return;
    state.articles = [];
    state.terms = [];
    saveArticles();
    saveTerms();
    closeAllModals();
    setView("home");
    toast("All data cleared.");
  });

  // Quiz
  $("#next-card-btn").addEventListener("click", nextCard);
  $("#favorite-term").addEventListener("click", toggleFavoriteCurrent);

  // Vocabulary filter tabs
  $$(".filter-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".filter-tabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.vocabFilter = tab.dataset.filter;
      renderVocabulary();
    });
  });

  // Escape closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
  });
}

/* ───────────────────  ?quiz= deep-link import  ───────────────────
 * Lets the daily TechCrunch automation (and any other source) drop you
 * straight into a pre-generated quiz. Accepts either a relative path
 * ("quizzes/2026-04-23-foo.json") resolved against the app URL, or an
 * absolute URL.
 */
async function importQuizFromQuery() {
  const params = new URLSearchParams(location.search);
  const quizParam = params.get("quiz");
  if (!quizParam) return false;

  let url;
  try {
    url = new URL(quizParam, location.href).toString();
  } catch {
    toast("That quiz link looks malformed.");
    return false;
  }

  try {
    showLoading("Loading your quiz…", "");
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Couldn't load quiz (${res.status})`);
    const data = await res.json();
    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("That quiz file is empty or malformed.");
    }

    // Clear the param so a refresh doesn't re-import.
    history.replaceState({}, "", location.pathname);

    // Already imported? Just jump into it.
    const existing = state.articles.find((a) => a.url === data.url);
    if (existing) {
      hideLoading();
      toast(`Resuming "${existing.title}"`);
      startQuiz(existing.id);
      return true;
    }

    const article = {
      id: uid(),
      url: data.url || url,
      title: data.title || "Imported quiz",
      level: data.level || "advanced",
      source: data.source || "",
      createdAt: data.createdAt || Date.now(),
      items: data.items.filter(validItem).map((it) => ({
        id: uid(),
        term: it.term,
        partOfSpeech: it.partOfSpeech || "",
        correctDefinition: it.correctDefinition,
        distractorDefinition: it.distractorDefinition,
        contextSnippet: it.contextSnippet || "",
        answered: false,
        lastResult: null,
      })),
    };
    if (article.items.length === 0) throw new Error("No usable items in that quiz.");

    state.articles.push(article);
    saveArticles();
    hideLoading();
    toast(`Quiz "${article.title}" added!`);
    startQuiz(article.id);
    return true;
  } catch (err) {
    hideLoading();
    toast(err.message || "Couldn't load that quiz.");
    console.error(err);
    return false;
  }
}

function init() {
  attachEvents();
  setView("home");

  // Handle ?quiz=… deep links from the TechCrunch automation (or any source).
  if (new URLSearchParams(location.search).has("quiz")) {
    importQuizFromQuery();
    return;
  }

  // First-run hint
  if (!state.settings.apiKey && state.articles.length === 0) {
    setTimeout(() => {
      toast("👋 Welcome! Open settings to add your Anthropic API key.");
    }, 400);
  }
}

document.addEventListener("DOMContentLoaded", init);
