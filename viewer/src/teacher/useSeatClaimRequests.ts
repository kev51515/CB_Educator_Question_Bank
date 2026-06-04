/**
 * useSeatClaimRequests — pending seat-claim (login recovery) requests for a course.
 *
 * A request is filed by `claim_student_seat` (migration 0095) when a student
 * tries to claim a seat that's already been taken over. The teacher of the
 * course (RLS-gated) sees the pending rows here and approves/denies via the
 * `decide_seat_claim_request` RPC. Approving resets that seat's sign-in to the
 * requested email + password — same student, same name, same work.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface SeatClaimRequest {
  id: string;
  seat_id: string;
  /** The per-seat login code, e.g. "Y8M3KP-01". */
  roster_code: string;
  /** Email the student wants to sign in with going forward. */
  requested_email: string;
  created_at: string;
  /** Teacher-owned display name of the seat (for the row label). */
  display_name: string | null;
  /** The seat's current email (synthetic or previously-claimed). */
  current_email: string;
}

interface RequestRow {
  id: string;
  seat_id: string;
  roster_code: string;
  requested_email: string;
  created_at: string;
  seat: { display_name: string | null; email: string } | null;
}

export interface UseSeatClaimRequests {
  requests: SeatClaimRequest[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  decide: (requestId: string, approve: boolean) => Promise<{ ok: boolean; error?: string }>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load login requests.";
}

export function useSeatClaimRequests(courseId: string | null): UseSeatClaimRequests {
  const [requests, setRequests] = useState<SeatClaimRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from("seat_claim_requests")
        .select(
          "id, seat_id, roster_code, requested_email, created_at, seat:profiles!seat_claim_requests_seat_id_fkey(display_name, email)",
        )
        .eq("course_id", courseId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (queryError) {
        setRequests([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as RequestRow[];
      setRequests(
        rows.map((row) => ({
          id: row.id,
          seat_id: row.seat_id,
          roster_code: row.roster_code,
          requested_email: row.requested_email,
          created_at: row.created_at,
          display_name: row.seat?.display_name ?? null,
          current_email: row.seat?.email ?? "",
        })),
      );
      setError(null);
    } catch (err: unknown) {
      setRequests([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = useCallback(
    async (requestId: string, approve: boolean): Promise<{ ok: boolean; error?: string }> => {
      const { error: rpcError } = await supabase.rpc("decide_seat_claim_request", {
        p_request_id: requestId,
        p_approve: approve,
      });
      if (rpcError) return { ok: false, error: rpcError.message };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  return { requests, loading, error, refresh, decide };
}
