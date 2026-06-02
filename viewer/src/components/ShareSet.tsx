import { useCallback } from "react";

interface ShareButtonProps {
  selectedIds: Set<string>;
  onImportSet: (ids: string[]) => void;
  showToast: (msg: string) => void;
}

/**
 * Encode bytes to base64url (no padding, URL-safe).
 */
function toBase64Url(str: string): string {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode base64url back to a string.
 */
function fromBase64Url(encoded: string): string {
  let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  // Re-add padding
  while (b64.length % 4 !== 0) b64 += "=";
  return atob(b64);
}

/**
 * Parse the `?share=` query parameter from the current URL.
 * Returns the decoded array of IDs, or null if the parameter is absent.
 * Cleans the URL (removes the share param) via history.replaceState.
 */
export function parseShareParam(): string[] | null {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("share");
  if (!encoded) return null;

  try {
    const decoded = fromBase64Url(encoded);
    const ids = decoded.split(",").filter(Boolean);

    // Clean the URL: remove the share param
    params.delete("share");
    const remaining = params.toString();
    const clean =
      window.location.pathname +
      (remaining ? `?${remaining}` : "") +
      window.location.hash;
    history.replaceState(null, "", clean);

    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export function ShareButton({ selectedIds, onImportSet, showToast }: ShareButtonProps) {
  // Silence the lint warning: onImportSet is part of the public API for the
  // consumer to wire up share-link import, but the button itself only exports.
  void onImportSet;

  const handleShare = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    const joined = ids.join(",");
    const encoded = toBase64Url(joined);
    const url = new URL(window.location.href);
    // Put share param on the query string (not the hash)
    url.searchParams.set("share", encoded);
    const shareUrl = url.toString();

    navigator.clipboard
      ?.writeText(shareUrl)
      .then(
        () => showToast("Share link copied!"),
        () => showToast("Copy failed"),
      );
  }, [selectedIds, showToast]);

  if (selectedIds.size === 0) return null;

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-accent-600 bg-accent-50 hover:bg-accent-100 rounded-lg transition-colors focus-ring"
      title="Copy a shareable link for the current print set"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      Share set
    </button>
  );
}
