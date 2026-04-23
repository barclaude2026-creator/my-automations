#!/usr/bin/env python3
"""Daily TechCrunch AI vocabulary quiz generator.

Polls the TechCrunch RSS feed, picks new articles whose titles contain "AI",
generates an advanced (C1) vocabulary quiz for each via the Claude API,
commits the quiz JSON to vocab-app/quizzes/, and emails the user a link
that opens each quiz directly in the Lingua web app.
"""

import json
import os
import re
import smtplib
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import feedparser
from anthropic import Anthropic

# ── config ──────────────────────────────────────────────────────────────────
FEED_URL = "https://techcrunch.com/feed/"
MAX_PER_RUN = 3
LEVEL = "advanced"
ITEM_COUNT = 12
MODEL = "claude-sonnet-4-6"

QUIZZES_DIR = Path("vocab-app/quizzes")
SEEN_FILE = QUIZZES_DIR / "seen.json"
INDEX_FILE = QUIZZES_DIR / "index.json"

DEFAULT_APP_URL = (
    "https://raw.githack.com/barclaude2026-creator/my-automations/"
    "claude/vocabulary-learning-app-oOEfk/vocab-app/index.html"
)
APP_URL = os.environ.get("APP_URL", DEFAULT_APP_URL)

# Match the standalone token "AI" or "A.I." (case-sensitive — "AI" the
# acronym, not the substring inside words like "said" or "main").
AI_PATTERN = re.compile(r"\bA\.?I\.?\b")

# ── secrets ─────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
GMAIL_USER = os.environ["GMAIL_USER"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
EMAIL_TO = os.environ["EMAIL_TO"]


# ── helpers ────────────────────────────────────────────────────────────────
def slugify(value: str, max_len: int = 60) -> str:
    value = re.sub(r"[^\w\s-]", "", value.lower())
    value = re.sub(r"[\s_-]+", "-", value).strip("-")
    return value[:max_len] or "article"


def load_json(path: Path, fallback):
    if path.exists():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            return fallback
    return fallback


def fetch_article(url: str) -> str:
    reader_url = "https://r.jina.ai/" + url
    req = urllib.request.Request(reader_url, headers={"Accept": "text/plain"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_reader(text: str) -> tuple[str, str]:
    title_m = re.search(r"^Title:\s*(.+)$", text, re.MULTILINE)
    idx = text.find("Markdown Content:")
    body = text[idx + len("Markdown Content:") :].strip() if idx >= 0 else text
    title = title_m.group(1).strip() if title_m else "Untitled"
    # Cap body length so the prompt stays modest in size.
    return title, body[:14000]


PROMPT_TMPL = """You are building a vocabulary-learning quiz for an English learner at advanced (C1) level.

Pick {count} sophisticated, useful vocabulary items from the article below. Favor terms the learner likely does NOT already know at their level: precise verbs, abstract nouns, idiomatic phrases, collocations, and domain-specific words. AVOID very common words. If the article is technical, include 2-3 domain terms (e.g. AI/ML jargon).

For each item, produce:
- "term": the exact surface form as it appears in the article (lowercase unless a proper noun). May be a multi-word phrase or collocation.
- "partOfSpeech": one of noun | verb | adjective | adverb | phrase | idiom.
- "correctDefinition": a concise English definition (12-22 words) that fits the sense used in the article.
- "distractorDefinition": a plausible but INCORRECT definition of similar length. It should be believable - e.g. the meaning of a similar-looking word, a near-synonym that's actually wrong in this context, or a common misconception. Never trivially silly.
- "contextSnippet": a short excerpt (max ~18 words) from the article showing the term in use. Replace the term itself with "___" so the quiz doesn't give away the answer.

Return ONLY valid JSON, no prose, no markdown fences:
{{"items":[{{"term":"...","partOfSpeech":"...","correctDefinition":"...","distractorDefinition":"...","contextSnippet":"..."}}]}}

Article title: {title}

Article:
{body}"""


def extract_json(text: str) -> dict:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip code fences if Claude added them anyway.
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fence:
        try:
            return json.loads(fence.group(1).strip())
        except json.JSONDecodeError:
            pass
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])
    raise RuntimeError("Couldn't parse JSON from Claude")


def generate_quiz(client: Anthropic, title: str, body: str) -> list[dict]:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": PROMPT_TMPL.format(count=ITEM_COUNT, title=title, body=body),
            }
        ],
    )
    text = "".join(getattr(b, "text", "") for b in msg.content)
    data = extract_json(text)
    items = [
        i
        for i in data.get("items", [])
        if isinstance(i, dict)
        and i.get("term")
        and i.get("correctDefinition")
        and i.get("distractorDefinition")
    ]
    if not items:
        raise RuntimeError("Claude returned no usable items")
    return items


