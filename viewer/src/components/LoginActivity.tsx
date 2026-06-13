/**
 * LoginActivity — durable per-user login history (IP + device + location).
 * ======================================================================
 * Reads the `get_login_events` RPC (0222) for one user and renders the most
 * recent login as a hero (time, place, device, IP) with an approximate map
 * pin, followed by a scrollable history. Events captured before a location was
 * resolved (geo_status='pending') are enriched on first view via ipwho.is and
 * persisted back through `set_login_geo`, so the next viewer reads them cached.
 *
 * Visibility is enforced server-side: the RPC returns rows only for admins or a
 * teacher of a course the subject is enrolled in. Used inline by the admin
 * UserDetailDrawer and inside LoginActivityDrawer on the teacher roster.
 *
 * No emojis (project rule) — country shown as a text code, place as plain text.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Skeleton } from "@/components/Skeleton";
import { lookupIp } from "@/lib/geoip";

export interface LoginEvent {
  id: string;
  ip: string | null;
  user_agent: string | null;
  country_code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string;
  created_at: string;
}

// ─── formatting helpers ─────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

function absolute(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Compact "Chrome on macOS" style label from a user-agent string. */
function parseDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : ua.startsWith("node") ? "Server"
    : "Browser";
  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return os ? `${browser} on ${os}` : browser;
}

function placeOf(e: LoginEvent): string {
  const parts = [e.city, e.region, e.country].filter(Boolean) as string[];
  if (parts.length) {
    // De-dupe region==city and keep it short: "City, Country".
    const uniq = parts.filter((p, i) => parts.indexOf(p) === i);
    if (uniq.length > 2) return `${uniq[0]}, ${uniq[uniq.length - 1]}`;
    return uniq.join(", ");
  }
  if (e.country_code) return e.country_code;
  return "Unknown location";
}

// ─── data hook ──────────────────────────────────────────────────────────────

function useLoginEvents(userId: string | null): {
  events: LoginEvent[];
  loading: boolean;
  error: string | null;
} {
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setEvents([]);
      return;
    }
    const alive = { current: true };
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { data, error: err } = await supabase.rpc("get_login_events", {
          p_user_id: userId,
          p_limit: 50,
        });
        if (!alive.current) return;
        if (err) throw err;
        const rows = (data as LoginEvent[] | null) ?? [];
        setEvents(rows);
        setLoading(false);

        // Enrich any events missing a city/coords (resolve unique IPs once).
        const pending = rows.filter(
          (e) => e.ip && e.geo_status !== "done" && e.latitude == null,
        );
        const byIp = new Map<string, LoginEvent[]>();
        for (const e of pending) {
          const list = byIp.get(e.ip as string) ?? [];
          list.push(e);
          byIp.set(e.ip as string, list);
        }
        for (const [ip, group] of byIp) {
          const geo = await lookupIp(ip);
          if (!alive.current) return;
          if (!geo) continue;
          // Persist for the first event of this IP; reuse for the rest locally.
          for (const e of group) {
            void supabase.rpc("set_login_geo", {
              p_event_id: e.id,
              p_city: geo.city ?? null,
              p_region: geo.region ?? null,
              p_country: geo.country ?? null,
              p_country_code: geo.countryCode ?? null,
              p_lat: geo.lat ?? null,
              p_lon: geo.lon ?? null,
            });
          }
          setEvents((prev) =>
            prev.map((e) =>
              e.ip === ip && e.latitude == null
                ? {
                    ...e,
                    city: geo.city ?? e.city,
                    region: geo.region ?? e.region,
                    country: geo.country ?? e.country,
                    country_code: geo.countryCode ?? e.country_code,
                    latitude: geo.lat ?? e.latitude,
                    longitude: geo.lon ?? e.longitude,
                    geo_status: "done",
                  }
                : e,
            ),
          );
        }
      } catch (e) {
        if (alive.current) {
          setError(e instanceof Error ? e.message : "Couldn't load login activity.");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [userId]);

  return { events, loading, error };
}

// ─── map ────────────────────────────────────────────────────────────────────

function IpMap({ lat, lon, label }: { lat: number; lon: number; label: string }): JSX.Element {
  const d = 0.12; // bbox half-size in degrees (~city view)
  const bbox = `${lon - d}%2C${lat - d}%2C${lon + d}%2C${lat + d}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
      <iframe
        title={`Approximate location: ${label}`}
        src={src}
        loading="lazy"
        className="block h-44 w-full border-0"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

// ─── panel ──────────────────────────────────────────────────────────────────

export function LoginActivityPanel({ userId }: { userId: string | null }): JSX.Element {
  const { events, loading, error } = useLoginEvents(userId);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-5 w-40 rounded" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-4 w-56 rounded" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900">
        {error}
      </p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-slate-800">
        No logins recorded yet. Activity appears here the next time this student signs in.
      </p>
    );
  }

  const latest = events[0];
  const mapEvent = events.find((e) => e.latitude != null && e.longitude != null);

  return (
    <div className="space-y-4">
      {/* Hero — most recent login */}
      <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:ring-slate-800">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Last login
          </span>
          <time dateTime={latest.created_at} title={absolute(latest.created_at)} className="text-xs text-slate-500 dark:text-slate-400">
            {timeAgo(latest.created_at)}
          </time>
        </div>
        <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {placeOf(latest)}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500 dark:text-slate-400">
          <span>{parseDevice(latest.user_agent)}</span>
          {latest.ip && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono text-xs">{latest.ip}</span>
            </>
          )}
        </div>
      </div>

      {mapEvent?.latitude != null && mapEvent.longitude != null && (
        <IpMap lat={mapEvent.latitude} lon={mapEvent.longitude} label={placeOf(mapEvent)} />
      )}

      {/* History */}
      {events.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            History ({events.length})
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate text-slate-700 dark:text-slate-200">{placeOf(e)}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400 dark:text-slate-500">
                    <span>{parseDevice(e.user_agent)}</span>
                    {e.ip && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-mono">{e.ip}</span>
                      </>
                    )}
                  </div>
                </div>
                <time
                  dateTime={e.created_at}
                  title={absolute(e.created_at)}
                  className="shrink-0 whitespace-nowrap text-xs text-slate-400 dark:text-slate-500 tabular-nums"
                >
                  {timeAgo(e.created_at)}
                </time>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── drawer (teacher roster) ────────────────────────────────────────────────

export function LoginActivityDrawer({
  userId,
  studentName,
  onClose,
}: {
  userId: string | null;
  studentName: string;
  onClose: () => void;
}): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, userId != null);
  if (!userId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Login activity for ${studentName}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Login activity
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{studentName}</p>
          </div>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 px-5 py-5">
          <LoginActivityPanel userId={userId} />
        </div>
      </div>
    </div>
  );
}
