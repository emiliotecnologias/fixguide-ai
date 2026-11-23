// FixGuide AI — glasses bridge abstraction.
//
// One interface, two implementations:
//  1. SdkBridge  — real Even Hub SDK (simulator or G2 hardware).
//  2. DemoBridge — plain-browser fallback that emulates the 576x288 green
//     display so the app can be demoed/tested without the simulator.
//
// The app logic only ever talks to this interface.

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
  CreateStartUpPageContainer,
  OsEventTypeList,
  type EvenAppBridge,
} from "@evenrealities/even_hub_sdk";

export type InputAction =
  | "next" // tap / click
  | "back" // double tap
  | "scrollUp"
  | "scrollDown"
  | "voiceStart" // long press
  | "voiceStop"; // long press release

export interface GlassesBridge {
  mode: "sdk" | "demo";
  /** Render a full screen of pre-formatted text (<= ~9 lines, <= ~42 chars/line). */
  render(text: string): Promise<void>;
  onInput(cb: (action: InputAction) => void): void;
  /** Start microphone capture (PCM 16kHz 16-bit mono on SDK; Web Speech in demo). */
  startMic(): Promise<void>;
  /** Stop capture. SDK: returns raw PCM bytes. Demo: returns null (transcript comes via onTranscript). */
  stopMic(): Promise<Uint8Array | null>;
  /** Demo mode only: browser speech-recognition transcript callback. */
  onTranscript(cb: (text: string) => void): void;
  storageGet(key: string): Promise<string>;
  storageSet(key: string, value: string): Promise<void>;
  shutdown(): Promise<void>;
}

const CONTAINER_ID = 1;
const CONTAINER_NAME = "main";

// ---------------------------------------------------------------------------
// SDK implementation
// ---------------------------------------------------------------------------

class SdkBridge implements GlassesBridge {
  mode = "sdk" as const;
  private bridge: EvenAppBridge;
  private inputCb: ((a: InputAction) => void) | null = null;
  private pcmChunks: Uint8Array[] = [];
  private micOn = false;

  constructor(bridge: EvenAppBridge) {
    this.bridge = bridge;
  }

  /** Returns false when the "bridge" is not a working Even host (e.g. the SDK
   *  resolves in a plain browser but container creation fails) — the caller
   *  then falls back to the browser demo instead of a dead Loading screen. */
  async init(firstScreen: string): Promise<boolean> {
    const mainText = new TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 6,
      containerID: CONTAINER_ID,
      containerName: CONTAINER_NAME,
      content: firstScreen,
      isEventCapture: 1,
    });
    const result = await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [mainText],
      }),
    );
    if (result !== 0) {
      console.error("createStartUpPageContainer failed:", result);
      return false;
    }

    this.bridge.onEvenHubEvent((event) => {
      // (registered only after a successful container creation)
      // Audio frames while the mic is open.
      if (event.audioEvent && this.micOn) {
        const pcm = event.audioEvent.audioPcm;
        if (pcm && pcm.length) this.pcmChunks.push(pcm);
        return;
      }
      // Input can arrive on textEvent (container) or sysEvent (long press etc.).
      const t = event.textEvent?.eventType ?? event.sysEvent?.eventType;
      if (t === undefined && !event.textEvent && !event.sysEvent) return;
      // The SDK sometimes normalizes CLICK_EVENT (0) to undefined on textEvent.
      if (event.textEvent && (t === undefined || t === OsEventTypeList.CLICK_EVENT)) {
        this.inputCb?.("next");
        return;
      }
      switch (t) {
        case OsEventTypeList.CLICK_EVENT:
          this.inputCb?.("next");
          break;
        case OsEventTypeList.DOUBLE_CLICK_EVENT:
          this.inputCb?.("back");
          break;
        case OsEventTypeList.SCROLL_TOP_EVENT:
          this.inputCb?.("scrollUp");
          break;
        case OsEventTypeList.SCROLL_BOTTOM_EVENT:
          this.inputCb?.("scrollDown");
          break;
        case OsEventTypeList.LONG_PRESS_EVENT:
          this.inputCb?.("voiceStart");
          break;
        case OsEventTypeList.LONG_PRESS_RELEASE_EVENT:
          this.inputCb?.("voiceStop");
          break;
      }
    });
    return true;
  }

  async render(text: string): Promise<void> {
    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: CONTAINER_ID,
        containerName: CONTAINER_NAME,
        content: text,
      }),
    );
  }

  onInput(cb: (a: InputAction) => void): void {
    this.inputCb = cb;
  }

  onTranscript(_cb: (text: string) => void): void {
    // SDK mode: transcription happens on the backend from raw PCM.
  }

  async startMic(): Promise<void> {
    this.pcmChunks = [];
    this.micOn = true;
    await this.bridge.audioControl(true);
  }

  async stopMic(): Promise<Uint8Array | null> {
    this.micOn = false;
    await this.bridge.audioControl(false);
    if (!this.pcmChunks.length) return null;
    const total = this.pcmChunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.pcmChunks) {
      out.set(c, off);
      off += c.length;
    }
    this.pcmChunks = [];
    return out;
  }

  async storageGet(key: string): Promise<string> {
    try {
      return (await this.bridge.getLocalStorage(key)) ?? "";
    } catch {
      return "";
    }
  }

  async storageSet(key: string, value: string): Promise<void> {
    try {
      await this.bridge.setLocalStorage(key, value);
    } catch {
      /* non-fatal */
    }
  }

  async shutdown(): Promise<void> {
    // Mode 1 = system exit-confirmation dialog (required on root page).
    await this.bridge.shutDownPageContainer(1);
  }
}

