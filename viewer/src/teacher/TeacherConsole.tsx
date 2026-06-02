/**
 * TeacherConsole
 * ==============
 * Top-level surface for a signed-in teacher (or admin standing in for one).
 * Lists the teacher's courses as cards, offers a "Create course" CTA, and
 * navigates to a per-course detail view on click.
 *
 * Selection state lives in the URL — clicking a card calls
 * `navigate(classPath(id))`, which lands the user inside ClassLayout's
 * /classes/:classId/* route subtree. We no longer keep `selectedClassId`
 * locally because the route handles that.
 *
 * Stays self-contained: doesn't reach into the question bank UI. Sign-out
 * and identity live in the overlaid StudentBadge that AuthGate renders.
 *
 * Note: AuthGate's StaffRoutes currently lands teachers on the Console's
 * `AllClassesView` (admin module) rather than this component. TeacherConsole
 * remains as a focused per-teacher list surface in case a future shell
 * wants to mount it directly — it's kept in the barrel for that reason.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreateClassModal, type CreatedClass } from "./ClassFormModal";
import { useTeacherClasses, type TeacherClass } from "./useTeacherClasses";
import { courseModulesPath } from "../lib/routes";
import { classPath } from "../lib/routes";
import { EmptyState, SkeletonRows } from "../components";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";

// Same alphabet + format as ClassFormModal's generateJoinCode. Kept inline
// rather than exported to avoid widening that module's public surface for a
// single caller. The DB has a unique constraint on join_code; on 23505 we
// simply retry with a fresh code (up to a small cap).
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomFromAlphabet(length: number): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = (buf[i] ?? 0) % JOIN_CODE_ALPHABET.length;
    out += JOIN_CODE_ALPHABET[idx];
  }
  return out;
}

function generateJoinCode(): string {
  return `${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

interface TeacherConsoleProps {
  teacherId: string;
  teacherName: string;
}

interface ClassCardProps {
  cls: TeacherClass;
  onOpen: () => void;
}

function ClassCard({ cls, onOpen }: ClassCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative text-left rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-5 hover:ring-indigo-400 dark:hover:ring-indigo-500 transition shadow-sm hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
            {cls.name}
          </h3>
          {cls.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
              {cls.description}
            </p>
          )}
        </div>
        <span
          aria-hidden
          className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors"
        >
          →
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-mono tracking-widest text-indigo-700 dark:text-indigo-300">
          {cls.join_code}
        </span>
        <span aria-hidden>·</span>
        <span>
          {cls.member_count} student{cls.member_count === 1 ? "" : "s"}
        </span>
      </div>
    </button>
  );
}

// Inline create row — mirrors ModulesPage's InlineCreateModuleRow. Used as
// the cheap path for "+ Course" (just a name). The legacy CreateClassModal
// is kept mounted only for Edit / Duplicate / etc. flows from elsewhere.
interface InlineCreateCourseRowProps {
  busy: boolean;
  onCommit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}

function InlineCreateCourseRow({
  busy,
  onCommit,
  onCancel,
}: InlineCreateCourseRowProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (): Promise<void> => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = await onCommit(trimmed);
    if (ok) setName("");
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-700 shadow-sm px-4 py-3 sm:col-span-2 lg:col-span-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex items-center gap-2"
      >
        <span aria-hidden className="text-indigo-500 dark:text-indigo-400 text-lg leading-none">
          +
        </span>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          disabled={busy}
          placeholder="Course name — Enter to create, Esc to cancel"
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </form>
      <p className="mt-1.5 ml-6 text-[11px] text-slate-500 dark:text-slate-400">
        Saved as draft. Use Settings to set a description or template flag.
      </p>
    </div>
  );
}

export function TeacherConsole({ teacherId, teacherName }: TeacherConsoleProps) {
  const { classes, loading, error, refresh } = useTeacherClasses(teacherId);
  const [showCreate, setShowCreate] = useState(false);
  const [inlineCreatingCourse, setInlineCreatingCourse] = useState(false);
  const [inlineBusy, setInlineBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const onCreated = (created: CreatedClass): void => {
    // Realtime should pick this up anyway, but trigger a refresh so the
    // card is visible the instant the modal closes.
    void refresh();
    // Stay on the modal "success" screen so the teacher can copy the code;
    // the modal closes when they dismiss it.
    void created;
  };

  /**
   * Inline-create commit. Inserts into `public.courses` with just the name;
   * the DB trigger fills in `short_code` (see migration 0038). We still
   * supply `join_code` on the client (same pattern as ClassFormModal —
   * there's no DB-side generator for it). RLS uses teacher_id to scope.
   * Returns true on success so the row clears its input.
   */
  const onInlineCommit = async (name: string): Promise<boolean> => {
    setInlineBusy(true);
    try {
      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const joinCode = generateJoinCode();
        const { data, error: insertError } = await supabase
          .from("courses")
          .insert({
            teacher_id: teacherId,
            name,
            join_code: joinCode,
          })
          .select("id, short_code, join_code")
          .single();

        if (!insertError && data) {
          toast.success("Course created");
          void refresh();
          setInlineCreatingCourse(false);
          const shortCode = data.short_code as string | null;
          if (shortCode) {
            navigate(courseModulesPath(shortCode));
          } else {
            // Trigger 0038 should always populate short_code on INSERT. If we
            // got back NULL the schema is out of sync — surface it instead of
            // leaving the teacher confused why nothing navigated.
            toast.warning(
              "Course created, but no short code returned",
              "Refresh the page to see it.",
            );
          }
          return true;
        }
        // 23505 = unique violation (join_code collision). Retry with a new code.
        if (insertError && insertError.code === "23505") continue;
        if (insertError) {
          toast.error("Couldn't create course", insertError.message);
          return false;
        }
      }
      toast.error(
        "Couldn't create course",
        "Couldn't generate a unique join code. Please try again.",
      );
      return false;
    } catch (err: unknown) {
      toast.error(
        "Couldn't create course",
        getErrorMessage(err, "Failed to create course."),
      );
      return false;
    } finally {
      setInlineBusy(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-12">
        <div className="mx-auto max-w-5xl space-y-8">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
                Teacher console
              </p>
              <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
                Hi, {teacherName.split(" ")[0] || teacherName}
              </h1>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
                Manage your courses and rosters here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInlineCreatingCourse(true)}
              disabled={inlineCreatingCourse}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              + Course
            </button>
          </header>

          <section aria-labelledby="classes-title" className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2
                id="classes-title"
                className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
              >
                Your courses
              </h2>
              {classes.length > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {classes.length} total
                </span>
              )}
            </div>

            {loading ? (
              <SkeletonRows count={3} rowClassName="h-40" />
            ) : error ? (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
              >
                {error}
              </div>
            ) : classes.length === 0 && !inlineCreatingCourse ? (
              <EmptyState
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="h-6 w-6"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                }
                title="No courses yet"
                body="Create your first course to start adding modules, assignments, and students."
                cta={{ label: "+ Course", onClick: () => setInlineCreatingCourse(true) }}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {inlineCreatingCourse && (
                  <InlineCreateCourseRow
                    busy={inlineBusy}
                    onCommit={onInlineCommit}
                    onCancel={() => setInlineCreatingCourse(false)}
                  />
                )}
                {classes.map((cls) => (
                  <ClassCard
                    key={cls.id}
                    cls={cls}
                    onOpen={() => navigate(classPath(cls.short_code))}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/*
        Legacy modal kept mounted for future Edit / Duplicate flows that may
        still target the Console. Cheap-path "+ Course" no longer opens it.
      */}
      <CreateClassModal
        open={showCreate}
        teacherId={teacherId}
        onClose={() => setShowCreate(false)}
        onCreated={onCreated}
      />
    </>
  );
}
