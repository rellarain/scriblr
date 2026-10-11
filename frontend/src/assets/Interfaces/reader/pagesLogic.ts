import type { ChapterText, FlagClass, FlaggedPassage, Mark, Note, ReaderSettings } from '../../../api/reader'
import { splitSentences } from '../writer/sentences'

// Pure logic for the e-reader (PAGES): sentence keys, how a chapter is cut into pages, how a flag shows a sentence, where the reader is, and
// the export of notes and highlights. A sentence is addressed `c<chapter>:p<paragraph>:s<sentence>` (the backend's keys).

export const sentenceKey = (chapter: number, paragraph: number, sentence: number): string => `c${chapter}:p${paragraph}:s${sentence}`

export function parseKey(key: string): { chapter: number; paragraph: number; sentence: number } | null {
  const m = /^c(\d+):p(\d+):s(\d+)$/.exec(key)
  return m ? { chapter: Number(m[1]), paragraph: Number(m[2]), sentence: Number(m[3]) } : null
}

// A reaction goes up a level on each click and clears on the fourth (the Writer's preview does the same).
export const nextLevel = (level: number): number => (level + 1) % 4

export const EMPTY_MARK: Mark = { like: 0, dislike: 0, flags: [] }

// How many characters fit on a page at a text size: the page shrinks as the text grows, and wide margins take a fifth of it.
export function pageBudget(size: number, margins: ReaderSettings['margins']): number {
  const base = 2600 * (17 / Math.max(10, size)) ** 2
  return Math.round(margins === 'wide' ? base * 0.8 : base)
}

// A page is whole paragraphs (the first paragraph of a page always fits, however long); returns the first paragraph of each page.
export function paginate(paragraphs: string[], budget: number): number[] {
  const starts: number[] = []
  let used = 0
  paragraphs.forEach((p, i) => {
    if (i === 0 || used + p.length > budget) { starts.push(i); used = 0 }
    used += p.length
  })
  return starts.length === 0 ? [0] : starts
}

// The page a paragraph is on (the last page whose first paragraph is at or before it).
export function pageOfParagraph(starts: number[], paragraph: number): number {
  let page = 0
  starts.forEach((s, i) => { if (s <= paragraph) page = i })
  return page
}

// How far through the book the reader is (0 to 100): finished chapters, plus the share of this one that is behind them.
export function progressPercent(chapter: number, chapters: number, paragraph: number, paragraphs: number): number {
  if (chapters <= 0) return 0
  const within = paragraphs > 0 ? Math.min(1, (paragraph + 1) / paragraphs) : 0
  return Math.min(100, Math.round((((chapter - 1) + within) / chapters) * 1000) / 10)
}

export interface SentenceFlag { flagKey: string; name: string; detail: string; cls: FlagClass }

// The flags on a sentence, each with the class the reader gave it: the author's flagged passages and the reader's own flags on it.
export function flagsAt(
  key: string,
  passages: FlaggedPassage[],
  mark: Mark | undefined,
  classOf: (flagKey: string, fallback: FlagClass) => FlagClass,
  mine: { key: string; name: string }[],
): SentenceFlag[] {
  const out: SentenceFlag[] = passages.filter(p => p.key === key).map(p => ({ flagKey: p.flagKey, name: p.name, detail: p.detail, cls: classOf(p.flagKey, p.defaultClass) }))
  for (const f of mark?.flags ?? []) {
    if (out.some(o => o.flagKey === f)) continue
    const own = mine.find(m => m.key === f)
    if (own) out.push({ flagKey: f, name: own.name, detail: '', cls: classOf(f, 'marked') })
    else out.push({ flagKey: f, name: f, detail: '', cls: classOf(f, 'marked') })
  }
  return out
}

// How a sentence shows: the strictest class wins (hidden, then spoiler, then highlight, then marked).
const STRENGTH: FlagClass[] = ['hidden', 'spoiler', 'highlight', 'marked']
export function strictest(flags: SentenceFlag[]): SentenceFlag | undefined {
  return [...flags].sort((a, b) => STRENGTH.indexOf(a.cls) - STRENGTH.indexOf(b.cls))[0]
}

export interface ParagraphView { index: number; sentences: string[] }
export const paragraphViews = (chapter: ChapterText): ParagraphView[] => chapter.paragraphs.map((text, index) => ({ index, sentences: splitSentences(text) }))

// The reaction counts in a chapter, for the Reactions console.
export function countMarks(marks: Record<string, Mark>, chapter: number): { marked: number; pleasant: number; unpleasant: number; flagged: number } {
  const own = Object.entries(marks).filter(([k]) => parseKey(k)?.chapter === chapter)
  return {
    marked: own.filter(([, m]) => m.like || m.dislike).length,
    pleasant: own.filter(([, m]) => m.like).length,
    unpleasant: own.filter(([, m]) => m.dislike).length,
    flagged: own.filter(([, m]) => m.flags.length).length,
  }
}

// The notes and highlights of a book as Markdown, in reading order (the file the reader exports).
export function notesMarkdown(bookTitle: string, author: string, notes: Note[]): string {
  const ordered = [...notes].sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0) || (parseKey(a.key ?? '')?.paragraph ?? 0) - (parseKey(b.key ?? '')?.paragraph ?? 0) || a.at.localeCompare(b.at))
  const lines = [`# ${bookTitle}`, `*${author}*`, '']
  let chapter: number | null | undefined
  for (const n of ordered) {
    if (n.chapter !== chapter) { chapter = n.chapter; lines.push(chapter ? `## Chapter ${chapter}` : '## Notes', '') }
    if (n.kind === 'bookmark') lines.push('- Bookmark', '')
    else {
      if (n.quote) lines.push(...n.quote.split('\n').map(l => `> ${l}`))
      if (n.note) lines.push('', n.note)
      lines.push('')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

// Where to open a book: the saved position (a chapter and paragraph), else the first chapter; never a chapter that is not open.
export function resumeAt(position: { chapter: number; paragraph: number } | undefined, available: number[]): { chapter: number; paragraph: number } {
  const first = available[0] ?? 1
  if (!position || !available.includes(position.chapter)) return { chapter: first, paragraph: 0 }
  return { chapter: position.chapter, paragraph: position.paragraph }
}

export const FONT_STACK: Record<ReaderSettings['font'], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif",
  // Easy-read: a plain sans with wider letter and word spacing, which the page's rules add.
  easy: "Verdana, 'Segoe UI', system-ui, sans-serif",
}
