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
        P
      </span>
      <span
        className={`text-lg font-semibold tracking-tight ${text}`}
        style={serif}
      >
        PrepMasters
      </span>
    </div>
  );
}

