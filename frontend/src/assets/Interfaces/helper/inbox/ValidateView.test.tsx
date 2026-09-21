import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ValidateView, { type ValidateActions, type ValidateMode } from './ValidateView'
import { SPINES, bundle, doneValidation, message, validation } from './inboxTestData'

const toned = () => validation({ tone: 'neutral', toneSet: true })

interface Setup { mode?: ValidateMode; messages?: ReturnType<typeof message>[]; canValidate?: boolean; seeTones?: boolean; hideDone?: boolean }

function setup(over: Setup = {}) {
  const actions: ValidateActions = { setTone: vi.fn(), setExplicate: vi.fn() }
  const messages = over.messages ?? [
    message('m1', { text: 'First one', validations: [toned()] }),
    message('m2', { text: 'Second one', date: '2026-08-11', validations: [toned()] }),
  ]
  const view = (ms: typeof messages) => (
    <ValidateView
      bundle={bundle({ messages: ms, can: { validate: over.canValidate ?? true, manageVerbs: true, seeTones: over.seeTones ?? false } })}
      mode={over.mode ?? 'case'} onMode={() => {}} hideDone={over.hideDone ?? false} onHideDone={() => {}} actions={actions}
    />
  )
  const utils = render(view(messages))
  return { actions, view, ...utils }
}

const region = (name: string) => screen.getByRole('region', { name })
const tabbable = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-cf]:not(:disabled)')].filter(el => el.tabIndex >= 0)

describe('validation by case', () => {
  it('shows one message at a time with both stages, and steps through them', () => {
    setup()
    expect(screen.getByText(/First one/)).toBeInTheDocument()
    expect(screen.queryByText(/Second one/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 \/ 2 · 2 to do/)).toBeInTheDocument()
    for (const name of ['Tone', 'Explicate']) expect(region(name)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Channel' })).not.toBeInTheDocument()   // channel and explicate are one stage
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }))
    expect(screen.getByText(/Second one/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next case' })).toBeDisabled()
  })

  it('records a tone from four face buttons with no words', () => {
    const { actions } = setup()
    const faces = within(region('Tone')).getAllByRole('button')
    expect(faces.map(f => f.getAttribute('aria-label'))).toEqual(['Pleasant', 'Unpleasant', 'Mixed', 'Neutral'])
    expect(faces.every(f => (f.textContent ?? '').trim() === '')).toBe(true)
    fireEvent.click(faces[2])
    expect(actions.setTone).toHaveBeenCalledWith('m1', 'mixed')
  })

  it('keeps Explicate locked until the message is toned, with the reason as a tooltip', () => {
    setup({ messages: [message('m1', { text: 'Untoned' })] })
    expect(within(region('Explicate')).getByLabelText('Subject feature')).toBeDisabled()
    expect(within(region('Explicate')).getByTitle('Tone this message first')).toBeInTheDocument()
  })

  it('builds statements from a verb chip: it adds the subject and the verb together', () => {
    const chosen = doneValidation({ mine: false, channels: [SPINES], statements: [{ channel: SPINES, verbId: 'verb-fix' }] })
    const { actions } = setup({ messages: [message('m1', { validations: [toned(), chosen] })] })
    const chip = within(region('Explicate')).getByRole('button', { name: /Fix/ })
    expect(chip).toHaveTextContent('1')                    // one validator chose it
    fireEvent.click(chip)
    expect(actions.setExplicate).toHaveBeenCalledWith('m1', [SPINES], [{ channel: SPINES, verbId: 'verb-fix' }])
  })

  it('Shift+Enter jumps to the first control of the next stage', () => {
    setup()
    const face = within(region('Tone')).getAllByRole('button')[0]
    face.focus()
    fireEvent.keyDown(face, { key: 'Enter', shiftKey: true })
    expect(within(region('Explicate')).getByLabelText('Subject feature')).toHaveFocus()
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
    setup({ messages: [
      message('a', { validations: [toned()] }), message('b', { date: '2026-08-11', validations: [toned()] }), message('c', { date: '2026-08-12' }),
    ] })
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }))
    expect(screen.getByText(/Message c/)).toBeInTheDocument()
    // c is not toned, so Explicate has no control: from the Tone stage the shortcut runs off the end
    const face = within(region('Tone')).getAllByRole('button')[0]
    face.focus()
    fireEvent.keyDown(face, { key: 'Enter', shiftKey: true })
    expect(within(region('Tone')).getAllByRole('button')[0]).toHaveFocus()
  })

  it('after the last case, Shift+Enter wraps to an earlier message that is still to tone', () => {
    setup({ messages: [message('a'), message('b', { date: '2026-08-11', validations: [toned()] })] })
    fireEvent.click(screen.getByRole('button', { name: 'Next case' }))
    expect(screen.getByText(/Message b/)).toBeInTheDocument()
    const subject = within(region('Explicate')).getByLabelText('Subject feature')
    subject.focus()
    fireEvent.keyDown(subject, { key: 'Enter', shiftKey: true })
    expect(screen.getByText(/Message a/)).toBeInTheDocument()
    expect(within(region('Tone')).getAllByRole('button')[0]).toHaveFocus()
  })
})

