// Hand-rolled, dependency-free text statistics for the Draft Analytics
// panel: word/sentence counts, a heuristic syllable counter feeding the
// classic Flesch Reading Ease / Flesch-Kincaid Grade Level formulas, and a
// stopword-filtered word-frequency top list.

export interface TopWord {
  word: string
  count: number
}

export interface TextAnalytics {
  wordCount: number
  sentenceCount: number
  avgSentenceLength: number
  longestSentence: number
  fleschReadingEase: number
  fleschKincaidGrade: number
  topWords: TopWord[]
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'it', 'as',
  'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we',
  'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'not', 'no', 'so', 'if', 'then', 'than',
  'there', 'here', 'from', 'by', 'into', 'out', 'up', 'down', 'over', 'under', 'do', 'does', 'did',
  'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'am', 'are', 'him', 'them', 'us', 'me',
])

function splitWords(text: string): string[] {
  const trimmed = text.trim()
  return trimmed === '' ? [] : trimmed.split(/\s+/)
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Like `splitSentences`, but keeps the terminal `.`/`!`/`?` attached --
 * needed for sentence-type classification, which `splitSentences` throws
 * away. Kept separate so `analyzeText`'s existing behavior is untouched. */
function splitSentencesWithPunctuation(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []
  return matches.map((s) => s.trim()).filter(Boolean)
}

/** Heuristic vowel-group syllable count -- not linguistically exact, but
 * standard enough for Flesch-family formulas, with zero dependencies. */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  let count = 0
  let prevWasVowel = false
  for (const ch of w) {
    const isVowel = 'aeiouy'.includes(ch)
    if (isVowel && !prevWasVowel) count++
    prevWasVowel = isVowel
  }
  if (w.endsWith('e') && count > 1) count--
  return Math.max(count, 1)
}

export function analyzeText(text: string): TextAnalytics {
  const words = splitWords(text)
  const sentences = splitSentences(text)
  const wordCount = words.length
  const sentenceCount = sentences.length

  const sentenceLengths = sentences.map((s) => splitWords(s).length)
  const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0
  const longestSentence = sentenceLengths.length > 0 ? Math.max(...sentenceLengths) : 0

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0)

  let fleschReadingEase = 0
  let fleschKincaidGrade = 0
  if (wordCount > 0 && sentenceCount > 0) {
    const wordsPerSentence = wordCount / sentenceCount
    const syllablesPerWord = totalSyllables / wordCount
    fleschReadingEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord
    fleschKincaidGrade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59
  }

  const frequency = new Map<string, number>()
  for (const w of words) {
    const normalized = w.toLowerCase().replace(/[^a-z']/g, '')
    if (!normalized || STOPWORDS.has(normalized)) continue
    frequency.set(normalized, (frequency.get(normalized) ?? 0) + 1)
  }
  const topWords: TopWord[] = Array.from(frequency.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    wordCount,
    sentenceCount,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    longestSentence,
    fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
    fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
    topWords,
  }
}

// -- Sentence type / clause structure / phrase type -------------------------
//
// These are lexical-heuristic *estimates*, not a real grammatical parse --
// there's no dependency-free way to do true part-of-speech tagging. Sentence
// type is guessed from terminal punctuation plus a curated list of common
// imperative lead verbs; clause structure from the presence of coordinating/
// subordinating conjunctions; phrase-type counts are whole-text tallies of
// words from curated preposition/determiner/auxiliary-verb lists, used as
// stand-ins for prepositional/noun/verb phrases respectively.

export interface SentenceTypeCounts {
  declarative: number
  interrogative: number
  exclamatory: number
  imperative: number
}

export interface ClauseStructureCounts {
  simple: number
  compound: number
  complex: number
  compoundComplex: number
}

export interface PhraseTypeCounts {
  nounPhrase: number
  verbPhrase: number
  prepositionalPhrase: number
}

export interface SentenceStructureAnalytics {
  totalSentences: number
  sentenceTypes: SentenceTypeCounts
  clauseStructure: ClauseStructureCounts
  phraseTypes: PhraseTypeCounts
}

const IMPERATIVE_LEAD_VERBS = new Set([
  'go', 'stop', 'come', 'look', 'listen', 'wait', 'run', 'walk', 'take', 'give', 'get', 'put', 'bring',
  'hold', 'keep', 'let', 'make', 'do', 'try', 'remember', 'forget', 'imagine', 'consider', 'think', 'watch',
  'be', 'turn', 'open', 'close', 'push', 'pull', 'move', 'stay', 'leave', 'help', 'tell', 'ask', 'call',
  'write', 'read', 'check', 'use', 'follow', 'start', 'begin', 'finish', 'sit', 'stand', 'wake', 'hurry',
  'hush', 'breathe', 'focus', 'relax', 'calm', 'please', 'never', 'always', 'add', 'remove', 'avoid',
  'ignore', 'notice', 'picture', 'pretend', 'suppose', 'say', 'speak', 'shut', 'grab', 'drop', 'throw',
  'catch', 'build', 'break', 'fix', 'clean', 'choose', 'pick', 'send', 'answer', 'explain', 'describe',
  'continue', 'pause',
])

const COORDINATING_CONJUNCTIONS = new Set(['and', 'but', 'or', 'nor', 'so', 'yet'])

const SUBORDINATING_CONJUNCTIONS = new Set([
  'because', 'although', 'though', 'since', 'unless', 'while', 'whereas', 'if', 'when', 'whenever',
  'before', 'after', 'until', 'as', 'that', 'which', 'who', 'whom', 'whose', 'where', 'once',
])

const PREPOSITIONS = new Set([
  'in', 'on', 'at', 'by', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'to', 'from', 'up', 'down', 'of', 'off', 'over', 'under', 'again', 'further',
  'near', 'since', 'until', 'without', 'within', 'along', 'across', 'behind', 'beside', 'beyond', 'except',
  'inside', 'outside', 'toward', 'towards', 'upon', 'among', 'around',
])

const DETERMINERS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'some', 'any', 'no', 'each', 'every', 'either', 'neither',
])

