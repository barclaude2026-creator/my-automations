# Webinar Repurposing Machine

Internal tool for Duda's product marketing team. Upload a webinar transcript featuring a Duda customer and instantly generate 4 polished marketing assets — streamed live in parallel.

## Assets Generated

| Card | Asset |
|------|-------|
| 1 | Customer Success Story |
| 2 | Power Quotes |
| 3 | Use Case Slide |
| 4 | Sales Rep Email |

## Setup

1. **Install dependencies**
   ```bash
   cd proof-machine
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your Anthropic API key
   ```

3. **Run in development**
   ```bash
   npm run dev
   ```
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

## Architecture

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **AI**: Anthropic Claude API (claude-sonnet-4-6) via streaming SSE
- **Skills**: Modular prompt files in `/skills`

## Skills System

Each asset maps to a skill file in `/skills/`. Every Claude call prepends `duda-context.md` (foundational Duda knowledge) before the skill-specific instructions.

A speaker detection pre-call identifies the HOST and CUSTOMER from the transcript opening, injecting that context into every asset prompt to ensure correct attribution.

## Test Case

Upload a transcript from a Duda webinar featuring:
- **HOST**: Felix (Duda, Head of AMIA)
- **CUSTOMER**: Tina (COO, Websmart) — migrated 3,000 websites to Duda in 6 months

Expected: All 4 cards generate with Tina's words quoted, Felix never attributed.
