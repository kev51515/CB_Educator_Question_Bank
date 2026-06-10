/**
 * videoEmbed — pure helpers for turning a pasted video URL (YouTube, Vimeo,
 * or Google Drive) into an embeddable <iframe> src.
 *
 * No dependencies, no side effects — every function is a pure transform so it
 * can be unit-tested in isolation. The Pickleball lesson surfaces use this to
 * render recap links inline rather than bouncing the user out to a new tab.
 *
 * Supported providers:
 *   - YouTube:  youtube.com/watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID
 *   - Vimeo:    vimeo.com/ID, player.vimeo.com/video/ID
 *   - Drive:    drive.google.com/file/d/ID/view, ?id=ID
 */

export type VideoProvider = "youtube" | "vimeo" | "drive" | "unknown";

export interface ParsedVideo {
  provider: VideoProvider;
  /** Provider-specific id (video id / file id). Null when unrecognised. */
  id: string | null;
  /** Embeddable iframe src, or null when the URL can't be embedded. */
  embedSrc: string | null;
}

/**
 * Safely parse a string into a URL. Returns null on any malformed input rather
 * than throwing, so callers can branch on the result.
 */
function safeUrl(raw: string): URL | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    // Tolerate scheme-less input like "youtu.be/abc" by defaulting to https.
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function hostMatches(host: string, needle: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return h === needle || h.endsWith(`.${needle}`);
}

/** Detect which provider a URL belongs to (without building the embed src). */
export function detectVideoProvider(raw: string): VideoProvider {
  const url = safeUrl(raw);
  if (!url) return "unknown";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (hostMatches(host, "youtube.com") || host === "youtu.be" || hostMatches(host, "youtube-nocookie.com")) {
    return "youtube";
  }
  if (hostMatches(host, "vimeo.com")) return "vimeo";
  if (hostMatches(host, "drive.google.com")) return "drive";
  return "unknown";
}

function parseYouTube(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id || null;
  }

  // youtube.com/watch?v=<id>
  const vParam = url.searchParams.get("v");
  if (vParam) return vParam;

  // youtube.com/embed/<id>, /shorts/<id>, /v/<id>, /live/<id>
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && ["embed", "shorts", "v", "live"].includes(segments[0])) {
    return segments[1] || null;
  }

  return null;
}

function parseVimeo(url: URL): string | null {
  // player.vimeo.com/video/<id> OR vimeo.com/<id> (optionally /<id>/<hash>)
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  if (segments[0] === "video" && segments[1]) {
    return /^\d+$/.test(segments[1]) ? segments[1] : null;
  }
  // First all-numeric segment is the video id.
  const numeric = segments.find((s) => /^\d+$/.test(s));
  return numeric ?? null;
}

function parseDrive(url: URL): string | null {
  // drive.google.com/file/d/<id>/view  OR  ...?id=<id>
  const idParam = url.searchParams.get("id");
  if (idParam) return idParam;

  const segments = url.pathname.split("/").filter(Boolean);
  const dIdx = segments.indexOf("d");
  if (dIdx !== -1 && segments[dIdx + 1]) return segments[dIdx + 1];

  return null;
}

/**
 * Parse a pasted URL into a provider + id + embeddable iframe src.
 * `embedSrc` is null for unrecognised URLs — callers should fall back to a
 * plain link in that case.
 */
export function parseVideoUrl(raw: string): ParsedVideo {
  const url = safeUrl(raw);
  if (!url) return { provider: "unknown", id: null, embedSrc: null };

  const provider = detectVideoProvider(raw);

  switch (provider) {
    case "youtube": {
      const id = parseYouTube(url);
      return {
        provider,
        id,
        embedSrc: id ? `https://www.youtube-nocookie.com/embed/${id}` : null,
      };
    }
    case "vimeo": {
      const id = parseVimeo(url);
      return {
        provider,
        id,
        embedSrc: id ? `https://player.vimeo.com/video/${id}` : null,
      };
    }
    case "drive": {
      const id = parseDrive(url);
      return {
        provider,
        id,
        embedSrc: id ? `https://drive.google.com/file/d/${id}/preview` : null,
      };
    }
    default:
      return { provider: "unknown", id: null, embedSrc: null };
  }
}

/** Convenience: just the embeddable src (or null). */
export function toEmbedSrc(raw: string): string | null {
  return parseVideoUrl(raw).embedSrc;
}
