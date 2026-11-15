// A heading's anchor: its words in lower case joined by hyphens (`@#Heading-words` finds it, with any capitals). A repeat of the same words
// gets `-2`, `-3` and so on, in the order the headings come.

export function headingWords(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .join('-')
}

// The anchors of a list of heading texts, each unique.
export function anchorsFor(texts: string[]): string[] {
  const seen = new Map<string, number>()
  return texts.map(text => {
    const base = headingWords(text) || 'heading'
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
}
