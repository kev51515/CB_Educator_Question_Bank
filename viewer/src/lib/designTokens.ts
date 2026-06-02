/**
 * Section identity colors.
 *
 * Each identity is tied to a meaning and used consistently across the app:
 * - Filter group dot markers (6px)
 * - Modal dialog top borders (3px)
 * - Chip/badge tints in breadcrumbs
 *
 * Keep the base ink/white aesthetic — these are markers, not fills.
 */

export type Identity = "content" | "topic" | "difficulty" | "format" | "status" | "accent";

export const IDENTITY: Record<Identity, {
  /** Tailwind class for a 6px dot marker. */
  dot: string;
  /** Tailwind class for a colored top border on modals (use with border-t-[3px]). */
  topBorder: string;
  /** Tailwind class for a soft tinted background (used for chips). */
  chipBg: string;
  /** Tailwind class for chip text. */
  chipText: string;
}> = {
  content:    { dot: "bg-indigo-400",  topBorder: "border-t-indigo-400",  chipBg: "bg-indigo-50",  chipText: "text-indigo-700"  },
  topic:      { dot: "bg-teal-400",    topBorder: "border-t-teal-400",    chipBg: "bg-teal-50",    chipText: "text-teal-700"    },
  difficulty: { dot: "bg-amber-400",   topBorder: "border-t-amber-400",   chipBg: "bg-amber-50",   chipText: "text-amber-700"   },
  format:     { dot: "bg-violet-400",  topBorder: "border-t-violet-400",  chipBg: "bg-violet-50",  chipText: "text-violet-700"  },
  status:     { dot: "bg-slate-400",   topBorder: "border-t-slate-400",   chipBg: "bg-slate-50",   chipText: "text-slate-700"   },
  accent:     { dot: "bg-accent-500",  topBorder: "border-t-accent-500",  chipBg: "bg-accent-50",  chipText: "text-accent-700"  },
};

/** Maps a filter group label (matching the registry's `group` field) to an identity. */
export function groupIdentity(group: string | undefined): Identity {
  switch (group) {
    case "Content":    return "content";
    case "Topic":      return "topic";
    case "Difficulty": return "difficulty";
    case "Format":     return "format";
    case "Status":     return "status";
    default:           return "accent";
  }
}
