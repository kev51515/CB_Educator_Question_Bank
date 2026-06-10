/**
 * courseOrg — per-teacher folders + tags for the courses grid (migration 0188)
 * ============================================================================
 * A small data layer over the owner-scoped `course_folders` / `course_tags` and
 * their edge tables. Everything is keyed to the signed-in educator (owner_id),
 * so a shared course can be filed/labelled differently by each teacher.
 *
 * `useCourseOrganization` loads the four tables in parallel and exposes the
 * derived lookups (folderOf / tagsOf) plus optimistic mutations. Mutations
 * patch local state immediately for a snappy feel and reconcile (refresh +
 * toast) on failure — the same optimistic posture the rest of the LMS uses.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";

export interface CourseFolder {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

export interface CourseTag {
  id: string;
  name: string;
  color: string | null;
}

export interface CourseOrg {
  folders: CourseFolder[];
  tags: CourseTag[];
  /** course_id → folder_id (a course is in at most one folder per owner) */
  folderOf: Map<string, string>;
  /** course_id → tag_id[] */
  tagsOf: Map<string, string[]>;
}

const EMPTY_ORG: CourseOrg = {
  folders: [],
  tags: [],
  folderOf: new Map(),
  tagsOf: new Map(),
};

// ---- colour palette (shared by folders + tags) -----------------------------
// Stored as a token in the `color` column; resolved to Tailwind classes here so
// the DB stays presentation-agnostic. `null`/unknown → slate.
export const ORG_COLORS = [
  "indigo",
  "emerald",
  "amber",
  "rose",
  "sky",
  "violet",
  "teal",
  "orange",
  "slate",
] as const;
export type OrgColor = (typeof ORG_COLORS)[number];

// ---- drag-and-drop -----------------------------------------------------------
// MIME type carried by a course being dragged onto a folder rail row. Native
// HTML5 DnD (no library — matches the rest of the codebase). The folder rail
// rows check for this type on dragover so unrelated drags don't light them up.
export const COURSE_DND_MIME = "application/x-course-id";

interface ColorClasses {
  chip: string; // tag chip (bg + text + ring)
  dot: string; // small swatch (bg)
  solid: string; // active/selected (bg + text)
  soft: string; // soft tint background for an active folder row
}

