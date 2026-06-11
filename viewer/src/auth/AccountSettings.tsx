/**
 * AccountSettings
 * ===============
 * Top-down rendered settings panel. Previously this self-mounted via a
 * `#account` URL hash, but the app now routes through react-router and the
 * settings page mounts this component directly under `/settings/account`.
 *
 * The view exposes:
 *   - editable display name (calls updateDisplayName)
 *   - read-only email (with a "Change email" sub-flow that calls
 *     supabase.auth.updateUser({ email }) — user receives a confirmation
 *     email per Supabase's default flow)
 *   - read-only role label
 *   - change-password sub-flow (calls updatePassword)
 *   - sign-out button
 *
 * No actual sign-in / auth state is owned here — all mutations route
 * through the props handed in by AuthGate, which already owns the auth
 * session lifecycle.
 *
 * Wave 21 polish:
 *   - Live password strength meter (Weak/Fair/Good/Strong) below the
 *     new-password input; submit is suppressed when Weak.
 *   - Display name now validated inline (required, trimmed-non-empty,
 *     ≤100 chars).
 *   - Export-data flow gained pre-click hint, in-flight spinner, and a
 *     post-click "Exported {filename} ({size})" caption.
 *   - Email change flow gained a hint clarifying old-vs-new lifecycle.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { LineConnectCard } from "@/line";
import { setUiTheme, useUiTheme, type UiTheme } from "@/lib/theme";
import type { Profile } from "@/lib/profile";
import type { AuthResult } from "./session";

/**
 * EmailNotificationsSection — master switch for the Resend email channel
 * (migration 0196: profiles.email_notifications gates the email_outbox
 * enqueue trigger server-side). Self-contained fetch/update so the shared
 * Profile type doesn't need churn; the "profiles: own row update" policy
 * covers the write. Managed students never receive email regardless
 * (synthetic addresses), so this section is hidden for them at the call site.
 */
