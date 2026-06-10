/**
 * EventsPanel — Pickleball PLAYER-track teacher panel.
 *
 * Educators create and manage events (clinics, camps, social play) for the
 * players enrolled in this course: name, description (MarkdownEditor), coach,
 * location, start/end (SmartDatePicker), capacity, skill band, and a
 * registration window. A one-click status badge toggles draft -> published
 * (and back), or cancels. Expanding an event shows its roster: registered
 * players, then the waitlist in rank order, with per-row attendance controls
 * and an override-enroll picker that bypasses the skill gate.
 *
 * Optimistic UI + toast feedback throughout; Skeleton while loading; empty
 * state with a CTA.
 *
 * Prop contract (do not change):
 *   export function EventsPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MarkdownEditor, SmartDatePicker, SkeletonRows, useToast } from "@/components";

// ─── Constants ──────────────────────────────────────────────────────────────

type EventType = "clinic" | "camp" | "social";
type EventStatus = "draft" | "published" | "cancelled";
type RegState = "registered" | "waitlisted" | "attended" | "no_show" | "cancelled";

const TYPE_LABEL: Record<EventType, string> = {
  clinic: "Clinic",
  camp: "Camp",
  social: "Social",
};

const TYPE_OPTIONS: EventType[] = ["clinic", "camp", "social"];

const STATUS_STYLE: Record<EventStatus, string> = {
  draft:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700",
  published:
    "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  cancelled:
    "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
};

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  published: "Published",
  cancelled: "Cancelled",
};

const REG_STATE_LABEL: Record<RegState, string> = {
  registered: "Registered",
  waitlisted: "Waitlisted",
  attended: "Attended",
  no_show: "No-show",
  cancelled: "Cancelled",
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  course_id: string;
  type: EventType;
  name: string;
  description: string | null;
  coach_id: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  skill_min: number | null;
  skill_max: number | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  status: EventStatus;
  created_at: string;
}

interface RegistrationRow {
  id: string;
  event_id: string;
  course_id: string;
  player_id: string;
  state: RegState;
  waitlist_rank: number | null;
  registered_at: string;
}

interface PlayerOption {
  id: string;
  name: string;
}

interface CoachOption {
  id: string;
  name: string;
}

interface PendingForm {
  type: EventType;
  name: string;
  description: string;
  coachId: string;
  location: string;
  startsAt: string | null;
  endsAt: string | null;
  capacity: string;
  skillMin: string;
  skillMax: string;
  regOpensAt: string | null;
  regClosesAt: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

function friendlyError(err: unknown): string {
  const raw = getErrorMessage(err);
  switch (raw) {
    case "not_authorized":
      return "You don't have permission to manage events for this course.";
    case "not_authenticated":
      return "Your session expired — please sign in again.";
    case "not_found":
      return "That event no longer exists.";
    case "invalid_input":
      return "Please fill in the required fields.";
    case "already_registered":
      return "That player is already registered.";
    case "skill_gate":
      return "That player's skill level is outside this event's band.";
    case "registration_closed":
      return "Registration isn't open for this event.";
    default:
      return raw;
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSkillBand(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `Level ${min}–${max}`;
  if (min != null) return `Level ${min}+`;
  return `Up to level ${max}`;
}

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

function emptyForm(): PendingForm {
  return {
    type: "clinic",
    name: "",
    description: "",
    coachId: "",
    location: "",
    startsAt: null,
    endsAt: null,
    capacity: "",
    skillMin: "",
    skillMax: "",
    regOpensAt: null,
    regClosesAt: null,
  };
}

function formFromEvent(ev: EventRow): PendingForm {
  return {
    type: ev.type,
    name: ev.name,
    description: ev.description ?? "",
    coachId: ev.coach_id ?? "",
    location: ev.location ?? "",
    startsAt: ev.starts_at,
    endsAt: ev.ends_at,
    capacity: ev.capacity != null ? String(ev.capacity) : "",
    skillMin: ev.skill_min != null ? String(ev.skill_min) : "",
    skillMax: ev.skill_max != null ? String(ev.skill_max) : "",
    regOpensAt: ev.registration_opens_at,
    regClosesAt: ev.registration_closes_at,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EventsPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const aliveRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [regsByEvent, setRegsByEvent] = useState<Record<string, RegistrationRow[]>>({});
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PendingForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // ─── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, regsRes, rosterRes] = await Promise.all([
        supabase
          .from("pickleball_events")
          .select(
            "id, course_id, type, name, description, coach_id, location, starts_at, ends_at, capacity, skill_min, skill_max, registration_opens_at, registration_closes_at, status, created_at",
          )
          .eq("course_id", courseId)
          .order("starts_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("pickleball_event_registrations")
          .select("id, event_id, course_id, player_id, state, waitlist_rank, registered_at")
          .eq("course_id", courseId)
          .order("waitlist_rank", { ascending: true, nullsFirst: true })
          .order("registered_at", { ascending: true }),
        supabase
          .from("course_memberships")
          .select(
            "student_id, student:profiles!course_memberships_student_id_fkey(display_name, email)",
          )
          .eq("course_id", courseId),
      ]);

      if (!aliveRef.current) return;

      if (eventsRes.error) throw new Error(eventsRes.error.message);
      setEvents((eventsRes.data ?? []) as unknown as EventRow[]);

      if (regsRes.error) throw new Error(regsRes.error.message);
      const grouped: Record<string, RegistrationRow[]> = {};
      for (const r of (regsRes.data ?? []) as unknown as RegistrationRow[]) {
        (grouped[r.event_id] ??= []).push(r);
      }
      setRegsByEvent(grouped);

      if (rosterRes.error) throw new Error(rosterRes.error.message);
      const rosterRows = (rosterRes.data ?? []) as unknown as {
        student_id: string;
        student: { display_name: string | null; email: string | null } | null;
      }[];
      const opts = rosterRows.map((r) => ({
        id: r.student_id,
        name: r.student?.display_name || r.student?.email || "Unnamed player",
      }));
      setPlayers(opts);
      // Coaches are drawn from the same roster (any member can be tagged as the
      // session coach); coach picker is optional.
      setCoaches(opts);
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't load events", friendlyError(err));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const playerName = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name ?? "Player",
    [players],
  );
  const coachName = useCallback(
    (id: string | null) => (id ? coaches.find((c) => c.id === id)?.name ?? null : null),
    [coaches],
  );

  const hasEvents = useMemo(() => events.length > 0, [events]);

  // ─── Composer open/close ────────────────────────────────────────────────────

  const openNew = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setComposerOpen(true);
  }, []);

  const openEdit = useCallback((ev: EventRow) => {
    setEditingId(ev.id);
    setForm(formFromEvent(ev));
    setComposerOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }, []);

  // ─── Save (create or edit) ──────────────────────────────────────────────────

  const onSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error("Name required", "Give the event a name.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("pk_upsert_event", {
        p_course_id: courseId,
        p_name: form.name.trim(),
        p_id: editingId,
        p_type: form.type,
        p_description: form.description.trim() || null,
        p_coach_id: form.coachId || null,
        p_location: form.location.trim() || null,
        p_starts_at: form.startsAt,
        p_ends_at: form.endsAt,
        p_capacity: numOrNull(form.capacity),
        p_skill_min: numOrNull(form.skillMin),
        p_skill_max: numOrNull(form.skillMax),
        p_registration_opens_at: form.regOpensAt,
        p_registration_closes_at: form.regClosesAt,
      });
      if (error) throw new Error(error.message);
      if (!aliveRef.current) return;
      const saved = data as unknown as EventRow;
      setEvents((prev) => {
        const exists = prev.some((e) => e.id === saved.id);
        return exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev];
      });
      closeComposer();
      setExpandedId(saved.id);
      toast.success(editingId ? "Event updated" : "Event created", saved.name);
    } catch (err) {
      if (aliveRef.current) toast.error("Couldn't save event", friendlyError(err));
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [courseId, editingId, form, closeComposer, toast]);

  // ─── Publish toggle (optimistic) ────────────────────────────────────────────

  const onToggleStatus = useCallback(
    async (ev: EventRow) => {
      const target: EventStatus = ev.status === "published" ? "draft" : "published";
      const prevStatus = ev.status;
      setEvents((prev) =>
        prev.map((e) => (e.id === ev.id ? { ...e, status: target } : e)),
      );
      try {
        const { error } = await supabase.rpc("pk_publish_event", {
          p_id: ev.id,
          p_status: target,
        });
        if (error) throw new Error(error.message);
      } catch (err) {
        if (!aliveRef.current) return;
        setEvents((prev) =>
          prev.map((e) => (e.id === ev.id ? { ...e, status: prevStatus } : e)),
        );
        toast.error("Couldn't update status", friendlyError(err));
      }
    },
    [toast],
  );

  // ─── Attendance ──────────────────────────────────────────────────────────────

  const onSetAttendance = useCallback(
    async (eventId: string, reg: RegistrationRow, state: "attended" | "no_show") => {
      const prevState = reg.state;
      const nextState = reg.state === state ? "registered" : state;
      setRegsByEvent((prev) => ({
        ...prev,
        [eventId]: (prev[eventId] ?? []).map((r) =>
          r.id === reg.id ? { ...r, state: nextState } : r,
        ),
      }));
      try {
        // Toggling back to registered uses pk_publish-style intent; the RPC only
        // accepts attended|no_show, so re-clicking the same state reverts via a
        // direct educator update through RLS.
        if (nextState === "registered") {
          const { error } = await supabase
            .from("pickleball_event_registrations")
            .update({ state: "registered" })
            .eq("id", reg.id);
          if (error) throw new Error(error.message);
        } else {
          const { data, error } = await supabase.rpc("pk_set_attendance", {
            p_registration_id: reg.id,
            p_state: nextState,
          });
          if (error) throw new Error(error.message);
          if (!aliveRef.current) return;
          const updated = data as unknown as RegistrationRow;
          setRegsByEvent((prev) => ({
            ...prev,
            [eventId]: (prev[eventId] ?? []).map((r) => (r.id === updated.id ? updated : r)),
          }));
        }
      } catch (err) {
        if (!aliveRef.current) return;
        setRegsByEvent((prev) => ({
          ...prev,
          [eventId]: (prev[eventId] ?? []).map((r) =>
            r.id === reg.id ? { ...r, state: prevState } : r,
          ),
        }));
        toast.error("Couldn't update attendance", friendlyError(err));
      }
    },
    [toast],
  );

  // ─── Override-enroll a player ────────────────────────────────────────────────

  const onOverrideEnroll = useCallback(
    async (eventId: string, playerId: string): Promise<boolean> => {
      try {
        const { data, error } = await supabase.rpc("pk_override_register", {
          p_event_id: eventId,
          p_player_id: playerId,
        });
        if (error) throw new Error(error.message);
        if (!aliveRef.current) return true;
        const created = data as unknown as RegistrationRow;
        setRegsByEvent((prev) => {
          const list = (prev[eventId] ?? []).filter((r) => r.id !== created.id);
          return { ...prev, [eventId]: [...list, created] };
        });
        // The override RPC lands the player on the waitlist when the event is
        // full, so branch the confirmation on the returned row's state.
        if (created.state === "waitlisted") {
          toast.success(
            "Event full — player added to the waitlist",
            playerName(created.player_id),
          );
        } else {
          toast.success("Player enrolled", playerName(created.player_id));
        }
        return true;
      } catch (err) {
        if (aliveRef.current) toast.error("Couldn't enrol player", friendlyError(err));
        return false;
      }
    },
    [playerName, toast],
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" data-course-id={courseId}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Events</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Clinics, camps &amp; social play — with capacity, skill bands &amp; a waitlist.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (composerOpen ? closeComposer() : openNew())}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-sm font-medium text-white ring-1 ring-slate-900 transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100 dark:hover:bg-white"
        >
          <PlusIcon />
          {composerOpen ? "Close" : "New event"}
        </button>
      </div>

      {/* Composer */}
      {composerOpen && (
        <div className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Type
              </span>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EventType }))}
                className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Name
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Saturday morning dink clinic"
                className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Coach <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <select
                value={form.coachId}
                onChange={(e) => setForm((f) => ({ ...f, coachId: e.target.value }))}
                className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">No coach</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Location
              </span>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Court 3"
                className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <div className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Starts
              </span>
              <SmartDatePicker
                value={form.startsAt}
                onChange={(next) => setForm((f) => ({ ...f, startsAt: next }))}
                label="Event start"
              />
            </div>

            <div className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                Ends
              </span>
              <SmartDatePicker
                value={form.endsAt}
                onChange={(next) => setForm((f) => ({ ...f, endsAt: next }))}
                label="Event end"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Capacity
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                  placeholder="12"
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Skill min
                </span>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={form.skillMin}
                  onChange={(e) => setForm((f) => ({ ...f, skillMin: e.target.value }))}
                  placeholder="2.5"
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Skill max
                </span>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={form.skillMax}
                  onChange={(e) => setForm((f) => ({ ...f, skillMax: e.target.value }))}
                  placeholder="4.0"
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Registration opens
                </span>
                <SmartDatePicker
                  value={form.regOpensAt}
                  onChange={(next) => setForm((f) => ({ ...f, regOpensAt: next }))}
                  label="Registration opens"
                />
              </div>
              <div className="text-sm">
                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Registration closes
                </span>
                <SmartDatePicker
                  value={form.regClosesAt}
                  onChange={(next) => setForm((f) => ({ ...f, regClosesAt: next }))}
                  label="Registration closes"
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Description
            </span>
            <MarkdownEditor
              value={form.description}
              onChange={(html) => setForm((f) => ({ ...f, description: html }))}
              placeholder="What players should expect, what to bring…"
              minHeight={120}
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeComposer}
              className="min-h-[40px] rounded-xl px-3.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="min-h-[40px] rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Create event"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
          <SkeletonRows count={4} />
        </div>
      ) : !hasEvents ? (
        <div className="rounded-2xl bg-white/80 p-8 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No events yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create your first clinic, camp, or social play session.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            <PlusIcon />
            New event
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => (
            <EventRowCard
              key={ev.id}
              event={ev}
              regs={regsByEvent[ev.id] ?? []}
              players={players}
              coachLabel={coachName(ev.coach_id)}
              playerName={playerName}
              expanded={expandedId === ev.id}
              onToggleExpand={() =>
                setExpandedId((cur) => (cur === ev.id ? null : ev.id))
              }
              onToggleStatus={() => void onToggleStatus(ev)}
              onEdit={() => openEdit(ev)}
              onSetAttendance={(reg, state) => void onSetAttendance(ev.id, reg, state)}
              onOverrideEnroll={(playerId) => onOverrideEnroll(ev.id, playerId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Event row card ─────────────────────────────────────────────────────────

interface EventRowCardProps {
  event: EventRow;
  regs: RegistrationRow[];
  players: PlayerOption[];
  coachLabel: string | null;
  playerName: (id: string) => string;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  onEdit: () => void;
  onSetAttendance: (reg: RegistrationRow, state: "attended" | "no_show") => void;
  onOverrideEnroll: (playerId: string) => Promise<boolean>;
}

function EventRowCard({
  event,
  regs,
  players,
  coachLabel,
  playerName,
  expanded,
  onToggleExpand,
  onToggleStatus,
  onEdit,
  onSetAttendance,
  onOverrideEnroll,
}: EventRowCardProps) {
  const [overridePlayer, setOverridePlayer] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  const status = event.status;
  const skillBand = formatSkillBand(event.skill_min, event.skill_max);

  // Split registrations: active seats, waitlist (rank order), attendance.
  const activeRegs = useMemo(
    () => regs.filter((r) => r.state === "registered" || r.state === "attended" || r.state === "no_show"),
    [regs],
  );
  const waitlist = useMemo(
    () =>
      regs
        .filter((r) => r.state === "waitlisted")
        .sort((a, b) => (a.waitlist_rank ?? 0) - (b.waitlist_rank ?? 0)),
    [regs],
  );
  const registeredCount = useMemo(
    () => regs.filter((r) => r.state === "registered" || r.state === "attended" || r.state === "no_show").length,
    [regs],
  );

  // Players not yet on the roster for this event (eligible for override-enroll).
  const enrolledIds = useMemo(
    () => new Set(regs.filter((r) => r.state !== "cancelled").map((r) => r.player_id)),
    [regs],
  );
  const enrollable = useMemo(
    () => players.filter((p) => !enrolledIds.has(p.id)),
    [players, enrolledIds],
  );

  const handleEnroll = async () => {
    if (!overridePlayer) return;
    setEnrolling(true);
    const ok = await onOverrideEnroll(overridePlayer);
    setEnrolling(false);
    if (ok) setOverridePlayer("");
  };

  const capLabel =
    event.capacity != null ? `${registeredCount}/${event.capacity}` : `${registeredCount}`;

  return (
    <li className="overflow-hidden rounded-2xl bg-white/90 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800">
      {/* Summary row */}
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <ChevronIcon open={expanded} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                {event.name}
              </span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {TYPE_LABEL[event.type]}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{formatWhen(event.starts_at)}</span>
              {event.location && <span>· {event.location}</span>}
              {coachLabel && <span>· {coachLabel}</span>}
              <span>· {capLabel} registered</span>
              {waitlist.length > 0 && <span>· {waitlist.length} waitlisted</span>}
              {skillBand && <span>· {skillBand}</span>}
            </div>
          </div>
        </button>

        {/* Edit (pencil) */}
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit event"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <PencilIcon />
        </button>

        {/* One-click status toggle */}
        <button
          type="button"
          onClick={onToggleStatus}
          title={status === "published" ? "Click to unpublish" : "Click to publish"}
          disabled={status === "cancelled"}
          className={`min-h-[32px] shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition hover:opacity-80 disabled:cursor-default disabled:hover:opacity-100 ${STATUS_STYLE[status]}`}
        >
          {STATUS_LABEL[status]}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
          {/* Description */}
          {event.description && (
            <section className="mb-4">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Details
              </h4>
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                // Trusted: authored by the educator via MarkdownEditor.
                dangerouslySetInnerHTML={{ __html: event.description }}
              />
            </section>
          )}

          {/* Roster */}
          <section className="mb-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Registered ({activeRegs.length}
              {event.capacity != null ? ` / ${event.capacity}` : ""})
            </h4>
            {activeRegs.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No players registered yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {activeRegs.map((reg) => (
                  <li
                    key={reg.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
                  >
                    <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                      {playerName(reg.player_id)}
                      {reg.state !== "registered" && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                          {REG_STATE_LABEL[reg.state]}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => onSetAttendance(reg, "attended")}
                        className={`min-h-[32px] rounded-lg px-2.5 text-xs font-medium ring-1 transition ${
                          reg.state === "attended"
                            ? "bg-emerald-600 text-white ring-emerald-600"
                            : "text-slate-600 ring-slate-300 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-emerald-950/40"
                        }`}
                      >
                        Attended
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetAttendance(reg, "no_show")}
                        className={`min-h-[32px] rounded-lg px-2.5 text-xs font-medium ring-1 transition ${
                          reg.state === "no_show"
                            ? "bg-rose-600 text-white ring-rose-600"
                            : "text-slate-600 ring-slate-300 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-rose-950/40"
                        }`}
                      >
                        No-show
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Waitlist */}
          {waitlist.length > 0 && (
            <section className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Waitlist ({waitlist.length})
              </h4>
              <ol className="space-y-2">
                {waitlist.map((reg, idx) => (
                  <li
                    key={reg.id}
                    className="flex items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/30"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-200 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      {reg.waitlist_rank ?? idx + 1}
                    </span>
                    <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                      {playerName(reg.player_id)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Override-enroll */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Enrol a player (bypasses skill gate)
            </h4>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={overridePlayer}
                onChange={(e) => setOverridePlayer(e.target.value)}
                className="min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Choose a player…</option>
                {enrollable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleEnroll()}
                disabled={enrolling || !overridePlayer}
                className="min-h-[40px] shrink-0 rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {enrolling ? "Enrolling…" : "Enrol"}
              </button>
            </div>
            {enrollable.length === 0 && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Every player on the roster is already registered or waitlisted.
              </p>
            )}
          </section>
        </div>
      )}
    </li>
  );
}

// ─── Icons (inline SVG — no emoji) ──────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
