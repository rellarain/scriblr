import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { insertAfter } from './siblingOrder'
import { removalTarget, resolveKey, tabCandidates, useNodeKeys, type KeyInput } from './nodeKeys'

const base: KeyInput = {
  key: 'Enter', shift: false, ctrl: false, meta: false, alt: false, composing: false,
  field: 'single', readOnly: false, fieldEmpty: false, nodeEmpty: false, hasParent: true, canCreateParentSibling: true,
}
const key = (over: Partial<KeyInput>) => resolveKey({ ...base, ...over })

describe('resolveKey', () => {
  it('Enter in a field with text adds a sibling; Shift+Enter is a new line in multi-line fields only', () => {
    expect(key({})).toBe('createSibling')
    expect(key({ field: 'multi' })).toBe('createSibling')
    expect(key({ shift: true, field: 'multi' })).toBe('none') // the browser's new line
    expect(key({ shift: true, field: 'single' })).toBe('createSibling')
  })

  it('Enter in a blank field of a node that has other text does nothing', () => {
    expect(key({ fieldEmpty: true })).toBe('swallow')
    expect(key({ fieldEmpty: true, field: 'multi' })).toBe('swallow')
    expect(key({ fieldEmpty: true, field: 'multi', shift: true })).toBe('none') // a new line is fine
  })

  it('Enter or Shift+Enter in an empty node removes it and goes to the parent', () => {
    for (const shift of [false, true]) {
      for (const field of ['single', 'multi'] as const) {
        expect(key({ nodeEmpty: true, fieldEmpty: true, shift, field })).toBe('removeToParent')
      }
    }
  })

  it('an empty top-level node is left alone by Enter', () => {
    expect(key({ nodeEmpty: true, fieldEmpty: true, hasParent: false })).toBe('swallow')
  })

  it('Ctrl+Enter adds a sibling of the parent, or replaces an empty node with one', () => {
    expect(key({ ctrl: true })).toBe('createParentSibling')
    expect(key({ ctrl: true, nodeEmpty: true, fieldEmpty: true })).toBe('removeCreateParentSibling')
    expect(key({ ctrl: true, canCreateParentSibling: false })).toBe('swallow')
    expect(key({ ctrl: true, nodeEmpty: true, fieldEmpty: true, canCreateParentSibling: false })).toBe('swallow')
  })

  it('Backspace and Delete remove an empty node only', () => {
    expect(key({ key: 'Backspace', nodeEmpty: true, fieldEmpty: true })).toBe('removeToPrev')
    expect(key({ key: 'Delete', nodeEmpty: true, fieldEmpty: true })).toBe('removeToNext')
    expect(key({ key: 'Backspace', fieldEmpty: true })).toBe('none')
    expect(key({ key: 'Delete', fieldEmpty: true })).toBe('none')
    expect(key({ key: 'Backspace', nodeEmpty: true, fieldEmpty: true, hasParent: false })).toBe('removeToPrev')
    expect(key({ key: 'Backspace', nodeEmpty: true, fieldEmpty: true, shift: true })).toBe('none')
  })

  it('Tab and Shift+Tab move between fields', () => {
    expect(key({ key: 'Tab' })).toBe('tabNext')
    expect(key({ key: 'Tab', shift: true })).toBe('tabPrev')
    expect(key({ key: 'Tab', ctrl: true })).toBe('none')
  })

  it('draft text only tabs; Enter and Shift+Enter stay paragraphs', () => {
    expect(key({ field: 'draft' })).toBe('none')
    expect(key({ field: 'draft', shift: true })).toBe('none')
    expect(key({ field: 'draft', ctrl: true })).toBe('none')
    expect(key({ field: 'draft', key: 'Backspace', nodeEmpty: true, fieldEmpty: true })).toBe('none')
    expect(key({ field: 'draft', key: 'Tab' })).toBe('tabNext')
    expect(key({ field: 'draft', key: 'Tab', shift: true })).toBe('tabPrev')
  })

  it('ignores IME composition, modifier chords and read-only fields', () => {
    expect(key({ composing: true })).toBe('none')
    expect(key({ composing: true, key: 'Tab' })).toBe('none')
    expect(key({ meta: true })).toBe('none')
    expect(key({ alt: true })).toBe('none')
    expect(key({ readOnly: true })).toBe('none')
    expect(key({ readOnly: true, key: 'Tab' })).toBe('tabNext')
  })
})

