/**
 * Splits text into overlapping chunks for embedding.
 *
 * Chunks break on whitespace where possible so a sentence is not cut mid-word,
 * and consecutive chunks overlap so a passage spanning a boundary is still
 * retrievable from at least one chunk.
 */
export function splitTextIntoChunks(
  text: string,
  maxChunkLength = 1000,
  overlap = 200,
): string[] {
  const normalised = text.replace(/\r\n/g, '\n').trim();
  if (normalised.length === 0) return [];
  if (normalised.length <= maxChunkLength) return [normalised];

  // Guard against a configuration that would never advance the cursor.
  const safeOverlap = Math.min(Math.max(overlap, 0), Math.floor(maxChunkLength / 2));
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalised.length) {
    let end = Math.min(cursor + maxChunkLength, normalised.length);

    if (end < normalised.length) {
      // Prefer a paragraph break, then any whitespace, but only if it is in the
      // last 20% of the window - otherwise chunks become very uneven.
      const minBreak = cursor + Math.floor(maxChunkLength * 0.8);
      const paragraphBreak = normalised.lastIndexOf('\n\n', end);
      const whitespaceBreak = normalised.lastIndexOf(' ', end);

      if (paragraphBreak > minBreak) {
        end = paragraphBreak;
      } else if (whitespaceBreak > minBreak) {
        end = whitespaceBreak;
      }
    }

    const chunk = normalised.slice(cursor, end).trim();
    if (chunk.length > 0) chunks.push(chunk);

    if (end >= normalised.length) break;

    // Always move forward by at least one character.
    cursor = Math.max(end - safeOverlap, cursor + 1);
  }

  return chunks;
}
