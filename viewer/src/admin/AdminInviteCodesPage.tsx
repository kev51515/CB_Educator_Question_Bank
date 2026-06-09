/**
 * AdminInviteCodesPage
 * ====================
 * Admin-only page to mint and revoke teacher invite codes. RLS makes the
 * underlying `teacher_invite_codes` table admin-only-read, so non-admins
 * will see an empty list (and be unable to mint via RPC). It's safe to
 * mount this page for any signed-in user — the security boundary lives
 * in the DB.
 *
 * Not yet wired into AuthGate (the other agent owns that edit). The
 * intended hook-in is a "Admin: invite codes" link inside the teacher
 * console's nav for profile.role === 'admin'.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRovingTabIndex } from "@/hooks";
import { supabase } from "@/lib/supabase";
import { SmartDatePicker } from "@/components/SmartDatePicker";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import {
  FILTER_OPTIONS,
  SORT_OPTIONS,
  loadView,
  saveView,
  classifyCode,
  toInviteCode,
  formatDate,
  formatRelative,
  type FilterKey,
  type SortKey,
  type InviteCodesView,
  type InviteCode,
  type Redemption,
  type RawRedemptionRow,
} from "./inviteCodesHelpers";

export function AdminInviteCodesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Redemption history (last 20).
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState<boolean>(true);
  const [redemptionsError, setRedemptionsError] = useState<string | null>(null);

  // Mint form
  const [newCode, setNewCode] = useState<string>("");
  const [newNote, setNewNote] = useState<string>("");
  const [newExpiresAt, setNewExpiresAt] = useState<string>("");
  const [newMaxUses, setNewMaxUses] = useState<string>("");
  const [mintBusy, setMintBusy] = useState<boolean>(false);
  const [mintError, setMintError] = useState<string | null>(null);

  // Revoke confirm dialog
  const [confirmRevoke, setConfirmRevoke] = useState<InviteCode | null>(null);
  const [revokeBusy, setRevokeBusy] = useState<boolean>(false);

  // Filter + sort (persisted)
  const [view, setView] = useState<InviteCodesView>(() => loadView());
  useEffect(() => {
    saveView(view);
  }, [view]);

  const setFilter = useCallback((filter: FilterKey) => {
    setView((v) => ({ ...v, filter }));
  }, []);

  // Roving-tabindex keyboard nav for the status-filter tablist. (It already had
  // tabIndex 0/-1 roving but NO arrow handler, leaving inactive filters
  // keyboard-unreachable — Arrow/Home/End now reach them.)
  const { getTabProps } = useRovingTabIndex<HTMLButtonElement>({
    count: FILTER_OPTIONS.length,
    activeIndex: FILTER_OPTIONS.findIndex((o) => o.key === view.filter),
    onSelect: (i) => setFilter(FILTER_OPTIONS[i].key),
  });
  const setSort = useCallback((sort: SortKey) => {
    setView((v) => ({ ...v, sort }));
  }, []);

  const toast = useToast();

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("teacher_invite_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (queryError) {
        setError(queryError.message);
        setCodes([]);
        return;
      }
      const parsed: InviteCode[] = [];
      for (const row of data ?? []) {
        const c = toInviteCode(row);
        if (c) parsed.push(c);
      }
      setCodes(parsed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load invite codes.");
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshRedemptions = useCallback(async (): Promise<void> => {
    setRedemptionsLoading(true);
    setRedemptionsError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("teacher_invite_redemptions")
        .select(
          "id, code, redeemed_at, redeemed_by:profiles!teacher_invite_redemptions_redeemed_by_fkey(display_name, email)",
        )
        .order("redeemed_at", { ascending: false })
        .limit(20);
      if (queryError) {
        setRedemptionsError(queryError.message);
        setRedemptions([]);
        return;
      }
      const rows = (data ?? []) as unknown as RawRedemptionRow[];
      setRedemptions(
        rows.map((row) => ({
          id: row.id,
          code: row.code,
          redeemed_at: row.redeemed_at,
          redeemed_by_name: row.redeemed_by?.display_name ?? null,
          redeemed_by_email: row.redeemed_by?.email ?? "",
        })),
      );
    } catch (err: unknown) {
      setRedemptionsError(
        err instanceof Error ? err.message : "Failed to load redemptions.",
      );
      setRedemptions([]);
    } finally {
      setRedemptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshRedemptions();
  }, [refresh, refreshRedemptions]);

  const onMint = async (e: React.FormEvent) => {
    e.preventDefault();
    setMintError(null);
    const trimmedCode = newCode.trim().toLowerCase();
    if (trimmedCode.length < 6 || trimmedCode.length > 32) {
      setMintError("Code must be 6–32 characters.");
      return;
    }
    const maxUsesParsed = newMaxUses.trim() ? Number.parseInt(newMaxUses.trim(), 10) : null;
    if (maxUsesParsed !== null && (!Number.isFinite(maxUsesParsed) || maxUsesParsed <= 0)) {
      setMintError("Max uses must be a positive integer (or leave blank for unlimited).");
      return;
    }
    setMintBusy(true);
    try {
      // SmartDatePicker now stores ISO directly in state — no conversion needed.
      const expiresAtIso = newExpiresAt.trim() || null;
      const { error: rpcError } = await supabase.rpc("mint_teacher_invite", {
        p_code: trimmedCode,
        p_note: newNote.trim() || null,
        p_expires_at: expiresAtIso,
        p_max_uses: maxUsesParsed,
      });
      if (rpcError) {
        setMintError(rpcError.message);
        toast.error("Couldn't mint code", rpcError.message);
        return;
      }
      toast.success("Code minted", `"${trimmedCode}" is ready to share.`);
      setNewCode("");
      setNewNote("");
      setNewExpiresAt("");
      setNewMaxUses("");
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to mint code.";
      setMintError(msg);
      toast.error("Couldn't mint code", msg);
    } finally {
      setMintBusy(false);
    }
  };

  const performRevoke = async (code: string): Promise<void> => {
    setRevokeBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc("revoke_teacher_invite", { p_code: code });
      if (rpcError) {
        toast.error("Couldn't revoke code", rpcError.message);
        return;
      }
      toast.success("Code revoked", `"${code}" can no longer be redeemed.`);
      setConfirmRevoke(null);
      await refresh();
    } catch (err: unknown) {
      toast.error(
        "Couldn't revoke code",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setRevokeBusy(false);
    }
  };

  const copyCode = async (code: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Copied!", code);
    } catch {
      toast.error("Copy failed", "Your browser blocked clipboard access.");
    }
  };

  const focusCodeInput = (): void => {
    const el = document.getElementById("invite-code-input") as HTMLInputElement | null;
    el?.focus();
  };

  // Counts per bucket (computed once per refresh).
  const counts = useMemo(() => {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    let revoked = 0;
    for (const c of codes) {
      const cls = classifyCode(c, now);
      if (cls === "active") active++;
      else if (cls === "expired") expired++;
      else revoked++;
    }
    return { all: codes.length, active, expired, revoked };
  }, [codes]);

  // Filtered + sorted list for display.
  const visibleCodes = useMemo(() => {
    const now = Date.now();
    const filtered =
      view.filter === "all"
        ? codes.slice()
        : codes.filter((c) => classifyCode(c, now) === view.filter);
    const ts = (s: string | null): number => {
      if (!s) return NaN;
      const t = new Date(s).getTime();
      return Number.isFinite(t) ? t : NaN;
    };
    switch (view.sort) {
      case "oldest":
        filtered.sort((a, b) => (ts(a.created_at) || 0) - (ts(b.created_at) || 0));
        break;
      case "expires":
        filtered.sort((a, b) => {
          const at = ts(a.expires_at);
          const bt = ts(b.expires_at);
          const aNull = Number.isNaN(at);
          const bNull = Number.isNaN(bt);
          if (aNull && bNull) return 0;
          if (aNull) return 1; // nulls last
          if (bNull) return -1;
          return at - bt;
        });
        break;
      case "code":
        filtered.sort((a, b) => a.code.localeCompare(b.code));
        break;
      case "recent":
      default:
        filtered.sort((a, b) => (ts(b.created_at) || 0) - (ts(a.created_at) || 0));
        break;
    }
    return filtered;
  }, [codes, view.filter, view.sort]);

  const activeFilterLabel =
    FILTER_OPTIONS.find((o) => o.key === view.filter)?.label ?? "All";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Teacher invite codes
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Codes minted here promote a new user to the teacher role at signup.
          Any staff member can mint or revoke.
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Mint codes for new teacher signups. Codes are case-insensitive and may
          have an expiry and/or a max-uses cap.
        </p>
      </header>

      {/* Mint form */}
      <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Mint a new code
        </h2>
        <form onSubmit={onMint} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Code
            </span>
            <input
              id="invite-code-input"
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. spring-2026"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Note (internal)
            </span>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Spring 2026 cohort"
            />
          </label>
          <div>
            <SmartDatePicker
              label="Expires at (optional)"
              value={newExpiresAt || null}
              onChange={(iso) => setNewExpiresAt(iso ?? "")}
              allowClear
            />
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Max uses (optional)
            </span>
            <input
              type="number"
              min={1}
              value={newMaxUses}
              onChange={(e) => setNewMaxUses(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Unlimited if blank"
            />
          </label>
          {mintError && (
            <p role="alert" className="sm:col-span-2 text-sm text-rose-600 dark:text-rose-400">
              {mintError}
            </p>
          )}
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={mintBusy}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
            >
              {mintBusy ? "Minting…" : "Mint code"}
            </button>
          </div>
        </form>
      </section>

      {/* List */}
      <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
        <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Existing codes
          </h2>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Refresh
          </button>
        </header>
        {error && (
          <div role="alert" className="px-5 py-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}
        {loading ? (
          <div className="px-5 py-4">
            <SkeletonRows count={4} />
          </div>
        ) : codes.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState
              title="No invite codes yet"
              body="Mint a code above to share with new teachers."
              cta={{ label: "Mint a code", onClick: focusCodeInput }}
            />
          </div>
        ) : (
          <>
            {/* Filter pills + sort */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Filter codes by status"
                className="flex flex-wrap items-center gap-1.5"
              >
                {FILTER_OPTIONS.map((opt, idx) => {
                  const count =
                    opt.key === "all"
                      ? counts.all
                      : opt.key === "active"
                        ? counts.active
                        : opt.key === "expired"
                          ? counts.expired
                          : counts.revoked;
                  const selected = view.filter === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setFilter(opt.key)}
                      {...getTabProps(idx)}
                      className={
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium min-h-[40px] transition-colors " +
                        (selected
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700")
                      }
                    >
                      <span>{opt.label}</span>
                      <span
                        className={
                          "inline-flex items-center justify-center rounded-full px-1.5 min-w-[1.5rem] text-xs font-semibold " +
                          (selected
                            ? "bg-white/20 text-white"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700")
                        }
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span className="sr-only">Sort codes</span>
                <span aria-hidden>Sort</span>
                <select
                  aria-label="Sort codes"
                  value={view.sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 min-h-[40px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sr-only" aria-live="polite" role="status">
                Showing {visibleCodes.length} {activeFilterLabel.toLowerCase()}{" "}
                {visibleCodes.length === 1 ? "code" : "codes"}.
              </div>
            </div>
            {visibleCodes.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No {activeFilterLabel.toLowerCase()} codes
                </p>
                {view.filter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="mt-2 inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 min-h-[40px]"
                  >
                    Show all
                  </button>
                )}
              </div>
            ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-5 py-2">Code</th>
                  <th className="px-5 py-2">Note</th>
                  <th className="px-5 py-2">Uses</th>
                  <th className="px-5 py-2">Expires</th>
                  <th className="px-5 py-2">Status</th>
                  <th className="px-5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visibleCodes.map((c) => {
                  const max = c.max_uses === null ? "∞" : String(c.max_uses);
                  const status = classifyCode(c, Date.now());
                  return (
                    <tr
                      key={c.code}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-5 py-2 font-mono text-slate-900 dark:text-slate-100">
                        <button
                          type="button"
                          onClick={() => void copyCode(c.code)}
                          title="Copy code"
                          className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <span>{c.code}</span>
                          <svg
                            aria-hidden
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-slate-400 group-hover:text-indigo-500"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>
                      </td>
                      <td className="px-5 py-2 text-slate-700 dark:text-slate-300">
                        {c.note ?? "—"}
                      </td>
                      <td className="px-5 py-2 text-slate-700 dark:text-slate-300">
                        {c.uses} / {max}
                      </td>
                      <td
                        className="px-5 py-2 text-slate-700 dark:text-slate-300"
                        title={formatDate(c.expires_at)}
                      >
                        {formatRelative(c.expires_at)}
                      </td>
                      <td className="px-5 py-2">
                        {status === "revoked" ? (
                          <span className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-medium px-2 py-0.5">
                            Revoked
                          </span>
                        ) : status === "expired" ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-xs font-medium px-2 py-0.5">
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-medium px-2 py-0.5">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2 text-right">
                        {!c.revoked && (
                          <button
                            type="button"
                            onClick={() => setConfirmRevoke(c)}
                            className="text-sm font-medium text-rose-600 dark:text-rose-400 hover:underline"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            )}
          </>
        )}
      </section>

      {/* Redemption history. Last 20 successful redemptions, newest first. */}
      <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
        <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Redemption history
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Last 20 successful teacher invite redemptions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshRedemptions()}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Refresh
          </button>
        </header>
        {redemptionsError && (
          <div role="alert" className="px-5 py-3 text-sm text-rose-600 dark:text-rose-400">
            {redemptionsError}
          </div>
        )}
        {redemptionsLoading ? (
          <div className="px-5 py-4">
            <SkeletonRows count={3} />
          </div>
        ) : redemptions.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState
              title="No redemptions yet"
              body="When a new teacher uses one of your codes, the redemption shows up here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-5 py-2">Code</th>
                  <th className="px-5 py-2">Redeemed by</th>
                  <th className="px-5 py-2">Redeemed at</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-5 py-2 font-mono text-slate-900 dark:text-slate-100">
                      {r.code}
                    </td>
                    <td className="px-5 py-2">
                      <div className="text-slate-900 dark:text-slate-100">
                        {r.redeemed_by_name ?? "—"}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {r.redeemed_by_email}
                      </div>
                    </td>
                    <td
                      className="px-5 py-2 text-slate-500 dark:text-slate-400"
                      title={formatDate(r.redeemed_at)}
                    >
                      {formatRelative(r.redeemed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmRevoke && (
        <ConfirmDialog
          title="Revoke this invite code?"
          body={
            <div className="space-y-2">
              <p>
                <span className="font-mono font-semibold">{confirmRevoke.code}</span>
                {confirmRevoke.note ? <> — {confirmRevoke.note}</> : null}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Already used <span className="font-medium">{confirmRevoke.uses}</span>{" "}
                {confirmRevoke.uses === 1 ? "time" : "times"}
                {confirmRevoke.max_uses !== null
                  ? ` of ${confirmRevoke.max_uses} allowed`
                  : ""}
                . Anyone who already redeemed this code keeps their teacher role.
              </p>
              <p className="text-rose-700 dark:text-rose-300 text-sm">
                Future redemptions will be blocked.
              </p>
            </div>
          }
          confirmLabel="Revoke code"
          destructive
          busy={revokeBusy}
          onConfirm={() => {
            void performRevoke(confirmRevoke.code);
          }}
          onCancel={() => setConfirmRevoke(null)}
        />
      )}
    </div>
  );
}
