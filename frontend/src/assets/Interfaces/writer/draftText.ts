// The text of `source` added after `target` as a new paragraph (either may be empty).
export function mergeDraftText(target: string, source: string): string {
  const add = source.trim()
  if (!add) return target
  return target.trim() ? `${target.replace(/\s+$/, '')}\n\n${add}` : add
}