const COLOR_MAP: Record<OrgColor, ColorClasses> = {
  indigo: {
    chip: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900",
    dot: "bg-indigo-500",
    solid: "bg-indigo-600 text-white ring-indigo-600",
    soft: "bg-indigo-50 dark:bg-indigo-950/40",
  },
  emerald: {
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900",
    dot: "bg-emerald-500",
    solid: "bg-emerald-600 text-white ring-emerald-600",
    soft: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  amber: {
    chip: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
    dot: "bg-amber-500",
    solid: "bg-amber-500 text-white ring-amber-500",
    soft: "bg-amber-50 dark:bg-amber-950/40",
  },
  rose: {
    chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900",
    dot: "bg-rose-500",
    solid: "bg-rose-600 text-white ring-rose-600",
    soft: "bg-rose-50 dark:bg-rose-950/40",
  },
  sky: {
    chip: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
    dot: "bg-sky-500",
    solid: "bg-sky-600 text-white ring-sky-600",
    soft: "bg-sky-50 dark:bg-sky-950/40",
  },
  violet: {
    chip: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900",
    dot: "bg-violet-500",
    solid: "bg-violet-600 text-white ring-violet-600",
    soft: "bg-violet-50 dark:bg-violet-950/40",
  },
  teal: {
    chip: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900",
    dot: "bg-teal-500",
    solid: "bg-teal-600 text-white ring-teal-600",
    soft: "bg-teal-50 dark:bg-teal-950/40",
  },
  orange: {
    chip: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-900",
    dot: "bg-orange-500",
    solid: "bg-orange-500 text-white ring-orange-500",
    soft: "bg-orange-50 dark:bg-orange-950/40",
  },
  slate: {
    chip: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
    dot: "bg-slate-400",
    solid: "bg-slate-600 text-white ring-slate-600",
    soft: "bg-slate-100 dark:bg-slate-800/60",
  },
};

export function colorClasses(color: string | null | undefined): ColorClasses {
  return COLOR_MAP[(color ?? "slate") as OrgColor] ?? COLOR_MAP.slate;
}

interface MutationApi {
  createFolder: (name: string, color: OrgColor) => Promise<CourseFolder | null>;
  renameFolder: (id: string, name: string) => Promise<void>;
  recolorFolder: (id: string, color: OrgColor) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  setCourseFolder: (courseId: string, folderId: string | null) => Promise<void>;
  createTag: (name: string, color: OrgColor) => Promise<CourseTag | null>;
  deleteTag: (id: string) => Promise<void>;
  toggleCourseTag: (courseId: string, tagId: string, on: boolean) => Promise<void>;
}

export interface UseCourseOrg extends MutationApi {
  org: CourseOrg;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useCourseOrganization(ownerId: string | undefined): UseCourseOrg {
  const [org, setOrg] = useState<CourseOrg>(EMPTY_ORG);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!ownerId) {
      setOrg(EMPTY_ORG);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [foldersRes, tagsRes, fItemsRes, tItemsRes] = await Promise.all([
      supabase.from("course_folders").select("id, name, color, position").eq("owner_id", ownerId),
      supabase.from("course_tags").select("id, name, color").eq("owner_id", ownerId),
      supabase.from("course_folder_items").select("course_id, folder_id").eq("owner_id", ownerId),
      supabase.from("course_tag_items").select("course_id, tag_id").eq("owner_id", ownerId),
    ]);
    if (!aliveRef.current) return;
    const folders = ((foldersRes.data ?? []) as CourseFolder[])
      .slice()
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    const tags = ((tagsRes.data ?? []) as CourseTag[])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const folderOf = new Map<string, string>();
    for (const r of (fItemsRes.data ?? []) as Array<{ course_id: string; folder_id: string }>) {
      folderOf.set(r.course_id, r.folder_id);
    }
    const tagsOf = new Map<string, string[]>();
    for (const r of (tItemsRes.data ?? []) as Array<{ course_id: string; tag_id: string }>) {
      const list = tagsOf.get(r.course_id);
      if (list) list.push(r.tag_id);
      else tagsOf.set(r.course_id, [r.tag_id]);
    }
    setOrg({ folders, tags, folderOf, tagsOf });
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Clone the org with a patched copy of the two maps so React sees new refs.
  const patch = useCallback((fn: (draft: CourseOrg) => CourseOrg) => {
    setOrg((cur) => fn(cur));
  }, []);

  const fail = useCallback(
    (msg: string, e?: { message?: string } | null) => {
      toast.error(msg, e?.message);
      void refresh();
    },
    [toast, refresh],
  );

  const createFolder = useCallback<MutationApi["createFolder"]>(
    async (name, color) => {
      if (!ownerId) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;
      const position = org.folders.length;
      const { data, error } = await supabase
        .from("course_folders")
        .insert({ owner_id: ownerId, name: trimmed, color, position })
        .select("id, name, color, position")
        .single();
      if (error || !data) {
        fail("Couldn't create folder", error);
        return null;
      }
      const folder = data as CourseFolder;
      patch((cur) => ({ ...cur, folders: [...cur.folders, folder] }));
      return folder;
    },
    [ownerId, org.folders.length, fail, patch],
  );

  const renameFolder = useCallback<MutationApi["renameFolder"]>(
    async (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      patch((cur) => ({
        ...cur,
        folders: cur.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
      }));
      const { error } = await supabase.from("course_folders").update({ name: trimmed }).eq("id", id);
      if (error) fail("Couldn't rename folder", error);
    },
    [fail, patch],
  );

  const recolorFolder = useCallback<MutationApi["recolorFolder"]>(
    async (id, color) => {
      patch((cur) => ({
        ...cur,
        folders: cur.folders.map((f) => (f.id === id ? { ...f, color } : f)),
      }));
      const { error } = await supabase.from("course_folders").update({ color }).eq("id", id);
      if (error) fail("Couldn't recolor folder", error);
    },
    [fail, patch],
  );

  const deleteFolder = useCallback<MutationApi["deleteFolder"]>(
    async (id) => {
      patch((cur) => {
        const folderOf = new Map(cur.folderOf);
        for (const [c, f] of folderOf) if (f === id) folderOf.delete(c);
        return { ...cur, folders: cur.folders.filter((f) => f.id !== id), folderOf };
      });
      // Edge rows cascade on the folder FK, so only the folder row needs deleting.
      const { error } = await supabase.from("course_folders").delete().eq("id", id);
      if (error) fail("Couldn't delete folder", error);
    },
    [fail, patch],
  );

  const setCourseFolder = useCallback<MutationApi["setCourseFolder"]>(
    async (courseId, folderId) => {
      if (!ownerId) return;
      patch((cur) => {
        const folderOf = new Map(cur.folderOf);
        if (folderId) folderOf.set(courseId, folderId);
        else folderOf.delete(courseId);
        return { ...cur, folderOf };
      });
      if (folderId) {
        const { error } = await supabase
          .from("course_folder_items")
          .upsert(
            { owner_id: ownerId, course_id: courseId, folder_id: folderId },
            { onConflict: "owner_id,course_id" },
          );
        if (error) fail("Couldn't move course", error);
      } else {
        const { error } = await supabase
          .from("course_folder_items")
          .delete()
          .eq("owner_id", ownerId)
          .eq("course_id", courseId);
        if (error) fail("Couldn't remove from folder", error);
      }
    },
    [ownerId, fail, patch],
  );

  const createTag = useCallback<MutationApi["createTag"]>(
    async (name, color) => {
      if (!ownerId) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;
      // Reuse an existing same-name tag (case-insensitive) rather than erroring
      // on the unique index.
      const existing = org.tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing;
      const { data, error } = await supabase
        .from("course_tags")
        .insert({ owner_id: ownerId, name: trimmed, color })
        .select("id, name, color")
        .single();
      if (error || !data) {
        fail("Couldn't create tag", error);
        return null;
      }
      const tag = data as CourseTag;
      patch((cur) => ({
        ...cur,
        tags: [...cur.tags, tag].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      return tag;
    },
    [ownerId, org.tags, fail, patch],
  );

  const deleteTag = useCallback<MutationApi["deleteTag"]>(
    async (id) => {
      patch((cur) => {
        const tagsOf = new Map<string, string[]>();
        for (const [c, ts] of cur.tagsOf) {
          const next = ts.filter((t) => t !== id);
          if (next.length) tagsOf.set(c, next);
        }
        return { ...cur, tags: cur.tags.filter((t) => t.id !== id), tagsOf };
      });
      const { error } = await supabase.from("course_tags").delete().eq("id", id);
      if (error) fail("Couldn't delete tag", error);
    },
    [fail, patch],
  );

  const toggleCourseTag = useCallback<MutationApi["toggleCourseTag"]>(
    async (courseId, tagId, on) => {
      if (!ownerId) return;
      patch((cur) => {
        const tagsOf = new Map(cur.tagsOf);
        const list = tagsOf.get(courseId) ?? [];
        if (on) {
          if (!list.includes(tagId)) tagsOf.set(courseId, [...list, tagId]);
        } else {
          const next = list.filter((t) => t !== tagId);
          if (next.length) tagsOf.set(courseId, next);
          else tagsOf.delete(courseId);
        }
        return { ...cur, tagsOf };
      });
      if (on) {
        const { error } = await supabase
          .from("course_tag_items")
          .upsert(
            { owner_id: ownerId, course_id: courseId, tag_id: tagId },
            { onConflict: "course_id,tag_id" },
          );
        if (error) fail("Couldn't add tag", error);
      } else {
        const { error } = await supabase
          .from("course_tag_items")
          .delete()
          .eq("course_id", courseId)
          .eq("tag_id", tagId);
        if (error) fail("Couldn't remove tag", error);
      }
    },
    [ownerId, fail, patch],
  );

  return useMemo(
    () => ({
      org,
      loading,
      refresh,
      createFolder,
      renameFolder,
      recolorFolder,
      deleteFolder,
      setCourseFolder,
      createTag,
      deleteTag,
      toggleCourseTag,
    }),
    [
      org,
      loading,
      refresh,
      createFolder,
      renameFolder,
      recolorFolder,
      deleteFolder,
      setCourseFolder,
      createTag,
      deleteTag,
      toggleCourseTag,
    ],
  );
}
