/**
 * DesmosCalculator
 * ================
 * The Digital SAT provides an embedded Desmos graphing calculator on Math
 * sections. This is a floating, draggable, resizable panel that lazy-loads the
 * Desmos calculator API once and mounts a GraphingCalculator instance. It is
 * only rendered on math modules (see FullTestApp).
 *
 * The Desmos public test API key is used for now; swap VITE_DESMOS_API_KEY in
 * for a project key in production. The script is injected once and reused
 * across mounts; the calculator instance is created/destroyed per open.
 */
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator: (el: HTMLElement, opts?: Record<string, unknown>) => { destroy: () => void };
    };
  }
}

// Desmos's public test key — fine for development. Override via env for prod.
const DESMOS_KEY =
  (import.meta.env.VITE_DESMOS_API_KEY as string | undefined) ??
  "dcb31709b452b1cf9dc26972add0fda6";
const SCRIPT_SRC = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${DESMOS_KEY}`;

// Panel size — 2× the original 440×520 default, clamped to the viewport so it
// never overflows on smaller screens. Opens centered.
const CALC_W = 880;
const CALC_H = 1040;
const MARGIN = 16;
function panelSize(): { w: number; h: number } {
  if (typeof window === "undefined") return { w: CALC_W, h: CALC_H };
  return {
    w: Math.min(CALC_W, window.innerWidth - MARGIN),
    h: Math.min(CALC_H, window.innerHeight - MARGIN),
  };
}

let scriptPromise: Promise<void> | null = null;
function loadDesmos(): Promise<void> {
  if (window.Desmos) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Desmos calculator."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface DesmosCalculatorProps {
  open: boolean;
  onClose: () => void;
}

export function DesmosCalculator({ open, onClose }: DesmosCalculatorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const calcRef = useRef<{ destroy: () => void } | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // Mount/destroy the Desmos instance with the panel's open state.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("loading");
    loadDesmos()
      .then(() => {
        if (cancelled || !hostRef.current || !window.Desmos) return;
        calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
          expressionsCollapsed: false,
          settingsMenu: false,
          border: false,
          // Match the SAT calculator feel: keyboard + scientific functions on.
          keypad: true,
        });
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
      calcRef.current?.destroy();
      calcRef.current = null;
    };
  }, [open]);

  // Default position: centered on first open.
  useEffect(() => {
    if (open && pos.x < 0) {
      const { w, h } = panelSize();
      setPos({
        x: Math.max(8, Math.round((window.innerWidth - w) / 2)),
        y: Math.max(8, Math.round((window.innerHeight - h) / 2)),
      });
    }
  }, [open, pos.x]);

  // Keep the panel within the viewport if the window is resized after opening
  // (the clamped size recomputes on the re-render this setPos triggers), so it
  // can never end up overflowing off-screen.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const { w, h } = panelSize();
      setPos((p) =>
        p.x < 0
          ? p
          : {
              x: Math.max(8, Math.min(p.x, window.innerWidth - w - 8)),
              y: Math.max(8, Math.min(p.y, window.innerHeight - h - 8)),
            },
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  if (!open) return null;

  const onPointerDownHeader = (e: React.PointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMoveHeader = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 240, e.clientX - drag.current.dx)),
      y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - drag.current.dy)),
    });
  };
  const onPointerUpHeader = (e: React.PointerEvent) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="fixed z-30 flex flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700"
      style={{ left: pos.x, top: pos.y, width: panelSize().w, height: panelSize().h, resize: "both" }}
      role="dialog"
      aria-label="Graphing calculator"
    >
      <div
        className="flex cursor-move items-center justify-between bg-slate-800 px-3 py-2 text-white"
        onPointerDown={onPointerDownHeader}
        onPointerMove={onPointerMoveHeader}
        onPointerUp={onPointerUpHeader}
      >
        <span className="select-none text-sm font-semibold">Calculator</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
          aria-label="Close calculator"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="relative flex-1">
        <div ref={hostRef} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            {status === "error" ? "Calculator failed to load." : "Loading calculator…"}
          </div>
        )}
      </div>
    </div>
  );
}