const AUX_VERBS = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
])

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, '')
}

function classifySentenceType(sentence: string): keyof SentenceTypeCounts {
  const hasQuestion = sentence.includes('?')
  const words = splitWords(sentence.replace(/["'“”‘’]/g, ''))
  const firstWord = normalizeWord(words[0] ?? '')
  const isImperative = IMPERATIVE_LEAD_VERBS.has(firstWord)
  if (hasQuestion && !isImperative) return 'interrogative'
  if (isImperative) return 'imperative'
  if (sentence.includes('!')) return 'exclamatory'
  return 'declarative'
}

function classifyClauseStructure(sentence: string): keyof ClauseStructureCounts {
  const words = splitWords(sentence).map(normalizeWord)
  const hasCoordinating = words.some((w, i) => i > 0 && COORDINATING_CONJUNCTIONS.has(w))
  const hasSubordinating = words.some((w) => SUBORDINATING_CONJUNCTIONS.has(w))
  if (hasCoordinating && hasSubordinating) return 'compoundComplex'
  if (hasCoordinating) return 'compound'
  if (hasSubordinating) return 'complex'
  return 'simple'
}

function countPhraseTypes(words: string[]): PhraseTypeCounts {
  let nounPhrase = 0
  let verbPhrase = 0
  let prepositionalPhrase = 0
  for (const raw of words) {
    const w = normalizeWord(raw)
    if (!w) continue
    if (DETERMINERS.has(w)) nounPhrase++
    if (AUX_VERBS.has(w)) verbPhrase++
    if (PREPOSITIONS.has(w)) prepositionalPhrase++
  }
  return { nounPhrase, verbPhrase, prepositionalPhrase }
}

export function analyzeSentenceStructure(text: string): SentenceStructureAnalytics {
  const sentences = splitSentencesWithPunctuation(text)
  const sentenceTypes: SentenceTypeCounts = { declarative: 0, interrogative: 0, exclamatory: 0, imperative: 0 }
  const clauseStructure: ClauseStructureCounts = { simple: 0, compound: 0, complex: 0, compoundComplex: 0 }

  for (const sentence of sentences) {
    sentenceTypes[classifySentenceType(sentence)]++
    clauseStructure[classifyClauseStructure(sentence)]++
  }

  return {
    totalSentences: sentences.length,
    sentenceTypes,
    clauseStructure,
    phraseTypes: countPhraseTypes(splitWords(text)),
  }
}

/** Case-insensitive whole-word/phrase occurrence count, e.g. for detecting
 * how often a plotline's keyword shows up in drafted prose. */
export function countPhraseOccurrences(text: string, phrase: string): number {
  const trimmed = phrase.trim()
  if (!trimmed) return 0
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\b${escaped}\\b`, 'gi')
  return (text.match(pattern) ?? []).length
}
