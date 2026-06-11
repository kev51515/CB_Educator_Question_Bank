/**
 * AddEducatorModal — admin-only "create educator" dialog
 * ======================================================
 * Lets an admin mint a new teacher-role account directly (name + email +
 * password, min 6 chars). Calls the SECURITY DEFINER `admin_create_educator`
 * RPC (admin-only; raises not_authorized for non-admins). On success the
 * educator can sign in immediately with the email + password entered here.
 *
 * Modal shell is the shared <ResponsiveModal> (mobile bottom-sheet / desktop
 * centered card). It bakes in the full modal contract: role="dialog",
 * aria-modal, aria-labelledby, focus trap, top-right × (≥40px), Esc + backdrop
 * close, focus restore, sticky header/footer + scrollable body. Errors +
 * success surface via useToast.
 */
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { ResponsiveModal } from "@/components";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "./allUsersHelpers";

/** Map the RPC's stable error codes to friendly, admin-facing messages. */
function friendlyError(raw: string): string {
  switch (raw) {
    case "not_authorized":
      return "You don't have permission to add educators.";
    case "invalid_email":
      return "Enter a valid email address.";
    case "invalid_name":
      return "Enter a name for the educator.";
    case "weak_password":
      return "Password must be at least 6 characters.";
    case "email_taken":
      return "An account with that email already exists.";
    default:
      return raw;
  }
}

export function AddEducatorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Called after a successful create so the caller can refresh its list. */
  onCreated: () => void;
}): JSX.Element {
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < 6;
  const canSubmit =
    name.trim() !== "" && email.trim() !== "" && password.length >= 6 && !busy;

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_create_educator", {
        p_email: email.trim(),
        p_display_name: name.trim(),
        p_password: password,
      });
      if (error) {
        toast.error("Couldn't add educator", friendlyError(error.message));
        return;
      }
      toast.success(
        "Educator created",
        "They can sign in with this email + password.",
      );
      onCreated();
      onClose();
    } catch (err: unknown) {
      toast.error("Couldn't add educator", friendlyError(getErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal
      open={true}
      onClose={onClose}
      title="Add educator"
      subtitle="Creates a teacher account that can sign in right away."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-educator-form"
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 motion-safe:transition-colors"
          >
            {busy ? "Adding…" : "Add educator"}
          </button>
        </div>
      }
    >
      <form
        id="add-educator-form"
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="add-educator-name"
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Name
          </label>
          <input
            id="add-educator-name"
            data-autofocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Jane Educator"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="add-educator-email"
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Email
          </label>
          <input
            id="add-educator-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            placeholder="educator@example.com"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="add-educator-password"
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Password
          </label>
          <input
            id="add-educator-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            aria-invalid={passwordTooShort}
            aria-describedby="add-educator-password-hint"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <p
            id="add-educator-password-hint"
            className={[
              "mt-1 text-xs",
              passwordTooShort
                ? "text-rose-600 dark:text-rose-400"
                : "text-slate-400 dark:text-slate-500",
            ].join(" ")}
          >
            {passwordTooShort
              ? "Password must be at least 6 characters."
              : "Minimum 6 characters. Share it with the educator securely."}
          </p>
        </div>
      </form>
    </ResponsiveModal>
  );
}