describe('removalTarget', () => {
  const sibs = ['a', 'b', 'c']
  it('goes to the parent, previous or next sibling, with fallbacks', () => {
    expect(removalTarget('toParent', 'b', sibs, 'p')).toEqual({ id: 'p', which: 'first' })
    expect(removalTarget('toPrev', 'b', sibs, 'p')).toEqual({ id: 'a', which: 'last' })
    expect(removalTarget('toNext', 'b', sibs, 'p')).toEqual({ id: 'c', which: 'first' })
    expect(removalTarget('toPrev', 'a', sibs, 'p')).toEqual({ id: 'p', which: 'first' })
    expect(removalTarget('toPrev', 'a', sibs, null)).toEqual({ id: 'b', which: 'first' })
    expect(removalTarget('toNext', 'c', sibs, 'p')).toEqual({ id: 'b', which: 'last' })
    expect(removalTarget('toParent', 'a', sibs, null)).toEqual({ id: 'b', which: 'first' })
    expect(removalTarget('toNext', 'only', ['only'], null)).toBeNull()
  })
})

describe('tabCandidates', () => {
  // root children r1 r2; r1 children a b; r2 child c
  const parents: Record<string, string | null> = { r1: null, r2: null, a: 'r1', b: 'r1', c: 'r2' }
  const kids: Record<string, string[]> = { root: ['r1', 'r2'], r1: ['a', 'b'], r2: ['c'] }
  const siblingsOf = (id: string) => kids[parents[id] ?? 'root']
  const parentOf = (id: string) => parents[id]

  it('tries following siblings, then climbs to the parent\'s following siblings', () => {
    expect(tabCandidates(1, 'a', siblingsOf, parentOf).map(t => t.id)).toEqual(['b', 'r2'])
    expect(tabCandidates(1, 'b', siblingsOf, parentOf).map(t => t.id)).toEqual(['r2'])
    expect(tabCandidates(1, 'c', siblingsOf, parentOf)).toEqual([])
  })

  it('goes backwards through preceding siblings, then the parent itself', () => {
    expect(tabCandidates(-1, 'b', siblingsOf, parentOf)).toEqual([
      { id: 'a', which: 'last' }, { id: 'r1', which: 'last' },
    ])
    expect(tabCandidates(-1, 'c', siblingsOf, parentOf)).toEqual([
      { id: 'r2', which: 'last' }, { id: 'r1', which: 'last' },
    ])
  })
})

describe('insertAfter', () => {
  const n = (id: string, order: number, parentId: string | null) => ({ id, order, parentId })
  it('places the node right after a sibling and renumbers only that group', () => {
    const list = [n('a', 0, 'p'), n('b', 1, 'p'), n('x', 7, 'q')]
    const next = insertAfter(list, n('new', 99, 'p'), 'a', m => m.parentId === 'p')
    const ordered = next.filter(m => m.parentId === 'p').sort((s, t) => s.order - t.order).map(m => m.id)
    expect(ordered).toEqual(['a', 'new', 'b'])
    expect(next.find(m => m.id === 'x')!.order).toBe(7)
    expect(list.find(m => m.id === 'b')!.order).toBe(1) // input untouched
  })

  it('goes last when the sibling is unknown', () => {
    const next = insertAfter([n('a', 0, 'p')], n('new', 0, 'p'), 'gone', m => m.parentId === 'p')
    expect(next.filter(m => m.parentId === 'p').sort((s, t) => s.order - t.order).map(m => m.id)).toEqual(['a', 'new'])
  })
})

// --- the delegated handler, on a small nested list ---

interface Item { id: string; parentId: string | null; title: string; body: string }

let counter = 0
const initial = (): Item[] => [
  { id: 'r1', parentId: null, title: 'Act one', body: 'about act one' },
  { id: 'a', parentId: 'r1', title: 'Scene a', body: 'about a' },
  { id: 'b', parentId: 'r1', title: 'Scene b', body: 'about b' },
  { id: 'r2', parentId: null, title: 'Act two', body: 'about act two' },
  { id: 'c', parentId: 'r2', title: 'Scene c', body: 'about c' },
]