function EmailNotificationsSection({ userId }: { userId: string }): JSX.Element {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email_notifications")
        .eq("id", userId)
        .maybeSingle();
      if (alive) setEnabled((data?.email_notifications as boolean | undefined) ?? true);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const toggle = async (): Promise<void> => {
    if (enabled === null || busy) return;
    const next = !enabled;
    setEnabled(next); // optimistic
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ email_notifications: next })
      .eq("id", userId);
    setBusy(false);
    if (error) {
      setEnabled(!next); // roll back
      toast.error("Couldn't update email notifications. Please try again.");
    } else {
      toast.success(next ? "Email notifications on" : "Email notifications off");
    }
  };

  return (
    <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Email notifications
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Announcements, grades, feedback, and messages — sent to your account
          email.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled === true}
        disabled={enabled === null || busy}
        onClick={() => void toggle()}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
          enabled ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"
        } ${enabled === null ? "opacity-50" : ""}`}
        aria-label="Toggle email notifications"
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </section>
  );
}

/**
 * Appearance — UI theme picker (Ivy Ledger redesign, June 2026).
 * Local-only preference (localStorage via lib/theme.ts), applies instantly,
 * no server round-trip. Offered to every account type, so it renders in both
 * the managed-student and full-account branches below.
 */
function AppearanceSection(): JSX.Element {
  const theme = useUiTheme();
  const options: Array<{
    value: UiTheme;
    label: string;
    blurb: string;
    /** Little three-dot palette preview: page / surface / accent. */
    dots: [string, string, string];
  }> = [
    {
      value: "classic",
      label: "Classic",
      blurb: "The original look — clean white with system fonts.",
      dots: ["#f8fafc", "#ffffff", "#4f46e5"],
    },
    {
      value: "ivy",
      label: "Ivy Ledger",
      blurb: "Navy ink on warm paper with serif headings.",
      dots: ["#fbfaf7", "#ffffff", "#24407e"],
    },
  ];
  return (
    <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Appearance
      </h2>
      <div
        role="radiogroup"
        aria-label="UI theme"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {options.map((opt) => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setUiTheme(opt.value)}
              className={`min-h-[44px] rounded-lg p-3 text-left transition ring-1 focus-ring ${
                active
                  ? "ring-2 ring-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10"
                  : "ring-slate-200 dark:ring-slate-700 hover:ring-slate-300 dark:hover:ring-slate-600"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="flex -space-x-1" aria-hidden>
                  {opt.dots.map((c, i) => (
                    <span
                      key={i}
                      className="inline-block h-4 w-4 rounded-full ring-1 ring-slate-300 dark:ring-slate-600"
                      style={{ background: c }}
                    />
                  ))}
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {opt.label}
                </span>
                {active && (
                  <span className="ml-auto text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                    Active
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                {opt.blurb}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Applies on this device only. Test-taking always uses the light, calm
        layout regardless of theme.
      </p>
    </section>
  );
}

interface AccountSettingsProps {
  profile: Profile;
  email: string;
  updateDisplayName: (name: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  onSignOut: () => Promise<void> | void;
}

type StrengthLevel = "empty" | "weak" | "fair" | "good" | "strong";

interface StrengthInfo {
  level: StrengthLevel;
  /** 0–4 segments filled. */
  score: number;
  label: string;
  hint: string;
  /** Tailwind classes for the filled segments. */
  fillClass: string;
  /** Tailwind classes for the hint text. */
  textClass: string;
}

function evaluatePasswordStrength(password: string): StrengthInfo {
  if (password.length === 0) {
    return {
      level: "empty",
      score: 0,
      label: "Empty",
      hint: "Enter a new password",
      fillClass: "",
      textClass: "text-slate-500 dark:text-slate-400",
    };
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const len = password.length;

  if (len >= 12 && hasUpper && hasLower && hasDigit && hasSymbol) {
    return {
      level: "strong",
      score: 4,
      label: "Strong",
      hint: "Strong",
      fillClass: "bg-emerald-500",
      textClass: "text-emerald-600 dark:text-emerald-400",
    };
  }

  if (len >= 10 && hasUpper && hasDigit) {
    return {
      level: "good",
      score: 3,
      label: "Good",
      hint: hasSymbol
        ? "Good — 12+ chars with a symbol becomes Strong"
        : "Good — add a symbol to strengthen further",
      fillClass: "bg-indigo-500",
      textClass: "text-indigo-600 dark:text-indigo-400",
    };
  }

  if (len >= 8) {
    let nudge = "Fair";
    if (!hasDigit) nudge = "Fair — add a number";
    else if (!hasUpper) nudge = "Fair — add an uppercase letter";
    else if (!hasSymbol) nudge = "Fair — add a symbol";
    else if (len < 10) nudge = "Fair — try a longer password";
    return {
      level: "fair",
      score: 2,
      label: "Fair",
      hint: nudge,
      fillClass: "bg-amber-500",
      textClass: "text-amber-600 dark:text-amber-400",
    };
  }

  return {
    level: "weak",
    score: 1,
    label: "Weak",
    hint: "Weak — try a longer password (8+ characters)",
    fillClass: "bg-rose-500",
    textClass: "text-rose-600 dark:text-rose-400",
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function roleLabel(role: Profile["role"]): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "teacher":
      return "Teacher";
    case "student":
      return "Student";
    default:
      return role;
  }
}

export function AccountSettings({
  profile,
  email,
  updateDisplayName,
  updatePassword,
  onSignOut,
}: AccountSettingsProps) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState<string>(profile.display_name ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);
  const [lastExport, setLastExport] = useState<{ filename: string; size: number } | null>(null);

  const strength = useMemo(() => evaluatePasswordStrength(newPassword), [newPassword]);

  const trimmedName = displayName.trim();
  const nameError: string | null = (() => {
    if (!nameTouched) return null;
    if (trimmedName.length === 0) return "Display name is required";
    if (trimmedName.length > 100) return "Display name must be 100 characters or fewer";
    return null;
  })();
  const nameValid = trimmedName.length > 0 && trimmedName.length <= 100;

  const onExportData = async () => {
    setExportBusy(true);
    try {
      const { data, error } = await supabase.rpc("export_my_data");
      if (error) {
        toast.error("Export failed", error.message);
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const filename = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setLastExport({ filename, size: blob.size });
      toast.success("Export ready", "Your data has been downloaded.");
    } catch (err: unknown) {
      toast.error(
        "Export failed",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setExportBusy(false);
    }
  };

  // Sync local state when profile prop changes (e.g., after refresh).
  useEffect(() => {
    setDisplayName(profile.display_name ?? "");
    setNameTouched(false);
  }, [profile.display_name]);

  const onSubmitName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameTouched(true);
    if (!nameValid) {
      toast.error("Please enter a valid display name.");
      return;
    }
    setNameBusy(true);
    try {
      const { error } = await updateDisplayName(trimmedName);
      if (error) toast.error("Couldn't update name", error);
      else toast.success("Display name updated.");
    } finally {
      setNameBusy(false);
    }
  };

  const onSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error("Please enter the new email.");
      return;
    }
    setEmailBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) {
        toast.error("Couldn't update email", error.message);
        return;
      }
      toast.success(
        "Confirmation sent",
        "Check your inbox for a confirmation link at the new email address.",
      );
      setNewEmail("");
      setShowEmailForm(false);
    } catch (err: unknown) {
      toast.error(
        "Couldn't update email",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setEmailBusy(false);
    }
  };

  const onSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (strength.level === "weak") {
      toast.error("Please choose a stronger password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    setPwBusy(true);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) toast.error("Couldn't update password", error);
      else {
        toast.success("Password updated.");
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordForm(false);
      }
    } finally {
      setPwBusy(false);
    }
  };

  const passwordSubmitDisabled =
    pwBusy ||
    strength.level === "empty" ||
    strength.level === "weak" ||
    newPassword.length < 8 ||
    newPassword !== confirmPassword;

  // Teacher-managed student accounts have a login code + teacher-controlled
  // password and a non-deliverable synthetic email. Don't invite them to
  // change email/password here — show a read-only, teacher-managed view.
  if (profile.managed) {
    return (
      <div className="space-y-6">
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Your account
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">Name</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {profile.display_name ?? "—"}
              </dd>
            </div>
            {profile.login_code && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Login code</dt>
                <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {profile.login_code}
                </dd>
              </div>
            )}
          </dl>
          <p className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
            Your teacher manages your account. If you forget your password, ask
            them to reset it for you.
          </p>
        </section>
        <AppearanceSection />
        <LineConnectCard />
      </div>
    );
  }

  // A student's name is owned by their teacher (set on the roster), not the
  // student — this prevents misuse of the field (impersonation, inappropriate
  // names shown on discussions/gradebook). Managed students already hit the
  // read-only branch above; this covers self-registered students too. The
  // server enforces the same rule (a student cannot UPDATE their own
  // display_name) — see migration 0093 — so this is the UI half of a
  // defense-in-depth pair, not the only guard.
  const nameLocked = profile.role === "student";

  return (
    <div className="space-y-6">
        {/* Display name */}
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {nameLocked ? "Name" : "Display name"}
          </h2>
          {nameLocked ? (
            <>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {profile.display_name ?? "—"}
              </p>
              <p className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                Your teacher sets your name. If it looks wrong, ask them to update
                it for you.
              </p>
            </>
          ) : (
          <form onSubmit={onSubmitName} className="space-y-3">
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (!nameTouched) setNameTouched(true);
              }}
              onBlur={() => setNameTouched(true)}
              autoComplete="name"
              maxLength={100}
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? "display-name-error" : undefined}
              className={`w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                nameError
                  ? "border-rose-400 dark:border-rose-500 focus:ring-rose-500"
                  : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
              }`}
              placeholder="Your name"
            />
            {nameError ? (
              <p
                id="display-name-error"
                className="text-xs text-rose-600 dark:text-rose-400"
                role="alert"
              >
                {nameError}
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Up to 100 characters. Shown on assignments, discussions, and the gradebook.
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={nameBusy || !nameValid}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 min-h-[44px]"
              >
                {nameBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
          )}
        </section>

        {/* Email */}
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Email
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 font-mono">{email}</p>
          {!showEmailForm ? (
            <button
              type="button"
              onClick={() => {
                setShowEmailForm(true);
              }}
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Change email
            </button>
          ) : (
            <form onSubmit={onSubmitEmail} className="space-y-3">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
                aria-describedby="email-change-hint"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="new@example.com"
              />
              <p
                id="email-change-hint"
                className="text-xs text-slate-500 dark:text-slate-400"
              >
                We'll send a confirmation email to your new address. Your old email
                stays active until you click the link.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmailForm(false)}
                  className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={emailBusy}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 min-h-[44px]"
                >
                  {emailBusy ? "Sending…" : "Send confirmation"}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Role */}
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Role
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {roleLabel(profile.role)}
          </p>
        </section>

        {/* Change password */}
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Change password
          </h2>
          {!showPasswordForm ? (
            <button
              type="button"
              onClick={() => {
                setShowPasswordForm(true);
              }}
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Set a new password
            </button>
          ) : (
            <form onSubmit={onSubmitPassword} className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  New password
                </span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  aria-describedby="password-strength-hint"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="At least 8 characters"
                />
                {/* Strength meter */}
                <div className="mt-2 space-y-1">
                  <div
                    className="flex items-center gap-1"
                    role="progressbar"
                    aria-label={`Password strength: ${strength.label}`}
                    aria-valuenow={strength.score}
                    aria-valuemin={0}
                    aria-valuemax={4}
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          i < strength.score
                            ? strength.fillClass
                            : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      />
                    ))}
                  </div>
                  <p
                    id="password-strength-hint"
                    className={`text-xs ${strength.textClass}`}
                  >
                    {strength.hint}
                  </p>
                </div>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Confirm new password
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  aria-invalid={
                    confirmPassword.length > 0 && confirmPassword !== newPassword
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Repeat password"
                />
                {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="alert">
                    Passwords don't match
                  </p>
                )}
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordSubmitDisabled}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 min-h-[44px]"
                >
                  {pwBusy ? "Saving…" : "Update password"}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* UI theme (Classic / Ivy Ledger) */}
        <AppearanceSection />

        {/* Email channel master switch (managed students are excluded
            server-side — synthetic addresses — so no section for them). */}
        {!profile.managed && <EmailNotificationsSection userId={profile.id} />}

        {/* LINE binding + per-type LINE delivery prefs */}
        <LineConnectCard />

        {/* Notification preferences — link to dedicated page */}
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Notification preferences
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Choose which kinds of notifications appear in your bell.
            </p>
          </div>
          <Link
            // Sibling-relative so it works under either role prefix
            // (/educator/account/* or /student/account/*).
            to="../notification-preferences"
            className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 min-h-[44px]"
          >
            Manage
          </Link>
        </section>

        {/* Export my data */}
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Export my data
          </h2>
          <div>
            <button
              type="button"
              onClick={() => {
                void onExportData();
              }}
              disabled={exportBusy}
              title="Plain JSON, no encryption"
              aria-describedby="export-hint"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 min-h-[44px]"
            >
              {exportBusy && (
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              )}
              {exportBusy ? "Exporting…" : "Export my data"}
            </button>
            <p
              id="export-hint"
              className="mt-2 text-xs text-slate-500 dark:text-slate-400"
            >
              Downloads a JSON file with your profile, course memberships,
              assignment attempts, and feedback. May take a few seconds for
              accounts with many attempts.
            </p>
            {lastExport && !exportBusy && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Exported <span className="font-mono">{lastExport.filename}</span>{" "}
                ({formatBytes(lastExport.size)})
              </p>
            )}
          </div>
        </section>

        {/* Sign out */}
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Sign out
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              End your session on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void onSignOut();
            }}
            className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 min-h-[44px]"
          >
            Sign out
          </button>
        </section>
    </div>
  );
}
