import { splitSentences } from './sentences'

// The Draft's paragraph tools, as pure functions on a moment's text: where its paragraphs are, and moving one up or down, splitting one,
// joining two, taking one out of a moment and putting it into another. Paragraphs are counted as the Preview counts them (splitParagraphs:
// blank lines between them, trimmed, the empty ones left out). Each change keeps the text between the paragraphs as it was where it can.
//
// Each change also says where every paragraph went (`follow`), so what is pinned to a paragraph or a sentence (a plotpoint's placement, a
// footnote, a reaction) can go with it: given a moment, a paragraph and a sentence (counted from 0 in the paragraph) before the change, it
// gives them after. A place the change does not touch comes back as it was.

export interface Range { start: number; end: number }
export interface Place { momentId: string; paragraph: number; sentence: number }
export type Follow = (at: Place) => Place

// Where the paragraphs of a moment's text are: [start, end) of each, trimmed.
export function paragraphRanges(body: string): Range[] {
  const out: Range[] = []
  const push = (from: number, to: number) => {
    const piece = body.slice(from, to)
    const text = piece.trim()
    if (!text) return
    const start = from + (piece.length - piece.trimStart().length)
    out.push({ start, end: start + text.length })
  }
  const gap = /\n\s*\n/g
  let from = 0
  for (let m = gap.exec(body); m; m = gap.exec(body)) {
    push(from, m.index)
    from = m.index + m[0].length
  }
  push(from, body.length)
  return out
}

// The paragraph a caret at `offset` is in: the last that starts at or before it (one in the gap after a paragraph is in that paragraph), the
// first when it is before them all, -1 when there is none.
export function paragraphAt(ranges: Range[], offset: number): number {
  if (ranges.length === 0) return -1
  let found = 0
  ranges.forEach((r, i) => { if (r.start <= offset) found = i })
  return found
}

// The text with its paragraphs' texts replaced, in order (as many texts as paragraphs), and the text between them kept.
function withTexts(body: string, ranges: Range[], texts: string[]): string {
  let out = body.slice(0, ranges[0]?.start ?? body.length)
  ranges.forEach((r, i) => {
    out += texts[i]
    out += body.slice(r.end, ranges[i + 1]?.start ?? body.length)
  })
  return out
}

const sentenceCount = (text: string) => splitSentences(text).length

export interface Change { body: string; follow: Follow }

// Swap paragraph `index` with the one above (`by` -1) or below (+1). Null at the edge.
export function moveParagraph(body: string, momentId: string, index: number, by: -1 | 1): Change | null {
  const ranges = paragraphRanges(body)
  const other = index + by
  if (index < 0 || index >= ranges.length || other < 0 || other >= ranges.length) return null
  const texts = ranges.map(r => body.slice(r.start, r.end))
  ;[texts[index], texts[other]] = [texts[other], texts[index]]
  return {
    body: withTexts(body, ranges, texts),
    follow: at => {
      if (at.momentId !== momentId) return at
      if (at.paragraph === index) return { ...at, paragraph: other }
      if (at.paragraph === other) return { ...at, paragraph: index }
      return at
    },
  }
}

// Split the paragraph a caret at `offset` is inside, there: the text before stays, the text after becomes the next paragraph. Null when the
// caret is not inside a paragraph's text with words on both sides of it.
export function splitParagraph(body: string, momentId: string, offset: number): (Change & { paragraph: number; caret: number }) | null {
  const ranges = paragraphRanges(body)
  const index = ranges.findIndex(r => r.start < offset && offset < r.end)
  if (index < 0) return null
  const r = ranges[index]
  const left = body.slice(r.start, offset).replace(/\s+$/u, '')
  const right = body.slice(offset, r.end).replace(/^\s+/u, '')
  if (!left || !right) return null
  const head = body.slice(0, r.start) + left + '\n\n'
  const original = sentenceCount(body.slice(r.start, r.end))
  const leftCount = sentenceCount(left)
  // A sentence cut in two stays with the first part; the sentences after the cut start the new paragraph.
  const shift = original - sentenceCount(right)
  return {
    body: head + right + body.slice(r.end),
    paragraph: index + 1,
    caret: head.length,
    follow: at => {
      if (at.momentId !== momentId || at.paragraph < index) return at
      if (at.paragraph > index) return { ...at, paragraph: at.paragraph + 1 }
      return at.sentence < leftCount ? at : { ...at, paragraph: index + 1, sentence: Math.max(0, at.sentence - shift) }
    },
  }
}

