import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FootnoteTool } from './FootnoteTool'

// Version 1 (features.ts off): footnotes are the author's own; content flags and publishing a footnote come with publishing, in WUI v2.
// The tool with them on is tested in outline/BookPublish.test.tsx.
describe('the Footnote tool in WUI v1', () => {
  it('has no content flags and no Published switch', () => {
    const flags = [{ key: 'grief', name: 'Grief', detail: '', defaultClass: 'marked' as const }]
    const notes = {
      footnotes: [{ id: 'f1', paragraph: 0, sentence: 0, title: 'The weir', text: '', published: true }],
      flags: [{ id: 'x1', paragraph: 0, sentence: 0, flagKey: 'grief' }],
    }
    render(<FootnoteTool at={{ paragraph: 0, sentence: 0 }} notes={notes} flags={flags} onSave={vi.fn()} />)
    expect(screen.queryByLabelText('Flag this passage')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Published' })).toBeNull()
    expect(screen.queryByText(/flag/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete footnote The weir' })).toBeTruthy()
  })
})
