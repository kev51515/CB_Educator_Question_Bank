import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type FlagType = "confusing" | "great" | "too-easy" | "similar";

export interface QuestionFlag {
  type: FlagType;
  note?: string;
}

/* ─── Persistence hook ─────────────────────────────────────────────────────── */

export function useQuestionFlags(storageKey: string): {
  get: (questionId: string) => QuestionFlag[];
  add: (questionId: string, flag: QuestionFlag) => void;
  remove: (questionId: string, flagType: FlagType) => void;
  has: (questionId: string, flagType: FlagType) => boolean;
  count: () => number;
} {
  const [map, setMap] = useState<Record<string, QuestionFlag[]>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, QuestionFlag[]>;
      }
      return {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(map));
    } catch {
      /* quota or disabled -- non-fatal */
    }
  }, [storageKey, map]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : {};
        setMap(typeof next === "object" && next && !Array.isArray(next) ? next : {});
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const get = useCallback(
    (questionId: string): QuestionFlag[] => map[questionId] ?? [],
    [map],
  );

  const add = useCallback(
    (questionId: string, flag: QuestionFlag) => {
      setMap((prev) => {
        const existing = prev[questionId] ?? [];
        // Replace if same type already exists, otherwise append.
        const filtered = existing.filter((f) => f.type !== flag.type);
        return { ...prev, [questionId]: [...filtered, flag] };
      });
    },
    [],
  );

  const remove = useCallback(
    (questionId: string, flagType: FlagType) => {
      setMap((prev) => {
        const existing = prev[questionId] ?? [];
        const filtered = existing.filter((f) => f.type !== flagType);
        const next = { ...prev };
        if (filtered.length === 0) {
          delete next[questionId];
        } else {
          next[questionId] = filtered;
        }
        return next;
      });
    },
    [],
  );

  const has = useCallback(
    (questionId: string, flagType: FlagType): boolean =>
      (map[questionId] ?? []).some((f) => f.type === flagType),
    [map],
  );

  const count = useCallback((): number => Object.keys(map).length, [map]);

  return { get, add, remove, has, count };
}

/* ─── Flag options config ──────────────────────────────────────────────────── */

const FLAG_ICON_PROPS = {
  viewBox: "0 0 24 24",
  className: "w-3.5 h-3.5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const FLAG_OPTIONS: { type: FlagType; icon: JSX.Element; label: string }[] = [
  {
    type: "confusing",
    // Question mark in circle
    icon: (
      <svg {...FLAG_ICON_PROPS}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    label: "Confusing wording",
  },
  {
    type: "great",
    // Star
    icon: (
      <svg {...FLAG_ICON_PROPS}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    label: "Great for teaching",
  },
  {
    type: "too-easy",
    // Downward trend
    icon: (
      <svg {...FLAG_ICON_PROPS}>
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </svg>
    ),
    label: "Too easy for difficulty",
  },
  {
    type: "similar",
    // Refresh / cycle
    icon: (
      <svg {...FLAG_ICON_PROPS}>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
    label: "Similar to another question",
  },
];

/* ─── FlagButton component ─────────────────────────────────────────────────── */

interface FlagButtonProps {
  questionId: string;
  flags: QuestionFlag[];
  onAdd: (flag: QuestionFlag) => void;
  onRemove: (flagType: FlagType) => void;
}

export function FlagButton({
  questionId: _questionId,
  flags,
  onAdd,
  onRemove,
}: FlagButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const hasAnyFlag = flags.length > 0;
  const activeTypes = new Set(flags.map((f) => f.type));

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Flag question"
        aria-label="Flag question"
        aria-expanded={open}
        className={
          "w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors focus-ring " +
          (hasAnyFlag
            ? "text-amber-600 hover:bg-amber-50"
            : "text-ink-500 hover:text-ink-800 hover:bg-ink-100")
        }
      >
        <svg
          viewBox="0 0 24 24"
          className="w-3.5 h-3.5"
          fill={hasAnyFlag ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-ink-200 shadow-modal rounded-xl p-2 w-56">
          {FLAG_OPTIONS.map((opt) => {
            const isActive = activeTypes.has(opt.type);
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => {
                  if (isActive) {
                    onRemove(opt.type);
                  } else {
                    onAdd({ type: opt.type });
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] text-ink-700 hover:bg-ink-50 transition-colors text-left"
              >
                <span className="w-4 inline-flex items-center justify-center">{opt.icon}</span>
                <span className="flex-1">{opt.label}</span>
                {isActive && (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5 text-accent-600"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
