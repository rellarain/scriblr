import { screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

// The figure editor's choice lists are dropdowns of pictures (a button that opens a listbox), not native selects: these find one by its label, read what it holds and choose from it.
// A choice is named by its id (the options carry it as `data-value`) or by its text. For tests only.
type Scope = Pick<typeof screen, 'getByRole' | 'queryByRole' | 'getAllByRole'>
type User = ReturnType<typeof userEvent.setup>

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const named = (label: string | RegExp): RegExp => (typeof label === 'string' ? new RegExp(`^${escape(label)}: `) : label)

export const picker = (label: string | RegExp, scope: Scope = screen): HTMLElement => scope.getByRole('button', { name: named(label) })
export const maybePicker = (label: string | RegExp, scope: Scope = screen): HTMLElement | null => scope.queryByRole('button', { name: named(label) })
export const pickerValue = (label: string | RegExp, scope: Scope = screen): string | null => picker(label, scope).getAttribute('data-value')
// The labels of the dropdowns of pictures in a place (not their buttons' other text).
export const pickerLabels = (scope: Scope = screen): string[] =>
  scope.getAllByRole('button').filter(b => b.hasAttribute('data-value') && b.hasAttribute('aria-haspopup')).map(b => (b.getAttribute('aria-label') ?? '').split(': ')[0])

export async function choose(user: User, label: string | RegExp, choice: string, scope: Scope = screen): Promise<void> {
  await user.click(picker(label, scope))
  const list = screen.getByRole('listbox')
  const option = [...list.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.getAttribute('data-value') === choice) ?? within(list).getByRole('option', { name: choice })
  await user.click(option)
}

// What a dropdown offers, by name (it is opened and closed again).
export async function optionNames(user: User, label: string | RegExp, scope: Scope = screen): Promise<string[]> {
  await user.click(picker(label, scope))
  const names = within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent ?? '')
  await user.keyboard('{Escape}')
  return names
}
