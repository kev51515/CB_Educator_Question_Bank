/**
 * CourseCard
 * ==========
 * Shared course list card. Used by:
 *   - /dashboard (DashboardPage) — staff's own courses
 *   - /courses (AllClassesView) — admin cross-teacher view
 *
 * Visual contract: rounded card with a colored gradient header band (derived
 * from a fast hash of the seed string), a content area with title +
 * description + optional `meta` slot, a metrics row, and an actions/footer
 * row. Subtle elevation on hover.
 *
 * Two classes can collide on palette color — that's fine; the goal is visual
 * variety, not unique branding.
 */
import type { ReactNode } from "react";
import { KebabMenu, type KebabMenuOption } from "./KebabMenu";
import { useUiTheme } from "@/lib/theme";
import { accentRampFor, DOMAIN_VOCAB, type Domain } from "@/lib/domain";

// Fixed Canvas-like palette. JIT picks these up because they're static strings.
const CARD_PALETTE: ReadonlyArray<string> = [
  "from-indigo-500 to-violet-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-cyan-600",
  "from-fuchsia-500 to-purple-600",
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Derive a deterministic palette index from a stable string. */
export function paletteFor(seed: string): string {
  return CARD_PALETTE[hashString(seed) % CARD_PALETTE.length];
}

/** First letter(s) of the course name — max 2 — for the ivy monogram disc. */
function monogramFor(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.match(/[A-Za-z0-9]/)?.[0] ?? "")
    .filter(Boolean);
  return (words[0] ?? "?").concat(words[1] ?? "").toUpperCase();
}

export interface CourseCardMetric {
  label: string;
  value: string | number;
}

export interface CourseCardProps {
  /** Stable id used for palette derivation + React key. */
  paletteSeed: string;
  name: string;
  /** The course's domain — drives the ivy-theme eyebrow label + accent.
   *  Optional (defaults to 'academic'); unused in the classic theme. */
  domain?: Domain;
  description?: string | null;
  /** Optional second line below the description (used by admin view for
   *  teacher name + email). */
  meta?: ReactNode;
  /** Metric chips rendered below the description. */
  metrics?: ReadonlyArray<CourseCardMetric>;
  /** Status pill rendered in the top-right of the card body. */
  status?: { label: string; tone: "emerald" | "slate" | "amber" | "indigo" };
  /** Optional small tag pill next to the status (e.g. "Counseling"). */
  tag?: string;
  /** Footer slot — quick-nav icons (Dashboard) or CTA buttons (admin). */
  footer?: ReactNode;
  /** Visually deemphasize (archived courses). */
  muted?: boolean;
  /** Primary click — navigates or opens an inspector. */
  onClick?: () => void;
  /** aria-label override. */
  ariaLabel?: string;
  /** Per-card "⋯" actions menu (Edit / Duplicate / Archive / Delete / etc).
   *  Rendered in the top-right corner of the gradient header, white-tinted
   *  for contrast. Click is stop-propagation'd so it doesn't fire the
   *  card's primary onClick. */
  kebab?: ReadonlyArray<KebabMenuOption>;
}

