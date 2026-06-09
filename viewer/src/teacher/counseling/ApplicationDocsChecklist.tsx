/**
 * ApplicationDocsChecklist — a compact per-application document checklist (the
 * "missing documents" tracker). Self-contained: reads + writes the
 * `documents` jsonb on its own college_applications row (0137), so it drops into
 * a college row with just an appId. Counselor-facing (inherits the row's RLS).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";

interface Doc {
  label: string;
  done: boolean;
}

const SUGGESTED = [
  "Transcript",
  "Recommendation",
  "Test scores",
  "Essay",
  "Application",
  "Fee / waiver",
];

export function ApplicationDocsChecklist({ appId }: { appId: string }) {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState("");

  const load = useCallback(async (): Promise<void> => {
    const { data } = await supabase
      .from("college_applications")
      .select("documents")
      .eq("id", appId)
      .maybeSingle();
    if (!aliveRef.current) return;
    const d = (data?.documents ?? []) as Doc[];
    setDocs(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [appId]);
  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (next: Doc[]): Promise<void> => {
    setDocs(next);
    const { error } = await supabase
      .from("college_applications")
      .update({ documents: next })
      .eq("id", appId);
    if (!aliveRef.current) return;
    if (error) {
      toast.error("Couldn't save documents", error.message);
      void load();
    }
  };

  const toggle = (i: number) =>
    void persist(docs.map((d, idx) => (idx === i ? { ...d, done: !d.done } : d)));
  const remove = (i: number) => void persist(docs.filter((_, idx) => idx !== i));
  const add = (label: string) => {
    const l = label.trim();
    if (!l) return;
    if (docs.some((d) => d.label.toLowerCase() === l.toLowerCase())) {
      setAdding("");
      return;
    }
    void persist([...docs, { label: l, done: false }]);
    setAdding("");
  };

  if (loading) return null;
  const missing = docs.filter((d) => !d.done).length;

  return (
    <div className="w-full mt-1 flex flex-wrap items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Docs
      </span>
      {missing > 0 && (
        <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          {missing} missing
        </span>
      )}
      {docs.map((d, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ${
            d.done
              ? "bg-emerald-50 dark:bg-emerald-950/40 ring-emerald-200 dark:ring-emerald-900 text-emerald-700 dark:text-emerald-300"
              : "bg-slate-50 dark:bg-slate-800 ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300"
          }`}
        >
          <input
            type="checkbox"
            checked={d.done}
            onChange={() => toggle(i)}
            aria-label={`${d.label} ${d.done ? "done" : "not done"}`}
            className="h-3 w-3 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
          />
          {d.label}
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove ${d.label}`}
            className="text-slate-400 hover:text-rose-500"
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>
      ))}
      <input
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(adding);
          }
        }}
        list={`docsugg-${appId}`}
        placeholder="+ doc"
        aria-label="Add a required document"
        className="w-24 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <datalist id={`docsugg-${appId}`}>
        {SUGGESTED.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
