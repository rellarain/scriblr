// Splitting a chapter's draft text for the preview: paragraphs on blank
// lines, sentences on terminal punctuation (keeping closing quotes and the
// whitespace that follows, so the pieces concatenate back to the paragraph).

export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
}

export function splitSentences(paragraph: string): string[] {
  const parts = paragraph.match(/[^.!?]+(?:[.!?]+["”’')\]]*)?\s*|[.!?]+["”’')\]]*\s*/g)
  return parts ? parts.filter(p => p.trim().length > 0) : []
}
