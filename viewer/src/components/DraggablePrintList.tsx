import { useState, useCallback, useRef } from "react";
import { KebabMenu } from "@/components";
import { InsertionBar } from "@/teacher/modules-page/parts";
import type { IndexEntry } from "@/types";

/** Six-dot Canvas-style drag handle — mirrors MaterialCard / ModulesPage. */
function DragHandle({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      width={14}
      height={20}
      viewBox="0 0 14 20"
      aria-hidden
      style={{ touchAction: "none" }}
      className={`cursor-grab active:cursor-grabbing ${className ?? ""}`}
    >
      <circle cx={4} cy={5} r={1.5} fill="currentColor" />
      <circle cx={10} cy={5} r={1.5} fill="currentColor" />
      <circle cx={4} cy={10} r={1.5} fill="currentColor" />
      <circle cx={10} cy={10} r={1.5} fill="currentColor" />
      <circle cx={4} cy={15} r={1.5} fill="currentColor" />
      <circle cx={10} cy={15} r={1.5} fill="currentColor" />
    </svg>
  );
}

interface DraggablePrintListProps {
  entries: IndexEntry[];
  order: string[];
  onReorder: (newOrder: string[]) => void;
  onRemove: (id: string) => void;
  isBookmarked: (id: string) => boolean;
  isDone: (id: string) => boolean;
}

const DIFF_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  hard: "bg-red-100 text-red-700",
};

function diffBadgeClass(difficulty: string): string {
  return DIFF_COLORS[difficulty.toLowerCase()] ?? "bg-ink-100 text-ink-600";
}

