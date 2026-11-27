import { sentenceRanges } from './sentences'
import { countWords } from './wordCount'
import type { Range } from './paragraphs'

// The Draft's style aids, as pure functions on a moment's text: its long sentences, its words used again close together, and its reading
// level. Each aid is turned on or off in the Draft's settings (kept on this machine, for every chapter).

export interface StyleAids {
  long: boolean
  longWords: number // a sentence of more words than this is long
  repeat: boolean
  repeatGap: number // a word used again within this many words is marked
  read: boolean
}

export const DEFAULT_AIDS: StyleAids = { long: false, longWords: 30, repeat: false, repeatGap: 40, read: false }
export const AID_LIMITS = { longWords: [8, 120], repeatGap: [5, 400] } as const

export interface LongSentence extends Range { paragraph: number; words: number }

// The sentences of more than `limit` words, with where they are and how many words they have.
export function longSentences(body: string, limit: number): LongSentence[] {
  return sentenceRanges(body)
    .map(r => ({ start: r.start, end: r.end, paragraph: r.paragraph, words: countWords(body.slice(r.start, r.end)) }))
    .filter(s => s.words > limit)
}

// Small words that carry no style: left out of the repeated words.
const SMALL_WORDS = new Set((
  'a an the and or but nor so yet for of to in on at by from with without into onto upon over under about above below after before '
  + 'as than then that this these those there here when where while who whom whose which what why how if else not no yes '
  + 'i me my mine we us our ours you your yours he him his she her hers it its they them their theirs one ones '
  + 'is am are was were be been being have has had having do does did done will would shall should can could may might must '
  + 'just very too also only even still all any some each every more most much many such own same other '
  + 'up down out off again once back now said says say'
).split(' '))

// A word's key for repeats: lower case, a possessive dropped, a plain plural made singular (lanterns, lantern).
export function wordKey(word: string): string {
  let key = word.toLowerCase().replace(/[’']s$/u, '').replace(/[’'-]+$/u, '')
  if (key.length > 3 && key.endsWith('s') && !key.endsWith('ss') && !key.endsWith('us') && !key.endsWith('is')) key = key.slice(0, -1)
  return key
}

// The words used again within `gap` words of each other (both uses marked), leaving out small words and words of fewer than three letters.
export function repeatedWords(body: string, gap: number): Range[] {
  const words = [...body.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)].map(m => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0] }))
  const last = new Map<string, number>()
  const marked = new Set<number>()
  words.forEach((w, i) => {
    const key = wordKey(w.text)
    if (key.length < 3 || SMALL_WORDS.has(key) || /^\p{N}+$/u.test(key)) return
    const before = last.get(key)
    if (before !== undefined && i - before <= gap) { marked.add(before); marked.add(i) }
    last.set(key, i)
  })
  return [...marked].sort((a, b) => a - b).map(i => ({ start: words[i].start, end: words[i].end }))
}

// Syllables in an English word, by its groups of vowels (a silent final e left out): an estimate, as readability formulas use.
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length === 0) return 0
  if (w.length <= 3) return 1
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const groups = trimmed.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

// The text's reading level as a school grade (Flesch-Kincaid: words per sentence and syllables per word), for English text; null when it has
// fewer than 20 words in the Latin alphabet to judge by.
export function readingGrade(body: string): number | null {
  const sentences = sentenceRanges(body).length
  const words = body.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []
  if (sentences === 0 || words.length < 20) return null
  const syllableCount = words.reduce((sum, w) => sum + syllables(w), 0)
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllableCount / words.length) - 15.59
  return Math.max(1, Math.round(grade))
}

// What the reading level is called: "grade 6", up to "grade 16+".
export const gradeLabel = (grade: number) => `grade ${grade >= 16 ? '16+' : grade}`
