import { fireEvent, screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

// Helpers shared by the Designer's component tests, so a change to where a control lives is made here once.

// Open the previews and checks drawer in the footer (the previews and the checks are in it).
export async function openDrawer(user: UserEvent): Promise<void> {
  const button = screen.getByRole('button', { name: /^Previews and checks/ })
  if (button.getAttribute('aria-expanded') !== 'true') await user.click(button)
}

// The canvas layer toggles of the view toolbar, by name.
export const layerToggle = (name: string | RegExp) => screen.getByRole('button', { name })

// The tree is nested cards, so a card is only there while what holds it is open. This opens a group, an object or a shape by name through the tree's search (it lists a card
// of any level and a click on it opens the path to it), as a click on its card does once it is listed. `kind` tells apart cards that share a name.
export async function pick(user: UserEvent, name: string, kind?: 'group' | 'object' | 'shape'): Promise<void> {
  const nav = within(screen.getByRole('navigation', { name: 'Model tree' }))
  const search = nav.getByRole('textbox', { name: 'Search the model' })
  fireEvent.change(search, { target: { value: name } })
  const hits = nav.queryAllByRole('button').filter(b => b.classList.contains('dzHit') && b.getAttribute('data-name') === name && (!kind || b.getAttribute('data-kind') === kind))
  if (hits.length === 0) {
    fireEvent.change(search, { target: { value: '' } })
    throw new Error(`The tree has no ${kind ?? 'card'} named ${name}`)
  }
  await user.click(hits[0])
}
