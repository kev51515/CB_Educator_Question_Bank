/**
 * admin/audit/actions
 * ===================
 * Audit-action taxonomy: the known action-kind metadata, their grouping, and
 * the lookup/option-builder helpers. Pure data + functions, extracted verbatim
 * from AdminAuditPage. Top-level decls are exported so the page can consume the
 * lookup/builder helpers (getActionLabel, getActionMeta, buildActionOptionGroups).
 */
export interface ActionKindMeta {
  id: string;
  label: string;
  group: ActionGroup;
  description?: string;
}

export type ActionGroup = "Security" | "Grading" | "Content" | "Lifecycle" | "Other";

export const ACTION_GROUP_ORDER: ActionGroup[] = [
  "Security",
  "Lifecycle",
  "Grading",
  "Content",
  "Other",
];

export const KNOWN_ACTION_KINDS: ActionKindMeta[] = [
  // Security — auth, role, identity, invite minting.
  {
    id: "role.change",
    label: "Role change",
    group: "Security",
    description: "An admin promoted or demoted a profile's role.",
  },
  {
    id: "invite.mint",
    label: "Invite minted",
    group: "Security",
    description: "Staff issued a new teacher invite code.",
  },
  {
    id: "profile.delete",
    label: "Profile delete",
    group: "Security",
    description:
      "A user profile was deleted. Details record cascade counts for forensics.",
  },
  // Lifecycle — destructive deletes of top-level course content.
  {
    id: "course.delete",
    label: "Course delete",
    group: "Lifecycle",
    description: "A course (a.k.a. class) was deleted.",
  },
  {
    id: "assignment.delete",
    label: "Assignment delete",
    group: "Lifecycle",
  },
  {
    id: "material.delete",
    label: "Material delete",
    group: "Lifecycle",
  },
  {
    id: "announcement.delete",
    label: "Announcement delete",
    group: "Lifecycle",
  },
  // Grading
  {
    id: "assignment_grade",
    label: "Grade applied",
    group: "Grading",
    description: "Teacher recorded or overrode an assignment grade.",
  },
  // Content
  {
    id: "teacher_note_change",
    label: "Teacher note edited",
    group: "Content",
    description: "A private teacher-on-student note was created or updated.",
  },
  {
    id: "portfolio_import",
    label: "Portfolio import",
    group: "Content",
    description:
      "A teacher imported a portfolio template from another course.",
  },
];

export const ACTION_META_BY_ID: ReadonlyMap<string, ActionKindMeta> = new Map(
  KNOWN_ACTION_KINDS.map((k) => [k.id, k]),
);

export function getActionLabel(id: string): string {
  return ACTION_META_BY_ID.get(id)?.label ?? id;
}

export function getActionMeta(id: string): ActionKindMeta | undefined {
  return ACTION_META_BY_ID.get(id);
}

export interface ActionOptionGroup {
  group: ActionGroup;
  items: ActionKindMeta[];
}

/**
 * Build the option list shown in the dropdown. Combines the static registry
 * with any unknown actions discovered in the live data (bucketed as "Other"),
 * preserving the canonical group ordering and alphabetising within a group.
 */
export function buildActionOptionGroups(discovered: string[]): ActionOptionGroup[] {
  const known = new Set(KNOWN_ACTION_KINDS.map((k) => k.id));
  const extras: ActionKindMeta[] = discovered
    .filter((a) => !known.has(a))
    .sort()
    .map((id) => ({ id, label: id, group: "Other" as const }));

  const all = [...KNOWN_ACTION_KINDS, ...extras];
  const byGroup = new Map<ActionGroup, ActionKindMeta[]>();
  for (const meta of all) {
    const bucket = byGroup.get(meta.group) ?? [];
    bucket.push(meta);
    byGroup.set(meta.group, bucket);
  }

  const result: ActionOptionGroup[] = [];
  for (const group of ACTION_GROUP_ORDER) {
    const items = byGroup.get(group);
    if (!items || items.length === 0) continue;
    items.sort((a, b) => a.label.localeCompare(b.label));
    result.push({ group, items });
  }
  return result;
}

