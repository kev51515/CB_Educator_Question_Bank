/**
 * ClassFormModal
 * ==============
 * Unified create/edit form for a course. Used both from TeacherConsole (create)
 * and from ClassDetailView (edit). In create mode it mirrors the original
 * CreateClassModal behaviour — including generating a human-friendly join
 * code client-side and showing it on the success screen. In edit mode it
 * pre-populates from `initialClass` and updates the existing row in place.
 *
 * Why one component for both modes: every field overlaps (name, description,
 * archived), only the submit action differs. Forking two components would
 * have doubled the styling + state surface for no real benefit.
 *
 * Backward compatibility: the legacy export name `CreateClassModal` is kept
 * so existing call-sites keep working.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useCourseTemplates } from "./useCourseTemplates";
import { DuplicateCourseModal } from "./DuplicateCourseModal";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useToast } from "@/components";
import { SkeletonRows } from "../components/Skeleton";
import { useFocusTrap } from "../hooks";

export type ClassFormMode = "create" | "edit";

export interface EditableClass {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
}

interface ClassFormModalProps {
  open: boolean;
  mode: ClassFormMode;
  teacherId: string;
  /** Required when mode === "edit". */
  initialClass?: EditableClass;
  onClose: () => void;
  /** Called after a successful create so the parent can refresh. */
  onCreated?: (created: CreatedClass) => void;
  /** Called after a successful edit so the parent can refresh. */
  onUpdated?: (updated: EditableClass) => void;
}

export interface CreatedClass {
  id: string;
  name: string;
  description: string | null;
  join_code: string;
}

// Why this alphabet: visually unambiguous characters only. We drop the
// look-alikes O/0, I/1, and L. That keeps the human-readable codes robust
// over voice / handwritten contexts.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomFromAlphabet(length: number): string {
  // crypto.getRandomValues for unbiased-ish sampling. We tolerate the slight
  // modulo bias because the alphabet size (31) is small relative to 256.
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = (buf[i] ?? 0) % ALPHABET.length;
    out += ALPHABET[idx];
  }
  return out;
}

