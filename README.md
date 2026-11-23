# FixGuide AI — hands-free repair assistant for Even Realities G2

**Heads Up Hackathon (Even Realities × TVM Ventures × Daos Hub) — Track 04: AI Assistants & Work**

FixGuide AI puts a phone-repair technician's guidebook and AI assistant in their
field of view. While both hands are inside a phone, the glasses show one repair
step at a time — diagnosis checks, the exact tool, safety warnings — and the
technician advances by tap, ring scroll, or voice. Mid-repair questions go to
**Claude** (a Track 04 listed app) through a small backend and come back as
short, glanceable answers. Voice notes and completed jobs are logged on-device.

## What it does (read *and* write)

- **Read:** 8 original repair guides (Not Charging, Won't Turn On, Black Screen,
  Water Damage, Battery Drain, Touch Not Working, Boot Loop, Overheating) —
  diagnosis first, then procedure, one step per screen with progress bar,
  tool callouts and safety warnings.
- **Write by voice:** hold to talk — "next", "back", "tools", "note replaced
  the port", "done" — or ask any repair question ("current draw is 0.05 amps,
  what now?"). Answers are formatted for the 576×288 display and paginated.
- **Job log:** finished repairs (steps, duration, voice notes) persist via the
  SDK's local storage and are reviewable on the glasses.

## Architecture

```
G2 glasses ──BLE── Even App (WebView) ── Even Hub SDK ── this app (Vite + TS)
                                                              │ fetch (whitelisted in app.json)
                                                              ▼
                                              backend (server/server.mjs, Node, zero deps)
                                                ├─ POST /api/ask        → Claude API (key server-side)
                                                └─ POST /api/transcribe → Whisper (PCM 16kHz from G2 mic)
```

- `src/bridge.ts` — one interface over two transports: the real Even Hub SDK
  (simulator/hardware) and a browser fallback that emulates the 576×288 green
  display, so the app is demoable anywhere.
- `src/main.ts` — state machine + screen formatting (≤42 chars/line, ≤9 lines).
- `src/guides.ts` — original guide content (no manufacturer material).
- `server/server.mjs` — Claude proxy + speech-to-text + static demo hosting.
  **No API keys ever ship in the app.** Without keys it answers from an
  offline knowledge base and says so; STT returns an honest 501.

Input mapping: tap = next/select · double-tap = back · scroll = move/page ·
long-press = talk (release to send). Exit uses `shutDownPageContainer(1)`
(system dialog, per QA rules).

## Setup

Requirements: Node.js ≥ 20.

```bash
npm install

# Terminal 1 — backend (optional but recommended for live Claude answers)
cp server/.env.example server/.env   # add ANTHROPIC_API_KEY (+ OPENAI_API_KEY for STT)
npm run server                        # http://localhost:8787

# Terminal 2 — app dev server
npm run dev                           # http://localhost:5173
```

### Run in the Even Hub simulator (official path)

```bash
npm install -g @evenrealities/evenhub-simulator   # or use the devDependency
npm run sim                                        # evenhub-simulator http://localhost:5173
```

The simulator window shows the 576×288 canvas; click = tap, double-click =
double-tap. Point it at the Vite dev URL.

### Run on real G2 hardware

```bash
evenhub qr --url "http://<YOUR-LAN-IP>:5173"
```

Scan the QR from the Even Realities App (developer mode) — the app loads on
the glasses with hot-reload.

### Browser demo (no simulator)

Open http://localhost:5173 in any browser. With no Even host detected, the app
renders the glasses-display emulation with on-screen controls, keyboard input
(Enter/→ next, ← back, ↑↓ scroll, hold Space to talk), Web Speech API voice
input where available (Chrome), and a typed-command box that feeds the same
voice-command path when there is no microphone.

### Package (.ehpk)

```bash
npm run build
npx evenhub pack app.json dist     # -> out.ehpk
```

Before packaging for real hardware, replace the placeholder backend URL in
`app.json` (`network` whitelist) with your deployed backend and set
`VITE_BACKEND_URL` at build time.

## Demo flow (≤3 min video script)

1. Home menu → scroll to **Not Charging** → tap.
2. Step through 3 steps with taps (progress bar, TOOL line, safety warning).
3. Long-press: "note port was full of lint" → note saved.
4. Long-press: "what if current draw is zero?" → Claude answer, scroll to read.
5. Finish the guide → **JOB DONE** → Job Log shows the entry.

## Disclosure (per hackathon rules)

- Built for the Heads Up hackathon. A first scaffold/prototype was prepared
  21–22 Nov 2026, before the Nov 23 kickoff; final polish pass completed
  22 Nov 2026 (night, pre-kickoff), submission during build week (Nov 23–29).
  Polish included: browser-demo fallback fix (SDK probe), backend `.env`
  loading, offline-answer matching, typed-command fallback, and a demo video
  (`demo-video.mp4`, 1:47) captured from the real running app in
  browser-demo mode.
- Pre-existing material: the repair-guide *topics* match the author's own
  Emilio Tecnologías tutorial catalogue; all guide text in `src/guides.ts`
  was written originally for this app. No manufacturer schematics, no
  third-party content.
- Libraries/APIs: `@evenrealities/even_hub_sdk` (MIT), Vite, TypeScript;
  Claude API (Anthropic) and Whisper (OpenAI) via the backend.
- Solo entry: Emilio Cocho Ramírez (Emilio Tecnologías), Miami, USA.

## License

MIT — see `LICENSE`.
