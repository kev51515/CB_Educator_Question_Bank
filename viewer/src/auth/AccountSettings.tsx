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
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "@/components";
import { ROUTES } from "../lib/routes";
import type { Profile } from "../lib/profile";
import type { AuthResult } from "./session";

interface AccountSettingsProps {
  profile: Profile;
  email: string;
  updateDisplayName: (name: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  onSignOut: () => Promise<void> | void;
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

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);

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
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
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
  }, [profile.display_name]);

  const onSubmitName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameBusy(true);
    try {
      const { error } = await updateDisplayName(displayName);
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
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
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

  return (
    <div className="space-y-6">
        {/* Display name */}
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Display name
          </h2>
          <form onSubmit={onSubmitName} className="space-y-3">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Your name"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={nameBusy}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
              >
                {nameBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
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
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="new@example.com"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmailForm(false)}
                  className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={emailBusy}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
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
                  minLength={6}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="At least 6 characters"
                />
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
                  minLength={6}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Repeat password"
                />
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordForm(false)}
                  className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwBusy}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
                >
                  {pwBusy ? "Saving…" : "Update password"}
                </button>
              </div>
            </form>
          )}
        </section>

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
            to={ROUTES.NOTIFICATION_PREFS}
            className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Manage
          </Link>
        </section>

        {/* Export my data */}
        <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Export my data
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Download a JSON copy of your profile, course memberships, attempts,
            and portfolio submissions.
          </p>
          <div>
            <button
              type="button"
              onClick={() => {
                void onExportData();
              }}
              disabled={exportBusy}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
            >
              {exportBusy ? "Preparing…" : "Download my data as JSON"}
            </button>
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
            className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2"
          >
            Sign out
          </button>
        </section>
    </div>
  );
}
