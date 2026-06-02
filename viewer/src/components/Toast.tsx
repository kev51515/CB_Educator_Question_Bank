import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ToastVariant = "info" | "success" | "warning" | "error";

/**
 * Optional inline action attached to a toast — used for the "one-click action
 * with toast undo" pattern from CLAUDE.md. When `action` is supplied:
 *   - a button with `label` is rendered inside the toast
 *   - clicking it invokes `onAction` and dismisses the toast
 *   - the default ttl is extended (default 8s) so the user has time to react
 */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** Override the default auto-dismiss timer for this toast (ms). */
  durationMs?: number;
}

interface ToastMessage {
  id: number;
  variant: ToastVariant;
  title: string;
  body?: string;
  ttlMs: number;
  action?: ToastAction;
}

type ToastFn = (title: string, body?: string, options?: ToastOptions) => void;

interface ToastContextValue {
  show: (msg: Omit<ToastMessage, "id">) => void;
  success: ToastFn;
  error: ToastFn;
  info: ToastFn;
  warning: ToastFn;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

let nextId = 1;

// Defaults — when no action is present we keep the previous brisk timing;
// when an action is present we extend so the user can actually click it.
const DEFAULT_TTL: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  warning: 5000,
  error: 6000,
};
const DEFAULT_ACTION_TTL = 8000;

function resolveTtl(variant: ToastVariant, options?: ToastOptions): number {
  if (options?.durationMs !== undefined) return options.durationMs;
  if (options?.action) return DEFAULT_ACTION_TTL;
  return DEFAULT_TTL[variant];
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMessage[]>([]);

  const remove = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = nextId++;
    setItems(prev => [...prev, { ...msg, id }]);
    setTimeout(() => remove(id), msg.ttlMs);
  }, [remove]);

  const make = (variant: ToastVariant): ToastFn =>
    (title, body, options) =>
      show({
        variant,
        title,
        body,
        ttlMs: resolveTtl(variant, options),
        action: options?.action,
      });

  const value: ToastContextValue = {
    show,
    success: make("success"),
    error:   make("error"),
    info:    make("info"),
    warning: make("warning"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack items={items} onClose={remove} />
    </ToastContext.Provider>
  );
}

function ToastStack({ items, onClose }: { items: ToastMessage[]; onClose: (id: number) => void }) {
  // Keep only the last 5 visible — older toasts remain in state until they
  // auto-dismiss, but we cap the stack so the UI never towers off screen.
  const visible = items.slice(-5);
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-2 pointer-events-none">
      {visible.map(t => {
        // M28: errors/warnings use role="alert" + aria-live="assertive" so
        // screen-reader users hear them immediately; success/info stay polite.
        const assertive = t.variant === "error" || t.variant === "warning";
        return (
        <div
          key={t.id}
          role={assertive ? "alert" : "status"}
          aria-live={assertive ? "assertive" : "polite"}
          className={`pointer-events-auto min-w-[280px] max-w-[400px] rounded-lg shadow-lg ring-1 px-4 py-3 ${variantClasses(t.variant)}`}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl leading-none">{variantIcon(t.variant)}</span>
            <div className="flex-1">
              <p className="font-medium">{t.title}</p>
              {t.body && <p className="text-sm opacity-80 mt-0.5">{t.body}</p>}
            </div>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  try {
                    t.action?.onAction();
                  } finally {
                    onClose(t.id);
                  }
                }}
                className={`min-h-[40px] md:min-h-0 md:py-1 px-3 rounded-md text-sm font-semibold underline underline-offset-2 inline-flex items-center justify-center ${actionClasses(t.variant)} focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-current`}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onClose(t.id)}
              className="opacity-60 hover:opacity-100 text-sm min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 inline-flex items-center justify-center"
              aria-label="Dismiss"
            >×</button>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function variantClasses(v: ToastVariant): string {
  switch (v) {
    case "success": return "bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-100 dark:ring-emerald-900";
    case "error":   return "bg-rose-50 text-rose-900 ring-rose-200 dark:bg-rose-950/80 dark:text-rose-100 dark:ring-rose-900";
    case "warning": return "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/80 dark:text-amber-100 dark:ring-amber-900";
    case "info":
    default:        return "bg-slate-50 text-slate-900 ring-slate-200 dark:bg-slate-900/90 dark:text-slate-100 dark:ring-slate-700";
  }
}

function actionClasses(v: ToastVariant): string {
  // Subtle hover background tuned per variant so the action reads as "part of
  // this toast" but stays visually distinct from the body text.
  switch (v) {
    case "success": return "hover:bg-emerald-100 dark:hover:bg-emerald-900/40";
    case "error":   return "hover:bg-rose-100 dark:hover:bg-rose-900/40";
    case "warning": return "hover:bg-amber-100 dark:hover:bg-amber-900/40";
    case "info":
    default:        return "hover:bg-slate-100 dark:hover:bg-slate-800/60";
  }
}

function variantIcon(v: ToastVariant): string {
  switch (v) {
    case "success": return "✓";
    case "error":   return "✕";
    case "warning": return "!";
    case "info":
    default:        return "i";
  }
}
