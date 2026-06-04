/**
 * useMaterials — lists the materials (files + links) attached to a course.
 *
 * For kind='file' rows we additionally mint a 1-hour signed URL up-front so
 * the UI can render direct download links without a per-row click round-trip.
 * Signed URLs are stable for the hook's lifetime — if a teacher leaves the
 * tab open for >1h the link will 403. That's acceptable for v1 (re-mount the
 * hook by navigating away + back to refresh).
 *
 * Subscribes to postgres_changes on `course_materials` filtered to this course
 * so the same teacher in a second tab — or the eventual student page on the
 * same UI session — see updates without a manual refresh.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type MaterialKind = "file" | "link";

/**
 * Shape returned to the UI. For 'file' rows, `download_url` is the signed URL
 * minted at fetch time (1-hour TTL); for 'link' rows it is `null` and the UI
 * should use `url` directly.
 */
export interface CourseMaterial {
  id: string;
  course_id: string;
  uploader_id: string;
  kind: MaterialKind;
  title: string;
  description: string | null;
  /** Populated for kind='link'. Null otherwise. */
  url: string | null;
  /** Storage object path. Populated for kind='file'. Null otherwise. */
  file_path: string | null;
  /** Bytes. Populated for kind='file'. */
  file_size: number | null;
  mime_type: string | null;
  position: number;
  published: boolean;
  created_at: string;
  updated_at: string;
  /**
   * Signed URL minted by createSignedUrl() for kind='file' rows. Null for
   * 'link' rows. Expires ~1 hour after the hook last fetched.
   */
  download_url: string | null;
}

export interface UseMaterials {
  materials: CourseMaterial[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface MaterialRow {
  id: string;
  course_id: string;
  uploader_id: string;
  kind: string;
  title: string;
  description: string | null;
  url: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  position: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

const STORAGE_BUCKET = "course-materials";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load materials.";
}

function isMaterialKind(value: string): value is MaterialKind {
  return value === "file" || value === "link";
}

export function useMaterials(courseId: string | null): UseMaterials {
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
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
          "id, course_id, uploader_id, kind, title, description, url, file_path, file_size, mime_type, position, published, created_at, updated_at",
        )
        .eq("course_id", courseId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (queryError) {
        setMaterials([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as MaterialRow[];

      // Mint signed URLs for every file row in parallel. We tolerate
      // individual signing failures — a row with no signed URL renders as
      // "Link broken" rather than failing the whole list.
      const filePaths = rows
        .filter((r) => isMaterialKind(r.kind) && r.kind === "file" && r.file_path)
        .map((r) => r.file_path as string);

      const signedUrlByPath = new Map<string, string>();
      if (filePaths.length > 0) {
        const { data: signed, error: signError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrls(filePaths, SIGNED_URL_TTL_SECONDS);
        if (signError) {
          // Non-fatal: surface in the per-row state by leaving download_url
          // null. We don't promote it to the top-level error because the
          // metadata list is still useful.
          // eslint-disable-next-line no-console -- intentional dev hint
        } else if (signed) {
          for (const entry of signed) {
            if (entry.path && entry.signedUrl) {
              signedUrlByPath.set(entry.path, entry.signedUrl);
            }
          }
        }
      }

      const mapped: CourseMaterial[] = rows.map((row) => {
        const kind: MaterialKind = isMaterialKind(row.kind) ? row.kind : "link";
        const downloadUrl =
          kind === "file" && row.file_path
            ? (signedUrlByPath.get(row.file_path) ?? null)
            : null;
        return {
          id: row.id,
          course_id: row.course_id,
          uploader_id: row.uploader_id,
          kind,
          title: row.title,
          description: row.description,
          url: row.url,
          file_path: row.file_path,
          file_size: row.file_size,
          mime_type: row.mime_type,
          position: row.position,
          published: row.published,
          created_at: row.created_at,
          updated_at: row.updated_at,
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

  // Realtime: a second tab adding/removing materials updates the list. The
  // filter scopes events to this course only.
  useEffect(() => {
    if (!courseId) return;
    const channel = supabase
      .channel(`course-materials:${courseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "course_materials",
          filter: `course_id=eq.${courseId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [courseId, refresh]);

  return { materials, loading, error, refresh };
}