export function CourseCard({
  paletteSeed,
  name,
  domain = "academic",
  description,
  meta,
  metrics,
  status,
  tag,
  footer,
  muted = false,
  onClick,
  ariaLabel,
  kebab,
}: CourseCardProps) {
  const ivy = useUiTheme() === "ivy";
  const palette = paletteFor(paletteSeed);
  const trimmedDesc = (description ?? "").trim();
  const shortDesc =
    trimmedDesc.length > 110 ? `${trimmedDesc.slice(0, 107)}…` : trimmedDesc;

  const baseClass =
    // `min-w-0` lets the card shrink below its content's intrinsic width inside
    // a grid/flex track (items default to min-width:auto) so a long course name
    // can't force horizontal overflow on narrow screens.
    // `select-text` keeps the card's text selectable/copyable even when the
    // whole card is clickable — a native <button> would make its text
    // unselectable (UA user-select:none), so we render a role="button" div.
    // NOTE: no `overflow-hidden` — it would clip the kebab dropdown (the card's
    // rounded corners are handled by rounded-xl here + rounded-t-xl on the
    // gradient header; the content has no background so the bottom corners stay
    // rounded). z-index alone can't escape an ancestor's overflow clip.
    "group flex flex-col min-w-0 text-left select-text rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
    (onClick ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer " : "") +
    (muted ? "opacity-70 " : "");

  // Kebab block is shared between the two theme headers; only the backdrop
  // chip changes (translucent white on the classic gradient vs quiet ink on
  // the ivy paper header). Structure / handlers / aria are identical.
  const kebabBlock = kebab && kebab.length > 0 && (
    <div
      className="absolute top-2 right-2 z-10"
      onClick={(e) => {
        // Trigger click is on a child <button>; stop here so the card's
        // outer <button> onClick never fires when the user is opening
        // the kebab.
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      {/* Translucent backdrop chip so the dark dots read on the
          gradient header without us recoloring KebabMenu's internals. */}
      <span
        className={
          ivy
            ? "inline-flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400"
            : "inline-flex items-center justify-center rounded-md bg-white/20 backdrop-blur-sm ring-1 ring-white/30 text-white"
        }
      >
        <KebabMenu options={kebab} />
      </span>
    </div>
  );

  // Per-card domain accent (ivy ramp) for the eyebrow — exposed as CSS vars
  // so light/dark grades can both be static JIT-safe utility classes.
  const ivyEyebrowVars = {
    "--cc-eyebrow": accentRampFor("ivy", domain)["600"],
    "--cc-eyebrow-dark": accentRampFor("ivy", domain)["400"],
  } as React.CSSProperties;

  const inner = (
    <>
      {ivy ? (
        // Ivy quiet header: monogram disc + domain eyebrow (no gradient band).
        <div className="relative flex items-center gap-2.5 px-4 pt-4">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 font-display text-sm font-semibold text-accent-700 dark:border-slate-700 dark:bg-slate-800"
          >
            {monogramFor(name)}
          </span>
          <span
            style={ivyEyebrowVars}
            className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--cc-eyebrow)] dark:text-[color:var(--cc-eyebrow-dark)]"
          >
            {DOMAIN_VOCAB[domain].homeNoun}
          </span>
          {kebabBlock}
        </div>
      ) : (
        <div className={`relative h-20 w-full rounded-t-xl bg-gradient-to-br ${palette}`} aria-hidden={!kebab}>
          {kebabBlock}
        </div>
      )}
      <div className="flex-1 p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900 dark:text-slate-100">
            {name}
          </h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {tag && (
              <span
                className={
                  // Ivy: quiet slate chip (violet fights the navy/forest/
                  // bronze triad and duplicates the eyebrow's color voice).
                  ivy
                    ? "rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300"
                    : "rounded-full bg-violet-100 dark:bg-violet-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300"
                }
              >
                {tag}
              </span>
            )}
            {status && <StatusPill {...status} />}
          </div>
        </div>
        {shortDesc && (
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
            {shortDesc}
          </p>
        )}
        {meta && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {meta}
          </div>
        )}
        {metrics && metrics.length > 0 && (
          <div className="flex items-center gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
            {metrics.map((m) => (
              <span key={m.label} className="inline-flex items-center gap-1">
                <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                  {m.value}
                </span>
                <span>{m.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {footer && (
        <div className="flex items-center gap-1 px-3 py-2 border-t border-slate-100 dark:border-slate-800">
          {footer}
        </div>
      )}
    </>
  );

  if (onClick) {
    // Skip navigation when the click is really the end of a text selection
    // (drag-to-select) — copying text off the card is normal interaction and
    // shouldn't open the course. A plain click clears any selection on
    // mousedown, so this only suppresses the synthetic click after a drag.
    const activate = () => {
      if (typeof window !== "undefined") {
        const sel = window.getSelection();
        if (sel && sel.toString().trim().length > 0) return;
      }
      onClick();
    };
    // Always a role="button" div (never a native <button>): a <button> makes
    // its text unselectable, and it also can't legally nest the kebab's button.
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={baseClass}
        aria-label={ariaLabel ?? `Open course ${name}`}
      >
        {inner}
      </div>
    );
  }
  return <div className={baseClass}>{inner}</div>;
}

interface StatusPillProps {
  label: string;
  tone: "emerald" | "slate" | "amber" | "indigo";
}

function StatusPill({ label, tone }: StatusPillProps) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
      : tone === "amber"
        ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
        : tone === "indigo"
          ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
          : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
  return (
    <span
      className={`inline-flex items-center rounded-full text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 flex-none ${cls}`}
    >
      {label}
    </span>
  );
}

/** Small icon button slot used in card footers — stop propagation so click
 *  doesn't bubble into the parent card's onClick. */
export interface CardActionIconProps {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  icon: ReactNode;
}

export function CardActionIcon({ label, onClick, icon }: CardActionIconProps) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      title={label}
      aria-label={label}
      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 inline-flex items-center justify-center h-7 w-7 rounded-md text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
    >
      {icon}
    </span>
  );
}
