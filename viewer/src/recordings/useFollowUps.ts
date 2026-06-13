/**
 * Follow-ups data layer — tracked tasks promoted from a recording's AI action
 * items (migration 0233). Owner-scoped, client-direct CRUD under owner-all RLS
 * (no RPC). Plain supabase + useState/useEffect with an `aliveRef` guard, per
 * CLAUDE.md (Wave 21J).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RecordingFollowUp } from "./types";

const COLS =
  "id, owner_id, recording_id, body, assignee, due_at, done, done_at, created_at, updated_at";

export interface CreateFollowUpInput {
  recording_id: string | null;
  body: string;
  assignee?: string | null;
  due_at?: string | null;
}

/** Create one follow-up. Owner is the signed-in user (enforced by RLS too). */
export async function createFollowUp(
  input: CreateFollowUpInput,
): Promise<RecordingFollowUp> {
  const { data: auth } = await supabase.auth.getUser();
  const owner_id = auth.user?.id;
  if (!owner_id) throw new Error("not_authenticated");
  const { data, error } = await supabase
    .from("recording_follow_ups")
    .insert({
      owner_id,
      recording_id: input.recording_id,
      body: input.body.trim(),
      assignee: input.assignee?.trim() || null,
      due_at: input.due_at ?? null,
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as RecordingFollowUp;
}

export async function setFollowUpDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from("recording_follow_ups")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function setFollowUpDue(id: string, due_at: string | null): Promise<void> {
  const { error } = await supabase
    .from("recording_follow_ups")
    .update({ due_at })
    .eq("id", id);
  if (error) throw error;
}

export async function updateFollowUpBody(id: string, body: string): Promise<void> {
  const { error } = await supabase
    .from("recording_follow_ups")
    .update({ body: body.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteFollowUp(id: string): Promise<void> {
  const { error } = await supabase.from("recording_follow_ups").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Follow-ups for the caller. Pass a recordingId to scope to one recording
 * (the detail-page panel); omit it for the cross-recording "Follow-ups" page.
 */
export function useFollowUps(recordingId?: string) {
  const [followUps, setFollowUps] = useState<RecordingFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    let q = supabase
      .from("recording_follow_ups")
      .select(COLS)
      .order("done", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (recordingId) q = q.eq("recording_id", recordingId);
    const { data, error: err } = await q;
    if (!aliveRef.current) return;
    if (err) setError(err.message);
    else {
      setFollowUps((data ?? []) as RecordingFollowUp[]);
      setError(null);
    }
    setLoading(false);
  }, [recordingId]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  return { followUps, loading, error, refresh: load };
}
