/**
 * AnnouncementFormModal
 * =====================
 * Unified create / edit form for course announcements.
 *
 * Wave M7 — Maya audit #2: ship to N courses at once + schedule for later.
 *
 *   - The `courseId: string` prop becomes `targetCourseIds: string[]`. The
 *     normal "from inside a course" call site (CourseAnnouncements) passes
 *     `[course.id]` and the modal behaves exactly as before — title, body,
 *     pinned, submit. No visual change for that case.
 *   - A future "Broadcast" entry point (inbox-style compose button) will pass
 *     an empty `targetCourseIds` and `allowMultiCourse`, which surfaces a
 *     multi-select picker of the teacher's active courses. On submit we
 *     insert one row per selected course, sharing the same title/body/etc.
 *   - A `SmartDatePicker` "Publish at (optional)" field controls a new
 *     nullable `publish_at` column (migration 0054). Blank = post now; a
 *     date = scheduled, with a note + a different toast.
 *
 * Edit mode is single-course only (the row already exists for one course
 * and cross-posting an edit doesn't make sense — Maya edits each
 * cohort-specific copy independently if she wants per-cohort tweaks).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { SmartDatePicker, useToast } from "../components";
import type { Announcement } from "./useAnnouncements";
import { useFocusTrap } from "../hooks";

export type AnnouncementFormMode = "create" | "edit";

/**
 * One row in the multi-course picker. The minimal shape needed to render the
 * checkbox list and pass the id along to the INSERT — full Course types live
 * elsewhere; we keep this narrow so the modal can be fed from anywhere
 * (useTeacherClasses, useCourseTemplates, a hand-built list).
 */
export interface AnnouncementTargetCourse {
  id: string;
  name: string;
}

