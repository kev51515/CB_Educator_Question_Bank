/**
 * AddToModuleModal — put a recording into a course module. The teacher picks a
 * course + module, and chooses whether to share it with the course's students
 * (so they can open the read-only audio + notes + transcript) or keep it private
 * (a teacher-side link only). Mirrors QuizDraftPanel's course-loading.
 */
import { useEffect, useMemo, useState } from "react";
import { Combobox, ResponsiveModal, useToast } from "@/components";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { useTeacherClasses } from "@/teacher/useTeacherClasses";
import { addRecordingToModule } from "./useRecordings";

interface ModuleOpt {
  value: string;
  label: string;
}

export function AddToModuleModal({
  open,
  recordingId,
  recordingTitle,
  onClose,
}: {
  open: boolean;
  recordingId: string;
  recordingTitle: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { profile } = useProfile();
  const { classes } = useTeacherClasses(open ? profile?.id ?? null : null);
  const [courseId, setCourseId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [modules, setModules] = useState<ModuleOpt[]>([]);
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);

  const courseOptions = useMemo(
    () => classes.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name })),
    [classes],
  );

  useEffect(() => {
    if (open) {
      setCourseId("");
      setModuleId("");
      setModules([]);
      setShare(true);
    }
  }, [open]);

  // Load the chosen course's modules.
  useEffect(() => {
    if (!courseId) {
      setModules([]);
      setModuleId("");
      return;
    }
    let alive = true;
    void supabase
      .from("course_modules")
      .select("id, title, position")
      .eq("course_id", courseId)
      .order("position", { ascending: true })
      .then(({ data }) => {
        if (!alive) return;
        setModules((data ?? []).map((m) => ({ value: m.id as string, label: (m.title as string) || "Untitled module" })));
      });
    return () => {
      alive = false;
    };
  }, [courseId]);

  async function submit() {
    if (!courseId || !moduleId) {
      toast.error("Pick a course and a module.");
      return;
    }
    setBusy(true);
    try {
      await addRecordingToModule({
        recordingId,
        courseId,
        moduleId,
        title: recordingTitle,
        shareWithStudents: share,
      });
      toast.success(
        "Added to module",
        share ? "Students in the course can view it." : "Added as a private link.",
      );
      onClose();
    } catch (e) {
      toast.error("Couldn't add to module", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !courseId || !moduleId}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add to module"}
      </button>
    </div>
  );

  return (
    <ResponsiveModal open={open} onClose={onClose} title="Add recording to a module" footer={footer}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Course</span>
          <Combobox
            value={courseId || null}
            onChange={setCourseId}
            options={courseOptions}
            ariaLabel="Course"
            placeholder={courseOptions.length ? "Select a course…" : "No active courses"}
            disabled={courseOptions.length === 0}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Module</span>
          <Combobox
            value={moduleId || null}
            onChange={setModuleId}
            options={modules}
            ariaLabel="Module"
            placeholder={!courseId ? "Pick a course first" : modules.length ? "Select a module…" : "No modules in this course"}
            disabled={!courseId || modules.length === 0}
          />
        </label>
        <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-medium text-slate-900 dark:text-slate-100">Share with students in this course</span>
            <span className="block text-slate-500 dark:text-slate-400">
              They'll be able to open a read-only view (audio, notes, transcript). Uncheck to add a private,
              teacher-only link.
            </span>
          </span>
        </label>
      </div>
    </ResponsiveModal>
  );
}
