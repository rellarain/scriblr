import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

// Helpers shared by the Designer's component tests, so a change to where a control lives is made here once.

// Open the previews and checks drawer in the footer (the previews and the checks are in it).
export async function openDrawer(user: UserEvent): Promise<void> {
  const button = screen.getByRole('button', { name: /^Previews and checks/ })
  if (button.getAttribute('aria-expanded') !== 'true') await user.click(button)
}

// The canvas layer toggles of the view toolbar, by name.
export const layerToggle = (name: string | RegExp) => screen.getByRole('button', { name })
