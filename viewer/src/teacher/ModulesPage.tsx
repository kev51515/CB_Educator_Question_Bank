/**
 * ModulesPage
 * ===========
 * Canvas-style Modules surface for a course. Default landing tab inside
 * /courses/:courseId. Lists every course_module for the course as a
 * collapsible card; each card lists its module_items.
 *
 * Wave 8B (this revision) layers Canvas-equivalent UX on top:
 *   - Visible 6-dot drag handles on rows & item rows (existing native HTML5
 *     drag-and-drop still drives reorder).
 *   - Inline rename for module + item titles (click-to-edit, Enter/Esc).
 *   - Persisted collapse state per (user, course) via localStorage.
 *   - Top toolbar with collapse/expand-all, publish-all, +Module.
 *   - Kebab menus on each module + item (Duplicate / Lock-until / Move…).
 *   - One-click publish toggles via the round status indicator.
 *   - Student surface: completion ticks via `module_item_completion` +
 *     `mark_item_complete` RPC, plus a locked-module read-only display.
 *
 * Wave 8A's database contract (lock_at column, completion table, RPCs:
 * duplicate_module / move_item_to_module / toggle_module_publish /
 * toggle_item_publish / mark_item_complete) is assumed available at runtime.
 * If an RPC is missing in dev the error surfaces via a transient toast and
 * the UI continues to function for everything else.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClassContext } from "./classLayoutContext";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { courseAssignmentPath } from "@/lib/routes";
import {
  buildTree,
  useCourseModules,
  type CourseModule,
  type ModuleItem,
  type ModuleNode,
} from "./useCourseModules";
import { useMyModuleCompletion } from "./useMyModuleCompletion";
import {
  type DropTarget,
  type ItemDropTarget,
  collapseKey,
  readCollapseState,
  writeCollapseState,
  LockUntilPicker,
  MoveItemPicker,
  MoveModulePicker,
  InlineCreateModuleRow,
  ModuleNodeView,
} from "@/teacher/modules-page";
import { EditModuleModal } from "./EditModuleModal";
import { TeacherJourneyPanel } from "@/journey/TeacherJourneyPanel";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDialog } from "./ConfirmDialog";

// -----------------------------------------------------------------------------
// Small shared UI bits
// -----------------------------------------------------------------------------

/**
 * Auto-scroll the viewport when the user drags near its top/bottom edges.
 * Notion/Linear pattern — lets users reach items currently out of view as
 * drop targets without manually scrolling. Local (not extracted) per
 * project convention (see CLAUDE.md).
 */
function useAutoScrollOnDrag(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let rafId: number | null = null;
    let velocity = 0;
    const EDGE = 80; // px from viewport edge that triggers scroll
    const MAX_SPEED = 18; // px per frame

    const onDragOver = (e: DragEvent): void => {
      const y = e.clientY;
      const vh = window.innerHeight;
      if (y < EDGE) {
        velocity = -MAX_SPEED * (1 - y / EDGE);
      } else if (y > vh - EDGE) {
        velocity = MAX_SPEED * (1 - (vh - y) / EDGE);
      } else {
        velocity = 0;
      }
      if (velocity !== 0 && rafId === null) {
        const step = (): void => {
          window.scrollBy(0, velocity);
          if (velocity !== 0) {
            rafId = requestAnimationFrame(step);
          } else {
            rafId = null;
          }
        };
        rafId = requestAnimationFrame(step);
      }
    };
    const onDragEnd = (): void => {
      velocity = 0;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragend", onDragEnd);
    document.addEventListener("drop", onDragEnd);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragend", onDragEnd);
      document.removeEventListener("drop", onDragEnd);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [active]);
}


// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export function ModulesPage(): JSX.Element {
  // The URL param `courseId` is the user-facing slug (short_code OR legacy
  // UUID). We MUST use the resolved UUID from context for every downstream
  // hook + RPC — otherwise PostgreSQL rejects with `invalid input syntax
  // for type uuid` when the slug is a short_code like "69WAJ3".
  const { cls } = useClassContext();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const classId: string | null = cls?.id ?? null;
  const { modules, loading, error, refresh, patchModule } = useCourseModules(classId);
  // Ref mirror of `modules` so the drop-commit handlers (which can fire on a
  // quick second drag, before their useCallback closures re-bind to the
  // post-refresh `modules`) read the LATEST module list instead of the stale
  // render-time snapshot. Same ref-mirror discipline as dropTargetRef etc.
  const modulesRef = useRef(modules);
  modulesRef.current = modules;

  const toast = useToast();
  const isStudent = profile?.role === "student";
  const canEdit = useMemo(() => {
    const role = profile?.role;
    return role === "teacher" || role === "admin";
  }, [profile?.role]);

  // Persisted collapse state keyed by (user, course).
  const persistKey = collapseKey(profile?.id ?? null, classId);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    readCollapseState(persistKey),
  );
  useEffect(() => {
    setCollapsed(readCollapseState(persistKey));
  }, [persistKey]);
  useEffect(() => {
    writeCollapseState(persistKey, collapsed);
  }, [persistKey, collapsed]);

  const expandedFor = useCallback(
    (moduleId: string): boolean => !(collapsed[moduleId] ?? false),
    [collapsed],
  );

  // Journey | List views (staff only). Journey — the read-only
  // class-aggregate mastery grid (docs/JOURNEY_VIEW.md) — is the PRIMARY
  // view; List is the existing module editor. Persisted per course.
  const journeyKey = `staff.modulesView:${classId ?? ""}`;
  const [journeyMode, setJourneyMode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(journeyKey) !== "list";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      setJourneyMode(window.localStorage.getItem(journeyKey) !== "list");
    } catch {
      setJourneyMode(true);
    }
  }, [journeyKey]);
  const setModulesView = useCallback(
    (mode: "journey" | "list"): void => {
      setJourneyMode(mode === "journey");
      try {
        window.localStorage.setItem(journeyKey, mode);
      } catch {
        // ignore (private mode / quota)
      }
    },
    [journeyKey],
  );
  // The aggregate journey is a STAFF lens — students on this surface always
  // get the regular list (their own journey lives on StudentCourseView).
  const journeyActive = !isStudent && journeyMode;

  // Inline-create replaces the old "Add module" modal. When non-null an
  // input row renders above the modules list with the cursor focused inside;
  // Enter commits, Esc cancels. See `commitInlineCreateModule` below.
  const [inlineCreatingModule, setInlineCreatingModule] = useState<
    null | { busy: boolean }
  >(null);
  const [editingModule, setEditingModule] = useState<CourseModule | null>(null);
  const [addingItemToModule, setAddingItemToModule] =
    useState<CourseModule | null>(null);
  const [deletingModule, setDeletingModule] = useState<CourseModule | null>(
    null,
  );
  const [lockingModule, setLockingModule] = useState<CourseModule | null>(null);
  const [movingItem, setMovingItem] = useState<ModuleItem | null>(null);
  const [movingModule, setMovingModule] = useState<ModuleNode | null>(null);

  // Bulk-select state — checkboxes render on every module row when selectMode
  // is on, and the sticky action bar appears at the bottom when one or more
  // modules are selected. The "Select"/"Done" toolbar button is the only
  // entry/exit point in v1; we also reset on window resize / browser back to
  // avoid stale selection state surviving navigation.
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState<boolean>(false);

  const exitSelectMode = useCallback((): void => {
    setSelectMode(false);
    setSelectedModuleIds(new Set<string>());
  }, []);

  const toggleSelectedModule = useCallback((moduleId: string): void => {
    setSelectedModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  const isModuleSelected = useCallback(
    (moduleId: string): boolean => selectedModuleIds.has(moduleId),
    [selectedModuleIds],
  );

  // Auto-exit select mode on window resize + browser back (clean state).
  useEffect(() => {
    if (!selectMode) return;
    const onResize = (): void => exitSelectMode();
    const onPop = (): void => exitSelectMode();
    window.addEventListener("resize", onResize);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPop);
    };
  }, [selectMode, exitSelectMode]);

  // Prune selection if modules disappear (delete elsewhere, refresh, etc.).
  useEffect(() => {
    if (selectedModuleIds.size === 0) return;
    const live = new Set(modules.map((m) => m.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedModuleIds) {
      if (live.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedModuleIds(next);
  }, [modules, selectedModuleIds]);

  // Drag state — separate per granularity. Mirrored to refs so the hot
  // onDragOver / onDrop handlers can read the latest value without picking
  // up a stale closure from a prior render. setX/setItem wrappers update
  // both the React state and the ref atomically.
  const [draggedModuleId, setDraggedModuleIdState] = useState<string | null>(null);
  const draggedModuleIdRef = useRef<string | null>(null);
  const setDraggedModuleId = useCallback((id: string | null): void => {
    draggedModuleIdRef.current = id;
    setDraggedModuleIdState(id);
  }, []);
  const [draggedItem, setDraggedItemState] = useState<ModuleItem | null>(null);
  const draggedItemRef = useRef<ModuleItem | null>(null);
  const setDraggedItem = useCallback((item: ModuleItem | null): void => {
    draggedItemRef.current = item;
    setDraggedItemState(item);
  }, []);
  // Concurrent-drop guard. Without this a slow RPC could leave a 2nd drop
  // racing through before the 1st reconciles (would produce inconsistent
  // server state). Read/set inside commitDrop / commitItemDrop.
  const dropBusyRef = useRef<boolean>(false);
  // Drop-landing pulse: row (module or item) that just landed pulses indigo
  // briefly so the user has unambiguous "yes, it moved there" confirmation
  // beyond just the position change. The timer id is tracked so a fresh
  // drop cancels the previous pulse (no stacking) and unmount cleans up.
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerPulse = useCallback((id: string): void => {
    setRecentlyMovedId(id);
    if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => {
      setRecentlyMovedId(null);
      pulseTimerRef.current = null;
    }, 1200);
  }, []);
  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  // Live region for assistive-tech announcements of keyboard reorders.
  // The Alt+↑/Alt+↓ shortcut on the focused grip handle writes a sentence
  // here (e.g. "Moved 'Week 1' down. Now 4 of 7."), which is read out by
  // screen readers via aria-live="polite". Cleared after a short delay so
  // subsequent moves with the same destination index still re-announce.
  const [reorderAnnouncement, setReorderAnnouncement] = useState<string>("");
  const reorderAnnouncementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!reorderAnnouncement) return;
    if (reorderAnnouncementTimerRef.current !== null) {
      clearTimeout(reorderAnnouncementTimerRef.current);
    }
    reorderAnnouncementTimerRef.current = setTimeout(() => {
      setReorderAnnouncement("");
      reorderAnnouncementTimerRef.current = null;
    }, 2000);
    return () => {
      if (reorderAnnouncementTimerRef.current !== null) {
        clearTimeout(reorderAnnouncementTimerRef.current);
        reorderAnnouncementTimerRef.current = null;
      }
    };
  }, [reorderAnnouncement]);
  // Notion/Linear-style auto-scroll near viewport edges during any drag.
  useAutoScrollOnDrag(draggedModuleId !== null || draggedItem !== null);
  // Notion/Linear-style global drop indicator. Mirrored to a ref so that the
  // (rapid-fire, stale-closure-prone) onDragOver row handlers can read the
  // latest value without re-binding on every state update.
  const [dropTarget, setDropTargetState] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const setDropTarget = useCallback((target: DropTarget | null): void => {
    dropTargetRef.current = target;
    setDropTargetState(target);
  }, []);
  // Mirror state for the item-drop indicator. Items are flat (no nesting),
  // so the ItemDropTarget shape is simpler than DropTarget — but the
  // ref-mirroring pattern is the same to avoid stale-closure hits in the
  // rapid-fire per-row onDragOver handlers.
  const [itemDropTarget, setItemDropTargetState] =
    useState<ItemDropTarget | null>(null);
  const itemDropTargetRef = useRef<ItemDropTarget | null>(null);
  const setItemDropTarget = useCallback(
    (target: ItemDropTarget | null): void => {
      itemDropTargetRef.current = target;
      setItemDropTargetState(target);
    },
    [],
  );

  // Tree derived from flat modules. Memoized so child nodes are stable across
  // unrelated re-renders.
  const tree = useMemo<ModuleNode[]>(() => buildTree(modules), [modules]);

  // Flatten depth-first for selectors that need every node (Move-To picker,
  // descendant lookup, etc.). Sibling order matches the rendered tree.
  const flatNodes = useMemo<ModuleNode[]>(() => {
    const out: ModuleNode[] = [];
    const walk = (nodes: readonly ModuleNode[]): void => {
      for (const n of nodes) {
        out.push(n);
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [tree]);

  // childrenByParent: parentId|null → siblings sorted by position. Used for
  // computing reorder ids when dropping siblings.
  const childrenByParent = useMemo<Map<string | null, ModuleNode[]>>(() => {
    const map = new Map<string | null, ModuleNode[]>();
    map.set(null, tree);
    const walk = (nodes: readonly ModuleNode[]): void => {
      for (const n of nodes) {
        map.set(n.id, n.children);
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(tree);
    return map;
  }, [tree]);

  // Descendants of the currently dragged node (for cycle prevention in UI).
  const draggedDescendants = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!draggedModuleId) return set;
    const start = flatNodes.find((n) => n.id === draggedModuleId);
    if (!start) return set;
    const walk = (nodes: readonly ModuleNode[]): void => {
      for (const n of nodes) {
        set.add(n.id);
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(start.children);
    return set;
  }, [draggedModuleId, flatNodes]);

  const usedAssignmentIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of modules) {
      for (const it of m.items) {
        if (it.item_type === "assignment" && it.item_ref_id) {
          s.add(it.item_ref_id);
        }
      }
    }
    return s;
  }, [modules]);

  const maxModulePosition = modules.reduce(
    (max, m) => (m.position > max ? m.position : max),
    -1,
  );

  // Student completion state — read-only for staff.
  const allItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const m of modules) for (const it of m.items) ids.push(it.id);
    return ids;
  }, [modules]);
  const completion = useMyModuleCompletion(allItemIds, isStudent === true);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const onToggleModulePublished = useCallback(
    async (m: CourseModule): Promise<void> => {
      // Optimistic-friendly: throw on failure so the wrapping useOptimistic
      // can roll back. We still surface a toast via useOptimistic's
      // errorMessage path, plus refresh on success to converge with realtime.
      const { error: rpcError } = await supabase.rpc("toggle_module_publish", {
        p_module_id: m.id,
      });
      if (rpcError) {
        // Fallback: direct UPDATE.
        const { error: updError } = await supabase
          .from("course_modules")
          .update({ published: !m.published })
          .eq("id", m.id);
        if (updError) {
          throw new Error(updError.message);
        }
      }
      // Optimistic: patch the one module locally instead of a full refetch, so
      // publishing doesn't flash/reflow the whole list (the toggle already
      // reflects the new state instantly).
      patchModule(m.id, { published: !m.published });
    },
    [patchModule],
  );

  const onRenameModule = useCallback(
    async (moduleId: string, next: string, previous?: string): Promise<void> => {
      const { error: updError } = await supabase
        .from("course_modules")
        .update({ name: next })
        .eq("id", moduleId);
      if (updError) {
        toast.error("Couldn't rename module", updError.message);
        return;
      }
      // Offer Undo when we know the previous title and it actually changed.
      // The undo callback re-runs the rename without re-offering Undo, so we
      // can't infinite-loop on rollback failures.
      const canUndo = previous !== undefined && previous !== next;
      toast.success("Module renamed", next, canUndo ? {
        action: {
          label: "Undo",
          onAction: () => {
            void (async () => {
              const { error: undoError } = await supabase
                .from("course_modules")
                .update({ name: previous })
                .eq("id", moduleId);
              if (undoError) {
                toast.error("Couldn't undo rename", undoError.message);
                return;
              }
              await refresh();
            })();
          },
        },
      } : undefined);
      await refresh();
    },
    [refresh, toast],
  );

  const onDuplicateModule = useCallback(
    async (moduleId: string): Promise<void> => {
      const { error: rpcError } = await supabase.rpc("duplicate_module", {
        p_module_id: moduleId,
      });
      if (rpcError) {
        toast.error("Couldn't duplicate module", rpcError.message);
        return;
      }
      toast.success("Module duplicated");
      await refresh();
    },
    [refresh, toast],
  );

  const onApplyLock = useCallback(
    async (moduleId: string, iso: string | null): Promise<void> => {
      const { error: updError } = await supabase
        .from("course_modules")
        .update({ lock_at: iso })
        .eq("id", moduleId);
      if (updError) {
        toast.error("Couldn't update lock date", updError.message);
        return;
      }
      setLockingModule(null);
      toast.success(iso ? "Lock date set" : "Lock date cleared");
      await refresh();
    },
    [refresh, toast],
  );

  const onMoveItemApply = useCallback(
    async (itemId: string, targetModuleId: string, position: number): Promise<void> => {
      const { error: rpcError } = await supabase.rpc("move_item_to_module", {
        p_item_id: itemId,
        p_target_module_id: targetModuleId,
        p_position: position,
      });
      if (rpcError) {
        toast.error("Couldn't move item", rpcError.message);
        return;
      }
      setMovingItem(null);
      toast.success("Item moved");
      await refresh();
    },
    [refresh, toast],
  );

  const onConfirmDeleteModule = useCallback(async (): Promise<void> => {
    if (!deletingModule) return;
    // Soft delete (0202): Trash with 90-day recovery; items hide with it.
    const moduleId = deletingModule.id;
    const { error: delError } = await supabase.rpc("trash_content", {
      p_kind: "module",
      p_id: moduleId,
    });
    if (delError) {
      toast.error("Couldn't delete module", delError.message);
      return;
    }
    const deletedName = deletingModule.name;
    setDeletingModule(null);
    toast.success("Moved to Trash", `${deletedName} — recoverable for 90 days.`, {
      action: {
        label: "Undo",
        onAction: () => {
          void supabase
            .rpc("restore_content", { p_kind: "module", p_id: moduleId })
            .then(({ error }) => {
              if (error) toast.error("Couldn't restore", error.message);
              else {
                toast.success("Module restored", deletedName);
                void refresh();
              }
            });
        },
      },
    });
    await refresh();
  }, [deletingModule, refresh, toast]);

  // ---- Module move (atomic via move_module RPC) ----
  const callMoveModule = useCallback(
    async (
      moduleId: string,
      newParentId: string | null,
      newPosition: number,
    ): Promise<boolean> => {
      const { error: rpcError } = await supabase.rpc("move_module", {
        p_module_id: moduleId,
        p_new_parent_id: newParentId,
        p_new_position: newPosition,
      });
      if (rpcError) {
        toast.error("Couldn't move module", rpcError.message);
        return false;
      }
      toast.success("Module moved");
      await refresh();
      return true;
    },
    [refresh, toast],
  );

  // Convert a resolved DropTarget into (newParentId, newPosition) for
  // callMoveModule. `newPosition` is the index AMONG SIBLINGS at the new
  // level (NOT a global position). When `asChild` is set we append to the
  // anchor's children; otherwise we insert before/after the anchor among
  // its existing siblings.
  const commitDrop = useCallback(
    async (target: DropTarget): Promise<void> => {
      if (!draggedModuleId) return;
      // Concurrent-drop guard: ignore re-fires while a previous RPC is in
      // flight (slow network + rapid second drag → 2 RPCs with inconsistent
      // state otherwise).
      if (dropBusyRef.current) return;
      dropBusyRef.current = true;
      const siblings = childrenByParent.get(target.parentId) ?? [];
      let newPosition: number;
      if (target.asChild) {
        newPosition = siblings.length;
      } else {
        const anchorIdx = siblings.findIndex((s) => s.id === target.anchorId);
        if (anchorIdx < 0) newPosition = siblings.length;
        else newPosition = target.position === "before" ? anchorIdx : anchorIdx + 1;
      }
      const draggedId = draggedModuleId;
      // EDGE: no-op drop — dropping a module back into its current slot. The
      // resolver already rejects self/descendant, but NOT "drop adjacent to
      // self" (e.g. drop after the sibling immediately above, or before the
      // sibling immediately below, which both resolve to the module's own
      // current slot). Firing move_module here would round-trip a no-change RPC
      // and show a misleading "Module moved" toast. Detect same-parent +
      // same-resolved-slot and bail before the network call. Account for the
      // self-removal index shift: among the current siblings the module sits at
      // `currentIdx`; an insert position of `currentIdx` or `currentIdx + 1`
      // both land it back where it started once it's spliced out first.
      if (!target.asChild) {
        const dragged = flatNodes.find((n) => n.id === draggedId);
        const currentParentId = dragged?.parent_module_id ?? null;
        if (currentParentId === target.parentId) {
          const currentIdx = siblings.findIndex((s) => s.id === draggedId);
          if (
            currentIdx >= 0 &&
            (newPosition === currentIdx || newPosition === currentIdx + 1)
          ) {
            setDraggedModuleId(null);
            setDropTarget(null);
            dropBusyRef.current = false;
            return;
          }
        }
      }
      setDraggedModuleId(null);
      setDropTarget(null);
      try {
        const ok = await callMoveModule(draggedId, target.parentId, newPosition);
        // Only pulse on actual success — otherwise the user gets misleading
        // "yes that worked" feedback after a failed RPC.
        if (ok) triggerPulse(draggedId);
      } finally {
        dropBusyRef.current = false;
      }
    },
    [callMoveModule, childrenByParent, draggedModuleId, flatNodes, setDraggedModuleId, setDropTarget, triggerPulse],
  );

  const onIndentModule = useCallback(
    async (
      node: ModuleNode,
      siblings: readonly ModuleNode[],
      idx: number,
    ): Promise<void> => {
      if (idx <= 0) return;
      const newParent = siblings[idx - 1];
      const newPosition = (childrenByParent.get(newParent.id) ?? []).length;
      await callMoveModule(node.id, newParent.id, newPosition);
    },
    [callMoveModule, childrenByParent],
  );

  const onOutdentModule = useCallback(
    async (node: ModuleNode): Promise<void> => {
      if (node.parent_module_id === null) return;
      const parent = flatNodes.find((n) => n.id === node.parent_module_id);
      if (!parent) return;
      const grandparentId = parent.parent_module_id;
      const grandparentSiblings = childrenByParent.get(grandparentId) ?? [];
      const parentIdx = grandparentSiblings.findIndex((s) => s.id === parent.id);
      const newPosition = parentIdx < 0 ? grandparentSiblings.length : parentIdx + 1;
      await callMoveModule(node.id, grandparentId, newPosition);
    },
    [callMoveModule, childrenByParent, flatNodes],
  );

  // ---- Keyboard reorder (Alt+↑ / Alt+↓ on a focused grip) ----------------
  // Swap a module with its previous/next sibling within the same parent.
  // We use the same `move_module` RPC as drag-to-reorder so persistence is
  // identical — there's exactly one server-side source of truth for module
  // order. After the RPC resolves and `refresh()` rebuilds the tree, we
  // refocus the SAME grip (queried by data-module-grip="<id>") so the user
  // can press Alt+↓ again and walk a module down the list in one motion.
  const onKeyboardReorderModule = useCallback(
    async (
      node: ModuleNode,
      siblings: readonly ModuleNode[],
      idx: number,
      direction: "up" | "down",
    ): Promise<void> => {
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= siblings.length) return; // boundary no-op
      const moduleName = node.name;
      const { error: rpcError } = await supabase.rpc("move_module", {
        p_module_id: node.id,
        p_new_parent_id: node.parent_module_id,
        p_new_position: newIdx,
      });
      if (rpcError) {
        toast.error("Couldn't move module", rpcError.message);
        return;
      }
      triggerPulse(node.id);
      // Announce to assistive tech BEFORE refresh, so screen readers don't
      // race with the DOM update.
      const newPositionContext = `Now ${newIdx + 1} of ${siblings.length}`;
      setReorderAnnouncement(
        `Moved ${moduleName} ${direction}. ${newPositionContext}.`,
      );
      toast.success(`Moved '${moduleName}' ${direction}`);
      await refresh();
      // Restore focus to the same grip in its new DOM position. We wait one
      // animation frame so React has committed the post-refresh tree.
      requestAnimationFrame(() => {
        const grip = document.querySelector<HTMLButtonElement>(
          `[data-module-grip="${node.id}"]`,
        );
        grip?.focus();
      });
    },
    [refresh, toast, triggerPulse],
  );

  const onAddSubmodule = useCallback(
    async (parent: ModuleNode): Promise<void> => {
      if (!classId) return;
      const siblings = childrenByParent.get(parent.id) ?? [];
      // Append at max(sibling position)+1, NOT siblings.length: positions
      // aren't guaranteed dense-from-0 (trashing a submodule leaves a gap, and
      // the trashed row still holds its slot under the DB constraint). Using
      // the count collides whenever a live sibling sits at index `length`
      // (e.g. submodules at {1,2} → length 2 → "duplicate key … position").
      const position =
        siblings.reduce((max, m) => (m.position > max ? m.position : max), -1) + 1;
      const { error: insertError } = await supabase
        .from("course_modules")
        .insert({
          course_id: classId,
          name: "New submodule",
          position,
          published: false,
          opens_at: null,
          parent_module_id: parent.id,
        });
      if (insertError) {
        toast.error("Couldn't add submodule", insertError.message);
        return;
      }
      // Expand parent so the newly inserted child is visible.
      setCollapsed((prev) => ({ ...prev, [parent.id]: false }));
      toast.success("Submodule added");
      await refresh();
    },
    [classId, childrenByParent, refresh, toast],
  );

  // Inline-create handler used by the InlineCreateModuleRow below the list
  // (new modules append at the bottom via maxModulePosition+1). Defaults the
  // new module to draft + no lock date — the user can flip publish via the
  // one-click badge, set the lock date via the kebab. Linear/Notion pattern:
  // cheapest possible create.
  const commitInlineCreateModule = useCallback(
    async (name: string): Promise<boolean> => {
      if (!classId) return false;
      const trimmed = name.trim();
      if (trimmed.length === 0) return false;
      setInlineCreatingModule({ busy: true });
      const { error: insertError } = await supabase
        .from("course_modules")
        .insert({
          course_id: classId,
          name: trimmed,
          position: maxModulePosition + 1,
          published: false,
          opens_at: null,
        });
      if (insertError) {
        setInlineCreatingModule({ busy: false });
        toast.error("Couldn't create module", insertError.message);
        return false;
      }
      setInlineCreatingModule(null);
      toast.success("Module created", trimmed);
      await refresh();
      return true;
    },
    [classId, maxModulePosition, refresh, toast],
  );

  // ---- Item drop (Notion/Linear-style, unified across same- and cross-module) ----
  // Same-module reorders use reorder_module_items (cheaper, position-array
  // contract); cross-module moves use move_item_to_module. The resolver gave
  // us (anchorItem, position) — we translate that to either an ordered id
  // list or a target (moduleId, position).
  const commitItemDrop = useCallback(
    async (target: ItemDropTarget): Promise<void> => {
      // Read the dragged item + module list from refs (not the closure's
      // render-time state) so a quick second drop after a refresh resolves
      // against the LATEST data — the closure deps can still point at the
      // prior render. Mirrors the dropTargetRef discipline used in the hot
      // onDragOver handlers.
      const dragged = draggedItemRef.current;
      if (!dragged) return;
      // Concurrent-drop guard: ignore re-fires while a previous RPC is in
      // flight (slow network + rapid second drag → 2 RPCs racing, the second
      // reading stale server state). Same guard commitDrop uses.
      if (dropBusyRef.current) return;
      dropBusyRef.current = true;
      try {
        const draggedId = dragged.id;
        const sourceModuleId = dragged.module_id;
        const targetModuleId = target.moduleId;
        const anchorItemId = target.anchorItemId;
        const targetModule = modulesRef.current.find(
          (m) => m.id === targetModuleId,
        );
        if (!targetModule) {
          setDraggedItem(null);
          setItemDropTarget(null);
          return;
        }
        const anchorIdx = targetModule.items.findIndex(
          (i) => i.id === anchorItemId,
        );
        if (anchorIdx < 0) {
          setDraggedItem(null);
          setItemDropTarget(null);
          return;
        }
        // Always clear the drag/indicator state before the network round-trip so
        // a slow RPC doesn't leave a stale ghost indicator on the previous row.
        setDraggedItem(null);
        setItemDropTarget(null);

        if (sourceModuleId === targetModuleId) {
          // Same-module reorder via reorder_module_items.
          const fromIndex = targetModule.items.findIndex(
            (i) => i.id === draggedId,
          );
          if (fromIndex < 0) return;
          const next = targetModule.items.slice();
          const [moved] = next.splice(fromIndex, 1);
          // Re-find anchor after splice (it may have shifted by one).
          const adjAnchorIdx = next.findIndex((i) => i.id === anchorItemId);
          const insertAt =
            target.position === "before" ? adjAnchorIdx : adjAnchorIdx + 1;
          next.splice(insertAt, 0, moved);
          const orderedIds = next.map((i) => i.id);
          const { error: rpcError } = await supabase.rpc(
            "reorder_module_items",
            {
              p_module_id: targetModuleId,
              p_ordered_ids: orderedIds,
            },
          );
          if (rpcError) {
            toast.error("Couldn't reorder items", rpcError.message);
            return;
          }
          toast.success("Items reordered");
          await refresh();
          triggerPulse(draggedId);
          return;
        }

        // Cross-module move via move_item_to_module. Position is 0-based among
        // destination items (anchor index ± 1 depending on before/after).
        const newPosition =
          target.position === "before" ? anchorIdx : anchorIdx + 1;
        const { error: rpcError } = await supabase.rpc("move_item_to_module", {
          p_item_id: draggedId,
          p_target_module_id: targetModuleId,
          p_position: newPosition,
        });
        if (rpcError) {
          toast.error("Couldn't move item", rpcError.message);
          return;
        }
        toast.success("Item moved");
        await refresh();
        triggerPulse(draggedId);
      } finally {
        dropBusyRef.current = false;
      }
    },
    [refresh, setDraggedItem, setItemDropTarget, toast, triggerPulse],
  );

  // Module-level item drop: drop an item onto a module (empty, non-empty, or
  // even collapsed) and land it in that module. Used by the empty-list zone
  // (position 0) and by the module-header drop target (#6: a collapsed or
  // non-empty module accepts a cross-module item drop, appending to the end so
  // existing items aren't displaced). Cross-module only — a same-module drop
  // here is a no-op (no anchor to reorder against).
  const commitItemDropOnEmptyModule = useCallback(
    async (
      targetModuleId: string,
      where: "start" | "end" = "start",
    ): Promise<void> => {
      // Read from refs (see commitItemDrop) so a rapid second drop resolves
      // against the latest data, not a stale render-time closure.
      const dragged = draggedItemRef.current;
      if (!dragged) return;
      // Concurrent-drop guard — same as commitDrop / commitItemDrop.
      if (dropBusyRef.current) return;
      dropBusyRef.current = true;
      try {
        const draggedId = dragged.id;
        if (dragged.module_id === targetModuleId) {
          // Same-module drop onto its own header/empty zone: nothing to do.
          setDraggedItem(null);
          setItemDropTarget(null);
          return;
        }
        setDraggedItem(null);
        setItemDropTarget(null);
        // Append lands AFTER the module's current items; insert-at-start uses 0.
        const targetModule = modulesRef.current.find(
          (m) => m.id === targetModuleId,
        );
        const newPosition =
          where === "end" ? targetModule?.items.length ?? 0 : 0;
        const { error: rpcError } = await supabase.rpc("move_item_to_module", {
          p_item_id: draggedId,
          p_target_module_id: targetModuleId,
          p_position: newPosition,
        });
        if (rpcError) {
          toast.error("Couldn't move item", rpcError.message);
          return;
        }
        toast.success("Item moved");
        await refresh();
        triggerPulse(draggedId);
      } finally {
        dropBusyRef.current = false;
      }
    },
    [refresh, setDraggedItem, setItemDropTarget, toast, triggerPulse],
  );

  // ---- Toolbar actions ----
  const collapseAll = useCallback((): void => {
    const next: Record<string, boolean> = {};
    for (const m of modules) next[m.id] = true;
    setCollapsed(next);
  }, [modules]);

  const expandAll = useCallback((): void => {
    setCollapsed({});
  }, []);

  const allCollapsed = useMemo(() => {
    if (modules.length === 0) return false;
    return modules.every((m) => collapsed[m.id] === true);
  }, [collapsed, modules]);

  const publishAll = useCallback(async (): Promise<void> => {
    // Direct UPDATE per the spec — the toggle_module_publish RPC is per-row
    // and flips state, which isn't what we want for a "publish all" action.
    const ids = modules.filter((m) => !m.published).map((m) => m.id);
    if (ids.length === 0) return;
    const { error: updError } = await supabase
      .from("course_modules")
      .update({ published: true })
      .in("id", ids);
    if (updError) {
      toast.error("Couldn't publish modules", updError.message);
      return;
    }
    toast.success(
      ids.length === 1 ? "Module published" : `${ids.length} modules published`,
    );
    // Optimistic: flip each published module locally (batched) — no full refetch.
    for (const id of ids) patchModule(id, { published: true });
  }, [modules, patchModule, toast]);

  // ---- Bulk-select actions ----
  const bulkSetPublished = useCallback(
    async (nextPublished: boolean): Promise<void> => {
      const ids = Array.from(selectedModuleIds);
      if (ids.length === 0) return;
      setBulkBusy(true);
      const { error: updError } = await supabase
        .from("course_modules")
        .update({ published: nextPublished })
        .in("id", ids);
      setBulkBusy(false);
      if (updError) {
        toast.error(
          nextPublished
            ? "Couldn't publish modules"
            : "Couldn't unpublish modules",
          updError.message,
        );
        return;
      }
      const verb = nextPublished ? "published" : "unpublished";
      toast.success(
        nextPublished ? "Modules published" : "Modules unpublished",
        `${ids.length} module${ids.length === 1 ? "" : "s"} ${verb}.`,
      );
      exitSelectMode();
      await refresh();
    },
    [exitSelectMode, refresh, selectedModuleIds, toast],
  );

  const bulkDelete = useCallback(async (): Promise<void> => {
    const ids = Array.from(selectedModuleIds);
    if (ids.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkBusy(true);
    // Soft delete (0202): each module moves to the Trash (90-day recovery).
    let failed = 0;
    for (const id of ids) {
      const { error: delError } = await supabase.rpc("trash_content", {
        p_kind: "module",
        p_id: id,
      });
      if (delError) failed += 1;
    }
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    if (failed > 0) {
      toast.error(
        "Some modules couldn't be moved to Trash",
        `${failed} of ${ids.length} failed — refresh and try again.`,
      );
    } else {
      toast.success(
        "Modules moved to Trash",
        `${ids.length} module${ids.length === 1 ? "" : "s"} — recoverable for 90 days.`,
      );
    }
    exitSelectMode();
    await refresh();
  }, [exitSelectMode, refresh, selectedModuleIds, toast]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonRows count={3} rowClassName="h-24" />
      </div>
    );
  }

  // Quiet ledger meta under the page title — derived purely from the module
  // list already in memory (no extra queries).
  const publishedCount = modules.filter((m) => m.published).length;
  const totalItems = modules.reduce((n, m) => n + m.items.length, 0);

  // Ivy Ledger toolbar pill recipes: white ring-1 chips, per-intent tinted
  // hovers (neutral / green / navy), one solid navy primary. 32px visual
  // height on desktop, >=40px tap target on touch.
  const pillBase =
    "inline-flex items-center gap-1.5 rounded-full min-h-[40px] md:min-h-[32px] px-3.5 text-xs font-medium bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 transition-colors";
  const pillNeutral =
    `${pillBase} text-slate-600 dark:text-slate-300 hover:ring-slate-300 dark:hover:ring-slate-600 hover:text-slate-900 dark:hover:text-slate-100`;
  const pillGreen =
    `${pillBase} text-slate-600 dark:text-slate-300 hover:ring-emerald-300 dark:hover:ring-emerald-700 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="page-title text-lg font-semibold text-slate-900 dark:text-slate-100">
          Modules
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {!isStudent && modules.length > 0 && (
            <div
              className="inline-flex items-center rounded-full bg-indigo-600/[0.08] dark:bg-indigo-400/10 p-0.5"
              role="tablist"
              aria-label="Modules view"
            >
              {(["journey", "list"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={journeyActive === (mode === "journey")}
                  title={
                    mode === "journey"
                      ? "Class-aggregate mastery view of published modules"
                      : "Edit modules and items"
                  }
                  onClick={() => setModulesView(mode)}
                  className={`min-h-[40px] md:min-h-[32px] rounded-full px-4 text-xs font-semibold motion-safe:transition-colors ${
                    journeyActive === (mode === "journey")
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  {mode === "journey" ? "Journey" : "List"}
                </button>
              ))}
            </div>
          )}
          {!journeyActive && modules.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (allCollapsed) expandAll();
                else collapseAll();
              }}
              className={pillNeutral}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="h-3.5 w-3.5 flex-none"
              >
                {allCollapsed ? (
                  <path d="m7 4 5 5 5-5M7 20l5-5 5 5" />
                ) : (
                  <path d="m7 10 5-5 5 5M7 14l5 5 5-5" />
                )}
              </svg>
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
          {canEdit && !journeyActive && modules.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void publishAll();
              }}
              className={pillGreen}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="h-3.5 w-3.5 flex-none"
              >
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
              Publish all
            </button>
          )}
          {canEdit && !journeyActive && modules.length > 0 && (
            selectMode ? (
              <button
                type="button"
                onClick={exitSelectMode}
                className="inline-flex items-center gap-1.5 rounded-full min-h-[40px] md:min-h-[32px] px-3.5 text-xs font-medium transition-colors text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-400 dark:ring-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className={pillNeutral}
              >
                Select
              </button>
            )
          )}
          {canEdit && !journeyActive && (
            <button
              type="button"
              onClick={() => setInlineCreatingModule({ busy: false })}
              className="inline-flex items-center gap-1.5 rounded-full min-h-[40px] md:min-h-[32px] px-3.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="h-3.5 w-3.5 flex-none"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Module
            </button>
          )}
        </div>
      </div>

      {modules.length > 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 -mt-2">
          <span className="tabular-nums">{publishedCount}</span> of{" "}
          <span className="tabular-nums">{modules.length}</span>{" "}
          {modules.length === 1 ? "module" : "modules"} published ·{" "}
          <span className="tabular-nums">{totalItems}</span>{" "}
          {totalItems === 1 ? "item" : "items"}
        </p>
      )}

      <div className="ivy-rule" aria-hidden="true" />

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
        >
          {error}
        </div>
      )}

      {/* Visually-hidden live region for Alt+↑/Alt+↓ keyboard-reorder
          announcements. role="status" + aria-live="polite" lets screen
          readers announce position changes without interrupting other speech.
          aria-atomic ensures the FULL sentence is read each time, not just
          the diff. Sighted users get the same info via the toast + the
          updated grip aria-label. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {reorderAnnouncement}
      </div>

      {journeyActive && classId ? (
        <TeacherJourneyPanel courseId={classId} modules={modules} />
      ) : (
        <>
      {modules.length === 0 && !inlineCreatingModule ? (
        <EmptyState
          title="No modules yet"
          body="Modules group your assignments, pages, and links into sections — like chapters."
          cta={
            canEdit
              ? {
                  label: "+ Add your first module",
                  onClick: () => setInlineCreatingModule({ busy: false }),
                }
              : undefined
          }
        />
      ) : (
        <div
          className="space-y-3 relative"
          // EDGE: when the user drags out of the modules region entirely
          // (e.g. into the page header, sidebar, or off-screen), the
          // indicator must clear — otherwise it stays painted at the last
          // hovered row even though the drop will go nowhere.
          onDragLeave={(e) => {
            if (!draggedModuleId) return;
            const next = e.relatedTarget;
            if (
              next instanceof Node &&
              e.currentTarget.contains(next)
            ) {
              return; // moved to a child — keep indicator
            }
            if (dropTargetRef.current) setDropTarget(null);
          }}
        >
          {tree.map((node, idx) => (
            <ModuleNodeView
              key={node.id}
              node={node}
              depth={0}
              siblings={tree}
              siblingIndex={idx}
              flatModules={flatNodes}
              canEdit={canEdit}
              isStudent={isStudent === true}
              expandedFor={expandedFor}
              toggleExpanded={(moduleId) =>
                setCollapsed((prev) => ({
                  ...prev,
                  [moduleId]: !(prev[moduleId] ?? false),
                }))
              }
              completedIds={completion.completed}
              draggedModuleId={draggedModuleId}
              draggedDescendants={draggedDescendants}
              draggedItemId={draggedItem?.id ?? null}
              recentlyMovedId={recentlyMovedId}
              dropTarget={dropTarget}
              dropTargetRef={dropTargetRef}
              setDropTarget={setDropTarget}
              itemDropTarget={itemDropTarget}
              itemDropTargetRef={itemDropTargetRef}
              setItemDropTarget={setItemDropTarget}
              addingItemToModuleId={addingItemToModule?.id ?? null}
              classId={classId ?? ""}
              usedAssignmentIds={usedAssignmentIds}
              onCancelInlineItem={() => setAddingItemToModule(null)}
              onEditModule={(m) => setEditingModule(m)}
              onDeleteModule={(m) => setDeletingModule(m)}
              onTogglePublishModule={(m) => onToggleModulePublished(m)}
              onAddItem={(m) => setAddingItemToModule(m)}
              onAddSubmodule={onAddSubmodule}
              onOpenAssignment={(assignmentId) => {
                if (classId)
                  navigate(courseAssignmentPath(classId, assignmentId));
              }}
              onRefresh={refresh}
              onRenameModule={(m, next) => onRenameModule(m.id, next, m.name)}
              onDuplicateModule={(m) => onDuplicateModule(m.id)}
              onLockModule={(m) => setLockingModule(m)}
              onMoveModule={(m) => setMovingModule(m)}
              onIndentModule={onIndentModule}
              onOutdentModule={onOutdentModule}
              onKeyboardReorderModule={onKeyboardReorderModule}
              onMoveItem={(item) => setMovingItem(item)}
              onToggleItemCompleted={(itemId, next) =>
                completion.toggle(itemId, next)
              }
              onModuleDragStart={(m) => setDraggedModuleId(m.id)}
              onModuleDragEnd={() => {
                setDraggedModuleId(null);
                setDropTarget(null);
              }}
              onCommitDrop={commitDrop}
              onItemDragStart={(item) => setDraggedItem(item)}
              onItemDragEnd={() => {
                // EDGE: always clear both pieces of drag state on dragend
                // (covers drop-outside-zone, ESC-cancel, etc.). Without
                // setItemDropTarget(null) here the indicator could persist
                // after a cancelled drag.
                setDraggedItem(null);
                setItemDropTarget(null);
              }}
              onCommitItemDrop={commitItemDrop}
              onItemDropOnEmptyModule={commitItemDropOnEmptyModule}
              selectMode={selectMode}
              isSelected={isModuleSelected}
              onToggleSelected={toggleSelectedModule}
            />
          ))}
          {/* EDGE: drop tail — catches drops that land below the last
              top-level module. Without this, dragging past the end of the
              list does nothing (no row's "after" zone is hit). Painted as a
              subtle 32px zone that highlights only during drag. */}
          {canEdit && draggedModuleId && tree.length > 0 && (
            <div
              aria-hidden
              onDragOver={(e) => {
                if (!draggedModuleId) return;
                e.preventDefault();
                const lastTop = tree[tree.length - 1];
                // Self-drop guard: if the dragged module IS the last
                // top-level, dropping on the tail is a no-op (would target
                // itself). Skip to avoid a wasted RPC + misleading toast.
                if (lastTop.id === draggedModuleId) return;
                const target = {
                  anchorId: lastTop.id,
                  position: "after" as const,
                  asChild: false,
                  parentId: null,
                  depth: 0,
                };
                const cur = dropTargetRef.current;
                if (
                  !cur ||
                  cur.anchorId !== target.anchorId ||
                  cur.position !== target.position ||
                  cur.asChild !== target.asChild
                ) {
                  setDropTarget(target);
                }
              }}
              onDrop={(e) => {
                if (!draggedModuleId) return;
                e.preventDefault();
                const cur = dropTargetRef.current;
                if (cur) void commitDrop(cur);
              }}
              className="h-8 rounded-lg border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20 flex items-center justify-center text-[11px] font-medium text-indigo-700 dark:text-indigo-300"
            >
              Drop here to append at the end
            </div>
          )}
        </div>
      )}
      {/* New modules append at the bottom, so the create row lives BELOW the
          list — prefilled with today's date + focused, ready to rename. */}
      {inlineCreatingModule && (
        <InlineCreateModuleRow
          busy={inlineCreatingModule.busy}
          onCommit={(name) => commitInlineCreateModule(name)}
          onCancel={() => setInlineCreatingModule(null)}
        />
      )}
        </>
      )}

      {canEdit && selectMode && selectedModuleIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk module actions"
          className="fixed bottom-4 left-0 right-0 z-50 px-3 pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-600 shadow-xl px-4 py-2.5 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
              {selectedModuleIds.size} selected
            </span>
            <span
              aria-hidden
              className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => {
                  void bulkSetPublished(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full min-h-[40px] md:min-h-[32px] px-3.5 text-xs font-medium bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-emerald-300 dark:hover:ring-emerald-700 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="h-3.5 w-3.5 flex-none"
                >
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                {bulkBusy ? "Working…" : "Publish"}
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => {
                  void bulkSetPublished(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-full min-h-[40px] md:min-h-[32px] px-3.5 text-xs font-medium bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-amber-300 dark:hover:ring-amber-700 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Unpublish
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full min-h-[40px] md:min-h-[32px] px-3.5 text-xs font-semibold text-rose-700 dark:text-rose-300 ring-1 ring-rose-300 dark:ring-rose-700 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="h-3.5 w-3.5 flex-none"
                >
                  <path d="M5 7h14M9.5 7V5h5v2M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5" />
                </svg>
                Delete
              </button>
            </div>
            <button
              type="button"
              onClick={exitSelectMode}
              disabled={bulkBusy}
              className="ml-auto min-h-[40px] md:min-h-0 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:underline underline-offset-2 disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <ConfirmDialog
          title={`Delete ${selectedModuleIds.size} module${selectedModuleIds.size === 1 ? "" : "s"}?`}
          body={`Delete ${selectedModuleIds.size} module${selectedModuleIds.size === 1 ? "" : "s"} and all their items? This cannot be undone.`}
          confirmLabel="Delete modules"
          destructive
          busy={bulkBusy}
          onConfirm={() => {
            void bulkDelete();
          }}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}

      <EditModuleModal
        open={!!editingModule}
        module={editingModule}
        onClose={() => setEditingModule(null)}
        onUpdated={() => {
          void refresh();
        }}
      />

      {deletingModule && (
        <ConfirmDialog
          title={`Delete "${deletingModule.name}"?`}
          body="This permanently removes the module and every item inside it. Assignments themselves are not deleted."
          confirmLabel="Delete module"
          destructive
          onConfirm={() => {
            void onConfirmDeleteModule();
          }}
          onCancel={() => setDeletingModule(null)}
        />
      )}

      {lockingModule && (
        <LockUntilPicker
          initial={lockingModule.lock_at}
          onApply={(iso) => onApplyLock(lockingModule.id, iso)}
          onClose={() => setLockingModule(null)}
        />
      )}

      {movingItem && (
        <MoveItemPicker
          item={movingItem}
          modules={modules}
          onApply={(targetModuleId, position) =>
            onMoveItemApply(movingItem.id, targetModuleId, position)
          }
          onClose={() => setMovingItem(null)}
        />
      )}

      {movingModule && (
        <MoveModulePicker
          module={movingModule}
          flat={flatNodes}
          descendantIds={
            // Compute descendants of the move target so they're disabled in
            // the parent dropdown (cycle prevention mirror of the trigger).
            new Set(
              (() => {
                const out: string[] = [];
                const walk = (nodes: readonly ModuleNode[]): void => {
                  for (const n of nodes) {
                    out.push(n.id);
                    if (n.children.length > 0) walk(n.children);
                  }
                };
                const start = flatNodes.find((n) => n.id === movingModule.id);
                if (start) walk(start.children);
                return out;
              })(),
            )
          }
          onApply={async (newParentId, newPosition) => {
            await callMoveModule(movingModule.id, newParentId, newPosition);
            setMovingModule(null);
          }}
          onClose={() => setMovingModule(null)}
        />
      )}
    </div>
  );
}

