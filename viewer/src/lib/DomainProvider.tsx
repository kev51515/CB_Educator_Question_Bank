/**
 * DomainProvider — owns the signed-in user's ACTIVE DOMAIN and live accent theme.
 *
 * Responsibilities:
 *   1. Resolve the active domain: the user's `profiles.domain` if set, else a
 *      derived default from the course types they teach (RPC `derive_user_domain`,
 *      falling back to 'academic' if unknown / signed-out).
 *   2. Paint that domain's accent ramp (`DOMAIN_ACCENT`) onto
 *      `document.documentElement` as `--accent-50`…`--accent-950` so Tailwind's
 *      `accent-*` utilities re-theme live (see tailwind.config.js + index.css).
 *   3. Expose `{ domain, vocab, setDomain }`. `setDomain` is optimistic: it sets
 *      local state + re-themes immediately, then persists via `set_my_domain`;
 *      on failure it rolls back and toasts.
 *
 * Mounted in main.tsx inside the AuthGate/profile context so it can read the
 * profile. It is intentionally tolerant of "no profile yet" (signed-out, or the
 * pre-auth flicker window): it simply stays on the default 'academic' theme,
 * which matches the static `:root` accent defaults in index.css.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { useProfile } from "./profile";
import {
  ACCENT_STOPS,
  DOMAIN_ACCENT,
  DOMAIN_VOCAB,
  type Domain,
} from "./domain";
import { useToast } from "@/components";

interface DomainContextValue {
  domain: Domain;
  vocab: (typeof DOMAIN_VOCAB)[Domain];
  setDomain: (next: Domain) => void;
  /**
   * Temporarily theme by a specific domain WITHOUT changing the user's saved
   * domain — used when a user is inside a course so the accent matches the
   * course's vertical (a coach/player viewing a pickleball course sees orange
   * even if their saved domain is academic). Pass null to revert to the saved
   * active domain (call on unmount).
   */
  previewDomain: (next: Domain | null) => void;
}

const DomainContext = createContext<DomainContextValue | null>(null);

/** Validate a raw string into a Domain, or null if it isn't one. */
function asDomain(raw: unknown): Domain | null {
  return raw === "academic" || raw === "counseling" || raw === "coaching"
    ? raw
    : null;
}

/** "#4f46e5" → "79 70 229" (the "R G B" channel form Tailwind's
 * `rgb(var(--accent-N) / <alpha-value>)` needs so the /opacity modifier works). */
function hexToChannels(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * Write a domain's accent ramp onto the document root as `--accent-*` CSS
 * custom properties (in "R G B" channel form). Tailwind's `accent` AND `indigo`
 * colors both map to these vars, so this re-themes the whole app — every
 * `indigo-*` / `accent-*` utility, opacity modifiers included — live when the
 * active domain changes. Also stamps `data-domain` on the root for any
 * domain-scoped CSS / debugging.
 */
function applyAccent(domain: Domain): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.domain = domain;
  const ramp = DOMAIN_ACCENT[domain];
  for (const stop of ACCENT_STOPS) {
    const ch = hexToChannels(ramp[stop] ?? "");
    if (ch) root.style.setProperty(`--accent-${stop}`, ch);
  }
}

export function DomainProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const toast = useToast();

  // The active (saved) domain. Starts on the safe default and reconciles once
  // we learn the profile (and, if needed, the derived default).
  const [domain, setDomainState] = useState<Domain>("academic");

  // Transient per-course theme override (null = use the saved domain). The ref
  // mirrors it so setDomain's synchronous re-theme doesn't flash past an active
  // preview (e.g. switching global domain while inside a course).
  const [preview, setPreview] = useState<Domain | null>(null);
  const previewRef = useRef<Domain | null>(null);

  // Guards a stale async derive from clobbering a newer one (rapid sign-in /
  // sign-out, profile refetch).
  const deriveSeqRef = useRef(0);

  // Resolve the active domain from the profile. If the profile carries an
  // explicit `domain`, use it. Otherwise derive a default from the user's
  // taught course types via RPC; default to 'academic' on any error.
  useEffect(() => {
    const explicit = asDomain(profile?.domain);
    if (explicit) {
      setDomainState(explicit);
      return;
    }
    if (!profile?.id) {
      // Signed-out / no profile yet — stay on the default.
      setDomainState("academic");
      return;
    }
    // Derive a default from taught courses.
    const seq = ++deriveSeqRef.current;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("derive_user_domain", {
          p_user: profile.id,
        });
        if (deriveSeqRef.current !== seq) return; // superseded
        const derived = asDomain(data) ?? "academic";
        if (error) {
          setDomainState("academic");
          return;
        }
        setDomainState(derived);
      } catch {
        if (deriveSeqRef.current === seq) setDomainState("academic");
      }
    })();
  }, [profile?.id, profile?.domain]);

  // Paint the accent ramp whenever the effective domain changes — a course
  // preview overrides the saved domain while it's set.
  useEffect(() => {
    applyAccent(preview ?? domain);
  }, [preview, domain]);

  const previewDomain = useCallback((next: Domain | null) => {
    previewRef.current = next;
    setPreview(next);
  }, []);

  const setDomain = useCallback(
    (next: Domain) => {
      setDomainState((prev) => {
        if (prev === next) return prev;
        // Optimistic: re-theme immediately, then persist. On failure, roll back.
        // (applyAccent also runs via the effect above, but call it here so the
        // re-theme is synchronous with the click even before the effect flushes.
        // An active course preview still wins so we don't flash the global accent.)
        applyAccent(previewRef.current ?? next);
        void (async () => {
          const { error } = await supabase.rpc("set_my_domain", {
            p_domain: next,
          });
          if (error) {
            setDomainState(prev);
            applyAccent(prev);
            toast.error("Couldn't switch domain. Please try again.");
          }
        })();
        return next;
      });
    },
    [toast],
  );

  const value = useMemo<DomainContextValue>(
    () => ({ domain, vocab: DOMAIN_VOCAB[domain], setDomain, previewDomain }),
    [domain, setDomain, previewDomain],
  );

  return (
    <DomainContext.Provider value={value}>{children}</DomainContext.Provider>
  );
}

/**
 * Read the active domain context. Returns a safe default ('academic') when
 * called outside a DomainProvider so non-shell surfaces (and tests) don't crash
 * — though in practice everything authenticated renders under the provider.
 */
export function useDomain(): DomainContextValue {
  const ctx = useContext(DomainContext);
  if (ctx) return ctx;
  return {
    domain: "academic",
    vocab: DOMAIN_VOCAB.academic,
    setDomain: () => {},
    previewDomain: () => {},
  };
}
