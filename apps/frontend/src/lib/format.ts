/** "3 minutes ago", "yesterday", "12 Mar 2026" - whichever reads best. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Absolute timestamp for tooltips, where precision matters more than brevity. */
export function formatAbsoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Turns an axios error into something worth showing a user. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: string; details?: unknown } } })?.response
    ?.data;

  if (typeof data?.error === 'string') {
    // Validation failures carry per-field detail; surface the first one.
    const details = data.details;
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0] as { message?: string };
      if (first?.message) return `${data.error}: ${first.message}`;
    }
    return data.error;
  }

  return fallback;
}
