/**
 * EventsCard — Pickleball PLAYER-track student card (Increment 5, Lane B).
 *
 * The signed-in player browses PUBLISHED, UPCOMING events for their course
 * (clinics, ladders, social play, tournaments). For each event they can see:
 *   - name, type, when (relative + absolute), location, coach, skill band
 *   - capacity vs. live registered count ("12 / 20 spots", "Full")
 *   - their own registration state (registered / waitlisted #n / attended)
 * and either REGISTER (pk_register_event) or CANCEL (pk_cancel_registration).
 *
 * Skill gating: pk_register_event raises the stable error code 'skill_gate'
 * when the player's level is outside the event's [skill_min, skill_max] band.
 * We surface that cleanly with the band and a "talk to your coach" note rather
 * than a raw error.
 *
 * Data contract (implemented by Lane A's migration 0170):
 *   pickleball_events(
 *     id, course_id, name, type, starts_at, ends_at, location, coach_id,
 *     capacity, skill_min, skill_max, status[draft|published|cancelled|...])
 *   pickleball_event_registrations(
 *     id, event_id, player_id,
 *     status[registered|waitlisted|attended|cancelled], waitlist_position,
 *     created_at)
 *   RPCs:
 *     pk_register_event(p_event_id uuid)      -> registration row
 *       errors: not_authenticated / not_authorized / not_found /
 *               skill_gate / event_cancelled / already_registered
 *     pk_cancel_registration(p_event_id uuid) -> uuid (event id)
 *       errors: not_authenticated / not_authorized / not_found
 *
 * RLS lets a course member read published events + their own registrations.
 * The `studentId` prop equals profiles.id (== auth.uid()).
 *
 * Prop contract (do not change):
 *   export function EventsCard({ courseId, studentId }: {
 *     courseId: string; studentId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton, SkeletonRows, useToast } from "@/components";

// ─── Types ────────────────────────────────────────────────────────────────

type EventType = "clinic" | "ladder" | "social" | "tournament" | string;

type RegStatus = "registered" | "waitlisted" | "attended" | "cancelled";

const EVENT_TYPE_LABEL: Record<string, string> = {
  clinic: "Clinic",
  ladder: "Ladder",
  social: "Social play",
  tournament: "Tournament",
};

function eventTypeLabel(type: EventType): string {
  return EVENT_TYPE_LABEL[type] ?? "Event";
}

interface CoachInfo {
  display_name: string | null;
  email: string | null;
}

interface EventRow {
  id: string;
  name: string;
  type: EventType;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  coach_id: string | null;
  capacity: number | null;
  skill_min: number | null;
  skill_max: number | null;
  status: string;
  coach: CoachInfo | null;
}

interface RegistrationRow {
  id: string;
  event_id: string;
  status: RegStatus;
  waitlist_position: number | null;
}

interface EventView extends EventRow {
  registeredCount: number;
  myStatus: RegStatus | null;
  myWaitlistPosition: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

interface FriendlyError {
  title: string;
  body: string;
}

function friendlyRegisterError(err: unknown, event: EventView): FriendlyError {
  const raw = getErrorMessage(err);
  switch (raw) {
    case "skill_gate":
      return {
        title: "This event is skill-gated",
        body: `${bandLabel(event) ?? "It's set for a different skill band"} — talk to your coach about joining.`,
      };
    case "event_cancelled":
      return { title: "Event cancelled", body: "This event is no longer running." };
    case "already_registered":
      return { title: "Already registered", body: "You're already on the list for this event." };
    case "not_authorized":
      return { title: "Can't register", body: "You're not able to register for this event." };
    case "not_authenticated":
      return { title: "Session expired", body: "Please sign in again." };
    case "not_found":
      return { title: "Event not found", body: "That event no longer exists." };
    default:
      return { title: "Couldn't register", body: raw };
  }
}

function friendlyCancelError(err: unknown): FriendlyError {
  const raw = getErrorMessage(err);
  switch (raw) {
    case "not_authorized":
      return { title: "Can't cancel", body: "You're not able to cancel this registration." };
    case "not_authenticated":
      return { title: "Session expired", body: "Please sign in again." };
    case "not_found":
      return { title: "Nothing to cancel", body: "That registration no longer exists." };
    default:
      return { title: "Couldn't cancel", body: raw };
  }
}

const RELATIVE_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let duration = (d.getTime() - Date.now()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return null;
}

function formatAbsolute(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function bandLabel(event: { skill_min: number | null; skill_max: number | null }): string | null {
  const { skill_min, skill_max } = event;
  if (skill_min == null && skill_max == null) return null;
  const fmt = (n: number) => n.toFixed(1);
  if (skill_min != null && skill_max != null) {
    return skill_min === skill_max
      ? `Level ${fmt(skill_min)}`
      : `Level ${fmt(skill_min)}–${fmt(skill_max)}`;
  }
  if (skill_min != null) return `Level ${fmt(skill_min)}+`;
  return `Up to level ${fmt(skill_max as number)}`;
}

function coachName(coach: CoachInfo | null): string | null {
  if (!coach) return null;
  return coach.display_name || coach.email || null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EventsCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const toast = useToast();
  const aliveRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventView[]>([]);
  // Event ids with an in-flight register/cancel call (disables the button).
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const setBusy = useCallback((eventId: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(eventId);
      else next.delete(eventId);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nowIso = new Date().toISOString();

      // Published, upcoming events for this course. RLS permits a course
      // member to read published rows; we further filter to future events.
      const { data: evData, error: evErr } = await supabase
        .from("pickleball_events")
        .select(
          "id, name, type, starts_at, ends_at, location, coach_id, capacity, skill_min, skill_max, status, " +
            "coach:profiles!pickleball_events_coach_id_fkey(display_name, email)",
        )
        .eq("course_id", courseId)
        .eq("status", "published")
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true });

      if (!aliveRef.current) return;
      if (evErr) throw new Error(evErr.message);

      const eventRows = (evData ?? []) as unknown as EventRow[];
      const eventIds = eventRows.map((e) => e.id);

      // Live registration rows across these events. RLS scopes a member to
      // rows they can see (their own + aggregate counts via the count column);
      // we derive the registered count + the caller's own status client-side.
      let regRows: (RegistrationRow & { player_id: string })[] = [];
      if (eventIds.length > 0) {
        const { data: regData, error: regErr } = await supabase
          .from("pickleball_event_registrations")
          .select("id, event_id, player_id, status, waitlist_position")
          .in("event_id", eventIds);
        if (!aliveRef.current) return;
        if (regErr) throw new Error(regErr.message);
        regRows = (regData ?? []) as unknown as (RegistrationRow & {
          player_id: string;
        })[];
      }

      const countByEvent: Record<string, number> = {};
      const mineByEvent: Record<string, RegistrationRow> = {};
      for (const r of regRows) {
        if (r.status === "registered") {
          countByEvent[r.event_id] = (countByEvent[r.event_id] ?? 0) + 1;
        }
        if (r.player_id === studentId && r.status !== "cancelled") {
          mineByEvent[r.event_id] = r;
        }
      }

      setEvents(
        eventRows.map((e) => {
          const mine = mineByEvent[e.id];
          return {
            ...e,
            registeredCount: countByEvent[e.id] ?? 0,
            myStatus: mine ? mine.status : null,
            myWaitlistPosition: mine ? mine.waitlist_position : null,
          };
        }),
      );
    } catch (err) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err.message : "Couldn't load events.");
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRegister = useCallback(
    async (event: EventView) => {
      if (busyIds.has(event.id)) return;
      setBusy(event.id, true);

      // Optimistic: if the event still has open spots the player becomes
      // 'registered'; otherwise they join the waitlist. The server is the
      // source of truth — we reconcile via reload on success.
      const wasFull =
        event.capacity != null && event.registeredCount >= event.capacity;
      const optimisticStatus: RegStatus = wasFull ? "waitlisted" : "registered";
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id
            ? {
                ...e,
                myStatus: optimisticStatus,
                registeredCount: wasFull
                  ? e.registeredCount
                  : e.registeredCount + 1,
              }
            : e,
        ),
      );

      try {
        const { error: rpcErr } = await supabase.rpc("pk_register_event", {
          p_event_id: event.id,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        if (!aliveRef.current) return;
        toast.success(
          optimisticStatus === "waitlisted" ? "Added to waitlist" : "You're registered",
          event.name,
        );
        // Reconcile exact status + counts (waitlist position, server-side full).
        await load();
      } catch (err) {
        if (!aliveRef.current) return;
        // Roll back optimistic change.
        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id
              ? {
                  ...e,
                  myStatus: null,
                  myWaitlistPosition: null,
                  registeredCount: wasFull
                    ? e.registeredCount
                    : Math.max(0, e.registeredCount - 1),
                }
              : e,
          ),
        );
        const { title, body } = friendlyRegisterError(err, event);
        toast.error(title, body);
      } finally {
        if (aliveRef.current) setBusy(event.id, false);
      }
    },
    [busyIds, setBusy, toast, load],
  );

  const onCancel = useCallback(
    async (event: EventView) => {
      if (busyIds.has(event.id)) return;
      setBusy(event.id, true);

      const prevStatus = event.myStatus;
      const prevPosition = event.myWaitlistPosition;
      const wasRegistered = prevStatus === "registered";
      // Optimistic clear.
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id
            ? {
                ...e,
                myStatus: null,
                myWaitlistPosition: null,
                registeredCount: wasRegistered
                  ? Math.max(0, e.registeredCount - 1)
                  : e.registeredCount,
              }
            : e,
        ),
      );

      try {
        const { error: rpcErr } = await supabase.rpc("pk_cancel_registration", {
          p_event_id: event.id,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        if (!aliveRef.current) return;
        toast.success("Registration cancelled", event.name);
        await load();
      } catch (err) {
        if (!aliveRef.current) return;
        // Roll back optimistic clear.
        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id
              ? {
                  ...e,
                  myStatus: prevStatus,
                  myWaitlistPosition: prevPosition,
                  registeredCount: wasRegistered
                    ? e.registeredCount + 1
                    : e.registeredCount,
                }
              : e,
          ),
        );
        const { title, body } = friendlyCancelError(err);
        toast.error(title, body);
      } finally {
        if (aliveRef.current) setBusy(event.id, false);
      }
    },
    [busyIds, setBusy, toast, load],
  );

  const upcomingCount = useMemo(() => events.length, [events]);

  // ── Loading ──
  if (loading) {
    return (
      <div
        className="space-y-3 rounded-2xl bg-white/80 p-6 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <Skeleton className="h-5 w-32 rounded" />
        <SkeletonRows count={3} />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div
        className="rounded-2xl bg-white/80 p-6 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Couldn't load events
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex min-h-[40px] items-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Empty ──
  if (upcomingCount === 0) {
    return (
      <div
        className="rounded-2xl bg-white/80 p-8 text-center ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800"
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No upcoming events
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          When your coach schedules a clinic, ladder, or social play it'll show
          up here to register.
        </p>
      </div>
    );
  }

  // ── List ──
  return (
    <div className="space-y-4" data-course-id={courseId} data-student-id={studentId}>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Upcoming events
      </h2>
      <ol className="space-y-4">
        {events.map((event) => (
          <EventRowCard
            key={event.id}
            event={event}
            busy={busyIds.has(event.id)}
            onRegister={() => void onRegister(event)}
            onCancel={() => void onCancel(event)}
          />
        ))}
      </ol>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

const REG_BADGE_STYLE: Record<RegStatus, string> = {
  registered:
    "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  waitlisted:
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  attended:
    "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900",
  cancelled:
    "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700",
};

function regBadgeLabel(event: EventView): string | null {
  switch (event.myStatus) {
    case "registered":
      return "Registered";
    case "waitlisted":
      return event.myWaitlistPosition != null
        ? `Waitlisted · #${event.myWaitlistPosition}`
        : "Waitlisted";
    case "attended":
      return "Attended";
    default:
      return null;
  }
}

function EventRowCard({
  event,
  busy,
  onRegister,
  onCancel,
}: {
  event: EventView;
  busy: boolean;
  onRegister: () => void;
  onCancel: () => void;
}) {
  const relative = formatRelative(event.starts_at);
  const absolute = formatAbsolute(event.starts_at);
  const band = bandLabel(event);
  const coach = coachName(event.coach);
  const badge = regBadgeLabel(event);

  const isFull =
    event.capacity != null && event.registeredCount >= event.capacity;
  const spotsLabel =
    event.capacity != null
      ? `${event.registeredCount} / ${event.capacity} spots`
      : `${event.registeredCount} registered`;

  // Past events can't be acted on (attended is read-only); active states allow
  // cancel; everything else allows register.
  const isAttended = event.myStatus === "attended";
  const isActive = event.myStatus === "registered" || event.myStatus === "waitlisted";

  return (
    <li className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:ring-slate-800">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {event.name}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {eventTypeLabel(event.type)}
            </span>
          </div>
          {(relative || absolute) && (
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {relative && <span className="font-medium">{relative}</span>}
              {relative && absolute && <span className="text-slate-400"> · </span>}
              {absolute && <span className="text-slate-500 dark:text-slate-400">{absolute}</span>}
            </div>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            {event.location && <span>{event.location}</span>}
            {event.location && coach && <span aria-hidden>·</span>}
            {coach && <span>Coach {coach}</span>}
            {(event.location || coach) && band && <span aria-hidden>·</span>}
            {band && <span>{band}</span>}
          </div>
        </div>
        {badge && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${REG_BADGE_STYLE[event.myStatus as RegStatus]}`}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Footer: capacity + action */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span
          className={`text-xs font-medium ${
            isFull
              ? "text-amber-600 dark:text-amber-400"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {isFull ? `Full · ${spotsLabel}` : spotsLabel}
        </span>

        {isAttended ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            You attended this event
          </span>
        ) : isActive ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center rounded-xl px-4 text-sm font-medium text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 dark:ring-rose-900 dark:hover:bg-rose-950/40"
          >
            {busy ? "Cancelling…" : "Cancel registration"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRegister}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {busy ? "Registering…" : isFull ? "Join waitlist" : "Register"}
          </button>
        )}
      </div>
    </li>
  );
}