describe('validation by stage', () => {
  it('lists every message with only that stage input, on two icon tabs with progress', () => {
    setup({ mode: 'stage' })
    expect(screen.getByText(/First one/)).toBeInTheDocument()
    expect(screen.getByText(/Second one/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Pleasant' })).toHaveLength(2)
    const tabs = screen.getByRole('navigation', { name: 'Validation stages' }).querySelectorAll('button')
    expect([...tabs].map(t => t.getAttribute('title'))).toEqual(['Tone', 'Explicate'])
    expect(tabs[0]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(tabs[1])
    expect(screen.queryByRole('button', { name: 'Pleasant' })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Subject feature')).toHaveLength(2)
  })

  it('Shift+Enter moves on to the next stage, and after Explicate back to Tone', () => {
    setup({ mode: 'stage' })
    const tabs = () => [...screen.getByRole('navigation', { name: 'Validation stages' }).querySelectorAll('button')]
    const face = screen.getAllByRole('button', { name: 'Pleasant' })[0]
    face.focus()
    fireEvent.keyDown(face, { key: 'Enter', shiftKey: true })
    expect(tabs()[1]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByLabelText('Subject feature')[0]).toHaveFocus()
    fireEvent.keyDown(screen.getAllByLabelText('Subject feature')[0], { key: 'Enter', shiftKey: true })
    expect(tabs()[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('is read-only without the Processor role, and says why', () => {
    setup({ mode: 'stage', canValidate: false })
    expect(screen.getByText(/needs the Processor role on Helper > Inbox/)).toBeInTheDocument()
    for (const b of screen.getAllByRole('button', { name: 'Pleasant' })) expect(b).toBeDisabled()
  })
})

describe('the queue', () => {
  const names = () => [...document.querySelectorAll('.feedbackCardText')].map(p => p.textContent)

  it('keeps its order while you work, even when a tone score moves a message', () => {
    const a = message('a', { text: 'Alpha', category: 'pleasant', date: '2026-08-10' })
    const b = message('b', { text: 'Bravo', category: 'unpleasant', date: '2026-08-11' })
    const { rerender, view } = setup({ mode: 'stage', messages: [a, b] })
    expect(names()).toEqual(['Alpha', 'Bravo'])
    const moved = { ...a, tone: { ...a.tone, category: 'unpleasant' as const } }
    const swapped = { ...b, tone: { ...b.tone, category: 'pleasant' as const } }
    rerender(view([moved, swapped]))
    expect(names()).toEqual(['Alpha', 'Bravo'])
  })

  it('keeps finished messages in place, and hides them only when hide done is on', () => {
    const doneOne = message('d', { text: 'Done one', validations: [doneValidation()] })
    const todo = message('t', { text: 'To do', date: '2026-08-11' })
    setup({ mode: 'stage', messages: [doneOne, todo] })
    expect(names()).toEqual(['Done one', 'To do'])
  })

  it('hide done leaves only what is left', () => {
    const doneOne = message('d', { text: 'Done one', validations: [doneValidation()] })
    const todo = message('t', { text: 'To do', date: '2026-08-11' })
    setup({ mode: 'stage', messages: [doneOne, todo], hideDone: true })
    expect(names()).toEqual(['To do'])
  })

  it('offers Configurers a sort by validations and shows the other validators tone labels', () => {
    const others = validation({ mine: false, tone: 'unpleasant', toneSet: true })
    setup({ mode: 'stage', seeTones: true, messages: [message('m1', { validations: [toned(), others] })] })
    expect(screen.getByLabelText('Sort messages')).toBeInTheDocument()
    expect(screen.getByTitle("Other validators' tone labels")).toBeInTheDocument()
  })

  it('does not offer that to everyone else', () => {
    setup({ mode: 'stage', seeTones: false, messages: [message('m1', { validations: [toned(), validation({ mine: false, tone: null, toneSet: true })] })] })
    expect(screen.queryByLabelText('Sort messages')).not.toBeInTheDocument()
    expect(screen.queryByTitle("Other validators' tone labels")).not.toBeInTheDocument()
  })
})
