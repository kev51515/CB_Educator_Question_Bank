import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOptimistic } from "@/components/useOptimistic";

// -----------------------------------------------------------------------------
// Template publish badge — one-click optimistic toggle (mirrors ModulesPage).
// -----------------------------------------------------------------------------

interface TemplatePublishBadgeProps {
  templateId: string;
  published: boolean;
  disabled?: boolean;
  onCommitted: () => Promise<void>;
}

function TemplatePublishBadgeInner({
  templateId,
  published,
  disabled,
  onCommitted,
}: TemplatePublishBadgeProps): JSX.Element {
  const [pub, applyPub] = useOptimistic<boolean>(published);
  const [busy, setBusy] = useState(false);

  const onClick = async (): Promise<void> => {
    const target = !pub;
    setBusy(true);
    try {
      await applyPub({
        optimistic: () => target,
        commit: async () => {
          const { error } = await supabase
            .from("portfolio_templates")
            .update({ published: target })
            .eq("id", templateId);
          if (error) throw new Error(error.message);
          await onCommitted();
        },
        successMessage: target ? "Template published" : "Template unpublished",
      });
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy;
  const baseRing =
    "ring-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition";
  const palette = pub
    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-950/60"
    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700";

  return (
    <button
      type="button"
      onClick={() => {
        void onClick();
      }}
      disabled={isDisabled}
      title={pub ? "Published — click to unpublish" : "Draft — click to publish"}
      aria-pressed={pub}
      className={`${baseRing} ${palette} ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span aria-hidden>{pub ? "✓" : "⊘"}</span>
      <span>{pub ? "Published" : "Draft"}</span>
    </button>
  );
}

export function TemplatePublishBadge(props: TemplatePublishBadgeProps): JSX.Element {
  // Re-key on (id, published) so refreshes seed a fresh optimistic baseline.
  return (
    <TemplatePublishBadgeInner
      key={`${props.templateId}:${String(props.published)}`}
      {...props}
    />
  );
}
