// Student flashcard study widget with Leitner spaced repetition. Cards come
// from props; per-student review state lives in `vocab_review_state` (own rows
// via RLS). Grading calls the `record_vocab_review` RPC. Flippable card, three
// grade buttons, due-queue computed client-side. Tailwind + slate + dark mode.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";

type Grade = "again" | "good" | "easy";

interface Card {
  front: string;
  back: string;
}

interface ReviewRow {
  card_idx: number;
  due_at: string | null;
}

/** Relative phrasing for an ISO timestamp ("in 3 days", "soon"). */
function relative(iso: string | null): string {
  if (!iso) return "soon";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "now";
  const days = Math.round(ms / 86_400_000);
  if (days >= 1) return days === 1 ? "tomorrow" : `in ${days} days`;
  const hrs = Math.round(ms / 3_600_000);
  return hrs >= 1 ? `in ${hrs}h` : "soon";
}

export function VocabDeck({
  itemId,
  title,
  config,
}: {
  itemId: string;
  title?: string;
  config: { cards?: Array<{ front: string; back: string }> };
}): JSX.Element {
  const toast = useToast();
  const aliveRef = useRef(true);
  const cards: Card[] = useMemo(() => config.cards ?? [], [config.cards]);

  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [done, setDone] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [nextDue, setNextDue] = useState<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const { data } = await supabase
        .from("vocab_review_state")
        .select("card_idx, due_at")
        .eq("item_id", itemId);
      if (!aliveRef.current) return;
      setReviews((data ?? []) as ReviewRow[]);
      setLoaded(true);
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [itemId]);

  // A card is due if it has no review row OR its due_at <= now.
  const dueIdx = useMemo(() => {
    const now = Date.now();
    const byIdx = new Map<number, string | null>();
    for (const r of reviews) byIdx.set(r.card_idx, r.due_at);
    const out: number[] = [];
    for (let i = 0; i < cards.length; i++) {
      if (!byIdx.has(i)) {
        out.push(i);
      } else {
        const d = byIdx.get(i) ?? null;
        if (!d || new Date(d).getTime() <= now) out.push(i);
      }
    }
    return out;
  }, [reviews, cards.length]);

  const soonest = useMemo(() => {
    const future = reviews
      .map((r) => r.due_at)
      .filter((d): d is string => !!d && new Date(d).getTime() > Date.now())
      .sort();
    return future[0] ?? null;
  }, [reviews]);

  function start(all: boolean): void {
    const idxs = all ? cards.map((_, i) => i) : dueIdx;
    setQueue(idxs);
    setPos(0);
    setDone(0);
    setRevealed(false);
    setActive(idxs.length > 0);
  }

  async function grade(g: Grade): Promise<void> {
    if (busy) return;
    const cardIdx = queue[pos];
    if (cardIdx == null) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("record_vocab_review", {
      p_item_id: itemId,
      p_card_idx: cardIdx,
      p_grade: g,
    });
    if (!aliveRef.current) return;
    setBusy(false);
    if (error) {
      toast.error("Couldn't save your review", error.message);
      return;
    }
    if (typeof data === "string") setNextDue(data);
    setDone((d) => d + 1);
    setRevealed(false);
    if (pos + 1 >= queue.length) {
      setActive(false);
    } else {
      setPos((p) => p + 1);
    }
  }

  const shell =
    "rounded-xl border border-slate-200 bg-white px-4 py-3 ring-1 ring-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:ring-slate-800/60 text-slate-900 dark:text-slate-100";

  if (!loaded) {
    return (
      <div className={shell} aria-busy="true">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className={shell}>
        <h3 className="text-sm font-semibold">{title || "Vocabulary"}</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No cards yet.</p>
      </div>
    );
  }

  const card = active ? cards[queue[pos]] : null;

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title || "Vocabulary"}</h3>
        <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          {cards.length} cards · {dueIdx.length} due
        </span>
      </div>

      {active && card ? (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              Card {done + 1} of {queue.length}
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${(done / queue.length) * 100}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800"
          >
            <span className="block text-base font-medium">{card.front}</span>
            {revealed ? (
              <span className="mt-3 block border-t border-slate-200 pt-3 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
                {card.back}
              </span>
            ) : (
              <span className="mt-3 block text-xs font-medium text-indigo-600 dark:text-indigo-400">
                Show answer
              </span>
            )}
          </button>

          {revealed ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void grade("again")}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
              >
                Again
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void grade("good")}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                Good
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void grade("easy")}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                Easy
              </button>
            </div>
          ) : null}
        </div>
      ) : done > 0 ? (
        <div className="mt-3">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Session complete · reviewed {done} {done === 1 ? "card" : "cards"}
            {nextDue ? ` · next review ${relative(nextDue)}` : ""}
          </p>
          <button
            type="button"
            onClick={() => start(true)}
            className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Study again
          </button>
        </div>
      ) : (
        <div className="mt-3">
          {dueIdx.length > 0 ? (
            <button
              type="button"
              onClick={() => start(false)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Study {dueIdx.length} due
            </button>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              All caught up — next review {relative(soonest)}
            </p>
          )}
          <button
            type="button"
            onClick={() => start(true)}
            className="ml-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Study all {cards.length}
          </button>
        </div>
      )}
    </div>
  );
}
