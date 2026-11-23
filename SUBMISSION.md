# FixGuide AI — DoraHacks submission text

**Hackathon:** Even Realities "Heads Up" (Even Realities × TVM Ventures × Daos Hub)
**Track:** 04 — AI Assistants & Work
**Builder:** Emilio Cocho Ramírez (Emilio Tecnologías), Miami, USA
**DoraHacks profile:** https://dorahacks.io/builder/emiliotecnologia

---

## Project name

FixGuide AI

## One-line pitch

The repair guidebook and AI assistant a phone technician can use with both hands inside the phone — step-by-step guides, voice notes, and mid-repair Claude answers, right in the G2 field of view.

## Full description

Phone repair is a two-hands, eyes-on-the-board job. Every time a technician needs the next step, a torque spec, or a diagnosis check, they put down the tweezers, pick up a phone or tablet, unlock it, and scroll — with flux on their fingers. Repair knowledge lives in PDFs, YouTube videos, and forum threads: unusable mid-repair, at the bench, hands busy. The result is slower repairs, skipped safety checks (swollen batteries, wet boards), and knowledge that never reaches the moment of work.

FixGuide AI puts the guidebook and an AI assistant in the technician's field of view on Even Realities G2:

- **Read:** 8 original repair guides (Not Charging, Won't Turn On, Black Screen, Water Damage, Battery Drain, Touch Not Working, Boot Loop, Overheating) — diagnosis first, then procedure, one step per screen with a progress bar, the exact tool for the step, and safety warnings. Tap advances, double-tap goes back, ring scroll browses.
- **Write by voice:** hold to talk — "next", "back", "tools", "note replaced the port", "done" — or ask any repair question mid-job ("current draw is 0.05 amps, what now?"). Questions go to Claude through a small backend (API keys never ship in the app) and come back as short, glanceable, paginated answers formatted for the 576×288 display.
- **Job log:** finished repairs — guide, steps completed, duration, and voice notes — persist via the SDK's local storage and are reviewable on the glasses. The repair documents itself.

The bench is the one workplace where a screen you don't hold wins: hands occupied, eyes on small parts, gloves and flux make touchscreens hostile. G2's monochrome glanceable display + mic + ring is exactly the input/output budget of a repair step: a few words, one action, zero phone pickups. This is "read and write" done right — read the step, act on it, log it — without leaving the work.

## Tech stack

- Even Hub SDK (`@evenrealities/even_hub_sdk`) — native text containers, input events (tap / double-tap / scroll / long-press), microphone PCM capture, local storage, system exit dialog
- Vite + TypeScript (app), zero-dependency Node backend (`server/server.mjs`)
- Claude API (Anthropic) via backend `/api/ask`; Whisper (OpenAI) via backend `/api/transcribe` for G2 mic audio
- Browser-demo fallback: when no Even host is detected, the app emulates the 576×288 glasses display in any browser (on-screen controls, keyboard, Web Speech API, typed commands) — the same code path the demo video was captured from
- Packaged `.ehpk` included in the repo (`fixguide-ai.ehpk`)

## What's real vs. fallback (honest breakdown)

**Real, working today:**
- All 8 guides, step navigation, progress bars, tool callouts, safety warnings
- Voice-command state machine (next / back / tools / note / done / free-form question) — on G2 via mic → backend Whisper; in browser demo via Web Speech API or typed commands through the identical command path
- Job Log persistence (SDK local storage on device; localStorage in demo) — verified across reloads
- Backend Claude integration: with `ANTHROPIC_API_KEY` set, `/api/ask` returns live Claude answers constrained to short glanceable lines
- `.ehpk` packaging for the Even Hub

**Fallbacks, always labeled in-app:**
- Without an API key, `/api/ask` answers from a built-in offline repair knowledge base and says so ("(offline guide answer)" / "(offline mode)") — the demo video shows this honest offline mode because no key was configured during capture
- Without `OPENAI_API_KEY`, `/api/transcribe` returns an honest HTTP 501 ("STT not configured") instead of faking a transcript
- The demo video is captured in browser-demo mode (glasses-display emulation), not on physical G2 hardware — the same screens render natively on G2 through the SDK

## Links

- **GitHub repo:** https://github.com/emiliotecnologias/fixguide-ai
- **Demo video:** `demo-video.mp4` (1:47, in the repo root; captured from the real running app — Home → Not Charging guide → steps → voice note → AI question → JOB DONE → Job Log)
- **Pitch outline:** `PITCH.md` in the repo

## Disclosure (per hackathon rules)

- Built for the Heads Up hackathon. A first scaffold/prototype was prepared 21–22 Nov 2026, before the Nov 23 kickoff; final polish pass completed 22 Nov 2026 (night, pre-kickoff), submission during build week (Nov 23–29). Polish included: browser-demo fallback fix (SDK probe), backend `.env` loading, offline-answer matching, typed-command fallback, and the demo video captured from the real running app in browser-demo mode.
- Pre-existing material: the repair-guide *topics* match the author's own Emilio Tecnologías tutorial catalogue; all guide text in `src/guides.ts` was written originally for this app. No manufacturer schematics, no third-party content.
- Libraries/APIs: `@evenrealities/even_hub_sdk` (MIT), Vite, TypeScript; Claude API (Anthropic) and Whisper (OpenAI) via the backend.
- Solo entry: Emilio Cocho Ramírez (Emilio Tecnologías), Miami, USA.
