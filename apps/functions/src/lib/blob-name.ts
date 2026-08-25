/**
 * Resolves the blob name to download.
 *
 * The API now sends `blobName` explicitly, which is authoritative. The URL
 * fallback exists for messages enqueued by older builds still sitting in the
 * queue.
 *
 * The previous implementation used `blobUrl.split('/').pop()`, which breaks on
 * any URL carrying a SAS query string (`file.pdf?sv=...`) and silently returns
 * the wrong name for blobs stored under a virtual directory.
 */
export function resolveBlobName(blobUrl: string, blobName?: string): string {
  if (blobName) return blobName;

  let pathname: string;
  try {
    pathname = new URL(blobUrl).pathname;
  } catch {
    throw new Error(`Cannot resolve blob name from invalid URL: ${blobUrl}`);
  }

  // Path is /<container>/<blob path...>; drop the leading slash and container.
  const segments = pathname.replace(/^\/+/, '').split('/');
  if (segments.length < 2) {
    throw new Error(`Cannot resolve blob name from URL path: ${pathname}`);
  }

  // decodeURIComponent because names with spaces arrive percent-encoded.
  return segments.slice(1).map(decodeURIComponent).join('/');
}
