/**
 * useCourseTemplates — list courses with `is_template = true`.
 *
 * Used by the AllClassesView "Templates" filter pill and by the
 * "Start from template?" picker in ClassFormModal. RLS already restricts
 * which courses each caller can see (teacher of course / staff reads all),
 * so we simply add the is_template filter here.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface CourseTemplate {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  teacher_id: string;
}

export interface UseCourseTemplates {
  templates: CourseTemplate[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  teacher_id: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load templates.";
}

export function useCourseTemplates(): UseCourseTemplates {
  const [templates, setTemplates] = useState<CourseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("courses")
        .select("id, name, description, created_at, teacher_id")
        .eq("is_template", true)
        .order("created_at", { ascending: false });

      if (queryError) {
        setTemplates([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as TemplateRow[];
      setTemplates(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          created_at: row.created_at,
          teacher_id: row.teacher_id,
        })),
      );
    } catch (err: unknown) {
      setTemplates([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { templates, loading, error, refresh };
}
