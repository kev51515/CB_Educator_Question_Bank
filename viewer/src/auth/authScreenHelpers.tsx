/**
 * authScreenHelpers
 * =================
 * Auth-screen value types, role labels, typography constants, the error
 * cleaner, student-email resolver, and the <Wordmark> monogram. Extracted
 * verbatim from AuthScreen.
 */
export type Tab = "signin" | "signup";
export type SignInMode = "password" | "reset";
export type SignInRole = "student" | "educator";
/** Human labels for the role toggle / heading. */
export const ROLE_LABELS: Record<SignInRole, string> = {
  student: "Student",
  educator: "Educator",
};

export const SERIF = "'Fraunces', 'Iowan Old Style', Georgia, 'Times New Roman', serif";
export const SANS =
  "'Hanken Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const serif = { fontFamily: SERIF } as const;

// Fine fractal-noise grain for the brand panel — adds tactile depth so the
// dark pane reads as paper/ink rather than flat color.
export const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function cleanError(message: string): string {
  // Trim and strip any trailing stack-ish junk; supabase-js usually returns
  // tidy strings already, but be defensive.
  const firstLine = message.split("\n")[0] ?? message;
  return firstLine.trim();
}

/**
 * Resolve the email GoTrue should authenticate against from what the user
 * typed. Educators type a real email. Students type their per-course login
 * code (e.g. "ABCDEF-04"), which maps to the reserved synthetic mailbox
 * `<code>@students.local` minted by admin_create_student. We still accept a
 * raw email for the student field too (e.g. the seeded demo student, or a
 * self-signup student) by branching on the "@".
 */
export const STUDENT_EMAIL_DOMAIN = "students.local";
export function resolveLoginEmail(role: SignInRole, raw: string): string {
  const t = raw.trim();
  if (role === "educator") return t;
  if (t.includes("@")) return t;
  return `${t.toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

/** Small ink/cream serif monogram lockup. */
export function Wordmark({ tone }: { tone: "light" | "dark" }) {
  const square =
    tone === "dark"
      ? "bg-stone-50 text-stone-900"
      : "bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900";
  const text =
    tone === "dark"
      ? "text-stone-50"
      : "text-stone-900 dark:text-stone-100";
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-9 w-9 place-items-center rounded-[10px] text-lg leading-none ${square}`}
        style={serif}
        aria-hidden
      >
        O
      </span>
      <span
        className={`text-lg font-semibold tracking-tight ${text}`}
        style={serif}
      >
        OmniLMS
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared editorial primitives — used by BOTH AuthScreen and QuickStartScreen
// so the sign-in and class-code surfaces stay visually identical. Keep these
// here (not duplicated per-screen) so the two can never drift apart.
// ─────────────────────────────────────────────────────────────────────────

/** Stone, soft-ring text input. */
export const inputCls =
  "mt-1.5 w-full rounded-xl border border-stone-300/80 bg-white/70 px-3.5 py-2.5 text-base sm:text-[15px] text-stone-900 placeholder:text-stone-400 shadow-sm transition focus:border-stone-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-stone-900/[0.06] dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-white/40 dark:focus:ring-white/10";
/** Field label. */
export const labelCls = "block text-[13px] font-medium text-stone-600 dark:text-stone-300";
/** Near-black (cream in dark) primary action button. */
export const primaryBtn =
  "w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold tracking-tight text-stone-50 shadow-sm transition hover:bg-stone-800 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-stone-900/15 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white dark:focus:ring-white/20";

/**
 * Keyframes for the staggered page-load reveal + the drifting brand-panel
 * glows. Render once near the root of each auth surface. Respects
 * prefers-reduced-motion.
 */
export function AuthKeyframes() {
  return (
    <style>{`
      @keyframes authReveal{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
      @keyframes authFade{from{opacity:0}to{opacity:1}}
      @keyframes authFloat{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-14px,0)}}
      .auth-reveal{animation:authReveal .75s cubic-bezier(.22,.61,.36,1) both}
      .auth-fade{animation:authFade 1.1s ease both}
      @media (prefers-reduced-motion: reduce){.auth-reveal,.auth-fade{animation:none}}
    `}</style>
  );
}

/** One numbered row in the brand panel's editorial list. */
export interface BrandStep {
  n: string;
  title: string;
  blurb: string;
}

export interface BrandPanelProps {
  /** Small uppercase eyebrow above the headline. */
  eyebrow: string;
  /** Headline first line (upright). */
  title: string;
  /** Headline second line (italic amber accent). */
  titleAccent: string;
  /** Supporting paragraph. */
  lead: string;
  /** Numbered editorial list (01 / 02 / 03 …). */
  steps: readonly BrandStep[];
}

/**
 * The left "ink" brand panel (lg+ only). Dark stone ground with drifting
 * warm+cool radial glows, a fractal-noise grain overlay, a faint vertical
 * hairline, the serif wordmark, an editorial headline + numbered list, and a
 * footer tagline. Content is fully prop-driven so sign-in and quick-start can
 * share one identical treatment with surface-appropriate copy.
 */
export function BrandPanel({ eyebrow, title, titleAccent, lead, steps }: BrandPanelProps) {
  return (
    <aside className="relative hidden overflow-hidden bg-stone-950 text-stone-100 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {/* atmosphere: warm + cool radial glows, drifting slowly */}
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full opacity-60 blur-3xl auth-fade"
        style={{
          background:
            "radial-gradient(closest-side, rgba(217,160,84,0.30), transparent 70%)",
          animation: "authFloat 18s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 right-[-10%] h-[34rem] w-[34rem] rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,102,241,0.22), transparent 70%)",
          animation: "authFloat 22s ease-in-out infinite reverse",
        }}
      />
      {/* grain + a faint vertical hairline frame */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay"
        style={{ backgroundImage: GRAIN, backgroundSize: "220px 220px" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-y-10 left-10 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

      <header className="relative auth-reveal">
        <Wordmark tone="dark" />
      </header>

      <div className="relative max-w-md auth-reveal" style={{ animationDelay: "90ms" }}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-amber-300/80">
          {eyebrow}
        </p>
        <h2
          className="mt-5 text-[2.9rem] font-medium leading-[1.04] tracking-tight text-stone-50"
          style={serif}
        >
          {title}
          <br />
          <span className="italic text-amber-200/90">{titleAccent}</span>
        </h2>
        <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-stone-300/90">
          {lead}
        </p>
        <ol className="mt-9 max-w-sm space-y-px">
          {steps.map((s) => (
            <li
              key={s.n}
              className="group flex items-baseline gap-4 border-t border-white/10 py-3.5 transition-colors hover:border-amber-300/40"
            >
              <span
                className="text-[13px] tabular-nums text-amber-300/70 transition-colors group-hover:text-amber-200"
                style={serif}
              >
                {s.n}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium leading-tight text-stone-100">
                  {s.title}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-stone-400">
                  {s.blurb}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <footer
        className="relative flex items-center justify-between text-xs text-stone-500 auth-reveal"
        style={{ animationDelay: "180ms" }}
      >
        <span>© {new Date().getFullYear()} OmniLMS</span>
        <span className="tracking-wide" style={serif}>
          Mastery, measured.
        </span>
      </footer>
    </aside>
  );
}