// Join paragraph `index` with the next, with a space between. Null when it is the last.
export function joinParagraphs(body: string, momentId: string, index: number): (Change & { caret: number }) | null {
  const ranges = paragraphRanges(body)
  if (index < 0 || index + 1 >= ranges.length) return null
  const first = ranges[index]
  const second = ranges[index + 1]
  const joinedText = `${body.slice(first.start, first.end)} ${body.slice(second.start, second.end)}`
  // The second paragraph's sentences come after the first's (one fewer when the first ended mid-sentence and the two run together).
  const shift = sentenceCount(joinedText) - sentenceCount(body.slice(second.start, second.end))
  return {
    body: body.slice(0, first.end) + ' ' + body.slice(second.start),
    caret: first.end + 1,
    follow: at => {
      if (at.momentId !== momentId || at.paragraph <= index) return at
      if (at.paragraph === index + 1) return { ...at, paragraph: index, sentence: at.sentence + shift }
      return { ...at, paragraph: at.paragraph - 1 }
    },
  }
}

// Take paragraph `index` out of a moment: the text without it (and the gap before or after it), and the paragraph's text.
export function takeParagraph(body: string, index: number): { body: string; text: string } | null {
  const ranges = paragraphRanges(body)
  const r = ranges[index]
  if (!r) return null
  const text = body.slice(r.start, r.end)
  if (index + 1 < ranges.length) return { body: body.slice(0, r.start) + body.slice(ranges[index + 1].start), text }
  if (index > 0) return { body: body.slice(0, ranges[index - 1].end) + body.slice(r.end), text }
  return { body: body.slice(0, r.start) + body.slice(r.end), text }
}

// Put a paragraph's text at the start or the end of a moment's text: the new text and the paragraph's place in it.
export function putParagraph(body: string, text: string, where: 'start' | 'end'): { body: string; paragraph: number } {
  if (body.trim() === '') return { body: text, paragraph: 0 }
  if (where === 'start') return { body: `${text}\n\n${body.replace(/^\s+/u, '')}`, paragraph: 0 }
  return { body: `${body.replace(/\s+$/u, '')}\n\n${text}`, paragraph: paragraphRanges(body).length }
}

// Move paragraph `index` of one moment to the start or the end of another: both new texts, and where everything went (the paragraphs after
// it in its moment move up one; at the start of the other moment, that moment's paragraphs move down one).
export function moveToMoment(
  fromBody: string, fromId: string, index: number, toBody: string, toId: string, where: 'start' | 'end',
): { fromBody: string; toBody: string; paragraph: number; follow: Follow } | null {
  if (fromId === toId) return null
  const taken = takeParagraph(fromBody, index)
  if (!taken) return null
  const put = putParagraph(toBody, taken.text, where)
  return {
    fromBody: taken.body,
    toBody: put.body,
    paragraph: put.paragraph,
    follow: at => {
      if (at.momentId === fromId) {
        if (at.paragraph === index) return { momentId: toId, paragraph: put.paragraph, sentence: at.sentence }
        return at.paragraph > index ? { ...at, paragraph: at.paragraph - 1 } : at
      }
      if (at.momentId === toId && where === 'start') return { ...at, paragraph: at.paragraph + 1 }
      return at
    },
  }
}

// Counting paragraphs across a chapter (the Preview's and the footnotes' way: the moments in outline order, their paragraphs one after another):
// from a chapter-wide paragraph to a moment's own, and back.
export function chapterParagraphs(momentIds: string[], bodies: Record<string, string>) {
  const counts = momentIds.map(id => paragraphRanges(bodies[id] ?? '').length)
  return {
    toPlace(paragraph: number, sentence: number): Place | null {
      let left = paragraph
      for (let i = 0; i < momentIds.length; i += 1) {
        if (left < counts[i]) return { momentId: momentIds[i], paragraph: left, sentence }
        left -= counts[i]
      }
      return null
    },
    toChapter(at: Place): number | null {
      const i = momentIds.indexOf(at.momentId)
      if (i < 0) return null
      return counts.slice(0, i).reduce((a, b) => a + b, 0) + at.paragraph
    },
  }
}
