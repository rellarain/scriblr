import { groupBlocks, type Parsed } from './blocks'

export type { Block, ListItem, Parsed, QuestionBlock, QuestionOption, QuestionType, Stray } from './blocks'
export type { Inline } from './inline'

export function parseMarkup(text: string): Parsed {
  return groupBlocks(text)
}

// The same, remembered for the last texts read (a Help tile and its lesson are drawn again and again with the same text).
const CACHE_SIZE = 64
const cache = new Map<string, Parsed>()

export function parseCached(text: string): Parsed {
  const hit = cache.get(text)
  if (hit) {
    cache.delete(text)
    cache.set(text, hit)
    return hit
  }
  const parsed = groupBlocks(text)
  cache.set(text, parsed)
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
  return parsed
}
