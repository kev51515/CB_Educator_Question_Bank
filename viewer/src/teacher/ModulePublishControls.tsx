import { useOptimistic } from "@/components";

interface PublishButtonProps {
  published: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/**
 * iOS-style switch + label: the "circle" before this was ambiguous (users
 * couldn't tell at a glance whether a module was published). The switch
 * makes the state obvious — knob LEFT = off (Draft), knob RIGHT = on
 * (Published). Color reinforces: slate track for off, emerald for on.
 */
function PublishToggle({
  published,
  disabled,
  onToggle,
}: PublishButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      role="switch"
      aria-checked={published}
      title={published ? "Published — click to make draft" : "Draft — click to publish"}
      className={`min-h-[40px] md:min-h-0 inline-flex items-center gap-2 px-1.5 py-1 rounded-full transition-colors ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
      }`}
    >
      {/* Switch track */}
      <span
        aria-hidden
        className={`relative inline-block w-9 h-5 rounded-full transition-colors ${
          published
            ? "bg-emerald-500"
            : "bg-slate-300 dark:bg-slate-600"
        }`}
      >
        {/* Knob */}
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-150 ${
            published ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      {/* Label */}
      <span
        className={`text-xs font-semibold uppercase tracking-wide hidden sm:inline ${
          published
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-slate-500 dark:text-slate-400"
        }`}
      >
        {published ? "Published" : "Draft"}
      </span>
    </button>
  );
}

interface OptimisticPublishToggleProps {
  /** Authoritative server value — used as the initial / reset value. */
  published: boolean;
  /** Stable per-row key (e.g. module.id). Re-mounts the inner state when changed. */
  rowKey: string;
  disabled?: boolean;
  /** Persist the new value. Must throw on failure so the inner hook can roll back. */
  onCommit: (next: boolean) => Promise<void>;
}

/**
 * PublishToggle wrapped in useOptimistic — flips the UI immediately, rolls
 * back on commit failure, and surfaces a toast via the shared hook. We key
 * the wrapper by rowKey so that when the parent's list shuffles, each row
 * keeps its own optimistic state in sync with its server value.
 */
function OptimisticPublishToggleInner({
  published,
  disabled,
  onCommit,
}: Omit<OptimisticPublishToggleProps, "rowKey">): JSX.Element {
  const [pub, applyPub] = useOptimistic<boolean>(published);
  const handle = (): void => {
    void applyPub({
      optimistic: (cur) => !cur,
      commit: async () => {
        await onCommit(!pub);
      },
    });
  };
  return <PublishToggle published={pub} disabled={disabled} onToggle={handle} />;
}

function OptimisticPublishToggle(props: OptimisticPublishToggleProps): JSX.Element {
  const { rowKey, ...rest } = props;
  // Re-key so the inner useState seed (`initial`) re-runs whenever the row's
  // authoritative published value changes via a refresh.
  return <OptimisticPublishToggleInner key={`${rowKey}:${rest.published}`} {...rest} />;
}

/** Read-only round status indicator for student view. */
function PublishBadge({ published }: { published: boolean }): JSX.Element {
  return (
    <span
      title={published ? "Published" : "Unpublished"}
      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
        published
          ? "bg-emerald-500 text-white"
          : "border-2 border-slate-300 text-slate-300"
      }`}
    >
      {published ? "✓" : ""}
    </span>
  );
}

export {
  PublishToggle,
  OptimisticPublishToggleInner,
  OptimisticPublishToggle,
  PublishBadge,
};
export type { PublishButtonProps, OptimisticPublishToggleProps };
