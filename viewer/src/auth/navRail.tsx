/**
 * navRail — the reorderable educator sidebar rail.
 *
 * Each nav item is data ({id, to, label, icon}); the user can drag items into
 * the order they like and it persists per-user to localStorage. Falls back to
 * the canonical order for a fresh user, appends any newly-added items, and
 * drops ids that no longer exist (e.g. the Question Bank items for an educator
 * who loses access). Keyboard users reorder via the grip handle (↑/↓).
 *
 * Uses native HTML5 drag-and-drop to match the house pattern (ModulesPage), no
 * extra dependency.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ROUTES } from "@/lib/routes";

export interface NavRailItem {
  id: string;
  to: string;
  label: string;
  icon: ReactNode;
  /** Custom active matcher (e.g. Account highlights on any /account/* path). */
  isActive?: (pathname: string) => boolean;
}

interface RailIconProps {
  children: ReactNode;
}

export function RailIcon({ children }: RailIconProps) {
  return (
    <span aria-hidden className="inline-flex items-center justify-center h-6 w-6">
      {children}
    </span>
  );
}

export function railLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    "flex flex-col md:flex-row items-center md:items-center gap-1 md:gap-3 px-2 md:px-3 py-3 min-h-[44px] rounded-lg text-xs md:text-sm font-medium transition-colors w-full",
    isActive
      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200 ring-1 ring-indigo-200 dark:ring-indigo-900"
      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
  ].join(" ");
}

export function isAccountRouteActive(pathname: string): boolean {
  // Account settings — but NOT the admin subtree (that has its own rail item).
  if (pathname.startsWith(`${ROUTES.ACCOUNT}/admin`)) return false;
  return pathname === ROUTES.ACCOUNT || pathname.startsWith(`${ROUTES.ACCOUNT}/`);
}

// ---- order persistence (per user) ----------------------------------------

const orderKey = (userId: string | null): string =>
  `staff.nav.order:${userId ?? "anon"}`;

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
    /* ignore quota / disabled storage */
  }
}

/**
 * Project `items` into the saved id order: saved ids first (in their order),
 * then any items not in the saved list appended in canonical order. Ids in the
 * saved list that no longer map to an item are skipped.
 */
function orderItems(items: NavRailItem[], ids: string[]): NavRailItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const out: NavRailItem[] = [];
  for (const id of ids) {
    const it = byId.get(id);
    if (it && !seen.has(id)) {
      out.push(it);
      seen.add(id);
    }
  }
  for (const it of items) {
    if (!seen.has(it.id)) out.push(it);
  }
  return out;
}

// ---- component ------------------------------------------------------------

interface Props {
  items: NavRailItem[];
  collapsed: boolean;
  userId: string | null;
}

export function ReorderableNavRail({ items, collapsed, userId }: Props) {
  const location = useLocation();

  // `order` holds the user's preferred id sequence. Seed from storage; reseed
  // when the user id resolves (profile loads after mount).
  const [order, setOrder] = useState<string[]>(() =>
    orderItems(items, readOrder(userId) ?? []).map((i) => i.id),
  );
  useEffect(() => {
    setOrder(orderItems(items, readOrder(userId) ?? []).map((i) => i.id));
    // Re-read whenever the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const ordered = useMemo(() => orderItems(items, order), [items, order]);
  const [dragId, setDragId] = useState<string | null>(null);

  const commit = useCallback(
    (ids: string[]) => {
      setOrder(ids);
      writeOrder(userId, ids);
    },
    [userId],
  );

  // Move `id` so it sits immediately before `beforeId` (or to the end when
  // beforeId is null). Operates on the currently-rendered order.
  const moveBefore = useCallback(
    (id: string, beforeId: string | null) => {
      const ids = ordered.map((i) => i.id).filter((x) => x !== id);
      const idx = beforeId ? ids.indexOf(beforeId) : ids.length;
      ids.splice(idx < 0 ? ids.length : idx, 0, id);
      commit(ids);
    },
    [ordered, commit],
  );

  const nudge = useCallback(
    (id: string, dir: -1 | 1) => {
      const ids = ordered.map((i) => i.id);
      const from = ids.indexOf(id);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      commit(ids);
    },
    [ordered, commit],
  );

  return (
    <>
      {ordered.map((item) => {
        const active = item.isActive
          ? item.isActive(location.pathname)
          : undefined;
        return (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => {
              setDragId(item.id);
              e.dataTransfer.effectAllowed = "move";
              // Some browsers require data to be set for a drag to start.
              try {
                e.dataTransfer.setData("text/plain", item.id);
              } catch {
                /* ignore */
              }
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === item.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              // Live reorder: drop the dragged item before the hovered one.
              moveBefore(dragId, item.id);
            }}
            onDragEnd={() => setDragId(null)}
            className={[
              "group relative rounded-lg",
              dragId === item.id ? "opacity-50" : "",
            ].join(" ")}
          >
            <NavLink
              to={item.to}
              title={item.label}
              draggable={false}
              className={
                active === undefined
                  ? railLinkClass
                  : () => railLinkClass({ isActive: active })
              }
            >
              <RailIcon>{item.icon}</RailIcon>
              <span className={collapsed ? "md:hidden" : undefined}>
                {item.label}
              </span>
            </NavLink>

            {/* Grip: drag affordance + keyboard reorder. Expanded view only. */}
            {!collapsed && (
              <button
                type="button"
                aria-label={`Reorder ${item.label} (use arrow up and down)`}
                title="Drag to reorder"
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    nudge(item.id, -1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    nudge(item.id, 1);
                  }
                }}
                className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 h-7 w-5 items-center justify-center rounded text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-grab active:cursor-grabbing"
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx={9} cy={6} r={1.6} />
                  <circle cx={15} cy={6} r={1.6} />
                  <circle cx={9} cy={12} r={1.6} />
                  <circle cx={15} cy={12} r={1.6} />
                  <circle cx={9} cy={18} r={1.6} />
                  <circle cx={15} cy={18} r={1.6} />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
