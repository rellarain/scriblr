// Whether a typed answer is one of a question's accepted answers (`!` lines): capitals, extra spaces, punctuation and accents do not count,
// and small typos are allowed: none in an answer under 5 characters, 1 in one of 5 to 9, 2 in one of 10 or more (two letters swapped count
// as one).

export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// How many letters must be added, taken away, changed or swapped with the next to turn one into the other (optimal string alignment).
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1, cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

export function allowedTypos(answer: string): number {
  const n = answer.length
  return n < 5 ? 0 : n < 10 ? 1 : 2
}

export function matchesTextAnswer(given: string, accepted: string[]): boolean {
  const said = normalizeAnswer(given)
  if (!said) return false
  return accepted.some(a => {
    const want = normalizeAnswer(a)
    return want !== '' && editDistance(said, want) <= allowedTypos(want)
  })
}