def write_quiz(article_url: str, title: str, items: list[dict]) -> tuple[str, dict]:
    QUIZZES_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = slugify(title)
    filename = f"{today}-{slug}.json"
    payload = {
        "url": article_url,
        "title": title,
        "level": LEVEL,
        "source": "TechCrunch",
        "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        "items": items,
    }
    (QUIZZES_DIR / filename).write_text(
        json.dumps(payload, indent=2, ensure_ascii=False)
    )
    return filename, payload


def quiz_link(filename: str) -> str:
    rel = f"quizzes/{filename}"
    sep = "&" if "?" in APP_URL else "?"
    return f"{APP_URL}{sep}quiz={urllib.parse.quote(rel)}"


def send_email(quizzes: list[dict]) -> None:
    today = datetime.now(timezone.utc).strftime("%B %d, %Y")
    plural = "es" if len(quizzes) != 1 else ""

    html = f"""\
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1b1233;">
  <h2 style="color: #6a3de0;">📚 New AI vocabulary quiz{plural}</h2>
  <p style="color: #6b6284; font-size: 14px;">{today} · {len(quizzes)} quiz{plural} from TechCrunch</p>
"""
    for q in quizzes:
        link = quiz_link(q["filename"])
        terms_preview = ", ".join(t["term"] for t in q["items"][:5])
        if len(q["items"]) > 5:
            terms_preview += ", …"
        html += f"""\
  <div style="background:#f6f2ff; border-radius:14px; padding:18px; margin:14px 0;">
    <h3 style="margin:0 0 6px; font-size:16px;">{q['title']}</h3>
    <p style="margin:0 0 10px; color:#7a6f96; font-size:13px;">{len(q['items'])} terms · {terms_preview}</p>
    <a href="{link}" style="display:inline-block; background:linear-gradient(135deg,#6a3de0,#8f5fff); color:white; text-decoration:none; padding:10px 18px; border-radius:10px; font-weight:600; font-size:14px;">Start quiz →</a>
    &nbsp;<a href="{q['url']}" style="color:#6a3de0; font-size:13px;">read article</a>
  </div>
"""
    html += "</div>"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"📚 {len(quizzes)} new AI vocab quiz{plural} — {today}"
    msg["From"] = GMAIL_USER
    msg["To"] = EMAIL_TO
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.sendmail(GMAIL_USER, EMAIL_TO, msg.as_string())


# ── main ────────────────────────────────────────────────────────────────────
def main() -> int:
    seen = set(load_json(SEEN_FILE, []))
    index = load_json(INDEX_FILE, [])

    feed = feedparser.parse(FEED_URL)
    candidates: list[tuple[str, str]] = []
    for entry in feed.entries:
        title = (entry.get("title") or "").strip()
        link = (entry.get("link") or "").strip()
        if not link or link in seen:
            continue
        if not AI_PATTERN.search(title):
            continue
        candidates.append((title, link))

    candidates = candidates[:MAX_PER_RUN]
    if not candidates:
        print("No new TechCrunch articles with 'AI' in the title.")
        return 0

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    new_quizzes: list[dict] = []

    for title, link in candidates:
        print(f"→ {title}")
        try:
            raw = fetch_article(link)
            parsed_title, body = parse_reader(raw)
            items = generate_quiz(client, parsed_title or title, body)
            filename, payload = write_quiz(link, parsed_title or title, items)
            new_quizzes.append(
                {
                    "filename": filename,
                    "title": payload["title"],
                    "url": link,
                    "items": items,
                }
            )
            index.append(
                {
                    "filename": filename,
                    "title": payload["title"],
                    "url": link,
                    "createdAt": payload["createdAt"],
                    "source": "TechCrunch",
                }
            )
            seen.add(link)
            print(f"  ✓ wrote {filename} ({len(items)} terms)")
        except Exception as exc:
            print(f"  ! failed: {exc}", file=sys.stderr)

    if not new_quizzes:
        print("No quizzes were generated this run.")
        return 0

    QUIZZES_DIR.mkdir(parents=True, exist_ok=True)
    SEEN_FILE.write_text(json.dumps(sorted(seen), indent=2))
    INDEX_FILE.write_text(json.dumps(index, indent=2))

    send_email(new_quizzes)
    print(f"Done — {len(new_quizzes)} quiz(es) created and emailed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
