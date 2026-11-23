// FixGuide AI backend — zero-dependency Node server.
//
// Why a backend: the G2 app must never ship API keys. This server holds the
// Claude (and optional Whisper) keys and exposes two endpoints:
//
//   POST /api/ask        { question, guideId, stepIndex } -> { answer }
//   POST /api/transcribe { audioBase64, sampleRate }      -> { text }
//   GET  /api/health     -> { ok, claude, stt }
//
// Without ANTHROPIC_API_KEY, /api/ask answers from the built-in offline
// repair knowledge base (clearly labeled). Without OPENAI_API_KEY,
// /api/transcribe returns 501 — the app then tells the user STT is not
// configured instead of faking a transcript.
//
// Run:  node server/server.mjs        (PORT env, default 8787)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// Zero-dep .env loader: reads server/.env (KEY=VALUE lines) if present.
// Real environment variables always win over the file.
try {
  const envPath = fileURLToPath(new URL(".env", import.meta.url));
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* .env is optional */
}

const PORT = Number(process.env.PORT ?? 8787);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

// --- Offline knowledge base (mirror of the app's guide topics, concise) ----
const KB = [
  { keys: ["charge", "charging", "charger", "port", "cable", "current", "draw", "amps", "0a", "zero"], text: "Not charging: try a known-good cable/brick, measure draw with a USB meter (healthy 0.5A+; 0.00A = no connection — clean the port, check the tongue/pins, then battery voltage 3.7-4.4V). Swollen battery = stop and replace." },
  { keys: ["turn on", "dead", "won't boot", "no power", "power"], text: "Won't turn on: force restart (Power+VolDown 15s), charge 30 min, read current draw. Battery under 3.0V = replace. Boot current pulsing 0.2-1.5A is healthy; instant 2A+ = short." },
  { keys: ["black screen", "dark", "backlight", "display", "screen"], text: "Black screen: flashlight test first — faint image = backlight fault. Force restart, reseat the display flex (battery first), test with a spare screen before condemning the board." },
  { keys: ["water", "wet", "liquid", "dropped in"], text: "Water damage: power OFF immediately, never charge wet. Battery out, dry, scrub board with 99% IPA, inspect for corrosion, check shorts before first power-on with a current-limited supply." },
  { keys: ["drain", "battery life", "dies fast", "battery"], text: "Battery drain: check health (under 80% = replace), find the top background app, standby test in airplane mode (over 3%/h = fault), note heat location — it points to the cause." },
  { keys: ["touch", "digitizer", "ghost"], text: "Touch dead: restart, remove case/protector, draw a full-screen map to find dead bands, reseat the flex (battery first), confirm with a spare screen." },
  { keys: ["loop", "logo", "restart", "stuck"], text: "Boot loop: charge first, wipe cache in recovery, test a known-good battery, reflash stock firmware only with customer OK (data loss), then board-level storage check." },
  { keys: ["hot", "overheat", "heat", "warm"], text: "Overheating: note when it heats, check battery health, find background load, locate the hot spot (top=CPU, center=battery, bottom=charge IC). Swollen battery = replace now." },
];

function offlineAnswer(question) {
  const q = question.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const entry of KB) {
    const score = entry.keys.filter((k) => q.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (best) return `${best.text} (offline guide answer)`;
  return "No offline match for that. Open the matching guide from the menu, or configure ANTHROPIC_API_KEY on the backend for live Claude answers. (offline mode)";
}

const SYSTEM_PROMPT = `You are FixGuide AI, a phone-repair assistant answering on Even Realities G2 smart glasses (576x288 monochrome display).
Rules:
- Answer in at most 6 short lines, each under 40 characters where possible. Plain text only, no markdown.
- Be concrete: exact checks, values (voltages, currents), tools, and safety warnings.
- If the technician is mid-guide, answer for the current step first.
- Never invent board-level component designations you are unsure of; say what to measure instead.
- Safety first: swollen batteries, shorts, and water damage get explicit warnings.`;

async function askClaude(question, guideId, stepIndex) {
  const context = guideId
    ? `\n\nContext: technician is in guide "${guideId}", step ${(stepIndex ?? 0) + 1}.`
    : "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: question + context }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("empty Claude response");
  return text.trim();
}

async function transcribeWhisper(audioBase64, sampleRate) {
  const pcm = Buffer.from(audioBase64, "base64");
  // Wrap raw PCM (16-bit LE mono) in a WAV container for Whisper.
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);

  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "voice.wav");
  form.append("model", "whisper-1");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper HTTP ${res.status}`);
  const data = await res.json();
  return data.text ?? "";
}

// --- HTTP plumbing ----------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

async function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const safe = normalize(join(ROOT, "dist", rel));
  if (!safe.startsWith(join(ROOT, "dist"))) return sendJson(res, 403, { error: "forbidden" });
  try {
    const data = await readFile(safe);
    res.writeHead(200, { "Content-Type": MIME[extname(safe)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "not found (run `npm run build` for static demo, or use `npm run dev`)" });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (req.method === "OPTIONS") return sendJson(res, 204, {});
    if (url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, claude: Boolean(ANTHROPIC_API_KEY), stt: Boolean(OPENAI_API_KEY) });
    }
    if (url.pathname === "/api/ask" && req.method === "POST") {
      const { question, guideId, stepIndex } = await readJson(req);
      if (!question) return sendJson(res, 400, { error: "question required" });
      if (ANTHROPIC_API_KEY) {
        try {
          return sendJson(res, 200, { answer: await askClaude(question, guideId, stepIndex), source: "claude" });
        } catch (err) {
          console.error("Claude failed, falling back offline:", err.message);
        }
      }
      return sendJson(res, 200, { answer: offlineAnswer(question), source: "offline" });
    }
    if (url.pathname === "/api/transcribe" && req.method === "POST") {
      const { audioBase64, sampleRate } = await readJson(req);
      if (!audioBase64) return sendJson(res, 400, { error: "audioBase64 required" });
      if (!OPENAI_API_KEY) {
        return sendJson(res, 501, { error: "STT not configured: set OPENAI_API_KEY (Whisper) on the backend" });
      }
      return sendJson(res, 200, { text: await transcribeWhisper(audioBase64, sampleRate ?? 16000) });
    }
    if (req.method === "GET") return serveStatic(req, res, url.pathname);
    return sendJson(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: String(err.message ?? err) });
  }
});

server.listen(PORT, () => {
  console.log(`FixGuide AI backend on http://localhost:${PORT}`);
  console.log(`Claude: ${ANTHROPIC_API_KEY ? "configured" : "OFF (offline KB answers)"} · STT: ${OPENAI_API_KEY ? "configured" : "OFF"}`);
});
