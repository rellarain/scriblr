// Small formatters the Reader's consoles share.

export const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export const months = (n: number): string => plural(n, 'month')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Nov 3" (and the year when it is not this one).
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const text = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  return d.getUTCFullYear() === now.getUTCFullYear() ? text : `${text}, ${d.getUTCFullYear()}`
}

// Whole days from now to a date (negative once past).
export const daysUntil = (iso: string, now: Date = new Date()): number => Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000)

export function dueText(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ''
  const days = daysUntil(iso, now)
  if (days < 0) return 'overdue'
  if (days === 0) return 'due today'
  if (days <= 14) return `due in ${plural(days, 'day')}`
  return `due ${shortDate(iso, now)}`
}

export const wordsText = (n: number): string => `${n.toLocaleString('en-US')} words`

// About how long a book takes to read at 250 words a minute: "5 h 15 m", "40 m".
export function readingTime(words: number): string {
  const minutes = Math.round(words / 250)
  if (minutes < 60) return `${minutes} m`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
}

export const ratingText = (rating: number, ratings: number): string => (ratings > 0 ? `${rating.toFixed(1)} of 10 · ${ratings.toLocaleString('en-US')} ratings` : 'No ratings yet')

// Five stars out of a rating of 10.
export function stars(rating: number): string {
  const filled = Math.round(rating / 2)
  return '★'.repeat(filled) + '☆'.repeat(5 - filled)
}
