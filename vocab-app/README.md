# Lingua — Learn English Vocabulary From Articles

A friendly, self-contained web app that turns any article URL into an adaptive
vocabulary quiz. Built for advanced English learners who want to grow their
vocabulary from content they actually care about.

![style reference](./../) <!-- the reference design lives in the conversation, not in the repo -->

## How it works

1. **Paste an article URL** (e.g. an HBR post, a blog, a news article).
2. The app fetches the article via [Jina Reader](https://jina.ai/reader) — a
   free endpoint that returns clean text from any web page, CORS-friendly.
3. **Claude** picks 8–16 sophisticated vocabulary items from the article and
   writes, for each one, a correct definition + a plausible-but-wrong
   distractor.
4. You flip through the flashcards and pick the correct meaning. Terms you
   answer are automatically saved to **My Vocabulary**. Star the ones you want
   to revisit.

Everything is stored in your browser (`localStorage`). No server, no account.

## Run it

It's a static site — open `index.html` in a browser and go.

```bash
# Option A: just open the file
open vocab-app/index.html

# Option B: any tiny static server, if your browser blocks local fetches
cd vocab-app && python3 -m http.server 8080
# then open http://localhost:8080
```

You can also publish the `vocab-app/` folder to GitHub Pages and use it from
your phone.

## Setup (one-time)

1. Click the ⚙️ icon (top right of the home screen).
2. Paste your Anthropic API key (get one at
   [console.anthropic.com](https://console.anthropic.com)).
3. Pick a model. **Sonnet 4.6** is the recommended default — it produces
   excellent quizzes cheaply and quickly. Use **Opus 4.7** for the best
   distractors on dense articles. **Haiku 4.5** is the fastest and cheapest.

Your key is stored only in `localStorage` on your device, and is sent directly
to the Anthropic API from the browser (`anthropic-dangerous-direct-browser-access`
header). Nothing goes anywhere else.

## Files

- `index.html` — app shell with 4 views (home, quiz, vocabulary, summary) and
  3 modals (add article, settings, term detail)
- `styles.css` — purple/pink friendly theme, card-based layout, mobile-first
- `app.js` — state + localStorage, article fetching, Claude API call, quiz
  logic, vocabulary list + filters

## Adaptivity

On the "Add article" screen you pick your level:

- **Intermediate (B1–B2)** — Claude skews toward less common everyday words
- **Advanced (C1)** (default) — sophisticated register, collocations, idioms
- **Proficient (C2)** — near-native range, unusual or domain-specific terms

The prompt also tells Claude to avoid overly common words, which means even at
Intermediate you'll get useful terms rather than "customer" or "people".

## Daily TechCrunch automation

A GitHub Action runs `scripts/techcrunch_quiz.py` once a day, picks up to 3
new TechCrunch articles whose titles contain "AI", generates a vocabulary quiz
for each via Claude, commits the resulting JSON to `vocab-app/quizzes/`, and
emails you a "Start quiz" link per article. Clicking the link opens the app
with `?quiz=<path>`, which auto-imports the quiz and drops you into the
flashcards.

### One-time setup

1. **Add a repo secret** at *Settings → Secrets and variables → Actions →
   New repository secret*:
   - `ANTHROPIC_API_KEY` — your Claude key (the GMAIL_USER / GMAIL_APP_PASSWORD
     / EMAIL_TO secrets from the existing daily digest are reused).
2. *(Optional)* **Add a repo variable** (same screen → Variables tab):
   - `APP_URL` — where you've hosted the app (rawgithack URL or, ideally, a
     GitHub Pages URL like `https://barclaude2026-creator.github.io/my-automations/vocab-app/`).
     Defaults to the rawgithack URL on the feature branch.
3. **Make sure the repo is public** (or has GitHub Pages enabled on a paid
   plan) so the app can fetch quiz JSON from `vocab-app/quizzes/` at runtime.

### Schedule

`.github/workflows/techcrunch-quiz.yml` runs at **08:30 UTC daily**. To run
it manually: *Actions → Daily TechCrunch AI Vocab Quiz → Run workflow*.

### How "new" is tracked

The script keeps a list of already-processed URLs in
`vocab-app/quizzes/seen.json` and a list of available quizzes in
`vocab-app/quizzes/index.json`. Both are committed back to the repo on each
successful run.

### Direct-import format

The app accepts `?quiz=<url-or-relative-path>`. The JSON shape is:

```jsonc
{
  "url": "https://techcrunch.com/...",
  "title": "Article title",
  "level": "advanced",
  "source": "TechCrunch",
  "createdAt": 1735000000000,
  "items": [
    {
      "term": "perseverance",
      "partOfSpeech": "noun",
      "correctDefinition": "...",
      "distractorDefinition": "...",
      "contextSnippet": "she showed remarkable ___ in the face of setbacks"
    }
  ]
}
```

You can hand-author quiz files or generate them from any other source.

## Local storage schema

The app writes to `lingua.articles.v1` in `localStorage`:

```jsonc
// localStorage key: "lingua.articles.v1"
[
  {
    "id": "...",
    "url": "...",
    "title": "...",
    "level": "advanced",
    "createdAt": 1735000000000,
    "items": [
      {
        "id": "...",
        "term": "curbside",
        "partOfSpeech": "adjective",
        "correctDefinition": "located or happening at the edge of a street...",
        "distractorDefinition": "...",
        "contextSnippet": "offering ___ pickup for online orders",
        "answered": false,
        "lastResult": null
      }
    ]
  }
]
```

## Files

- `index.html` / `styles.css` / `app.js` — the static web app
- `quizzes/` — pre-generated quizzes (created by the daily automation)
- `../scripts/techcrunch_quiz.py` — the automation script
- `../.github/workflows/techcrunch-quiz.yml` — the daily schedule

## Troubleshooting

- **"Couldn't fetch the article"** — some sites block Jina Reader. Paste the
  article text into a pastebin or try a different source.
- **"Your API key looks invalid"** — re-check the key in Settings.
- **Rate limited** — wait a minute and retry.
