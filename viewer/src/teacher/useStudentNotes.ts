/**
 * useStudentNotes
 * ===============
 * Backing data hook for the teacher-private notes section on the
 * StudentProfilePage. Given a resolved course UUID + a student UUID,
 * fetches the CURRENT TEACHER's note for that (student, course) pair and
 * exposes save/remove helpers.
 *
 * Notes are private to the authoring teacher — never visible to the
 * student, and never visible to OTHER teachers of the same course. The
 * 0062 migration enforces this with RLS so even URL hacking can't read
 * another teacher's note.
 *
 * The natural unique constraint (teacher_id, student_id, course_id) lets
 * `save()` be a clean upsert that always lands on the same row — we don't
 * have to branch on insert-vs-update at the call site.
 *
 * Caller contract: pass UUIDs (not short_codes). The StudentProfilePage
 * resolves `course.id` from useStudentProfile and forwards that here.
 * Until both ids are non-null we sit in a `loading: true` no-op state so
 * the consumer can render a skeleton without special-casing the
 * "still resolving the page" path.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";

// --- Public types ----------------------------------------------------------

export interface TeacherStudentNote {
  id: string;
  teacher_id: string;
  student_id: string;
  course_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface UseStudentNotes {
  /** The current teacher's note for this (student, course), or null when
   *  none has been saved yet. */
  note: TeacherStudentNote | null;
  loading: boolean;
  /** Null on success. Last error message (load OR write) otherwise. */
  error: string | null;
  saving: boolean;
  /** Upsert the note body. Empty/whitespace-only bodies are treated as a
   *  delete request — see `remove()` — to avoid leaving zombie rows. */
  save: (body: string) => Promise<void>;
  /** Delete the note row (if any). No-op when no row exists. */
  remove: () => Promise<void>;
  /** Force a refetch. Mostly used by tests; the hook self-refetches after
   *  every save/remove. */
  refresh: () => Promise<void>;
}

// --- Helpers ---------------------------------------------------------------

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

/**
 * Strip a small set of "this is visually empty" HTML produced by TipTap so
 * an empty editor doesn't persist as `"<p></p>"`. We're deliberately
 * lenient — better to over-classify as empty (which deletes) than to
 * persist invisible whitespace.
 */
function isEffectivelyEmpty(body: string): boolean {
  const stripped = body
    .replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, "")
    .replace(/\s+/g, "")
    .trim();
  return stripped.length === 0;
}

// --- Hook ------------------------------------------------------------------

export function useStudentNotes(
  courseId: string | null,
  studentId: string | null,
): UseStudentNotes {
  const { profile } = useProfile();
  const teacherId = profile?.id ?? null;

  const [note, setNote] = useState<TeacherStudentNote | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Track the in-flight request id so a late response can't clobber a
  // newer one when the user navigates between students rapidly.
  const inFlightRef = useRef<number>(0);

  const fetchNote = useCallback(async (): Promise<void> => {
    if (!teacherId || !courseId || !studentId) {
      setNote(null);
      setLoading(false);
      return;
    }
    const reqId = ++inFlightRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("teacher_student_notes")
        .select("id, teacher_id, student_id, course_id, body, created_at, updated_at")
        .eq("teacher_id", teacherId)
        .eq("student_id", studentId)
        .eq("course_id", courseId)
        .maybeSingle();

      if (reqId !== inFlightRef.current) return; // a newer fetch superseded us
      if (queryError) {
        setError(getErrorMessage(queryError, "Couldn't load notes."));
        setNote(null);
      } else {
        setNote((data as TeacherStudentNote | null) ?? null);
      }
    } catch (err: unknown) {
      if (reqId !== inFlightRef.current) return;
      setError(getErrorMessage(err, "Couldn't load notes."));
      setNote(null);
    } finally {
      if (reqId === inFlightRef.current) setLoading(false);
    }
  }, [teacherId, studentId, courseId]);

  // Auto-fetch on any input change.
  useEffect(() => {
    void fetchNote();
  }, [fetchNote]);

  // --- Mutations ----------------------------------------------------------

  const remove = useCallback(async (): Promise<void> => {
    if (!teacherId || !courseId || !studentId) return;
    // Optimistic clear, with rollback target so we can restore on failure.
    const previous = note;
    if (!previous) return; // nothing to delete; treat as no-op
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const { error: delErr } = await supabase
        .from("teacher_student_notes")
        .delete()
        .eq("teacher_id", teacherId)
        .eq("student_id", studentId)
        .eq("course_id", courseId);
      if (delErr) {
        setNote(previous);
        setError(getErrorMessage(delErr, "Couldn't delete note."));
        return;
      }
    } catch (err: unknown) {
      setNote(previous);
      setError(getErrorMessage(err, "Couldn't delete note."));
    } finally {
      setSaving(false);
    }
  }, [teacherId, studentId, courseId, note]);

  const save = useCallback(
    async (body: string): Promise<void> => {
      if (!teacherId || !courseId || !studentId) return;

      // Treat "visually empty" as a delete intent — avoids zombie rows
      // when a teacher clears the editor.
      if (isEffectivelyEmpty(body)) {
        if (note !== null) await remove();
        return;
      }
      // Skip a redundant round-trip if the value hasn't changed.
      if (note && note.body === body) return;

      setSaving(true);
      setError(null);
      try {
        const nowIso = new Date().toISOString();
        const { data, error: upsertErr } = await supabase
          .from("teacher_student_notes")
          .upsert(
            {
              teacher_id: teacherId,
              student_id: studentId,
              course_id: courseId,
              body,
              updated_at: nowIso,
            },
            { onConflict: "teacher_id,student_id,course_id" },
          )
          .select("id, teacher_id, student_id, course_id, body, created_at, updated_at")
          .single();

        if (upsertErr) {
          setError(getErrorMessage(upsertErr, "Couldn't save note."));
          return;
        }
        setNote((data as TeacherStudentNote | null) ?? null);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Couldn't save note."));
      } finally {
        setSaving(false);
      }
    },
    [teacherId, studentId, courseId, note, remove],
  );

  return {
    note,
    loading,
    error,
    saving,
    save,
    remove,
    refresh: fetchNote,
  };
}
