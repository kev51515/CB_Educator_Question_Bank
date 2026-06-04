import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { IDENTITY } from "@/lib/designTokens";
import { useFocusTrap } from "@/hooks";

export interface A11yPrefs {
  dyslexiaMode: boolean;
  highContrast: boolean;
  mathSpeech: boolean;
  /** 0 = default, 1-3 = increased letter spacing. */
  letterSpacing: number;
  /** 1.5 default, up to 2.0. */
  lineHeight: number;
}

const DEFAULTS: A11yPrefs = {
  dyslexiaMode: false,
  highContrast: false,
  mathSpeech: false,
  letterSpacing: 0,
  lineHeight: 1.5,
};

const LETTER_SPACING_VALUES = ["0", "0.05em", "0.1em", "0.15em"] as const;
const LETTER_SPACING_LABELS = ["Default", "Slight", "Medium", "Wide"] as const;

const LINE_HEIGHT_STOPS = [1.5, 1.625, 1.75, 1.875, 2.0] as const;
const LINE_HEIGHT_LABELS = ["Default", "Comfortable", "Roomy", "Spacious", "Maximum"] as const;

function isA11yPrefs(value: unknown): value is A11yPrefs {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.dyslexiaMode === "boolean" &&
    typeof v.highContrast === "boolean" &&
    typeof v.mathSpeech === "boolean" &&
    typeof v.letterSpacing === "number" &&
    typeof v.lineHeight === "number"
  );
}

function loadPrefs(storageKey: string): A11yPrefs {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (isA11yPrefs(parsed)) {
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Ignore malformed JSON or storage errors.
  }
  return { ...DEFAULTS };
}

function applyPrefsToDocument(prefs: A11yPrefs): void {
  const el = document.documentElement;
  el.classList.toggle("dyslexia-mode", prefs.dyslexiaMode);
  el.classList.toggle("high-contrast", prefs.highContrast);
  el.classList.toggle("math-speech-on", prefs.mathSpeech);

  const idx = Math.max(0, Math.min(LETTER_SPACING_VALUES.length - 1, Math.round(prefs.letterSpacing)));
  el.style.setProperty("--letter-spacing", LETTER_SPACING_VALUES[idx]);
  el.style.setProperty("--line-height", String(prefs.lineHeight));
}

export function useA11yPrefs(storageKey: string): {
  prefs: A11yPrefs;
  setPref: <K extends keyof A11yPrefs>(key: K, value: A11yPrefs[K]) => void;
  reset: () => void;
} {
  const [prefs, setPrefs] = useState<A11yPrefs>(() => loadPrefs(storageKey));

  // Persist + apply on every change.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
      // Storage may be unavailable (private mode, quota). Apply regardless.
    }
    applyPrefsToDocument(prefs);
  }, [prefs, storageKey]);

  const setPref = useCallback(
    <K extends keyof A11yPrefs>(key: K, value: A11yPrefs[K]) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const reset = useCallback(() => {
    setPrefs({ ...DEFAULTS });
  }, []);

  return { prefs, setPref, reset };
}

/* ─────────────────────────────────────────────────────────────────────── */
/* A11yToggle                                                              */
/* ─────────────────────────────────────────────────────────────────────── */

interface A11yToggleProps {
  onClick: () => void;
}

export function A11yToggle({ onClick }: A11yToggleProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Accessibility preferences"
      data-tooltip="Accessibility"
      className="w-7 h-7 rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-700 focus-ring flex items-center justify-center"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
        <path d="M8 10.5h8" />
        <path d="M12 10.5v3.5" />
        <path d="M12 14l-2.5 5" />
        <path d="M12 14l2.5 5" />
      </svg>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* A11yPanel — modal with all toggles                                      */
/* ─────────────────────────────────────────────────────────────────────── */

interface A11yPanelProps {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "viewer.a11yPrefs.v1";

export function A11yPanel({ open, onClose }: A11yPanelProps): JSX.Element | null {
  const { prefs, setPref, reset } = useA11yPrefs(STORAGE_KEY);

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useFocusTrap(dialogRef, open);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const lineHeightIndex = useMemo(() => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < LINE_HEIGHT_STOPS.length; i++) {
      const d = Math.abs(LINE_HEIGHT_STOPS[i] - prefs.lineHeight);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }, [prefs.lineHeight]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-10 bg-ink-800/25 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={dialogRef}
        className={"bg-white rounded-2xl shadow-modal border border-ink-100 border-t-[3px] " + IDENTITY.topic.topBorder + " w-full max-w-md p-7 max-h-[85vh] overflow-y-auto dark:bg-ink-800"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2
            id={titleId}
            className="text-[15px] font-semibold tracking-tight text-ink-800 dark:text-ink-100"
          >
            Accessibility
          </h2>
          <button
            ref={closeBtnRef}
            data-autofocus
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          <SwitchRow
            label="Dyslexia mode"
            description="Uses OpenDyslexic font, increased spacing"
            checked={prefs.dyslexiaMode}
            onChange={(v) => setPref("dyslexiaMode", v)}
          />
          <SwitchRow
            label="High contrast"
            description="Stronger contrast for low-vision users"
            checked={prefs.highContrast}
            onChange={(v) => setPref("highContrast", v)}
          />
          <SwitchRow
            label="Math speech"
            description="Enables MathJax speech rules — works with VoiceOver and NVDA"
            checked={prefs.mathSpeech}
            onChange={(v) => setPref("mathSpeech", v)}
          />

          <SliderRow
            label="Letter spacing"
            value={prefs.letterSpacing}
            min={0}
            max={3}
            step={1}
            tickLabels={LETTER_SPACING_LABELS}
            onChange={(v) => setPref("letterSpacing", v)}
          />

          <SliderRow
            label="Line height"
            value={lineHeightIndex}
            min={0}
            max={LINE_HEIGHT_STOPS.length - 1}
            step={1}
            tickLabels={LINE_HEIGHT_LABELS}
            onChange={(idx) => setPref("lineHeight", LINE_HEIGHT_STOPS[idx])}
          />
        </div>

        <div className="mt-6 pt-4 border-t border-ink-150 dark:border-ink-700 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 text-[13px] rounded-md text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-700 focus-ring"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Internal building blocks                                                */
/* ─────────────────────────────────────────────────────────────────────── */

interface SwitchRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function SwitchRow({ label, description, checked, onChange }: SwitchRowProps): JSX.Element {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <label
          htmlFor={id}
          className="block text-[13px] font-medium text-ink-800 dark:text-ink-100 cursor-pointer"
        >
          {label}
        </label>
        <p id={descId} className="mt-0.5 text-[12px] text-ink-500 dark:text-ink-400">
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors focus-ring ${
          checked ? "bg-accent-500" : "bg-ink-200 dark:bg-ink-700"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  tickLabels: readonly string[];
  onChange: (next: number) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  tickLabels,
  onChange,
}: SliderRowProps): JSX.Element {
  const id = useId();
  const currentLabel = tickLabels[Math.max(0, Math.min(tickLabels.length - 1, value))];
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label
          htmlFor={id}
          className="text-[13px] font-medium text-ink-800 dark:text-ink-100"
        >
          {label}
        </label>
        <span className="text-[12px] text-ink-500 dark:text-ink-400">{currentLabel}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={currentLabel}
        className="w-full focus-ring accent-accent-500"
      />
      <div className="mt-1 flex justify-between text-[10px] text-ink-400 dark:text-ink-500">
        {tickLabels.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
