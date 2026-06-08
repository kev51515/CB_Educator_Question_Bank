import { useState, useCallback, useRef } from "react";
import type { IndexEntry } from "@/types";

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
          <div
            key={entry.id}
            role="listitem"
            draggable
            onDragStart={(e) => handleDragStart(e, entry.id)}
            onDragOver={(e) => handleDragOver(e, entry.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, entry.id)}
            onDragEnd={handleDragEnd}
            className={
              "flex items-center gap-2 px-3 py-2 rounded-lg border border-ink-200 bg-white mb-1 select-none transition-opacity" +
              (isDragging ? " opacity-50" : "") +
              (showBefore ? " border-t-2 border-t-accent-600" : "") +
              (showAfter ? " border-b-2 border-b-accent-600" : "")
            }
          >
            {/* Drag handle */}
            <span
              className="cursor-grab text-ink-400 hover:text-ink-600 text-[14px] leading-none shrink-0"
              aria-hidden="true"
            >
              ≡
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
        );
      })}
    </div>
  );
}
