/**
 * discussion-topic/helpers
 * ========================
 * Pure helpers for the discussion topic view: post-length cap, error message
 * extraction, relative-time formatting, and the nested post-tree builder.
 * Extracted verbatim from DiscussionTopicView. No JSX.
 */
import type { DiscussionPost } from "@/teacher/useTopicPosts";
export const MAX_POST_LEN = 10000;

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  if (abs < 60_000) return "just now";
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 3_600_000) return fmt.format(minutes, "minute");
    if (abs < 86_400_000) return fmt.format(hours, "hour");
    if (abs < 30 * 86_400_000) return fmt.format(days, "day");
    return then.toLocaleDateString();
  } catch {
    return then.toLocaleString();
  }
}
export interface PostTreeNode {
  post: DiscussionPost;
  children: PostTreeNode[];
}

export function buildTree(posts: ReadonlyArray<DiscussionPost>): PostTreeNode[] {
  const byId = new Map<string, PostTreeNode>();
  for (const post of posts) {
    byId.set(post.id, { post, children: [] });
  }
  const roots: PostTreeNode[] = [];
  for (const post of posts) {
    const node = byId.get(post.id);
    if (!node) continue;
    if (post.parent_post_id && byId.has(post.parent_post_id)) {
      byId.get(post.parent_post_id)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

