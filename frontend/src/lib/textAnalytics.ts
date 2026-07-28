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
