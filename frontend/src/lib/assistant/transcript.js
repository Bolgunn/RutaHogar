/**
 * Pure helper for preparing and sanitizing chat transcripts for support ticket submission (HU24 - E4).
 */

/**
 * Builds a clean, bounded transcript array suitable for ticket creation payload.
 *
 * @param {Array<{role: string, content: string, id?: string, createdAt?: string}>} messages
 * @param {number} [maxTurns=10] Maximum recent turns to include
 * @returns {Array<{role: string, content: string, ts: string}>}
 */
export function buildTranscriptForTicket(messages = [], maxTurns = 10) {
  if (!Array.isArray(messages)) return [];

  // Filter out system hints or welcome banner if present
  const validMessages = messages.filter(
    (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()
  );

  const bounded = validMessages.slice(-maxTurns);

  return bounded.map((m) => ({
    role: m.role,
    content: m.content.slice(0, 1000).trim(),
    ts: m.createdAt || new Date().toISOString(),
  }));
}
