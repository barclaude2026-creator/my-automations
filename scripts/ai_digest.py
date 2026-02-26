import feedparser
import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone, timedelta

# --- Config ---
FEEDS = [
    ("TechCrunch", "https://techcrunch.com/feed/"),
    ("Search Engine Journal", "https://www.searchenginejournal.com/feed/"),
    ("Search Engine Land", "https://searchengineland.com/feed"),
]

AI_KEYWORDS = [
    "ai", "artificial intelligence", "machine learning", "chatgpt", "openai",
    "claude", "gemini", "llm", "large language model", "generative ai",
    "deep learning", "neural network", "copilot", "gpt"
]

GMAIL_USER = os.environ["GMAIL_USER"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
EMAIL_TO = os.environ["EMAIL_TO"]

# --- Fetch articles from last 24 hours ---
cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
articles = []

for source_name, url in FEEDS:
    feed = feedparser.parse(url)
    for entry in feed.entries:
        # Parse published date
        published = None
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        
        if published and published < cutoff:
            continue  # Skip old articles

        title = entry.get("title", "")
        summary = entry.get("summary", "")
        link = entry.get("link", "")
        combined = (title + " " + summary).lower()

        if any(kw in combined for kw in AI_KEYWORDS):
            articles.append({
                "source": source_name,
                "title": title,
                "link": link,
                "published": published.strftime("%b %d, %H:%M UTC") if published else "Unknown"
            })

# --- Build email ---
if not articles:
    print("No AI articles found today. No email sent.")
    exit()

html = "<h2>🤖 Daily AI News Digest</h2>"
html += f"<p><i>{len(articles)} articles found — {datetime.now(timezone.utc).strftime('%B %d, %Y')}</i></p><hr>"

# Group by source
for source_name, _ in FEEDS:
    source_articles = [a for a in articles if a["source"] == source_name]
    if not source_articles:
        continue
    html += f"<h3>{source_name}</h3><ul>"
    for a in source_articles:
        html += f'<li><a href="{a["link"]}">{a["title"]}</a> <small style="color:gray">({a["published"]})</small></li>'
    html += "</ul>"

# --- Send email ---
msg = MIMEMultipart("alternative")
msg["Subject"] = f"🤖 AI News Digest — {datetime.now(timezone.utc).strftime('%B %d, %Y')}"
msg["From"] = GMAIL_USER
msg["To"] = EMAIL_TO
msg.attach(MIMEText(html, "html"))

with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
    server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
    server.sendmail(GMAIL_USER, EMAIL_TO, msg.as_string())

print(f"Email sent with {len(articles)} articles!")
