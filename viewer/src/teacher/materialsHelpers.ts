export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const rounded = n >= 10 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded} ${units[i]}`;
}

export function safeHostname(raw: string | null): string {
  if (!raw) return "";
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}
