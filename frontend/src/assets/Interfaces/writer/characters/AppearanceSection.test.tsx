import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CharacterDoc } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { charactersBackend } from '../../../../test/charactersBackend'
import CharactersConsole from './CharactersConsole'

const ada = (): CharacterDoc => ({ ...newCharacter('chr_a', { name: 'Ada' }, 0) })

async function open(doc: CharacterDoc = ada()) {
  const backend = charactersBackend([doc])
  render(<CharactersConsole projectId="p1" />)
  const user = userEvent.setup()
  await screen.findByRole('textbox', { name: 'In a paragraph' })
  return { backend, user }
}
type Backend = ReturnType<typeof charactersBackend>
const puts = (b: Backend) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: Backend) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as CharacterDoc
const field = (name: string) => screen.getByRole('textbox', { name })

describe('the Appearance section', () => {
  it('is where a character opens: the name, a paragraph and a field for each thing a stranger notices', async () => {
    await open()
    expect(screen.getByRole('textbox', { name: 'Name of the character' })).toHaveValue('Ada')
    for (const name of ['In a paragraph', 'Height', 'Build', 'Skin', 'Hair', 'Eyes', 'Face', 'Voice', 'Bearing and mannerisms', 'How they dress', 'Distinguishing marks']) expect(field(name)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-pressed', 'true')
    // The portrait is one click away, not the first thing.
    expect(screen.queryByRole('img', { name: /portrait/ })).not.toBeInTheDocument()
  })

  it('keeps what is typed until Save, then saves it with the character', async () => {
    const { backend, user } = await open()
    await user.type(field('Hair'), 'Black, cropped')
    await user.type(field('Voice'), 'Low and dry')
    expect(puts(backend)).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).profile).toMatchObject({ hair: 'Black, cropped', voice: 'Low and dry' })
  })

  it('writes the empty fields from the portrait and leaves what is already written', async () => {
    const doc = ada()
    doc.profile = { ...doc.profile, eyes: 'Grey as slate' }
    const { user } = await open(doc)
    await user.click(screen.getByRole('button', { name: 'Write the empty fields from the portrait' }))
    expect(field('Eyes')).toHaveValue('Grey as slate')
    expect((field('Hair') as HTMLTextAreaElement).value).toMatch(/hair/i)
    expect((field('In a paragraph') as HTMLTextAreaElement).value).not.toBe('')
    expect(field('Voice')).toHaveValue('')
    // What a portrait cannot say (a height, a voice, marks) stays the author's.
    expect(field('Height')).toHaveValue('')
    expect(field('Distinguishing marks')).toHaveValue('')
    // Everything the portrait can say is there now: nothing is left to write.
    expect(screen.getByRole('button', { name: 'Write the empty fields from the portrait' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(field('Hair')).toHaveValue('')
  })

  it('writes every field again only after asking', async () => {
    const doc = ada()
    doc.profile = { ...doc.profile, eyes: 'Grey as slate' }
    const { user } = await open(doc)
    await user.click(screen.getByRole('button', { name: 'Write every field again from the portrait' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(field('Eyes')).toHaveValue('Grey as slate')
    await user.click(screen.getByRole('button', { name: 'Write every field again from the portrait' }))
    await user.click(screen.getByRole('button', { name: 'Confirm: write every field from the portrait' }))
    expect(field('Eyes')).not.toHaveValue('Grey as slate')
    expect((field('Eyes') as HTMLInputElement).value).toMatch(/eyes/i)
  })

  it('shows the words on the cast overview and in a comparison, and what differs between two characters', async () => {
    const a = ada()
    a.profile = { ...a.profile, appearance: 'A weathered woman with the sea in her squint.', hair: 'Grey, cropped' }
    const b = { ...newCharacter('chr_b', { name: 'Bram' }, 1) }
    b.profile = { ...b.profile, hair: 'Black, braided' }
    const backend = charactersBackend([a, b])
    render(<CharactersConsole projectId="p1" />)
    const user = userEvent.setup()
    await screen.findByRole('textbox', { name: 'In a paragraph' })
    await user.click(screen.getByRole('button', { name: 'The cast' }))
    expect(await screen.findAllByText(/A weathered woman with the sea in her squint\./)).not.toHaveLength(0)
    expect(screen.getByText('Hair: Grey, cropped > Black, braided')).toBeInTheDocument()
    expect(backend.of('PUT')).toHaveLength(0)
  })

  it('goes to the portrait from the Portrait button and back', async () => {
    const { user } = await open()
    expect(screen.queryByRole('button', { name: 'Look' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Portrait' }))
    expect(await screen.findByRole('img', { name: 'Ada, portrait' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(field('Hair')).toBeInTheDocument()
  })

  it('writes the words from the portrait that was made, not from a default', async () => {
    const doc = ada()
    doc.portrait = { ...doc.portrait, age: 'elderly', hairColor: '#e2e0dc', hairLength: 'chest', hairTexture: '4C', build: 'heavy' }
    const { user } = await open(doc)
    await user.click(screen.getByRole('button', { name: 'Write the empty fields from the portrait' }))
    const hair = (field('Hair') as HTMLTextAreaElement).value
    expect(hair).toMatch(/chest/i)
    expect(hair).toMatch(/tightly coiled/)
    expect(hair).toMatch(/white|silver/)
    expect((field('In a paragraph') as HTMLTextAreaElement).value).toMatch(/elderly|old/i)
  })
})