function generateJoinCode(): string {
  // Format: 4 chars - 4 chars, e.g. ABCD-2345
  return `${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function ClassFormModal({
  open,
  mode,
  teacherId,
  initialClass,
  onClose,
  onCreated,
  onUpdated,
}: ClassFormModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedClass | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateSource, setTemplateSource] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const { templates, loading: templatesLoading } = useCourseTemplates();
  const toast = useToast();

  const nameRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initialClass) {
      setName(initialClass.name);
      setDescription(initialClass.description ?? "");
      setArchived(initialClass.archived);
    } else {
      setName("");
      setDescription("");
      setArchived(false);
    }
    setError(null);
    setCreated(null);
    setCopied(false);
    setShowTemplatePicker(false);
    setTemplateSource(null);
    const id = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, mode, initialClass]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open && !templateSource) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a course name.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "edit" && initialClass) {
        const { data, error: updateError } = await supabase
          .from("courses")
          .update({
            name: trimmedName,
            description: description.trim() || null,
            archived,
          })
          .eq("id", initialClass.id)
          .select("id, name, description, archived")
          .single();

        if (updateError) {
          toast.error("Couldn't save", updateError.message);
          return;
        }
        const updated: EditableClass = {
          id: data.id as string,
          name: data.name as string,
          description: (data.description as string | null) ?? null,
          archived: Boolean(data.archived),
        };
        toast.success("Course updated");
        onUpdated?.(updated);
        onClose();
        return;
      }

      // Create mode — retry on join_code uniqueness collision (PG error 23505).
      let attempts = 0;
      const maxAttempts = 5;
      while (attempts < maxAttempts) {
        attempts += 1;
        const joinCode = generateJoinCode();
        const { data, error: insertError } = await supabase
          .from("courses")
          .insert({
            teacher_id: teacherId,
            name: trimmedName,
            description: description.trim() || null,
            join_code: joinCode,
          })
          .select("id, name, description, join_code")
          .single();

        if (!insertError && data) {
          const createdClass: CreatedClass = {
            id: data.id as string,
            name: data.name as string,
            description: (data.description as string | null) ?? null,
            join_code: data.join_code as string,
          };
          setCreated(createdClass);
          toast.success("Course created");
          onCreated?.(createdClass);
          return;
        }

        if (insertError && insertError.code === "23505") {
          continue;
        }
        if (insertError) {
          toast.error("Couldn't save", insertError.message);
          return;
        }
      }
      toast.error("Couldn't save", "Couldn't generate a unique join code. Please try again.");
    } catch (err: unknown) {
      toast.error(
        "Couldn't save",
        getErrorMessage(
          err,
          mode === "edit" ? "Failed to update course." : "Failed to create course.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.join_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently no-op */
    }
  };

  const titleId =
    mode === "edit" ? "edit-class-title" : "create-class-title";
  const headingText = created
    ? "Course created"
    : mode === "edit"
      ? "Edit course"
      : "Create a course";
  const subheading = created
    ? "Share the join code with your students so they can enroll."
    : mode === "edit"
      ? "Update the course name, description, or archive status."
      : "Give your course a name. You can add a description if helpful.";

  return (
    <>
    {open && (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 inline-flex items-center justify-center w-10 h-10 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <header className="space-y-1 pr-8">
          <h2
            id={titleId}
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            {headingText}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {subheading}
          </p>
        </header>

        {created ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-900 px-4 py-4 text-center">
              <p className="text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Join code
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-indigo-900 dark:text-indigo-100">
                {created.join_code}
              </p>
              <button
                type="button"
                onClick={onCopy}
                className="mt-3 rounded-md bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-800 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950"
              >
                {copied ? "Copied" : "Copy code"}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "create" && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {showTemplatePicker ? (
                  <div className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 p-2 space-y-1 max-h-40 overflow-y-auto">
                    {templatesLoading ? (
                      <div className="px-1 py-1">
                        <SkeletonRows count={3} rowClassName="h-6" />
                      </div>
                    ) : templates.length === 0 ? (
                      <p className="px-1 py-1">No templates yet.</p>
                    ) : (
                      templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTemplateSource({ id: t.id, name: t.name });
                            setShowTemplatePicker(false);
                            onClose();
                          }}
                          className="block w-full text-left rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          {t.name}
                        </button>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => setShowTemplatePicker(false)}
                      className="block w-full text-left rounded px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTemplatePicker(true)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Start from template?
                  </button>
                )}
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
              >
                {error}
              </div>
            )}
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Course name
              </span>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. AP Calculus — Block 3"
              />
            </label>
            <div className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Description{" "}
                <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
              </span>
              <div className="mt-1">
                <MarkdownEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="What's this course for?"
                  minHeight={120}
                  characterLimit={500}
                />
              </div>
            </div>
            {mode === "edit" && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(e) => setArchived(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-medium">Archived</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Archived courses stay visible to you and existing students,
                    but new students can't join using the code.
                  </span>
                </span>
              </label>
            )}
            <div className="flex items-center gap-2">
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
                {busy
                  ? mode === "edit"
                    ? "Saving…"
                    : "Creating…"
                  : mode === "edit"
                    ? "Save changes"
                    : "Create course"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
    )}
    <DuplicateCourseModal
      open={!!templateSource}
      source={templateSource}
      onClose={() => setTemplateSource(null)}
    />
    </>
  );
}

// Backward-compat alias for existing call-sites that imported the old name.
// Both behave identically because they're the same component — callers that
// don't pass `mode` will default to create via the wrapper below.
type CreateClassModalCompatProps = Omit<ClassFormModalProps, "mode">;
export function CreateClassModal(props: CreateClassModalCompatProps) {
  return <ClassFormModal {...props} mode="create" />;
}
