/**
 * PartRecorder — a thin MediaRecorder wrapper for the "spurt" recording model.
 *
 * The educator records in Parts: each Part is its own MediaRecorder session
 * that yields one audio Blob when stopped. Within a Part they can Pause/Resume.
 * Pressing "Stop Part" (or "End") finalizes the current Part's Blob, which the
 * caller then uploads + transcribes independently while the next Part records.
 *
 * Codec note: iOS/Safari don't support webm/opus. We feature-detect and prefer
 * `audio/mp4` (AAC) there, falling back to `audio/webm`. The chosen container's
 * extension is exposed via `fileExt()` so the upload path + AssemblyAI get the
 * right type. If MediaRecorder is unavailable entirely, `isSupported()` is
 * false and the caller should fall back to the upload-a-file path.
 */

const MIME_CANDIDATES: { mime: string; ext: string }[] = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/mp4", ext: "mp4" }, // Safari/iOS
  { mime: "audio/mpeg", ext: "mp3" },
];

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
    for (const c of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    }
  }
  return { mime: "", ext: "webm" }; // let the browser choose its default
}

export interface PartResult {
  blob: Blob;
  durationMs: number;
  ext: string;
}

export type CaptureMode = "mic" | "meeting";

/** True if this browser can capture tab/screen audio (Chrome/Edge; not Safari/FF). */
export function isMeetingCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof window.AudioContext !== "undefined"
  );
}

export class PartRecorder {
  private stream: MediaStream | null = null; // what MediaRecorder records
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private picked = pickMime();
  private partStartedAt = 0;
  private pausedMs = 0;
  private pausedAt = 0;
  private mode: CaptureMode = "mic";
  // Meeting-mode plumbing we must tear down.
  private audioCtx: AudioContext | null = null;
  private sources: MediaStream[] = []; // raw display + mic streams to stop

  /** Set BEFORE the first part starts (mic vs tab-audio+mic meeting capture). */
  setMode(mode: CaptureMode): void {
    this.mode = mode;
  }

  fileExt(): string {
    return this.picked.ext;
  }

  /**
   * Acquire the capture stream once; reused across Parts until disposed.
   * - mic:     just getUserMedia.
   * - meeting: getDisplayMedia (a shared TAB's audio — e.g. a Google Meet) +
   *   getUserMedia (the educator's mic), mixed into one track via Web Audio so
   *   MediaRecorder captures both sides of the call.
   */
  async ensureStream(): Promise<void> {
    if (this.stream) return;
    if (this.mode === "mic") {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return;
    }
    // meeting capture
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Chrome requires a video constraint to show the tab picker
      audio: true,
    });
    this.sources.push(display);
    const tabAudio = display.getAudioTracks();
    // We only want audio — drop the video track immediately.
    for (const t of display.getVideoTracks()) t.stop();
    if (tabAudio.length === 0) {
      this.dispose();
      throw new Error(
        'No tab audio captured — when sharing, pick the meeting tab and tick "Also share tab audio".',
      );
    }
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.sources.push(mic);

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new Ctx();
    const dest = this.audioCtx.createMediaStreamDestination();
    this.audioCtx.createMediaStreamSource(new MediaStream(tabAudio)).connect(dest);
    this.audioCtx.createMediaStreamSource(mic).connect(dest);
    this.stream = dest.stream;
  }

  /** The live mic stream (for a level meter), or null before capture starts. */
  getStream(): MediaStream | null {
    return this.stream;
  }

  isActive(): boolean {
    return this.rec != null && this.rec.state !== "inactive";
  }

  isPaused(): boolean {
    return this.rec?.state === "paused";
  }

  /** Start a fresh Part. Throws if a Part is already active. */
  async startPart(): Promise<void> {
    if (this.isActive()) throw new Error("a part is already recording");
    await this.ensureStream();
    if (!this.stream) throw new Error("no audio stream");
    this.chunks = [];
    this.pausedMs = 0;
    this.pausedAt = 0;
    const opts = this.picked.mime ? { mimeType: this.picked.mime } : undefined;
    this.rec = new MediaRecorder(this.stream, opts);
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(1000); // timeslice so we never lose >1s on a crash
    this.partStartedAt = Date.now();
  }

  pause(): void {
    if (this.rec?.state === "recording") {
      this.rec.pause();
      this.pausedAt = Date.now();
    }
  }

  resume(): void {
    if (this.rec?.state === "paused") {
      this.pausedMs += Date.now() - this.pausedAt;
      this.pausedAt = 0;
      this.rec.resume();
    }
  }

  /** Stop the current Part and resolve with its Blob + duration. */
  stopPart(): Promise<PartResult> {
    return new Promise((resolve, reject) => {
      const rec = this.rec;
      if (!rec || rec.state === "inactive") {
        reject(new Error("no active part"));
        return;
      }
      if (rec.state === "paused") this.resume();
      rec.onstop = () => {
        const type = this.picked.mime || this.chunks[0]?.type || "audio/webm";
        const blob = new Blob(this.chunks, { type });
        const durationMs = Date.now() - this.partStartedAt - this.pausedMs;
        this.chunks = [];
        this.rec = null;
        resolve({ blob, durationMs: Math.max(0, durationMs), ext: this.picked.ext });
      };
      rec.onerror = () => reject(new Error("recorder error"));
      rec.stop();
    });
  }

  /** Release the mic. Call when the whole session ends or the panel unmounts. */
  dispose(): void {
    try {
      if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    } catch {
      /* ignore */
    }
    this.rec = null;
    this.chunks = [];
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    // Meeting-mode teardown: stop the raw display + mic streams and close the
    // mixing AudioContext.
    for (const s of this.sources) {
      for (const t of s.getTracks()) t.stop();
    }
    this.sources = [];
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

/** Derive a file extension from an uploaded File's name/type (upload path). */
export function uploadExtFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  const t = file.type;
  if (t.includes("mp4") || t.includes("m4a")) return "m4a";
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  if (t.includes("wav")) return "wav";
  return "webm";
}
