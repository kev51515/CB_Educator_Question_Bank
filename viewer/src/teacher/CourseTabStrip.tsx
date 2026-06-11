/**
 * CourseTabStrip — the per-course tab bar, organised into GROUPS with an
 * always-visible SUBTAB row (two-level navigation).
 *
 * Row 1 — groups. Single-item groups render as plain NavLink tabs (the classic
 * border-b-2 accent underline). Multi-item groups render as buttons; clicking
 * one navigates to the group's first page (or stays put if the current route
 * already lives inside the group).
 *
 * Row 2 — the active group's pages, ALWAYS visible while a multi-item group is
 * active (owner decision 2026-06: subtabs over dropdown menus). The active
 * group tab and the subtab band share the same accent-tinted surface so the
 * two levels read as one connected control: the tab is drawn as the band's
 * "raised lip" (tinted bg + rounded top, no underline), and the band carries
 * the underline weight instead. Single-item groups have no band.
 *
 * Drag-reorder happens at the GROUP level only (HTML5 drag + Alt+←/→), and the
 * order persists per user AND course type under
 * `staff.coursetabs.grouporder:<userId>:<courseType>`. The saved order
 * reconciles: known group ids first, new ids appended, missing ones dropped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { classPath } from "@/lib/routes";

export interface CourseTab {
  /** Relative path inside the course. Empty string = index. */
  to: string;
  label: string;
  end?: boolean;
}

export interface CourseTabGroup {
  /** Stable id — the unit of drag-order persistence. */
  id: string;
  label: string;
  items: CourseTab[];
}

const orderKey = (userId: string | null, courseType: string) =>
  `staff.coursetabs.grouporder:${userId ?? "anon"}:${courseType}`;

