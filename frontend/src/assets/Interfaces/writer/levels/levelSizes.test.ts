import { describe, expect, it } from 'vitest'
import { focusOf, levelSizes } from './levelSizes'

describe('focusOf', () => {
  it('maps each console to its level', () => {
    expect(['shelves', 'shelf', 'book', 'page', 'pages'].map(c => focusOf(c as never))).toEqual(['dash', 'project', 'outline', 'draft', 'draft'])
  })
})

describe('levelSizes', () => {
  it('makes the focused level Max, its parent Mid and everything further up Min', () => {
    expect(levelSizes('project')).toEqual({ dash: 'mid', project: 'max', outline: 'hidden', draft: 'hidden' })
    expect(levelSizes('outline')).toEqual({ dash: 'min', project: 'mid', outline: 'max', draft: 'hidden' })
    expect(levelSizes('draft')).toEqual({ dash: 'min', project: 'min', outline: 'mid', draft: 'max' })
  })

  it('at Dash focus shows the project shelves as the Min project level', () => {
    expect(levelSizes('dash')).toEqual({ dash: 'max', project: 'min', outline: 'hidden', draft: 'hidden' })
  })

  it("applies a level's own Min/Mid toggle, but never to the focused or a hidden level", () => {
    expect(levelSizes('draft', { project: 'mid', outline: 'min' })).toEqual({ dash: 'min', project: 'mid', outline: 'min', draft: 'max' })
    expect(levelSizes('project', { project: 'min', draft: 'mid' })).toEqual({ dash: 'mid', project: 'max', outline: 'hidden', draft: 'hidden' })
  })

  it('ignores a Project toggle while the Dash has the focus (the shelves have no Mid)', () => {
    expect(levelSizes('dash', { project: 'mid' }).project).toBe('min')
  })
})
