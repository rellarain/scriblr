import type { WuiConsole } from '../useWriterWorkspace'

// The Writer is four stacked levels -- Dash, Project, Outline (the open book) and
// Draft (the open chapter) -- each shown Min, Mid or Max. Exactly one level has the
// focus (Max); the level above it is Mid and everything further up is Min; the
// levels below it are not shown. (Dash focus is the exception: the project shelves
// sit beside it as a Min list.)
export type Level = 'dash' | 'project' | 'outline' | 'draft'
export type LevelSize = 'hidden' | 'min' | 'mid' | 'max'
// A level's own Min/Mid toggle (the focused level is always Max).
export type SizeOverrides = Partial<Record<Level, 'min' | 'mid'>>

export const LEVELS: Level[] = ['dash', 'project', 'outline', 'draft']

export function focusOf(console: WuiConsole): Level {
  if (console === 'shelves') return 'dash'
  if (console === 'shelf') return 'project'
  if (console === 'book') return 'outline'
  return 'draft'
}

const DEFAULT_SIZES: Record<Level, Record<Level, LevelSize>> = {
  dash: { dash: 'max', project: 'min', outline: 'hidden', draft: 'hidden' },
  project: { dash: 'mid', project: 'max', outline: 'hidden', draft: 'hidden' },
  outline: { dash: 'min', project: 'mid', outline: 'max', draft: 'hidden' },
  draft: { dash: 'min', project: 'min', outline: 'mid', draft: 'max' },
}

export function levelSizes(focus: Level, overrides: SizeOverrides = {}): Record<Level, LevelSize> {
  const sizes = { ...DEFAULT_SIZES[focus] }
  for (const level of LEVELS) {
    const override = overrides[level]
    if (!override || level === focus || sizes[level] === 'hidden') continue
    // At Dash focus the Project level is the project list, which has no Mid.
    if (focus === 'dash' && level === 'project') continue
    sizes[level] = override
  }
  return sizes
}
