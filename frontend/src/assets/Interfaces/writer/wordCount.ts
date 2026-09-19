// Words in a piece of draft text: runs of non-whitespace characters.
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

export function formatWords(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
}
