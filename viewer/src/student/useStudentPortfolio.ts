/**
 * useStudentPortfolio — read the portfolio template + items for a course the
 * signed-in student is enrolled in, joined with the student's own submissions
 * (if any) so the UI can render status pills per item.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type StudentPortfolioItemType =
  | "short_text"
  | "long_text"
  | "file"
  | "link"
  | "number"
  | "date"
  | "choice"
  | "multi_choice";

export interface StudentPortfolioItemSettings {
  max_chars?: number;
  options?: string[];
}

export interface StudentPortfolioItem {
  id: string;
  template_id: string;
  position: number;
  title: string;
  prompt: string | null;
  item_type: StudentPortfolioItemType;
  required: boolean;
  due_at: string | null;
  settings: StudentPortfolioItemSettings;
  parent_item_id: string | null;
}

/** Tree projection — header items can have children, leaves are submission targets. */
export interface StudentPortfolioItemNode extends StudentPortfolioItem {
  children: StudentPortfolioItemNode[];
}

export type StudentSubmissionStatus = "draft" | "submitted";

export interface StudentPortfolioSubmission {
  id: string;
  item_id: string;
  student_id: string;
  status: StudentSubmissionStatus;
  submitted_at: string | null;
  value_text: string | null;
  value_url: string | null;
  value_file_path: string | null;
  value_file_size: number | null;
  value_file_mime: string | null;
  value_number: number | null;
  value_date: string | null;
  value_choice: string | null;
  value_multi_choice: string[] | null;
  updated_at: string;
}

export interface UseStudentPortfolio {
  templateId: string | null;
  items: StudentPortfolioItem[];
  submissionsByItemId: Record<string, StudentPortfolioSubmission>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface TemplateRow {
  id: string;
}

interface ItemRow {
  id: string;
  template_id: string;
  position: number;
  title: string;
  prompt: string | null;
  item_type: string;
  required: boolean;
  due_at: string | null;
  settings: unknown;
  parent_item_id: string | null;
}

interface SubmissionRow {
  id: string;
  item_id: string;
  student_id: string;
  status: string;
  submitted_at: string | null;
  value_text: string | null;
  value_url: string | null;
  value_file_path: string | null;
  value_file_size: number | null;
  value_file_mime: string | null;
  value_number: number | string | null;
  value_date: string | null;
  value_choice: string | null;
  value_multi_choice: string[] | null;
  updated_at: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load portfolio.";
}

function isItemType(value: string): value is StudentPortfolioItemType {
  return (
    value === "short_text" ||
    value === "long_text" ||
    value === "file" ||
    value === "link" ||
    value === "number" ||
    value === "date" ||
    value === "choice" ||
    value === "multi_choice"
  );
}

function toSettings(raw: unknown): StudentPortfolioItemSettings {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: StudentPortfolioItemSettings = {};
  if (typeof r.max_chars === "number") out.max_chars = r.max_chars;
  if (Array.isArray(r.options)) {
    out.options = r.options.filter((v): v is string => typeof v === "string");
  }
  return out;
}

export function useStudentPortfolio(
  courseId: string | null,
  studentId: string | null,
): UseStudentPortfolio {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [items, setItems] = useState<StudentPortfolioItem[]>([]);
  const [submissionsByItemId, setSubmissionsByItemId] = useState<
    Record<string, StudentPortfolioSubmission>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseId || !studentId) {
      setTemplateId(null);
      setItems([]);
      setSubmissionsByItemId({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: tplData, error: tplErr } = await supabase
        .from("portfolio_templates")
        .select("id")
        .eq("course_id", courseId)
        .maybeSingle();
      if (tplErr) {
        setError(tplErr.message);
        return;
      }
      const tplRow = (tplData ?? null) as unknown as TemplateRow | null;
      if (!tplRow) {
        setTemplateId(null);
        setItems([]);
        setSubmissionsByItemId({});
        return;
      }
      setTemplateId(tplRow.id);

      const { data: itemData, error: itemErr } = await supabase
        .from("portfolio_items")
        .select(
          "id, template_id, position, title, prompt, item_type, required, due_at, settings, parent_item_id",
        )
        .eq("template_id", tplRow.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (itemErr) {
        setError(itemErr.message);
        return;
      }
      const itemRows = (itemData ?? []) as unknown as ItemRow[];
      const mappedItems: StudentPortfolioItem[] = itemRows
        .filter((r) => isItemType(r.item_type))
        .map((r) => ({
          id: r.id,
          template_id: r.template_id,
          position: r.position,
          title: r.title,
          prompt: r.prompt,
          item_type: r.item_type as StudentPortfolioItemType,
          required: r.required,
          due_at: r.due_at,
          settings: toSettings(r.settings),
          parent_item_id: r.parent_item_id ?? null,
        }));
      setItems(mappedItems);

      const itemIds = mappedItems.map((i) => i.id);
      if (itemIds.length === 0) {
        setSubmissionsByItemId({});
        return;
      }

      const { data: subData, error: subErr } = await supabase
        .from("portfolio_submissions")
        .select(
          "id, item_id, student_id, status, submitted_at, value_text, value_url, value_file_path, value_file_size, value_file_mime, value_number, value_date, value_choice, value_multi_choice, updated_at",
        )
        .eq("student_id", studentId)
        .in("item_id", itemIds);
      if (subErr) {
        setError(subErr.message);
        return;
      }
      const subRows = (subData ?? []) as unknown as SubmissionRow[];
      const map: Record<string, StudentPortfolioSubmission> = {};
      for (const r of subRows) {
        const status: StudentSubmissionStatus =
          r.status === "submitted" ? "submitted" : "draft";
        map[r.item_id] = {
          id: r.id,
          item_id: r.item_id,
          student_id: r.student_id,
          status,
          submitted_at: r.submitted_at,
          value_text: r.value_text,
          value_url: r.value_url,
          value_file_path: r.value_file_path,
          value_file_size: r.value_file_size,
          value_file_mime: r.value_file_mime,
          value_number:
            r.value_number === null
              ? null
              : typeof r.value_number === "string"
                ? Number(r.value_number)
                : r.value_number,
          value_date: r.value_date,
          value_choice: r.value_choice,
          value_multi_choice: r.value_multi_choice,
          updated_at: r.updated_at,
        };
      }
      setSubmissionsByItemId(map);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId, studentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    templateId,
    items,
    submissionsByItemId,
    loading,
    error,
    refresh,
  };
}

/**
 * Read-only tree builder for the student side. Mirrors the staff
 * `buildPortfolioTree` shape but typed against `StudentPortfolioItem`.
 */
export function buildStudentPortfolioTree(
  items: readonly StudentPortfolioItem[],
): StudentPortfolioItemNode[] {
  const ids = new Set<string>();
  for (const i of items) ids.add(i.id);

  const byParent = new Map<string | null, StudentPortfolioItem[]>();
  for (const item of items) {
    const key =
      item.parent_item_id && ids.has(item.parent_item_id)
        ? item.parent_item_id
        : null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(item);
    else byParent.set(key, [item]);
  }

  const build = (parentId: string | null): StudentPortfolioItemNode[] => {
    const siblings = (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    return siblings.map((item) => ({
      ...item,
      children: build(item.id),
    }));
  };

  return build(null);
}
