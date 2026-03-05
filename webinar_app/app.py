from flask import Flask, render_template, request, jsonify
import anthropic
from concurrent.futures import ThreadPoolExecutor, as_completed
import os

app = Flask(__name__)
client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from environment

SKILLS = {
    "sales-email-writer": {
        "title": "Sales Email",
        "icon": "✉️",
        "system": """You are an expert sales copywriter. Write a compelling, personalized sales email based on insights from a webinar transcript.

The email should:
- Have a powerful subject line (write it at the top as "Subject: ...")
- Open with a hook that references a key insight from the webinar
- Clearly articulate the value proposition
- Include a specific call-to-action
- Be concise (250–350 words max)
- Feel warm and human, not pushy

Format: subject line first, then the email body.""",
        "prompt": "Based on this webinar transcript, write a high-converting sales email:\n\n{transcript}",
    },
    "power-quotes-identifier": {
        "title": "Power Quotes",
        "icon": "💬",
        "system": """You are an expert content curator who identifies the most powerful, shareable quotes from webinar content.

Extract the top 5–7 quotes that are:
- Memorable and punchy
- Contain a strong insight or fresh perspective
- Self-contained (make sense without extra context)
- Ideal for LinkedIn or social media

For each quote provide:
1. The quote in quotation marks
2. A one-sentence note on why it's powerful
3. 1–2 suggested hashtags""",
        "prompt": "Extract the most powerful, shareable quotes from this webinar transcript:\n\n{transcript}",
    },
    "use-case-slide-writer": {
        "title": "Use Case Slides",
        "icon": "📊",
        "system": """You are an expert presentation designer. Identify use cases from a webinar transcript and write compelling slide content.

For each use case you identify (aim for 2–4), write:
- A bold slide headline (the "so what")
- 3–4 bullet points that tell the story
- A "Bottom Line" callout with a key stat or insight

Format it as slide-ready content a designer could use immediately.""",
        "prompt": "Based on this webinar transcript, write compelling use case slide content:\n\n{transcript}",
    },
    "success-story-writer": {
        "title": "Success Story",
        "icon": "🏆",
        "system": """You are an expert case study writer. Craft a compelling success story narrative from webinar content.

Follow this structure:
1. **The Challenge** – What problem was being faced?
2. **The Solution** – What approach was taken?
3. **The Results** – What outcomes were achieved? (use specific numbers/metrics if available)
4. **The Lesson** – What's the key takeaway?

Write 300–450 words in a compelling narrative style suitable for a case study or testimonial asset.""",
        "prompt": "Based on this webinar transcript, write a compelling success story:\n\n{transcript}",
    },
}


def run_skill(skill_id, skill, transcript):
    try:
        with client.messages.stream(
            model="claude-opus-4-6",
            max_tokens=2048,
            system=skill["system"],
            messages=[
                {
                    "role": "user",
                    "content": skill["prompt"].format(transcript=transcript),
                }
            ],
        ) as stream:
            text = stream.get_final_message().content[0].text
            return skill_id, text, None
    except Exception as e:
        return skill_id, None, str(e)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/generate", methods=["POST"])
def generate():
    data = request.get_json()
    transcript = data.get("transcript", "").strip()

    if not transcript:
        return jsonify({"error": "Please paste a transcript before generating."}), 400

    results = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(run_skill, skill_id, skill, transcript): skill_id
            for skill_id, skill in SKILLS.items()
        }
        for future in as_completed(futures):
            skill_id, text, error = future.result()
            results[skill_id] = text if text else f"Error: {error}"

    return jsonify({"results": results})


if __name__ == "__main__":
    print("\n🎙️  Webinar Repurposing Machine")
    print("=" * 40)
    print("➜  Local URL: http://localhost:5000")
    print("   Press Ctrl+C to stop\n")
    app.run(debug=False, port=5000)
