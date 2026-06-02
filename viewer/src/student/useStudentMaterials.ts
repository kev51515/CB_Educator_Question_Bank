/**
 * useStudentMaterials — read-only materials list for a single course as seen
 * by an enrolled student.
 *
 * Mirrors the teacher-side `useMaterials` shape but with a few simplifications:
 *   - No realtime subscription: the student list is a one-shot fetch; if a
 *     teacher adds new materials while a student is mid-session, they appear
 *     on the next navigation. We avoid the channel overhead because the
 *     student dashboard mounts many of these in parallel.
 *   - SELECT-only: students cannot create / edit / delete, so we never expose
 *     write helpers from the hook.
 *
 * Signed URLs for kind='file' rows are minted up-front (1-hour TTL) so the UI
 * can render a direct download link. Storage SELECT policy gates this on
 * enrollment, so an evicted student gets no URL.
 *
 * RLS handles scoping: the SELECT policy on `course_materials` already filters
 * to courses the caller is enrolled in (see migration 0016). We still pass
 * `course_id=eq.{id}` to keep the query small.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type StudentMaterialKind = "file" | "link";

export interface StudentMaterial {
  id: string;
  course_id: string;
  kind: StudentMaterialKind;
  title: string;
  description: string | null;
  /** Populated for kind='link'. Null for kind='file'. */
  url: string | null;
  /** Storage path. Populated for kind='file'. Null otherwise. */
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  position: number;
  created_at: string;
  /**
   * Signed URL minted by createSignedUrls() for kind='file' rows. Null for
   * 'link' rows. Expires ~1 hour after the hook last fetched.
   */
  download_url: string | null;
}

export interface UseStudentMaterials {
  materials: StudentMaterial[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface MaterialRow {
  id: string;
  course_id: string;
  kind: string;
  title: string;
  description: string | null;
  url: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  position: number;
  created_at: string;
}

const STORAGE_BUCKET = "course-materials";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load materials.";
}

function isMaterialKind(value: string): value is StudentMaterialKind {
  return value === "file" || value === "link";
}

export function useStudentMaterials(
  courseId: string | null,
): UseStudentMaterials {
  const [materials, setMaterials] = useState<StudentMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseId) {
      setMaterials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("course_materials")
        .select(
          "id, course_id, kind, title, description, url, file_path, file_size, mime_type, position, created_at",
        )
        .eq("course_id", courseId)
        .eq("published", true)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (queryError) {
        setMaterials([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as MaterialRow[];

      // Sign every file row in a single round-trip.
      const filePaths = rows
        .filter((r) => isMaterialKind(r.kind) && r.kind === "file" && r.file_path)
        .map((r) => r.file_path as string);

      const signedUrlByPath = new Map<string, string>();
      if (filePaths.length > 0) {
        const { data: signed, error: signError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrls(filePaths, SIGNED_URL_TTL_SECONDS);
        if (!signError && signed) {
          for (const entry of signed) {
            if (entry.path && entry.signedUrl) {
              signedUrlByPath.set(entry.path, entry.signedUrl);
            }
          }
        }
        // Non-fatal: a per-row null download_url renders as a disabled row.
      }

      const mapped: StudentMaterial[] = rows.map((row) => {
        const kind: StudentMaterialKind = isMaterialKind(row.kind)
          ? row.kind
          : "link";
        const downloadUrl =
          kind === "file" && row.file_path
            ? (signedUrlByPath.get(row.file_path) ?? null)
            : null;
        return {
          id: row.id,
          course_id: row.course_id,
          kind,
          title: row.title,
          description: row.description,
          url: row.url,
          file_path: row.file_path,
          file_size: row.file_size,
          mime_type: row.mime_type,
          position: row.position,
          created_at: row.created_at,
          download_url: downloadUrl,
        };
      });

      setMaterials(mapped);
    } catch (err: unknown) {
      setMaterials([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { materials, loading, error, refresh };
}