interface AnnouncementFormModalProps {
  open: boolean;
  mode: AnnouncementFormMode;
  /**
   * Course ids this announcement will be posted to. Length-1 array for the
   * common "from inside a course" entry point; longer array for broadcast.
   * Edit mode treats this as `[announcement.course_id]` and ignores extras.
   */
  targetCourseIds: string[];
  authorId: string;
  /** Required when mode === "edit". */
  initialAnnouncement?: Announcement;
  /**
   * When true, the modal renders the multi-course picker (checkboxes +
   * "Select all" / "Clear"). When false, target courses are taken as-is from
   * `targetCourseIds`. Defaults to false to keep the legacy single-course
   * call site untouched. Ignored in edit mode.
   */
  allowMultiCourse?: boolean;
  /**
   * Candidate courses to show in the multi-course picker. Required when
   * `allowMultiCourse` is true. The caller is responsible for filtering out
   * archived / template courses if that's desired.
   */
  availableCourses?: AnnouncementTargetCourse[];
  onClose: () => void;
  /** Called after a successful create so the parent can refresh. */
  onCreated?: () => void;
  /** Called after a successful edit so the parent can refresh. */
  onUpdated?: () => void;
}

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 10000;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/** Format a scheduled date in the same compact style SmartDatePicker uses. */
function formatScheduled(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AnnouncementFormModal({
  open,
  mode,
  targetCourseIds,
  authorId,
  initialAnnouncement,
  allowMultiCourse = false,
  availableCourses,
  onClose,
  onCreated,
  onUpdated,
}: AnnouncementFormModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [publishAt, setPublishAt] = useState<string | null>(null);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  // Edit mode never shows the picker — we always operate on the existing row.
  const showCoursePicker = allowMultiCourse && mode === "create";

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initialAnnouncement) {
      setTitle(initialAnnouncement.title);
      setBody(initialAnnouncement.body);
      setPinned(initialAnnouncement.pinned);
      setPublishAt(initialAnnouncement.publish_at ?? null);
      setSelectedCourseIds([initialAnnouncement.course_id]);
    } else {
      setTitle("");
      setBody("");
      setPinned(false);
      setPublishAt(null);
      // Seed the selection with the provided ids. In the legacy single-course
      // case this is just [courseId] and the picker is hidden anyway. In the
      // broadcast case the caller may pre-check certain cohorts.
      setSelectedCourseIds(targetCourseIds);
    }
    setError(null);
    const id = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
    // targetCourseIds is intentionally excluded from deps — we don't want
    // every parent re-render that builds a new array reference to wipe the
    // form. The form is re-seeded only when `open` flips or mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initialAnnouncement]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const allCandidateIds = useMemo<string[]>(
    () => (availableCourses ?? []).map((c) => c.id),
    [availableCourses],
  );

  const toggleCourse = useCallback((id: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedCourseIds(allCandidateIds);
  }, [allCandidateIds]);

  const clearAll = useCallback(() => {
    setSelectedCourseIds([]);
  }, []);

  if (!open) return null;

  const isScheduled = publishAt !== null && publishAt !== "";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      setError("Please enter a title.");
      return;
    }
    if (trimmedTitle.length > MAX_TITLE_LEN) {
      setError(`Title must be ${MAX_TITLE_LEN} characters or fewer.`);
      return;
    }
    if (!trimmedBody) {
      setError("Please enter a message.");
      return;
    }
    if (trimmedBody.length > MAX_BODY_LEN) {
      setError(`Message must be ${MAX_BODY_LEN} characters or fewer.`);
      return;
    }

    // Pick the effective target list. In edit mode we always work on the row
    // we were given. In create mode we either use the picker's selection (if
    // the picker is on) or fall back to whatever the caller passed.
    const targets =
      mode === "edit" && initialAnnouncement
        ? [initialAnnouncement.course_id]
        : showCoursePicker
          ? selectedCourseIds
          : targetCourseIds;

    if (targets.length === 0) {
      setError("Pick at least one course to post to.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "edit" && initialAnnouncement) {
        const { error: updateError } = await supabase
          .from("course_announcements")
          .update({
            title: trimmedTitle,
            body: trimmedBody,
            pinned,
            publish_at: isScheduled ? publishAt : null,
          })
          .eq("id", initialAnnouncement.id);

        if (updateError) {
          toast.error("Couldn't save", updateError.message);
          return;
        }
        toast.success("Announcement saved");
        onUpdated?.();
        onClose();
        return;
      }

      // Create mode: one INSERT per target course, all sharing the same
      // body. We deliberately fire these in parallel — if some fail, we
      // surface an aggregated error and keep the successful inserts (no
      // rollback). Maya can re-target the failed cohorts from the broadcast
      // entry point or post to them individually.
      const rows = targets.map((courseId) => ({
        course_id: courseId,
        author_id: authorId,
        title: trimmedTitle,
        body: trimmedBody,
        pinned,
        publish_at: isScheduled ? publishAt : null,
      }));

      const results = await Promise.all(
        rows.map(async (row) => {
          const { error: insertError } = await supabase
            .from("course_announcements")
            .insert(row);
          return { courseId: row.course_id, error: insertError };
        }),
      );

      const failed = results.filter((r) => r.error !== null);
      const succeeded = results.length - failed.length;

      if (failed.length === results.length) {
        // All-fail: most likely cause is RLS / auth. Surface the first error.
        const firstMessage =
          failed[0]?.error?.message ?? "Failed to post announcement.";
        toast.error("Couldn't post", firstMessage);
        return;
      }

      if (failed.length > 0) {
        // Partial failure: keep the successes, report the count.
        toast.error(
          `${failed.length} of ${results.length} failed`,
          failed
            .map(
              (f) =>
                `${f.courseId.slice(0, 8)}…: ${f.error?.message ?? "unknown"}`,
            )
            .join("; "),
        );
        onCreated?.();
        onClose();
        return;
      }

      if (isScheduled && publishAt) {
        toast.success(
          succeeded > 1
            ? `Scheduled for ${formatScheduled(publishAt)} — ${succeeded} courses`
            : `Scheduled for ${formatScheduled(publishAt)}`,
        );
      } else if (succeeded > 1) {
        toast.success(`Announcement broadcast to ${succeeded} courses`);
      } else {
        toast.success("Announcement posted");
      }

      onCreated?.();
      onClose();
    } catch (err: unknown) {
      toast.error(
        "Couldn't save",
        getErrorMessage(
          err,
          mode === "edit"
            ? "Failed to update announcement."
            : "Failed to post announcement.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const titleId =
    mode === "edit"
      ? "edit-announcement-title"
      : "create-announcement-title";
  const headingText =
    mode === "edit" ? "Edit announcement" : "Post an announcement";
  const subheading =
    mode === "edit"
      ? "Update or pin this announcement."
      : showCoursePicker
        ? "Send a message to one or more of your courses."
        : "Send a message to everyone enrolled in this course.";
  const submitLabel = busy
    ? mode === "edit"
      ? "Saving…"
      : isScheduled
        ? "Scheduling…"
        : "Posting…"
    : mode === "edit"
      ? "Save changes"
      : isScheduled
        ? "Schedule announcement"
        : showCoursePicker && selectedCourseIds.length > 1
          ? `Post to ${selectedCourseIds.length} courses`
          : "Post announcement";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2
              id={titleId}
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {headingText}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {subheading}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
            >
              {error}
            </div>
          )}

          {/* Multi-course picker (broadcast mode only) */}
          {showCoursePicker && (
            <fieldset className="block">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Send to courses
                </legend>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <span>{selectedCourseIds.length} selected</span>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
                  >
                    Select all
                  </button>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-800">
                {(availableCourses ?? []).length === 0 ? (
                  <p className="p-3 text-sm text-slate-500 dark:text-slate-400">
                    No courses available.
                  </p>
                ) : (
                  (availableCourses ?? []).map((c) => {
                    const checked = selectedCourseIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCourse(c.id)}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-800 dark:text-slate-200 truncate">
                          {c.name}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </fieldset>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Title
            </span>
            <input
              ref={titleRef}
              data-autofocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE_LEN}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Reminder — quiz next Tuesday"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              {title.length} / {MAX_TITLE_LEN}
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Message
            </span>
            <div className="mt-1">
              {/* Editor stores HTML — DB body column accepts string transparently. */}
              <MarkdownEditor
                value={body}
                onChange={setBody}
                placeholder="What do you want your students to know?"
                characterLimit={MAX_BODY_LEN}
              />
            </div>
          </label>

          <div className="block">
            <SmartDatePicker
              label="Publish at (optional)"
              value={publishAt}
              onChange={setPublishAt}
            />
            {isScheduled && publishAt && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Students won&apos;t see this until {formatScheduled(publishAt)}.
              </p>
            )}
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">Pin to top</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Pinned announcements appear above unpinned ones in the list.
              </span>
            </span>
          </label>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
