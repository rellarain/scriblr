import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CharacterDoc, ItemDoc, OutlineNode } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { newItem } from '../../../../designSystem/mockItems'
import { itemsBackend } from '../../../../test/itemsBackend'
import ItemsConsole from './ItemsConsole'

const ada = (): CharacterDoc => newCharacter('chr_a', { name: 'Ada' }, 0)
const bram = (): CharacterDoc => newCharacter('chr_b', { name: 'Bram' }, 1)
const sword = (): ItemDoc => ({ ...newItem('itm_s', { name: 'Sunblade', kind: 'weapon' }, 0), description: 'Warm to the touch.', holdings: [{ id: 'h1', holder: 'char:chr_a', at: '', note: 'Hers from the start' }] })
const letter = (): ItemDoc => newItem('itm_l', { name: 'Letter', kind: 'document' }, 1)
const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, title: string): OutlineNode => ({ id, kind, parentId, order, title } as OutlineNode)
const outline = [node('b1', 'book', null, 0, 'Book'), node('c1', 'chapter', 'b1', 0, 'One'), node('c2', 'chapter', 'b1', 1, 'Two')]

// The items API is the pretend one; the cast and the links the console reads beside it are answered by path.
function open(items: ItemDoc[] = [sword(), letter()]) {
  const backend = itemsBackend(items, path => (path.endsWith('/characters/all') ? [ada(), bram()] : []))
  render(<ItemsConsole projectId="p1" outline={outline} />)
  return { backend, user: userEvent.setup() }
}
type Backend = ReturnType<typeof itemsBackend>
const save = () => screen.getByRole('button', { name: 'Save' })
const puts = (b: Backend) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: Backend) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as ItemDoc

describe('the Items console', () => {
  it('lists the library and opens the first item', async () => {
    open()
    const list = within(await screen.findByRole('navigation', { name: 'Items' }))
    expect(list.getAllByRole('button', { name: /^Open / }).map(b => b.textContent)).toEqual(['SunbladeWeapon', 'LetterDocument'])
    expect(await screen.findByRole('textbox', { name: 'Name of the item' })).toHaveValue('Sunblade')
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('Warm to the touch.')
  })

  it('says so when the library is empty and makes an item with the plus', async () => {
    const { backend, user } = open([])
    expect(await screen.findByText(/Make an item to start/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New item' }))
    expect(await screen.findByRole('textbox', { name: 'Name of the item' })).toHaveValue('Unnamed item')
    expect(backend.of('POST')).toHaveLength(1)
  })

  it('keeps an edit waiting until Save, then saves the item whole', async () => {
    const { backend, user } = open()
    const kind = await screen.findByRole('combobox', { name: 'Kind of item' })
    expect(save()).toBeDisabled()
    await user.selectOptions(kind, 'jewel')
    expect(puts(backend)).toHaveLength(0)
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).kind).toBe('jewel')
  })

  it('shows who has the item at the end of the story and lets a holding be added, changed and taken away', async () => {
    const { backend, user } = open()
    expect(await screen.findByText('At the end of the story: Ada.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a holding' }))
    const second = screen.getByRole('combobox', { name: 'Who has it in holding h2' })
    // The new holding starts at the point after the last one, with nobody known.
    expect(screen.getByRole('combobox', { name: 'From when in holding h2' })).toHaveValue('c1')
    await user.selectOptions(second, 'char:chr_b')
    expect(await screen.findByText('At the end of the story: Bram.')).toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).holdings.map(h => [h.holder, h.at])).toEqual([['char:chr_a', ''], ['char:chr_b', 'c1']])
    await user.click(screen.getByRole('button', { name: 'Remove holding h2' }))
    expect(screen.getByText('At the end of the story: Ada.')).toBeInTheDocument()
  })

  it('opens another item from the list and deletes one after asking', async () => {
    const { backend, user } = open()
    await screen.findByRole('textbox', { name: 'Name of the item' })
    await user.click(screen.getByRole('button', { name: 'Open Letter' }))
    expect(await screen.findByDisplayValue('Letter')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete Letter' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(backend.of('DELETE')).toHaveLength(1))
    expect(within(screen.getByRole('navigation', { name: 'Items' })).queryByRole('button', { name: 'Open Letter' })).not.toBeInTheDocument()
  })
})
