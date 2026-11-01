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

// Where each sentence of a moment's text is, as characters [start, end) of the text (the end is before the whitespace that follows the sentence): what a
// flag on a passage is kept by. `paragraph` and `sentence` count from 0, as the preview's keys do.
export interface SentenceRange { paragraph: number; sentence: number; start: number; end: number }

export function sentenceRanges(body: string): SentenceRange[] {
  const pieces: Array<{ text: string; at: number }> = []
  const gap = /\n\s*\n/g
  let from = 0
  for (let m = gap.exec(body); m; m = gap.exec(body)) {
    pieces.push({ text: body.slice(from, m.index), at: from })
    from = m.index + m[0].length
  }
  pieces.push({ text: body.slice(from), at: from })
  const out: SentenceRange[] = []
  let paragraph = 0
  for (const piece of pieces) {
    const text = piece.text.trim()
    if (!text) continue
    let offset = piece.at + (piece.text.length - piece.text.trimStart().length)
    splitSentences(text).forEach((sentence, i) => {
      out.push({ paragraph, sentence: i, start: offset, end: offset + sentence.trimEnd().length })
      offset += sentence.length
    })
    paragraph += 1
  }
  return out
}
