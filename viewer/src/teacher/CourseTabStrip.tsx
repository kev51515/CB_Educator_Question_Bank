/**
 * CourseTabStrip — the per-course tab bar, organised into GROUPS.
 *
 * Each group is either:
 *   - single-item → a plain NavLink tab (same border-b-2 accent styling as the
 *     old flat strip), or
 *   - multi-item  → a button tab with a chevron that opens a dropdown menu
 *     (role="menu", keyboard + outside-click + viewport-flip behaviour
 *     modelled on components/KebabMenu.tsx). When the active route lives
 *     inside a group, the group tab shows the accent underline and its label
 *     reads "Group · Page" (e.g. "Teach · Grades").
 *
 * Drag-reorder happens at the GROUP level only (HTML5 drag + Alt+←/→), and the
 * order persists per user AND course type under
 * `staff.coursetabs.grouporder:<userId>:<courseType>`. The saved order
 * reconciles: known group ids first, new ids appended, missing ones dropped.
 * (The pre-grouping flat key `staff.coursetabs.order:*` is abandoned.)
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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

function stripTabClass(isActive: boolean): string {
  return `whitespace-nowrap min-h-[40px] md:min-h-0 inline-flex items-center gap-1 px-3 py-2.5 md:py-2 text-sm font-medium border-b-2 transition-colors ${
    isActive
      ? "border-accent-600 text-accent-700 dark:text-accent-300"
      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
  }`;
}

/**
 * Multi-item group tab: a chevron button that opens a dropdown menu.
 *
 * The menu panel is position:fixed (coordinates measured from the trigger) so
 * it escapes the strip's overflow-x-auto scroll container instead of being
 * clipped. Invisible-first-paint pattern (à la KebabMenu): rendered hidden,
 * measured, then positioned + revealed — flipping to right-align when the
 * panel would overflow the right viewport edge.
 */
function GroupTab({
  group,
  base,
  onNudge,
}: {
  group: CourseTabGroup;
  base: string;
  onNudge: (dir: -1 | 1) => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // null until measured — panel paints invisibly first (no wrong-side flash).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const activeItemIndex = useMemo(
    () => group.items.findIndex((t) => isPathActive(pathname, pathFor(base, t))),
    [group.items, base, pathname],
  );
  const activeItem = activeItemIndex >= 0 ? group.items[activeItemIndex] : null;
  const isActive = activeItem !== null;

  // Outside click + Escape close; any scroll/resize closes too (the panel is
  // fixed-positioned, so it would otherwise float detached from its trigger).
  useEffect(() => {
    if (!open) {
      setPos(null);
      setActiveIndex(-1);
      return;
    }
    const onDocClick = (e: MouseEvent): void => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onReposition = (e: Event): void => {
      // Ignore scrolls inside the menu itself (long menus can scroll).
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  // Measure after first (invisible) paint: anchor to the trigger's bottom-left;
  // flip to right-align if the panel would overflow the right viewport edge.
  useEffect(() => {
    if (!open || !menuRef.current || !triggerRef.current) return;
    const tr = triggerRef.current.getBoundingClientRect();
    const menuWidth = menuRef.current.offsetWidth;
    let left = tr.left;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, tr.right - menuWidth);
    }
    setPos({ top: tr.bottom + 4, left });
  }, [open]);

  // Once positioned, move focus into the menu — onto the active page's item
  // if the current route is inside this group, else the first item.
  useEffect(() => {
    if (!open || pos === null) return;
    setActiveIndex(activeItemIndex >= 0 ? activeItemIndex : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const n = group.items.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((cur) => (cur < 0 ? 0 : (cur + 1) % n));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((cur) => (cur < 0 ? n - 1 : (cur - 1 + n) % n));
    } else if (e.key === "Home") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex(n - 1);
    } else if (e.key === "Tab") {
      // Tab closes the menu and lets focus move naturally.
      setOpen(false);
    }
  };

  const select = (tab: CourseTab): void => {
    setOpen(false);
    triggerRef.current?.focus();
    navigate(pathFor(base, tab));
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        className={stripTabClass(isActive)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.altKey && e.key === "ArrowLeft") {
            e.preventDefault();
            onNudge(-1);
          } else if (e.altKey && e.key === "ArrowRight") {
            e.preventDefault();
            onNudge(1);
          } else if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {isActive && activeItem ? `${group.label} · ${activeItem.label}` : group.label}
        <svg
          width={12}
          height={12}
          viewBox="0 0 12 12"
          aria-hidden
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={group.label}
          onKeyDown={onMenuKeyDown}
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0 }}
          className={`fixed z-50 min-w-[11rem] max-w-[18rem] rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-900 shadow py-1 text-sm ${
            pos === null ? "invisible" : ""
          }`}
        >
          {group.items.map((tab, i) => {
            const itemActive = isPathActive(pathname, pathFor(base, tab));
            return (
              <button
                key={tab.to}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                aria-current={itemActive ? "page" : undefined}
                tabIndex={i === activeIndex ? 0 : -1}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => select(tab)}
                className={`block w-full text-left px-3 py-2.5 md:py-1.5 truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  itemActive
                    ? "font-medium text-accent-700 dark:text-accent-300"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Props {
  groups: CourseTabGroup[];
  shortCode: string;
  userId: string | null;
  /** Part of the persistence key — each course type keeps its own group order. */
  courseType: string;
}

export function CourseTabStrip({ groups, shortCode, userId, courseType }: Props) {
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

  // Keyboard reorder: Alt+←/→ moves the focused group. React keeps the same
  // DOM node (stable key) when the list reorders, so focus stays put.
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
    <nav
      aria-label="Course sections"
      className="flex items-center gap-1 overflow-x-auto -mb-px"
    >
      {ordered.map((group) => {
        const isActiveGroup = group.items.some((t) =>
          isPathActive(pathname, pathFor(base, t)),
        );
        const single = group.items.length === 1 ? group.items[0] : null;
        return (
          <div
            key={group.id}
            ref={isActiveGroup ? activeRef : undefined}
            draggable
            title="Drag, or Alt+←/→, to reorder"
            onDragStart={(e) => {
              setDragId(group.id);
              e.dataTransfer.effectAllowed = "move";
              try {
                e.dataTransfer.setData("text/plain", group.id);
              } catch {
                /* ignore */
              }
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === group.id) {
                setDropTarget(null);
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropTarget(group.id);
              moveBefore(dragId, group.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropTarget(null);
            }}
            onDrop={() => setDropTarget(null)}
            className={`relative cursor-grab active:cursor-grabbing ${dragId === group.id ? "opacity-50" : ""}`}
          >
            {dragId && dropTarget === group.id && dragId !== group.id && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-indigo-500 dark:bg-indigo-400"
              />
            )}
            {single ? (
              <NavLink
                to={pathFor(base, single)}
                end={single.end}
                draggable={false}
                className={() => stripTabClass(isActiveGroup)}
                aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                onKeyDown={(e) => {
                  if (e.altKey && e.key === "ArrowLeft") {
                    e.preventDefault();
                    nudge(group.id, -1);
                  } else if (e.altKey && e.key === "ArrowRight") {
                    e.preventDefault();
                    nudge(group.id, 1);
                  }
                }}
              >
                {group.label}
              </NavLink>
            ) : (
              <GroupTab
                group={group}
                base={base}
                onNudge={(dir) => nudge(group.id, dir)}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
