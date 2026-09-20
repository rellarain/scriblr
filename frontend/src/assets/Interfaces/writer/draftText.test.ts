import { describe, expect, it } from 'vitest'
import { mergeDraftText } from './draftText'

describe('mergeDraftText', () => {
  it('appends the source as a new paragraph', () => {
    expect(mergeDraftText('First.', 'Second.')).toBe('First.\n\nSecond.')
    expect(mergeDraftText('First.\n\n', '  Second.  ')).toBe('First.\n\nSecond.')
  })

  it('takes the source when the target is empty and ignores an empty source', () => {
    expect(mergeDraftText('  ', 'Only.')).toBe('Only.')
    expect(mergeDraftText('Kept.', '   ')).toBe('Kept.')
  })
})
