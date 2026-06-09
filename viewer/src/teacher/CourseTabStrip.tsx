/**
 * CourseTabStrip — the per-course tab bar. Tabs are grouped by function in the
 * default order and can be drag-reordered into any arrangement the user likes;
 * the order persists per user in localStorage (like the left rail). The visible
 * set is course-type aware (Caseload/Portfolio/Skills come and go), and the
 * saved order reconciles: known ids first, new ids appended, missing ones
 * dropped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { classPath } from "@/lib/routes";

export interface CourseTab {
  to: string;
  label: string;
  end?: boolean;
}

const orderKey = (userId: string | null) =>
  `staff.coursetabs.order:${userId ?? "anon"}`;

function readOrder(userId: string | null): string[] | null {
  try {
    const raw = localStorage.getItem(orderKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

function writeOrder(userId: string | null, ids: string[]): void {
  try {
    localStorage.setItem(orderKey(userId), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function applyOrder(tabs: CourseTab[], ids: string[]): CourseTab[] {
  const byId = new Map(tabs.map((t) => [t.to, t]));
  const seen = new Set<string>();
  const out: CourseTab[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (t && !seen.has(id)) {
      out.push(t);
      seen.add(id);
    }
  }
  for (const t of tabs) if (!seen.has(t.to)) out.push(t);
  return out;
}

function tabClass({ isActive }: { isActive: boolean }): string {
  return `whitespace-nowrap min-h-[40px] md:min-h-0 inline-flex items-center px-3 py-2.5 md:py-2 text-sm font-medium border-b-2 transition-colors ${
    isActive
      ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
  }`;
}

interface Props {
  tabs: CourseTab[];
  shortCode: string;
  userId: string | null;
}

export function CourseTabStrip({ tabs, shortCode, userId }: Props) {
  const [order, setOrder] = useState<string[]>(() =>
    applyOrder(tabs, readOrder(userId) ?? []).map((t) => t.to),
  );
  useEffect(() => {
    setOrder(applyOrder(tabs, readOrder(userId) ?? []).map((t) => t.to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const ordered = useMemo(() => applyOrder(tabs, order), [tabs, order]);
  const [dragId, setDragId] = useState<string | null>(null);

  // Keep the active tab visible in the (horizontally scrolling) strip.
  const { pathname } = useLocation();
  const base = classPath(shortCode);
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [pathname, ordered.length]);

  const commit = useCallback(
    (ids: string[]) => {
      setOrder(ids);
      writeOrder(userId, ids);
    },
    [userId],
  );

  const moveBefore = useCallback(
    (id: string, beforeId: string) => {
      const ids = ordered.map((t) => t.to).filter((x) => x !== id);
      const idx = ids.indexOf(beforeId);
      ids.splice(idx < 0 ? ids.length : idx, 0, id);
      commit(ids);
    },
    [ordered, commit],
  );

  // Keyboard reorder: Alt+←/→ moves the focused tab. React keeps the same DOM
  // node (stable key) when the list reorders, so focus stays on the tab.
  const nudge = useCallback(
    (id: string, dir: -1 | 1) => {
      const ids = ordered.map((t) => t.to);
      const from = ids.indexOf(id);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      commit(ids);
    },
    [ordered, commit],
  );

  return (
    <nav aria-label="Course sections" className="flex items-center gap-1 overflow-x-auto -mb-px">
      {ordered.map((tab) => {
        const tabPath = tab.to ? `${base}/${tab.to}` : base;
        const isActiveTab =
          pathname === tabPath || pathname.startsWith(`${tabPath}/`);
        return (
        <div
          key={tab.to}
          ref={isActiveTab ? activeRef : undefined}
          draggable
          title="Drag, or Alt+←/→, to reorder"
          onDragStart={(e) => {
            setDragId(tab.to);
            e.dataTransfer.effectAllowed = "move";
            try {
              e.dataTransfer.setData("text/plain", tab.to);
            } catch {
              /* ignore */
            }
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === tab.to) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            moveBefore(dragId, tab.to);
          }}
          onDragEnd={() => setDragId(null)}
          className={`cursor-grab active:cursor-grabbing ${dragId === tab.to ? "opacity-50" : ""}`}
        >
          <NavLink
            to={tab.to ? `${classPath(shortCode)}/${tab.to}` : classPath(shortCode)}
            end={tab.end}
            draggable={false}
            className={tabClass}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
            onKeyDown={(e) => {
              if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                nudge(tab.to, -1);
              } else if (e.altKey && e.key === "ArrowRight") {
                e.preventDefault();
                nudge(tab.to, 1);
              }
            }}
          >
            {tab.label}
          </NavLink>
        </div>
        );
      })}
    </nav>
  );
}