function Harness({ start = initial(), snapshot }: { start?: Item[]; snapshot?: (items: Item[]) => void }) {
  const [items, setItems] = useState<Item[]>(start)
  snapshot?.(items)
  const kids = (parentId: string | null) => items.filter(i => i.parentId === parentId)
  const get = (id: string) => items.find(i => i.id === id)
  const add = (parentId: string | null, after: string): string => {
    const id = `new${++counter}`
    setItems(prev => {
      const at = prev.findIndex(i => i.id === after)
      return [...prev.slice(0, at + 1), { id, parentId, title: '', body: '' }, ...prev.slice(at + 1)]
    })
    return id
  }
  const keys = useNodeKeys({
    parentOf: id => get(id)?.parentId ?? null,
    siblingsOf: id => kids(get(id)?.parentId ?? null).map(i => i.id),
    isEmpty: id => {
      const i = get(id)
      return !i || (i.title.trim() === '' && i.body.trim() === '' && kids(id).length === 0)
    },
    createSibling: id => add(get(id)?.parentId ?? null, id),
    createParentSibling: id => {
      const parent = get(get(id)?.parentId ?? '')
      return parent ? add(parent.parentId, parent.id) : null
    },
    canCreateParentSibling: id => Boolean(get(id)?.parentId),
    remove: id => setItems(prev => prev.filter(i => i.id !== id)),
  })
  const patch = (id: string, p: Partial<Item>) => setItems(prev => prev.map(i => (i.id === id ? { ...i, ...p } : i)))
  const render = (parentId: string | null): React.ReactNode => kids(parentId).map(i => (
    <div key={i.id} data-knode={i.id} data-testid={`node-${i.id}`}>
      <input aria-label={`title ${i.id}`} data-kf="" value={i.title} onChange={e => patch(i.id, { title: e.target.value })} />
      <textarea aria-label={`body ${i.id}`} data-kf="" value={i.body} onChange={e => patch(i.id, { body: e.target.value })} />
      <button type="button">add</button>
      {render(i.id)}
    </div>
  ))
  return <div onKeyDown={keys.onKeyDown}>{render(null)}</div>
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const press = (el: HTMLElement, opts: Parameters<typeof fireEvent.keyDown>[1]) => fireEvent.keyDown(el, opts)
const focused = () => (document.activeElement as HTMLElement | null)?.getAttribute('aria-label')

describe('handleNodeKey', () => {
  it('Enter adds a sibling right after the node and focuses its first field', async () => {
    render(<Harness />)
    field('title a').focus()
    expect(press(field('title a'), { key: 'Enter' })).toBe(false)
    await waitFor(() => expect(focused()).toMatch(/^title new/))
    const order = [...document.querySelectorAll('[data-knode]')].map(n => (n as HTMLElement).dataset.knode)
    expect(order.slice(0, 4)).toEqual(['r1', 'a', order[2], 'b'])
    expect(order[2]).toMatch(/^new/)
  })

  it('Enter works from a description too, and Shift+Enter there is left as a new line', () => {
    render(<Harness />)
    expect(press(field('body a'), { key: 'Enter', shiftKey: true })).toBe(true) // not cancelled: the browser adds the line
    expect(document.querySelectorAll('[data-knode]').length).toBe(5)
    expect(press(field('body a'), { key: 'Enter' })).toBe(false)
    expect(document.querySelectorAll('[data-knode]').length).toBe(6)
  })

  it('Enter in a blank field of a node with other text does nothing', () => {
    render(<Harness start={[{ id: 'x', parentId: null, title: '', body: 'has text' }]} />)
    expect(press(field('title x'), { key: 'Enter' })).toBe(false)
    expect(document.querySelectorAll('[data-knode]').length).toBe(1)
  })

  it('Ctrl+Enter adds a sibling of the parent', async () => {
    render(<Harness />)
    press(field('title a'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(focused()).toMatch(/^title new/))
    const top = [...document.querySelectorAll('[data-testid^="node-"]')].filter(n => n.parentElement?.getAttribute('data-testid') === null)
    expect(top.length).toBe(3) // r1, the new sibling of r1, r2
    expect(top[1].getAttribute('data-knode')).toMatch(/^new/)
  })

  it('Enter in an empty node removes it and focuses the parent\'s first field', () => {
    render(<Harness start={[...initial(), { id: 'e', parentId: 'r2', title: '', body: '' }]} />)
    field('title e').focus()
    press(field('title e'), { key: 'Enter' })
    expect(screen.queryByLabelText('title e')).toBeNull()
    expect(focused()).toBe('title r2')
  })

  it('Shift+Enter in an empty node does the same', () => {
    render(<Harness start={[...initial(), { id: 'e', parentId: 'r2', title: '', body: '' }]} />)
    press(field('body e'), { key: 'Enter', shiftKey: true })
    expect(screen.queryByLabelText('title e')).toBeNull()
    expect(focused()).toBe('title r2')
  })

  it('Ctrl+Enter in an empty node replaces it with a sibling of its parent', async () => {
    render(<Harness start={[...initial(), { id: 'e', parentId: 'r2', title: '', body: '' }]} />)
    press(field('title e'), { key: 'Enter', ctrlKey: true })
    expect(screen.queryByLabelText('title e')).toBeNull()
    await waitFor(() => expect(focused()).toMatch(/^title new/))
    expect(document.querySelectorAll('[data-testid^="node-"]').length).toBe(6) // 5 + new parent sibling (e removed)
  })

  it('Backspace in an empty node removes it and lands on the previous sibling\'s last field', () => {
    render(<Harness start={[...initial(), { id: 'e', parentId: 'r1', title: '', body: '' }]} />)
    press(field('title e'), { key: 'Backspace' })
    expect(screen.queryByLabelText('title e')).toBeNull()
    expect(focused()).toBe('body b')
  })

  it('Delete in an empty node removes it and lands on the next sibling\'s first field', () => {
    const start = initial()
    start.splice(2, 0, { id: 'e', parentId: 'r1', title: '', body: '' }) // between a and b
    render(<Harness start={start} />)
    press(field('body e'), { key: 'Delete' })
    expect(screen.queryByLabelText('title e')).toBeNull()
    expect(focused()).toBe('title b')
  })

  it('Backspace and Delete are ordinary in a node that has text', () => {
    render(<Harness />)
    expect(press(field('title a'), { key: 'Backspace' })).toBe(true)
    expect(press(field('title a'), { key: 'Delete' })).toBe(true)
    expect(document.querySelectorAll('[data-knode]').length).toBe(5)
  })

  it('Tab goes to the next field, then the next sibling, skipping buttons and children', () => {
    render(<Harness />)
    field('title r1').focus()
    expect(press(field('title r1'), { key: 'Tab' })).toBe(false)
    expect(focused()).toBe('body r1')
    press(field('body r1'), { key: 'Tab' }) // r1's last field: next sibling r2 (not its child a)
    expect(focused()).toBe('title r2')
  })

  it('Tab from the last node of a list continues to the parent\'s next sibling', () => {
    render(<Harness />)
    press(field('body b'), { key: 'Tab' })
    expect(focused()).toBe('title r2')
  })

  it('Shift+Tab goes to the previous field, then the previous sibling\'s last field', () => {
    render(<Harness />)
    press(field('title b'), { key: 'Tab', shiftKey: true })
    expect(focused()).toBe('body a')
    press(field('body a'), { key: 'Tab', shiftKey: true })
    expect(focused()).toBe('title a')
    press(field('title a'), { key: 'Tab', shiftKey: true }) // first child: the parent's last field
    expect(focused()).toBe('body r1')
  })

  it('leaves Tab to the browser when nothing follows', () => {
    render(<Harness start={[{ id: 'only', parentId: null, title: 't', body: 'b' }]} />)
    expect(press(field('body only'), { key: 'Tab' })).toBe(true)
  })

  it('leaves draft fields alone except for Tab', () => {
    function DraftHarness() {
      const keys = useNodeKeys({
        parentOf: () => null, siblingsOf: id => [id], isEmpty: () => true, createSibling: () => null, remove: () => {},
      })
      return (
        <div onKeyDown={keys.onKeyDown}>
          <div data-knode="m"><textarea aria-label="draft" data-kf="draft" defaultValue="" /></div>
        </div>
      )
    }
    render(<DraftHarness />)
    const draft = screen.getByLabelText('draft')
    expect(press(draft, { key: 'Enter' })).toBe(true)
    expect(press(draft, { key: 'Enter', shiftKey: true })).toBe(true)
    expect(press(draft, { key: 'Backspace' })).toBe(true)
    expect(press(draft, { key: 'Delete' })).toBe(true)
  })

  it('ignores keys from elements that are not marked as node fields', () => {
    render(<Harness />)
    const button = screen.getAllByText('add')[0]
    expect(press(button, { key: 'Enter' })).toBe(true)
    expect(document.querySelectorAll('[data-knode]').length).toBe(5)
  })
})
