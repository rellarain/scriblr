import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ValidateView, { type ValidateActions } from './ValidateView'
import { TONE_BANDS } from './inboxLogic'
import { bundle, message, validation } from './inboxTestData'

const me = 'adm-dana'

function setup(over: { mode?: 'stage' | 'case'; messages?: ReturnType<typeof message>[]; canValidate?: boolean } = {}) {
  const actions: ValidateActions = { setTone: vi.fn(), setChannels: vi.fn(), setStatements: vi.fn() }
  const messages = over.messages ?? [message('m1', { text: 'First one' }), message('m2', { text: 'Second one', date: '2026-08-11' })]
  const view = (mode: 'stage' | 'case') => (
    <ValidateView
      bundle={bundle({ messages, can: { validate: over.canValidate ?? true, manageVerbs: true } })} adminId={me}
      mode={mode} onMode={() => {}} toneOrder={TONE_BANDS} actions={actions}
    />
  )
  const utils = render(view(over.mode ?? 'case'))
  return { actions, ...utils }
}

const tabbable = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-cf]:not(:disabled)')]

describe('validation by case', () => {
  it('shows one message at a time with all three stages, and steps through them', () => {
    setup()
    expect(screen.getByText(/First one/)).toBeInTheDocument()
    expect(screen.queryByText(/Second one/)).not.toBeInTheDocument()
    expect(screen.getByText(/Case 1 of 2 · 2 unfinished/)).toBeInTheDocument()
    for (const name of ['Tone', 'Channel', 'Explicate']) expect(screen.getByRole('region', { name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }))
    expect(screen.getByText(/Second one/)).toBeInTheDocument()
    expect(screen.getByText(/Case 2 of 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next case' })).toBeDisabled()
  })

  it('records a tone from the Tone stage', () => {
    const { actions } = setup()
    fireEvent.click(within(screen.getByRole('region', { name: 'Tone' })).getByRole('button', { name: /^Pleasant/ }))
    expect(actions.setTone).toHaveBeenCalledWith('m1', 'pleasant')
    fireEvent.click(within(screen.getByRole('region', { name: 'Tone' })).getByRole('button', { name: /Neutral/ }))
    expect(actions.setTone).toHaveBeenLastCalledWith('m1', 'neutral')
  })

  it('Shift+Enter jumps to the first control of the next stage', () => {
    setup()
    const tone = within(screen.getByRole('region', { name: 'Tone' })).getAllByRole('button')[0]
    tone.focus()
    fireEvent.keyDown(tone, { key: 'Enter', shiftKey: true })
    expect(within(screen.getByRole('region', { name: 'Channel' })).getByLabelText('Page')).toHaveFocus()
  })

  it('Tab past the last control goes on to the next case, Shift+Tab back to the previous', () => {
    const { container } = setup()
    const controls = tabbable(container)
    controls[controls.length - 1].focus()
    fireEvent.keyDown(controls[controls.length - 1], { key: 'Tab' })
    expect(screen.getByText(/Second one/)).toBeInTheDocument()
    expect(tabbable(container)[0]).toHaveFocus()
    fireEvent.keyDown(tabbable(container)[0], { key: 'Tab', shiftKey: true })
    expect(screen.getByText(/First one/)).toBeInTheDocument()
    const now = tabbable(container)
    expect(now[now.length - 1]).toHaveFocus()
  })

  it('after the last stage of the last case, Shift+Enter returns to the first message still to tone', () => {
    const toned = validation(me, { tone: 'neutral' })
    setup({ messages: [message('a', { validations: [toned] }), message('b', { date: '2026-08-11', validations: [toned] }), message('c', { date: '2026-08-12' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }))
    expect(screen.getByText(/Message c/)).toBeInTheDocument()
    // no channel yet, so Explicate has no control: from the Channel stage the shortcut runs off the end
    const page = within(screen.getByRole('region', { name: 'Channel' })).getByLabelText('Page')
    page.focus()
    fireEvent.keyDown(page, { key: 'Enter', shiftKey: true })
    // c is the only message left to tone, so the cursor lands on its Tone stage
    expect(within(screen.getByRole('region', { name: 'Tone' })).getAllByRole('button')[0]).toHaveFocus()
  })

  it('after the last case, Shift+Enter wraps to an earlier message that is still to tone', () => {
    const toned = validation(me, { tone: 'neutral' })
    setup({ messages: [message('a'), message('b', { date: '2026-08-11', validations: [toned] })] })
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }))
    expect(screen.getByText(/Message b/)).toBeInTheDocument()
    const page = within(screen.getByRole('region', { name: 'Channel' })).getByLabelText('Page')
    page.focus()
    fireEvent.keyDown(page, { key: 'Enter', shiftKey: true })
    expect(screen.getByText(/Message a/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Tone' })).getAllByRole('button')[0]).toHaveFocus()
  })
})

describe('validation by stage', () => {
  it('lists every message with only that stage input and progress on the tabs', () => {
    setup({ mode: 'stage' })
    expect(screen.getByText(/First one/)).toBeInTheDocument()
    expect(screen.getByText(/Second one/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Pleasant/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Tone/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Channel/ }))
    expect(screen.queryByRole('button', { name: /^Pleasant/ })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Page')).toHaveLength(2)
  })

  it('Shift+Enter moves on to the next stage, and after Explicate back to Tone', () => {
    setup({ mode: 'stage' })
    const tone = screen.getAllByRole('button', { name: /^Pleasant/ })[0]
    tone.focus()
    fireEvent.keyDown(tone, { key: 'Enter', shiftKey: true })
    expect(screen.getByRole('button', { name: /Channel/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByLabelText('Page')[0]).toHaveFocus()
    fireEvent.keyDown(screen.getAllByLabelText('Page')[0], { key: 'Enter', shiftKey: true })
    expect(screen.getByRole('button', { name: /Explicate/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Enter', shiftKey: true })
    expect(screen.getByRole('button', { name: /Tone/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is read-only without feedback processing access, and says why', () => {
    setup({ mode: 'stage', canValidate: false })
    expect(screen.getByText(/needs feedback processing access to Helper > Inbox/)).toBeInTheDocument()
    for (const b of screen.getAllByRole('button', { name: /^Pleasant/ })) expect(b).toBeDisabled()
  })
})
