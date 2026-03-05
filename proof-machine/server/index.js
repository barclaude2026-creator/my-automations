require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt, SKILLS } = require('./skills');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());

// Detect speakers from the transcript
async function detectSpeakers(transcriptExcerpt) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system:
        'Read the opening of this transcript and identify the HOST (Duda employee/interviewer) and the CUSTOMER (featured guest). Return only JSON: {"host": {"name": "", "role": ""}, "customer": {"name": "", "role": "", "company": ""}}',
      messages: [{ role: 'user', content: transcriptExcerpt }],
    });
    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('Speaker detection failed:', err.message);
  }
  return null;
}

function buildSpeakerInjection(speakers) {
  if (!speakers) return '';
  const { host, customer } = speakers;
  const hostName = host?.name || 'The Host';
  const hostRole = host?.role || 'Duda employee';
  const customerName = customer?.name || 'The Customer';
  const customerRole = customer?.role || 'Guest';
  const customerCompany = customer?.company || '';
  return `\n\nSPEAKER IDENTIFICATION: In this transcript, ${hostName} is the HOST (${hostRole} — do not quote them or attribute outcomes to them). ${customerName} is the CUSTOMER (${customerRole}${customerCompany ? ', ' + customerCompany : ''}) — they are the subject of all assets.\n`;
}

// SSE endpoint — generates all 4 assets in parallel
app.post('/api/generate', upload.single('transcript'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No transcript file uploaded' });
  }

  const transcript = req.file.buffer.toString('utf-8');

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function sendEvent(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  try {
    // Speaker detection pre-call
    const excerpt = transcript.slice(0, 600);
    const speakers = await detectSpeakers(excerpt);
    const speakerInjection = buildSpeakerInjection(speakers);

    sendEvent({ type: 'speakers', data: speakers });

    // Fire all 4 skill streams in parallel
    const skillEntries = Object.entries(SKILLS);

    await Promise.all(
      skillEntries.map(async ([skillId, skillMeta]) => {
        const startTime = Date.now();
        sendEvent({ type: 'status', skillId, status: 'generating' });

        try {
          const systemPrompt = buildSystemPrompt(skillMeta.file) + speakerInjection;

          const stream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: `Here is the webinar transcript:\n\n${transcript}`,
              },
            ],
          });

          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              sendEvent({
                type: 'delta',
                skillId,
                text: event.delta.text,
              });
            }
          }

          const elapsed = Math.round((Date.now() - startTime) / 1000);
          sendEvent({ type: 'status', skillId, status: 'done', elapsed });
        } catch (err) {
          console.error(`Error generating ${skillId}:`, err.message);
          sendEvent({ type: 'status', skillId, status: 'error', error: err.message });
        }
      })
    );
  } catch (err) {
    console.error('Generation error:', err.message);
    sendEvent({ type: 'error', message: err.message });
  }

  sendEvent({ type: 'done' });
  res.end();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proof Machine server running on http://localhost:${PORT}`);
});
