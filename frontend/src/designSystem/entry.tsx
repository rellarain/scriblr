import { createRoot } from 'react-dom/client'
import '../style/style.css'
import { CARDS, ensureBackend } from './cards'
import { Preview } from './Preview'

// The design system's bundle (components/bundle.js, built by scripts/design-system): `Scriblr.mountCard(element, id)` draws one card, the
// real app against a pretend backend, in the preview frame.

export const cards = CARDS.map(({ id, title, group, summary }) => ({ id, title, group, summary }))

export function mountCard(element: HTMLElement, id: string): void {
  const card = CARDS.find(c => c.id === id)
  if (!card) throw new Error(`No design-system card called ${id}`)
  ensureBackend()
  createRoot(element).render(<Preview card={card} />)
}
