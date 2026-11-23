// FixGuide AI — hands-free phone-repair assistant for Even Realities G2.
// Track 04 (AI Assistants & Work): integrates Claude via a small backend.
//
// Glasses UX contract (576x288 monochrome green):
//  - tap (click)        = next step / select
//  - double tap         = back / previous step
//  - scroll (ring)      = move in lists, page long text
//  - long press         = talk (voice command or AI question), release to send

import "./style.css";
import { createBridge, type GlassesBridge, type InputAction } from "./bridge";
import { GUIDES, getGuide, type Guide } from "./guides";

const BACKEND = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "";
const LINE = 42; // chars per line on the G2 display (safe budget)

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function wrap(text: string, width = LINE): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function progressBar(done: number, total: number): string {
  const cells = 10;
  const filled = Math.round((done / total) * cells);
  return "[" + "#".repeat(filled) + "-".repeat(cells - filled) + "]";
}

function paginate(text: string, perPage = 6): string[][] {
  const lines = text
    .split("\n")
    .flatMap((l) => (l.trim() ? wrap(l) : [""]));
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  return pages.length ? pages : [[]];
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

type Screen = "home" | "guide" | "ask" | "answer" | "log" | "done";

interface JobEntry {
  guide: string;
  startedAt: number;
  finishedAt?: number;
  stepsDone: number;
  notes: string[];
}

const state = {
  screen: "home" as Screen,
  menuIndex: 0,
  guide: null as Guide | null,
  step: 0,
  job: null as JobEntry | null,
  answerPages: [] as string[][],
  answerPage: 0,
  lastQuestion: "",
  listening: false,
  busy: false,
};

const MENU: { label: string; guideId?: string; action?: Screen }[] = [
  ...GUIDES.map((g) => ({ label: g.name, guideId: g.id })),
  { label: "Ask AI", action: "ask" as Screen },
  { label: "Job Log", action: "log" as Screen },
];

let bridge: GlassesBridge;

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function homeScreen(): string {
  const perPage = 6;
  const page = Math.floor(state.menuIndex / perPage);
  const items = MENU.slice(page * perPage, page * perPage + perPage);
  const lines = ["FIXGUIDE AI", "Hands-free repair assistant", "------------------------------"];
  items.forEach((item, i) => {
    const idx = page * perPage + i;
    lines.push(`${idx === state.menuIndex ? ">" : " "} ${item.label}`);
  });
  lines.push("", "tap select · scroll move · hold talk");
  return lines.join("\n");
}

function guideScreen(): string {
  const g = state.guide!;
  const s = g.steps[state.step];
  const lines: string[] = [];
  lines.push(`${g.name.toUpperCase()}  Step ${state.step + 1}/${g.steps.length}`);
  lines.push(`${progressBar(state.step + 1, g.steps.length)}  ${s.title}`);
  lines.push(...wrap(s.body).slice(0, 3));
  if (s.tool) lines.push(`TOOL: ${s.tool}`);
  if (s.warn) lines.push(`! ${s.warn}`);
  lines.push("tap next · 2x back · hold ask");
  return lines.join("\n");
}

function askScreen(): string {
  const lines = [
    "ASK AI",
    state.listening ? "Listening... release to send" : "Hold to talk, release to send.",
    "",
    "Try: \"next\"  \"back\"  \"tools\"",
    "\"note <text>\"  \"done\"",
    "or ask any repair question.",
  ];
  if (state.lastQuestion) lines.push("", `Last: "${state.lastQuestion.slice(0, 30)}"`);
  lines.push("2x back to guide");
  return lines.join("\n");
}

function answerScreen(): string {
  const page = state.answerPages[state.answerPage] ?? [];
  const lines = [
    `AI ANSWER  ${state.answerPage + 1}/${state.answerPages.length}`,
    "------------------------------",
    ...page,
    "",
    "scroll read · tap guide · 2x menu",
  ];
  return lines.join("\n");
}

async function logScreen(): Promise<string> {
  const raw = await bridge.storageGet("joblog");
  const log: JobEntry[] = raw ? JSON.parse(raw) : [];
  const lines = ["JOB LOG", "------------------------------"];
  if (!log.length) {
    lines.push("No jobs yet.", "Finish a guide to log it.");
  } else {
    for (const j of log.slice(-5).reverse()) {
      const mins = j.finishedAt ? Math.max(1, Math.round((j.finishedAt - j.startedAt) / 60000)) : 0;
      lines.push(`${j.guide} · ${j.stepsDone} steps · ${mins}min`);
      if (j.notes.length) lines.push(`  note: ${j.notes[j.notes.length - 1].slice(0, 34)}`);
    }
  }
  lines.push("", "2x back to menu");
  return lines.join("\n");
}

function doneScreen(): string {
  const g = state.guide!;
  const mins = state.job?.finishedAt
    ? Math.max(1, Math.round((state.job.finishedAt - state.job.startedAt) / 60000))
    : 0;
  return [
    "JOB DONE",
    "------------------------------",
    `${g.name} complete.`,
    `${g.steps.length} steps · ${mins} min`,
    "",
    "Saved to Job Log.",
    "",
    "tap menu",
  ].join("\n");
}

async function render(): Promise<void> {
  switch (state.screen) {
    case "home":
      return bridge.render(homeScreen());
    case "guide":
      return bridge.render(guideScreen());
    case "ask":
      return bridge.render(askScreen());
    case "answer":
      return bridge.render(answerScreen());
    case "log":
      return bridge.render(await logScreen());
    case "done":
      return bridge.render(doneScreen());
  }
}

// ---------------------------------------------------------------------------
// Job log persistence
// ---------------------------------------------------------------------------

async function saveJob(): Promise<void> {
  if (!state.job) return;
  const raw = await bridge.storageGet("joblog");
  const log: JobEntry[] = raw ? JSON.parse(raw) : [];
  log.push(state.job);
  await bridge.storageSet("joblog", JSON.stringify(log.slice(-20)));
}

// ---------------------------------------------------------------------------
// AI ask (backend -> Claude; offline fallback from guide knowledge)
// ---------------------------------------------------------------------------

// Keyword map per guide (mirrors the backend's offline KB) so questions like
// "what if current draw is zero?" land on the right guide even when the exact
// words differ from the step text.
const GUIDE_KEYWORDS: Record<string, string[]> = {
  "not-charging": ["charge", "charging", "charger", "port", "cable", "current", "draw", "amps", "0a", "zero"],
  "wont-turn-on": ["turn on", "dead", "no power", "power", "won't turn", "wont turn"],
  "black-screen": ["black screen", "dark", "backlight", "display", "screen"],
  "water-damage": ["water", "wet", "liquid", "dropped"],
  "battery-drain": ["drain", "battery life", "dies fast", "battery"],
  "touch-not-working": ["touch", "digitizer", "ghost"],
  "boot-loop": ["loop", "logo", "restart", "stuck"],
  "overheating": ["hot", "overheat", "heat", "warm"],
};

function offlineAnswer(question: string): string {
  const q = question.toLowerCase();
  // Rank guides by keyword hits; the guide the technician is inside wins ties.
  let bestGuide: Guide | null = null;
  let bestGuideScore = 0;
  for (const guide of GUIDES) {
    const keys = GUIDE_KEYWORDS[guide.id] ?? [];
    let score = keys.filter((k) => q.includes(k)).length;
    if (state.guide?.id === guide.id) score += 0.5;
    if (score > bestGuideScore) {
      bestGuideScore = score;
      bestGuide = guide;
    }
  }
  const pool = bestGuide ? [bestGuide] : state.guide ? [state.guide] : GUIDES;
  let bestStep: { title: string; body: string; tool?: string } | null = null;
  let bestStepScore = 0;
  for (const guide of pool) {
    for (const s of guide.steps) {
      const hay = `${s.title} ${s.body} ${s.tool ?? ""}`.toLowerCase();
      const hit = q.split(/\s+/).filter((w) => w.length > 3 && hay.includes(w)).length;
      if (hit > bestStepScore) {
        bestStepScore = hit;
        bestStep = s;
      }
    }
  }
  if (bestStep && (bestGuideScore > 0 || bestStepScore >= 2)) {
    return `${bestStep.title}: ${bestStep.body}${bestStep.tool ? ` Tool: ${bestStep.tool}.` : ""} (offline guide answer)`;
  }
  return "No offline match. Connect the backend (ANTHROPIC_API_KEY) for live Claude answers, or open a guide from the menu. (offline mode)";
}

async function askAI(question: string): Promise<string> {
  try {
    const res = await fetch(`${BACKEND}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        guideId: state.guide?.id ?? null,
        stepIndex: state.guide ? state.step : null,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { answer?: string };
    if (data.answer) return data.answer;
    throw new Error("empty answer");
  } catch {
    return offlineAnswer(question);
  }
}

async function transcribe(pcm: Uint8Array): Promise<string> {
  // Raw PCM (16kHz, 16-bit LE mono) -> backend STT (Whisper) when configured.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < pcm.length; i += chunk) {
    binary += String.fromCharCode(...pcm.subarray(i, i + chunk));
  }
  const res = await fetch(`${BACKEND}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64: btoa(binary), sampleRate: 16000 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

// ---------------------------------------------------------------------------
// Voice commands
// ---------------------------------------------------------------------------

async function handleTranscript(raw: string): Promise<void> {
  const text = raw.trim();
  if (!text) return;
  const t = text.toLowerCase();
  state.lastQuestion = text;

  if (/\b(next|continue|go on)\b/.test(t) && state.screen === "guide") return nextStep();
  if (/\b(back|previous|go back)\b/.test(t)) return goBack();
  if (/\b(done|finish|complete)\b/.test(t) && state.screen === "guide") return finishJob();
  if (/\b(tools?|what tool)\b/.test(t) && state.guide) {
    const s = state.guide.steps[state.step];
    return showAnswer(s.tool ? `For this step: ${s.tool}. Full kit: ${state.guide.tools.join(", ")}.` : `Kit for ${state.guide.name}: ${state.guide.tools.join(", ")}.`);
  }
  if (t.startsWith("note ")) {
    const note = text.slice(5).trim();
    if (state.job && note) state.job.notes.push(note);
    return showAnswer(`Note saved: "${note}"`);
  }
  const question = t.startsWith("ask ") ? text.slice(4) : text;
  state.busy = true;
  await bridge.render("ASK AI\n\nThinking...");
  const answer = await askAI(question);
  state.busy = false;
  return showAnswer(answer);
}

async function showAnswer(answer: string): Promise<void> {
  state.answerPages = paginate(answer);
  state.answerPage = 0;
  state.screen = "answer";
  await render();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

async function startGuide(guideId: string): Promise<void> {
  const g = getGuide(guideId);
  if (!g) return;
  state.guide = g;
  state.step = 0;
  state.job = { guide: g.name, startedAt: Date.now(), stepsDone: 0, notes: [] };
  state.screen = "guide";
  await render();
}

async function nextStep(): Promise<void> {
  if (!state.guide || !state.job) return;
  state.job.stepsDone = Math.max(state.job.stepsDone, state.step + 1);
  if (state.step >= state.guide.steps.length - 1) return finishJob();
  state.step += 1;
  await render();
}

async function finishJob(): Promise<void> {
  if (!state.job) return;
  state.job.finishedAt = Date.now();
  state.job.stepsDone = state.guide?.steps.length ?? state.job.stepsDone;
  await saveJob();
  state.screen = "done";
  await render();
}

async function goBack(): Promise<void> {
  switch (state.screen) {
    case "guide":
      if (state.step > 0) {
        state.step -= 1;
        await render();
      } else {
        state.screen = "home";
        await render();
      }
      break;
    case "ask":
      state.screen = state.guide ? "guide" : "home";
      await render();
      break;
    case "answer":
      state.screen = state.guide ? "guide" : "home";
      await render();
      break;
    case "log":
    case "done":
      state.screen = "home";
      await render();
      break;
    case "home":
      await bridge.shutdown();
      break;
  }
}

async function onInput(action: InputAction): Promise<void> {
  if (state.busy) return;

  if (action === "voiceStart") {
    state.listening = true;
    if (state.screen !== "ask") state.screen = "ask";
    await render();
    await bridge.startMic();
    return;
  }
  if (action === "voiceStop") {
    state.listening = false;
    const pcm = await bridge.stopMic();
    if (bridge.mode === "sdk" && pcm && pcm.length) {
      state.busy = true;
      await bridge.render("ASK AI\n\nTranscribing...");
      try {
        const text = await transcribe(pcm);
        state.busy = false;
        await handleTranscript(text);
      } catch {
        state.busy = false;
        await showAnswer("Could not transcribe. Check the backend STT config, or use tap/scroll to navigate.");
      }
    } else {
      await render(); // demo mode: transcript arrives via onTranscript
    }
    return;
  }

  switch (state.screen) {
    case "home":
      if (action === "scrollDown") state.menuIndex = Math.min(MENU.length - 1, state.menuIndex + 1);
      else if (action === "scrollUp") state.menuIndex = Math.max(0, state.menuIndex - 1);
      else if (action === "next") {
        const item = MENU[state.menuIndex];
        if (item.guideId) return startGuide(item.guideId);
        if (item.action) state.screen = item.action;
      } else if (action === "back") return goBack();
      await render();
      break;

    case "guide":
      if (action === "next") return nextStep();
      if (action === "back") return goBack();
      if (action === "scrollDown") return nextStep();
      if (action === "scrollUp") return goBack();
      break;

    case "ask":
      if (action === "back") return goBack();
      break;

    case "answer":
      if (action === "scrollDown") state.answerPage = Math.min(state.answerPages.length - 1, state.answerPage + 1);
      else if (action === "scrollUp") state.answerPage = Math.max(0, state.answerPage - 1);
      else if (action === "next") {
        state.screen = state.guide ? "guide" : "home";
      } else if (action === "back") return goBack();
      await render();
      break;

    case "log":
      if (action === "back" || action === "next") return goBack();
      break;

    case "done":
      if (action === "next" || action === "back") {
        state.guide = null;
        state.job = null;
        state.screen = "home";
        await render();
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot(): Promise<void> {
  const demoScreenEl = document.getElementById("glasses-screen")!;
  const modeEl = document.getElementById("mode-label");
  bridge = await createBridge(homeScreen(), demoScreenEl);
  if (modeEl) {
    modeEl.textContent =
      bridge.mode === "sdk"
        ? "Connected to Even Hub (simulator / G2)"
        : "Browser demo — glasses display emulation (no Even host detected)";
  }
  bridge.onInput((a) => void onInput(a));
  bridge.onTranscript((t) => void handleTranscript(t));
  await render();
}

void boot();
