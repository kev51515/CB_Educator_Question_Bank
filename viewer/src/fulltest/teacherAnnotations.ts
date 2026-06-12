/**
 * useTeacherItemAnnotations — teacher review annotations, saved to the DB
 * per (teacher, course, item) via `teacher_item_annotations` (migration 0203).
 *
 * Same API as useRunnerAnnotations so TestReviewPage swaps sources without
 * touching the rendering pipeline. The scoping is the whole point: the same
 * test slug linked from two courses keeps SEPARATE annotation sets, so notes
 * a teacher writes while reviewing with one class never bleed into another.
 *
 * When `courseId` is null (test not linked to any course yet) the hook falls
 * back to the device-local localStorage store — same behavior as before this
 * hook existed — and reports `scope: "device"` so the UI can say so.
 *
 * Persistence: load once per (course, item); mutations update local state
 * instantly and a debounced (800ms) upsert writes the whole jsonb map back.
 * Pending writes flush on unmount/course-switch so quick navigation can't
 * drop the last edit.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  EMPTY_ANNOTATION,
  storeAddHighlight,
  storeClearHighlights,
  storeRemoveHighlightAt,
  storeSetNote,
  useRunnerAnnotations,
  type AnnotField,
  type AnnotationStore,
  type Highlight,
  type QAnnotation,
  type UseRunnerAnnotations,
} from "./annotations";

const SAVE_DEBOUNCE_MS = 800;

export type TeacherItemKind = "test" | "assignment";

export interface UseTeacherItemAnnotations extends UseRunnerAnnotations {
  /** "course" = saved to the DB for the selected class; "device" = localStorage fallback. */
  scope: "course" | "device";
  /** True while the course-scoped store is still loading from the server. */
  loading: boolean;
}

interface PendingWrite {
  courseId: string;
  store: AnnotationStore;
}

export function useTeacherItemAnnotations(
  courseId: string | null,
  itemKind: TeacherItemKind,
  itemKey: string,
): UseTeacherItemAnnotations {
  // Device-local fallback (also preserves any pre-existing localStorage
  // highlights teachers made before this feature shipped).
  const local = useRunnerAnnotations(itemKey);

  const [dbStore, setDbStore] = useState<AnnotationStore>({});
  const [loading, setLoading] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  // The (course, store) snapshot awaiting a debounced write. Captured as a
  // pair so a course switch mid-debounce still writes to the RIGHT course.
  const pendingRef = useRef<PendingWrite | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const loadedForRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUid(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const flush = useCallback((): void => {
    window.clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    if (!uid) {
      // Auth not resolved yet — put the write back; the next edit (or the
      // next flush) retries with a real teacher_id instead of failing NOT NULL.
      pendingRef.current = pending;
      return;
    }
    // Fire-and-forget: a failed save leaves the annotations on screen; the
    // next edit retries. (No toast — this runs on unmount paths too.)
    // NB: supabase-js builders are LAZY — they only execute once awaited /
    // .then()'d. A bare `void builder` never sends the request.
    void supabase
      .from("teacher_item_annotations")
      .upsert(
        {
          teacher_id: uid,
          course_id: pending.courseId,
          item_kind: itemKind,
          item_key: itemKey,
          annotations: pending.store,
        },
        { onConflict: "teacher_id,course_id,item_kind,item_key" },
      )
      .then(({ error }) => {
        if (error) {
          // Keep the payload for the next retry rather than dropping the edit.
          pendingRef.current = pendingRef.current ?? pending;
        }
      });
  }, [itemKind, itemKey, uid]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Load the course-scoped store whenever the (course, item) target changes.
  // Any write pending against the PREVIOUS course flushes first.
  useEffect(() => {
    if (!courseId || !uid) return;
    const key = `${courseId}:${itemKind}:${itemKey}`;
    let cancelled = false;
    flushRef.current();
    setLoading(true);
    void supabase
      .from("teacher_item_annotations")
      .select("annotations")
      .eq("teacher_id", uid)
      .eq("course_id", courseId)
      .eq("item_kind", itemKind)
      .eq("item_key", itemKey)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        loadedForRef.current = key;
        setDbStore((data?.annotations as AnnotationStore | null) ?? {});
        setLoading(false);
      });
    return () => {
      cancelled = true;
      flushRef.current();
    };
  }, [courseId, itemKind, itemKey, uid]);

  // Flush on unload so closing the tab right after an edit doesn't lose it.
  useEffect(() => {
    const onUnload = () => flushRef.current();
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  const useDb = courseId !== null;

  const mutate = useCallback(
    (fn: (prev: AnnotationStore) => AnnotationStore): void => {
      if (!courseId) return;
      setDbStore((prev) => {
        const next = fn(prev);
        if (next === prev) return prev;
        pendingRef.current = { courseId, store: next };
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => flushRef.current(), SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [courseId],
  );

  const get = useCallback(
    (qid: string): QAnnotation => (useDb ? (dbStore[qid] ?? EMPTY_ANNOTATION) : local.get(qid)),
    [useDb, dbStore, local],
  );

  const addHighlight = useCallback(
    (qid: string, hl: Highlight): void => {
      if (useDb) mutate((prev) => storeAddHighlight(prev, qid, hl));
      else local.addHighlight(qid, hl);
    },
    [useDb, mutate, local],
  );

  const removeHighlightAt = useCallback(
    (qid: string, field: AnnotField, offset: number): void => {
      if (useDb) mutate((prev) => storeRemoveHighlightAt(prev, qid, field, offset));
      else local.removeHighlightAt(qid, field, offset);
    },
    [useDb, mutate, local],
  );

  const clearHighlights = useCallback(
    (qid: string): void => {
      if (useDb) mutate((prev) => storeClearHighlights(prev, qid));
      else local.clearHighlights(qid);
    },
    [useDb, mutate, local],
  );

  const setNote = useCallback(
    (qid: string, note: string): void => {
      if (useDb) mutate((prev) => storeSetNote(prev, qid, note));
      else local.setNote(qid, note);
    },
    [useDb, mutate, local],
  );

  // seed() exists for the runner's server-draft restore; the teacher surface
  // never seeds, so it's a no-op in DB mode.
  const seed = useCallback(
    (qid: string, a: QAnnotation): void => {
      if (!useDb) local.seed(qid, a);
    },
    [useDb, local],
  );

  return {
    get,
    addHighlight,
    removeHighlightAt,
    clearHighlights,
    setNote,
    seed,
    scope: useDb ? "course" : "device",
    loading: useDb && loading,
  };
}