// ---------------------------------------------------------------------------
// Browser demo implementation (576x288 green viewport emulation)
// ---------------------------------------------------------------------------

class DemoBridge implements GlassesBridge {
  mode = "demo" as const;
  private screenEl: HTMLElement;
  private inputCb: ((a: InputAction) => void) | null = null;
  private transcriptCb: ((t: string) => void) | null = null;
  private recognition: any = null;
  private lastTranscript = "";

  constructor(screenEl: HTMLElement) {
    this.screenEl = screenEl;
    this.bindControls();
  }

  private fire(a: InputAction) {
    this.inputCb?.(a);
  }

  private bindControls() {
    const byId = (id: string) => document.getElementById(id);
    byId("btn-next")?.addEventListener("click", () => this.fire("next"));
    byId("btn-back")?.addEventListener("click", () => this.fire("back"));
    byId("btn-up")?.addEventListener("click", () => this.fire("scrollUp"));
    byId("btn-down")?.addEventListener("click", () => this.fire("scrollDown"));
    const voiceBtn = byId("btn-voice");
    if (voiceBtn) {
      voiceBtn.addEventListener("mousedown", () => this.fire("voiceStart"));
      voiceBtn.addEventListener("mouseup", () => this.fire("voiceStop"));
      voiceBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.fire("voiceStart");
      });
      voiceBtn.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.fire("voiceStop");
      });
    }
    // Typed-command fallback (demo only): when there is no mic / no Web Speech
    // API, typed text goes through the exact same voice-command path.
    const cmdInput = byId("cmd-input") as HTMLInputElement | null;
    const sendTyped = () => {
      const text = cmdInput?.value.trim();
      if (!text) return;
      if (cmdInput) cmdInput.value = "";
      this.transcriptCb?.(text);
    };
    byId("cmd-send")?.addEventListener("click", sendTyped);
    cmdInput?.addEventListener("keydown", (e) => {
      e.stopPropagation(); // don't let demo keyboard shortcuts fire while typing
      if (e.key === "Enter") sendTyped();
    });
    // Clicking the glasses viewport = temple tap; double-click = back.
    this.screenEl.addEventListener("click", () => this.fire("next"));
    this.screenEl.addEventListener("dblclick", () => this.fire("back"));
    this.screenEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.fire(e.deltaY > 0 ? "scrollDown" : "scrollUp");
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === "ArrowRight") this.fire("next");
      else if (e.key === "Backspace" || e.key === "ArrowLeft") this.fire("back");
      else if (e.key === "ArrowUp") this.fire("scrollUp");
      else if (e.key === "ArrowDown") this.fire("scrollDown");
      else if (e.key === " " && !e.repeat) {
        e.preventDefault();
        this.fire("voiceStart");
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.key === " ") this.fire("voiceStop");
    });
  }

  async render(text: string): Promise<void> {
    this.screenEl.textContent = text;
  }

  onInput(cb: (a: InputAction) => void): void {
    this.inputCb = cb;
  }

  onTranscript(cb: (text: string) => void): void {
    this.transcriptCb = cb;
  }

  async startMic(): Promise<void> {
    this.lastTranscript = "";
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return; // typed/simulated commands still work via buttons
    try {
      this.recognition = new SR();
      this.recognition.lang = "en-US";
      this.recognition.interimResults = false;
      this.recognition.onresult = (ev: any) => {
        this.lastTranscript = ev.results[0][0].transcript;
      };
      this.recognition.start();
    } catch {
      this.recognition = null;
    }
  }

  async stopMic(): Promise<Uint8Array | null> {
    try {
      this.recognition?.stop();
    } catch {
      /* ignore */
    }
    // Give the recognizer a moment to deliver the final result.
    await new Promise((r) => setTimeout(r, 350));
    if (this.lastTranscript) this.transcriptCb?.(this.lastTranscript);
    return null;
  }

  async storageGet(key: string): Promise<string> {
    return localStorage.getItem(`fixguide:${key}`) ?? "";
  }

  async storageSet(key: string, value: string): Promise<void> {
    localStorage.setItem(`fixguide:${key}`, value);
  }

  async shutdown(): Promise<void> {
    this.screenEl.textContent = "FixGuide AI closed.\n\nReload the page to reopen.";
  }
}

// ---------------------------------------------------------------------------
// Factory: real SDK if the Even host is present, demo fallback otherwise.
// ---------------------------------------------------------------------------

export async function createBridge(
  firstScreen: string,
  demoScreenEl: HTMLElement,
): Promise<GlassesBridge> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800));
  const sdk = await Promise.race([waitForEvenAppBridge().catch(() => null), timeout]);
  if (sdk) {
    const b = new SdkBridge(sdk as EvenAppBridge);
    // The SDK promise can resolve in a plain browser without a real Even host;
    // only trust it if the startup container was actually created.
    if (await b.init(firstScreen)) return b;
  }
  const demo = new DemoBridge(demoScreenEl);
  await demo.render(firstScreen);
  return demo;
}
