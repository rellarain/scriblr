// A "paragraph" is text between blank lines -- the same boundary
// ReactMarkdown already treats as a paragraph break when rendering a
// moment's body. Nothing else in this codebase splits a draft body into
// paragraph units; this is the one place that convention lives.

export function splitParagraphs(body: string): string[] {
  const trimmed = body.trim()
  if (trimmed === '') return []
  return trimmed.split(/\n\s*\n/)
}

/** Clamps a possibly-stale paragraph index (e.g. from an anchor recorded
 * before edits shifted paragraphs) to the current paragraph count, so a
 * plotpoint pin degrades gracefully onto the last paragraph instead of
 * vanishing or crashing. Returns null if there are no paragraphs at all. */
export function clampParagraphIndex(index: number, paragraphCount: number): number | null {
  if (paragraphCount <= 0) return null
  if (index < 0) return 0
  if (index >= paragraphCount) return paragraphCount - 1
  return index
}