function readOrder(userId: string | null, courseType: string): string[] | null {
  try {
    const raw = localStorage.getItem(orderKey(userId, courseType));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

function writeOrder(
  userId: string | null,
  courseType: string,
  ids: string[],
): void {
  try {
    localStorage.setItem(orderKey(userId, courseType), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function applyOrder(
  groups: CourseTabGroup[],
  ids: string[],
): CourseTabGroup[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const out: CourseTabGroup[] = [];
  for (const id of ids) {
    const g = byId.get(id);
    if (g && !seen.has(id)) {
      out.push(g);
      seen.add(id);
    }
  }
  for (const g of groups) if (!seen.has(g.id)) out.push(g);
  return out;
}

function pathFor(base: string, tab: CourseTab): string {
  return tab.to ? `${base}/${tab.to}` : base;
}

function isPathActive(pathname: string, tabPath: string): boolean {
  return pathname === tabPath || pathname.startsWith(`${tabPath}/`);
}

/**
 * Row-1 tab styling. Active MULTI-item groups get the tinted "lip" treatment
 * (fuses with the subtab band below); active single-item tabs keep the classic
 * accent underline (no band follows them).
 */
function groupTabClass(opts: { active: boolean; fused: boolean }): string {
  const base =
    "whitespace-nowrap min-h-[40px] md:min-h-[36px] inline-flex items-center gap-1.5 px-3.5 text-sm font-medium transition-colors";
  if (opts.active && opts.fused) {
    return `${base} rounded-t-lg bg-accent-600/[0.08] dark:bg-accent-400/[0.14] text-accent-800 dark:text-accent-200 font-semibold`;
  }
  if (opts.active) {
    return `${base} border-b-2 border-accent-600 text-accent-700 dark:text-accent-300 font-semibold`;
  }
  return `${base} border-b-2 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700`;
}

interface Props {
  groups: CourseTabGroup[];
  shortCode: string;
  userId: string | null;
  /** Part of the persistence key — each course type keeps its own group order. */
  courseType: string;
  /** Right-aligned chrome rendered on the groups row (code chip, kebab …). */
  trailing?: React.ReactNode;
}

export function CourseTabStrip({
  groups,
  shortCode,
  userId,
  courseType,
  trailing,
}: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = classPath(shortCode);

  const [order, setOrder] = useState<string[]>(() =>
    applyOrder(groups, readOrder(userId, courseType) ?? []).map((g) => g.id),
  );
  useEffect(() => {
    setOrder(
      applyOrder(groups, readOrder(userId, courseType) ?? []).map((g) => g.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, courseType]);

  const ordered = useMemo(() => applyOrder(groups, order), [groups, order]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // The group containing the current route (drives the subtab band).
  const activeGroup = useMemo(
    () =>
      ordered.find((g) =>
        g.items.some((t) => isPathActive(pathname, pathFor(base, t))),
      ) ?? null,
    [ordered, pathname, base],
  );
  const bandItems =
    activeGroup && activeGroup.items.length > 1 ? activeGroup.items : null;

  // Keep the active group tab visible in the horizontally scrolling row.
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [pathname, ordered.length]);

  const commit = useCallback(
    (ids: string[]) => {
      setOrder(ids);
      writeOrder(userId, courseType, ids);
    },
    [userId, courseType],
  );

  const moveBefore = useCallback(
    (id: string, beforeId: string) => {
      const ids = ordered.map((g) => g.id).filter((x) => x !== id);
      const idx = ids.indexOf(beforeId);
      ids.splice(idx < 0 ? ids.length : idx, 0, id);
      commit(ids);
    },
    [ordered, commit],
  );

  // Keyboard reorder: Alt+←/→ moves the focused group tab.
  const nudge = useCallback(
    (id: string, dir: -1 | 1) => {
      const ids = ordered.map((g) => g.id);
      const from = ids.indexOf(id);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      commit(ids);
    },
    [ordered, commit],
  );

  return (
    <div>
      {/* ── Row 1: groups ─────────────────────────────────────────────── */}
      <div className="flex items-end gap-3">
        <nav
          aria-label="Course sections"
          className="flex flex-1 min-w-0 items-end gap-1 overflow-x-auto"
        >
          {ordered.map((group) => {
            const isActiveGroup = group.items.some((t) =>
              isPathActive(pathname, pathFor(base, t)),
            );
            const single = group.items.length === 1 ? group.items[0] : null;
            const dragProps = {
              draggable: true,
              onDragStart: (e: React.DragEvent) => {
                setDragId(group.id);
                e.dataTransfer.effectAllowed = "move";
                try {
                  e.dataTransfer.setData("text/plain", group.id);
                } catch {
                  /* ignore */
                }
              },
              onDragOver: (e: React.DragEvent) => {
                if (!dragId || dragId === group.id) {
                  setDropTarget(null);
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropTarget(group.id);
                moveBefore(dragId, group.id);
              },
              onDragEnd: () => {
                setDragId(null);
                setDropTarget(null);
              },
              onDrop: () => setDropTarget(null),
            };
            const onKeyDown = (e: React.KeyboardEvent) => {
              if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                nudge(group.id, -1);
              } else if (e.altKey && e.key === "ArrowRight") {
                e.preventDefault();
                nudge(group.id, 1);
              }
            };
            return (
              <div
                key={group.id}
                ref={isActiveGroup ? activeRef : undefined}
                {...dragProps}
                className={`relative cursor-grab active:cursor-grabbing ${
                  dragId === group.id ? "opacity-50" : ""
                }`}
              >
                {dragId && dropTarget === group.id && dragId !== group.id && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-accent-500"
                  />
                )}
                {single ? (
                  <NavLink
                    to={pathFor(base, single)}
                    end={single.end}
                    draggable={false}
                    aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                    onKeyDown={onKeyDown}
                    className={groupTabClass({
                      active: isActiveGroup,
                      fused: false,
                    })}
                  >
                    {group.label}
                  </NavLink>
                ) : (
                  <button
                    type="button"
                    aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                    aria-current={isActiveGroup ? "true" : undefined}
                    onKeyDown={onKeyDown}
                    onClick={() => {
                      // Already inside the group → no-op; else open its first page.
                      if (!isActiveGroup) {
                        navigate(pathFor(base, group.items[0]));
                      }
                    }}
                    className={groupTabClass({
                      active: isActiveGroup,
                      fused: true,
                    })}
                  >
                    {group.label}
                  </button>
                )}
              </div>
            );
          })}
        </nav>
        {trailing && (
          <div className="flex shrink-0 items-center gap-2 pb-1">{trailing}</div>
        )}
      </div>

      {/* ── Row 2: the active group's pages (subtabs) ─────────────────── */}
      {/* Shares the active tab's tint so tab + band read as one control;
          the band carries the accent baseline the fused tab gave up. */}
      {bandItems && activeGroup && (
        <nav
          aria-label={`${activeGroup.label} pages`}
          className="flex items-center gap-1 overflow-x-auto rounded-b-lg rounded-tr-lg bg-accent-600/[0.08] dark:bg-accent-400/[0.14] px-1.5 py-1.5 border-b-2 border-accent-600"
        >
          {bandItems.map((tab) => (
            <NavLink
              key={tab.to}
              to={pathFor(base, tab)}
              end={tab.end}
              className={({ isActive }) =>
                `whitespace-nowrap min-h-[36px] md:min-h-[30px] inline-flex items-center rounded-lg px-3 text-[13px] font-medium transition-colors ${
                  isActive || isPathActive(pathname, pathFor(base, tab))
                    ? "bg-white dark:bg-slate-900 text-accent-800 dark:text-accent-200 font-semibold shadow-sm ring-1 ring-accent-600/20"
                    : "text-accent-800/80 dark:text-accent-200/80 hover:bg-white/60 dark:hover:bg-slate-900/50 hover:text-accent-800 dark:hover:text-accent-200"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
