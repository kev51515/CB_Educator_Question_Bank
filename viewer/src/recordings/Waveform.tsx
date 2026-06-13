/**
 * Waveform — a real <audio> element plus a canvas waveform with a click-to-seek
 * playhead. Dependency-free: pure Web Audio (decodeAudioData) + 2D canvas.
 *
 * On mount it fetches the source, decodes it, and reduces the samples to ~200
 * peak bars (slate for the un-played portion, indigo for the played portion).
 * Clicking the canvas seeks proportionally. The underlying <audio> ref is still
 * handed back via `register(audioEl)` so external jump-to-timestamp seeking
 * (RecordingDetailPage's audioRegistry) keeps working untouched.
 *
 * If decoding fails (codec/CORS/etc.) it gracefully falls back to a plain
 * <audio controls> element.
 */
import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 200;

function fmtClock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Waveform({
  src,
  register,
}: {
  src: string;
  register?: (el: HTMLAudioElement | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef<number[] | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 of currentTime/duration
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  function cycleRate() {
    const next = rate >= 2 ? 1 : rate >= 1.5 ? 2 : 1.5;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  // Decode the audio into ~200 peak bars on mount.
  useEffect(() => {
    let alive = true;
    setPeaks(null);
    setDecodeFailed(false);
    peaksRef.current = null;

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      setDecodeFailed(true);
      return;
    }
    const ctx = new Ctx();

    void (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        if (!alive) return;
        const channel = decoded.getChannelData(0);
        const block = Math.floor(channel.length / BAR_COUNT) || 1;
        const next: number[] = [];
        let max = 0;
        for (let i = 0; i < BAR_COUNT; i++) {
          let peak = 0;
          const start = i * block;
          const end = Math.min(start + block, channel.length);
          for (let j = start; j < end; j++) {
            const v = Math.abs(channel[j]);
            if (v > peak) peak = v;
          }
          next.push(peak);
          if (peak > max) max = peak;
        }
        // Normalise so the loudest bar fills the canvas.
        const norm = max > 0 ? next.map((p) => p / max) : next;
        peaksRef.current = norm;
        setPeaks(norm);
      } catch {
        if (alive) setDecodeFailed(true);
      } finally {
        void ctx.close();
      }
    })();

    return () => {
      alive = false;
    };
  }, [src]);

  // Draw the bars whenever peaks or progress change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 56;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);

    const slotW = cssW / peaks.length;
    const barW = Math.max(1, slotW * 0.6);
    const mid = cssH / 2;
    const isDark = document.documentElement.classList.contains("dark");
    const playedColor = "#6366f1"; // indigo-500
    const restColor = isDark ? "#475569" : "#cbd5e1"; // slate-600 / slate-300
    const playedTo = progress * peaks.length;

    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(2, peaks[i] * (cssH - 4));
      const x = i * slotW + (slotW - barW) / 2;
      g.fillStyle = i <= playedTo ? playedColor : restColor;
      g.fillRect(x, mid - h / 2, barW, h);
    }
  }, [peaks, progress]);

  function handleRef(el: HTMLAudioElement | null) {
    audioRef.current = el;
    register?.(el);
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }

  function seekFromEvent(e: React.MouseEvent<HTMLCanvasElement>) {
    const a = audioRef.current;
    const canvas = canvasRef.current;
    if (!a || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const dur = a.duration || duration;
    if (dur && isFinite(dur)) {
      a.currentTime = frac * dur;
      setProgress(frac);
    }
  }

  // Fall back to a bare audio element if we couldn't decode the waveform.
  if (decodeFailed) {
    return (
      <audio
        controls
        preload="metadata"
        src={src}
        ref={handleRef}
        className="mt-2 w-full"
      />
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
              <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.28-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
            </svg>
          )}
        </button>
        <canvas
          ref={canvasRef}
          onClick={seekFromEvent}
          className="h-14 flex-1 cursor-pointer rounded-md bg-slate-50 dark:bg-slate-800"
          aria-hidden
        />
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {fmtClock(progress * duration)} / {fmtClock(duration)}
          </span>
          <button
            type="button"
            onClick={cycleRate}
            className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Playback speed"
            aria-label={`Playback speed ${rate}x`}
          >
            {rate}×
          </button>
        </div>
      </div>
      {/* The real audio element — kept in the DOM so external seeking via the
          registered ref works, but visually hidden behind the custom controls. */}
      <audio
        ref={handleRef}
        preload="metadata"
        src={src}
        className="sr-only"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          const d = (e.target as HTMLAudioElement).duration;
          if (isFinite(d)) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          const a = e.target as HTMLAudioElement;
          const dur = a.duration || duration;
          if (dur && isFinite(dur)) setProgress(a.currentTime / dur);
        }}
      />
    </div>
  );
}