export function DraggablePrintList({
  entries,
  order,
  onReorder,
  onRemove,
  isBookmarked,
  isDone,
}: DraggablePrintListProps): JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build a lookup from entries for quick access
  const entryMap = new Map(entries.map((e) => [e.id, e]));

  // Ordered list based on the order prop, filtered to only entries that exist
  const orderedEntries = order
    .map((id) => entryMap.get(id))
    .filter((e): e is IndexEntry => e != null);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (targetId === dragId) {
        setDropIndicator(null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position: "before" | "after" =
        e.clientY < midY ? "before" : "after";
      setDropIndicator({ id: targetId, position });
    },
    [dragId],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Only clear if we're leaving the list entirely
      const related = e.relatedTarget as HTMLElement | null;
      if (!listRef.current?.contains(related)) {
        setDropIndicator(null);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === targetId) {
        setDragId(null);
        setDropIndicator(null);
        return;
      }

      const newOrder = order.filter((id) => id !== sourceId);
      const targetIndex = newOrder.indexOf(targetId);
      if (targetIndex < 0) {
        setDragId(null);
        setDropIndicator(null);
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertIndex = e.clientY < midY ? targetIndex : targetIndex + 1;
      newOrder.splice(insertIndex, 0, sourceId);
      onReorder(newOrder);
      setDragId(null);
      setDropIndicator(null);
    },
    [order, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropIndicator(null);
  }, []);

  // Drop onto the tail zone after the last item → append.
  const handleTailDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData("text/plain");
      if (sourceId) {
        const newOrder = order.filter((id) => id !== sourceId);
        newOrder.push(sourceId);
        onReorder(newOrder);
      }
      setDragId(null);
      setDropIndicator(null);
    },
    [order, onReorder],
  );

  const handleTailDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropIndicator({ id: "__tail__", position: "after" });
    },
    [dragId],
  );

  // Move an item up or down by one slot — keyboard fallback for drag.
  const moveBy = useCallback(
    (id: string, delta: -1 | 1) => {
      const from = order.indexOf(id);
      if (from < 0) return;
      const to = from + delta;
      if (to < 0 || to >= order.length) return;
      const newOrder = [...order];
      newOrder.splice(from, 1);
      newOrder.splice(to, 0, id);
      onReorder(newOrder);
    },
    [order, onReorder],
  );

  // Move an item to an absolute 1-based position (kebab "Move to…" picker).
  const moveTo = useCallback(
    (id: string, position: number) => {
      const from = order.indexOf(id);
      if (from < 0) return;
      const to = Math.max(0, Math.min(order.length - 1, position - 1));
      if (to === from) return;
      const newOrder = [...order];
      newOrder.splice(from, 1);
      newOrder.splice(to, 0, id);
      onReorder(newOrder);
    },
    [order, onReorder],
  );

  if (orderedEntries.length === 0) {
    return (
      <div className="text-[12px] text-ink-400 text-center py-6">
        Add questions with the <kbd>S</kbd> key or checkbox
      </div>
    );
  }

  return (
    <div ref={listRef} role="list" aria-label="Print set questions">
      {orderedEntries.map((entry, i) => {
        const isDragging = dragId === entry.id;
        const showBefore =
          dropIndicator?.id === entry.id &&
          dropIndicator.position === "before";
        const showAfter =
          dropIndicator?.id === entry.id &&
          dropIndicator.position === "after";

        return (
          <div key={entry.id}>
            {/* Insertion bar — replaces the weak top/bottom border on the row. */}
            {showBefore && <InsertionBar depth={0} />}
            <div
              role="listitem"
              draggable
              tabIndex={0}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              onKeyDown={(e) => {
                if (e.altKey && e.key === "ArrowUp") {
                  e.preventDefault();
                  moveBy(entry.id, -1);
                } else if (e.altKey && e.key === "ArrowDown") {
                  e.preventDefault();
                  moveBy(entry.id, 1);
                }
              }}
              onDragStart={(e) => handleDragStart(e, entry.id)}
              onDragOver={(e) => handleDragOver(e, entry.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, entry.id)}
              onDragEnd={handleDragEnd}
              className={
                "flex items-center gap-2 px-3 py-2 rounded-lg border border-ink-200 bg-white mb-1 select-none transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" +
                (isDragging ? " opacity-50" : "")
              }
            >
              {/* Drag handle */}
              <span className="text-ink-400 hover:text-ink-600 shrink-0" aria-hidden="true">
                <DragHandle />
              </span>

              {/* Question number */}
            <span className="text-[12px] font-medium text-ink-700 tabular-nums shrink-0 w-8">
              {entry.number != null ? `#${entry.number}` : `${i + 1}`}
            </span>

            {/* Difficulty badge */}
            <span
              className={
                "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 " +
                diffBadgeClass(entry.difficulty)
              }
            >
              {entry.difficulty}
            </span>

            {/* Skill text */}
            <span className="text-[12px] text-ink-600 truncate min-w-0 flex-1">
              {entry.skill}
              {isBookmarked(entry.id) && (
                <span
                  className="ml-1 inline-flex items-center text-amber-500 align-text-bottom"
                  aria-label="Bookmarked"
                  title="Bookmarked"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3 h-3"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </span>
              )}
              {isDone(entry.id) && (
                <span className="ml-1 text-green-500" aria-label="Done" title="Done">✓</span>
              )}
            </span>

            {/* Move-to position picker — keyboard / touch fallback for drag. */}
            <span className="shrink-0">
              <KebabMenu
                options={[
                  {
                    label: "Move up",
                    disabled: i === 0,
                    onSelect: () => moveBy(entry.id, -1),
                  },
                  {
                    label: "Move down",
                    disabled: i === orderedEntries.length - 1,
                    onSelect: () => moveBy(entry.id, 1),
                  },
                  {
                    label: "Move to top",
                    disabled: i === 0,
                    onSelect: () => moveTo(entry.id, 1),
                  },
                  {
                    label: "Move to bottom",
                    disabled: i === orderedEntries.length - 1,
                    onSelect: () => moveTo(entry.id, orderedEntries.length),
                  },
                  {
                    label: "Remove from print set",
                    destructive: true,
                    onSelect: () => onRemove(entry.id),
                  },
                ]}
              />
            </span>

            {/* Remove button */}
            <button
              type="button"
              onClick={() => onRemove(entry.id)}
              className="text-ink-400 hover:text-red-500 w-5 h-5 flex items-center justify-center shrink-0 rounded focus-ring transition-colors"
              aria-label={`Remove question ${entry.number ?? entry.id}`}
              title="Remove from print set"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
                aria-hidden="true"
              >
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
            </div>
            {showAfter && <InsertionBar depth={0} />}
          </div>
        );
      })}
      {/* Tail drop zone — drop here to append to the end of the set. */}
      <div
        onDragOver={handleTailDragOver}
        onDrop={handleTailDrop}
        aria-hidden="true"
        className={
          "h-6 rounded-lg border border-dashed mb-1 transition-colors" +
          (dropIndicator?.id === "__tail__"
            ? " border-indigo-500 bg-indigo-50"
            : " border-transparent")
        }
      />
    </div>
  );
}
