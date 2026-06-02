import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ─── */

interface BatchOpsProps {
  selectedIds: string[];
  onBookmarkAll: () => void;
  onDoneAll: () => void;
  onClearBookmarks: () => void;
  onClearDone: () => void;
  onTagAll?: (tagId: string) => void;
  tags?: { id: string; name: string; color: string }[];
  showToast: (msg: string) => void;
}

/* ─── BatchOpsBar component ─── */

export function BatchOpsBar({
  selectedIds,
  onBookmarkAll,
  onDoneAll,
  onClearBookmarks,
  onClearDone,
  onTagAll,
  tags,
  showToast,
}: BatchOpsProps): JSX.Element | null {
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  // Close tag menu on outside click
  useEffect(() => {
    if (!tagMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setTagMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [tagMenuOpen]);

  // Close tag menu on Escape
  useEffect(() => {
    if (!tagMenuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTagMenuOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [tagMenuOpen]);

  const handleBookmarkAll = useCallback(() => {
    onBookmarkAll();
    showToast(`Bookmarked ${selectedIds.length} questions`);
  }, [onBookmarkAll, showToast, selectedIds.length]);

  const handleDoneAll = useCallback(() => {
    onDoneAll();
    showToast(`Marked ${selectedIds.length} questions done`);
  }, [onDoneAll, showToast, selectedIds.length]);

  const handleClearBookmarks = useCallback(() => {
    onClearBookmarks();
    showToast(`Cleared bookmarks from ${selectedIds.length} questions`);
  }, [onClearBookmarks, showToast, selectedIds.length]);

  const handleClearDone = useCallback(() => {
    onClearDone();
    showToast(`Cleared done from ${selectedIds.length} questions`);
  }, [onClearDone, showToast, selectedIds.length]);

  const handleTagAll = useCallback(
    (tagId: string, tagName: string) => {
      onTagAll?.(tagId);
      showToast(`Tagged ${selectedIds.length} questions as "${tagName}"`);
      setTagMenuOpen(false);
    },
    [onTagAll, showToast, selectedIds.length],
  );

  if (selectedIds.length <= 1) return null;

  const btnClass =
    "px-2 py-1 rounded-md text-[11.5px] text-accent-700 hover:bg-accent-100 hover:text-accent-800 transition focus-ring whitespace-nowrap";

  return (
    <div className="bg-accent-50 border-b border-accent-100 px-3 py-2 flex items-center gap-2 text-[12px] flex-wrap">
      <span className="font-medium text-accent-700 tabular-nums">
        {selectedIds.length} selected
      </span>

      <div className="w-px h-4 bg-accent-200 mx-1" />

      <button type="button" onClick={handleBookmarkAll} className={btnClass}>
        Bookmark all
      </button>
      <button type="button" onClick={handleDoneAll} className={btnClass}>
        Mark all done
      </button>
      <button type="button" onClick={handleClearBookmarks} className={btnClass}>
        Clear bookmarks
      </button>
      <button type="button" onClick={handleClearDone} className={btnClass}>
        Clear done
      </button>

      {onTagAll && tags && tags.length > 0 && (
        <div ref={tagMenuRef} className="relative inline-block">
          <button
            type="button"
            onClick={() => setTagMenuOpen((p) => !p)}
            className={btnClass + " inline-flex items-center gap-1"}
          >
            Tag all
            <svg
              className={"w-3 h-3 transition-transform " + (tagMenuOpen ? "rotate-180" : "")}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {tagMenuOpen && (
            <div className="absolute left-0 mt-1 w-40 bg-white border border-ink-200 rounded-lg shadow-card z-30 py-1 text-[12px]">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleTagAll(tag.id, tag.name)}
                  className="w-full text-left px-3 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors flex items-center gap-2"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
