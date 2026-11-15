import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { HELP_TARGETS } from '../../channels/helpTargets'
import { feedbackBackend } from '../../test/feedbackBackend'
import HelpTile from './HelpTile'

let backend: ReturnType<typeof feedbackBackend>
beforeEach(() => { backend = feedbackBackend() })

const tab = (name: string | RegExp) => screen.getByRole('tab', { name })

describe('HelpTile', () => {
  it('opens on the guides (the fallback while none are written) and counts the questions asked of you', async () => {
    render(<HelpTile target={HELP_TARGETS.writerDraft} fallback="Help with the draft." />)
    expect(tab('Guides')).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Help with the draft.')).toBeInTheDocument()
    // The local writer was asked one question (about their library search).
    expect(await screen.findByLabelText('1 questions for you')).toBeInTheDocument()
  })

  it('sends a statement about where you are, which then shows under My feedback as received', async () => {
    render(<HelpTile target={HELP_TARGETS.writerDraft} fallback="" />)
    fireEvent.click(tab('Send feedback'))
    const form = screen.getByRole('form', { name: 'Send feedback' })
    // The subject starts at this console.
    await waitFor(() => expect(within(form).getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-current', 'location'))
    const send = within(form).getByRole('button', { name: 'Send feedback' })
    expect(send).toBeDisabled()
    fireEvent.click(await within(form).findByRole('button', { name: 'Add' }))
    fireEvent.change(within(form).getByLabelText('Your feedback'), { target: { value: 'A word count goal per scene.' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Pleasant' }))
    expect(send).toBeEnabled()
    fireEvent.click(send)
    expect(await screen.findByRole('status')).toHaveTextContent('Sent')
    const posted = backend.fetch.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(String(posted?.[1]?.body))).toMatchObject({
      text: 'A word count goal per scene.', channelId: 'writer/draft', verbId: 'verb-add', senderTone: 'pleasant', fromChannel: 'writer/draft', authorId: 'ORG-4471',
    })
    fireEvent.click(tab(/My feedback/))
    const mine = await screen.findByRole('article', { name: 'Add Writer > Draft' })
    expect(within(mine).getByText('A word count goal per scene.')).toBeInTheDocument()
    expect(within(mine).getByRole('listitem', { current: 'step' })).toHaveTextContent('Received')
  })

  it('takes how you feel as a smile, a frown, both (mixed) or neither', async () => {
    render(<HelpTile target={HELP_TARGETS.writerDraft} fallback="" />)
    fireEvent.click(tab('Send feedback'))
    const feel = within(screen.getByRole('group', { name: 'How you feel about it' }))
    expect(feel.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Pleasant', 'Unpleasant'])
    const smile = feel.getByRole('button', { name: 'Pleasant' }), frown = feel.getByRole('button', { name: 'Unpleasant' })
    fireEvent.click(smile)
    fireEvent.click(frown)
    expect(smile).toHaveAttribute('aria-pressed', 'true')
    expect(frown).toHaveAttribute('aria-pressed', 'true')
    const form = screen.getByRole('form', { name: 'Send feedback' })
    fireEvent.click(await within(form).findByRole('button', { name: 'Fix' }))
    fireEvent.change(within(form).getByLabelText('Your feedback'), { target: { value: 'Both, really.' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Send feedback' }))
    await screen.findByRole('status')
    const sent = (n: number) => JSON.parse(String(backend.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')[n]?.[1]?.body))
    expect(sent(0).senderTone).toBe('mixed')
    // Sent: the faces are let go; neither pressed sends no tone.
    expect(smile).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(form).getByRole('button', { name: 'Fix' }))
    fireEvent.change(within(form).getByLabelText('Your feedback'), { target: { value: 'No feeling either way.' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Send feedback' }))
    await waitFor(() => expect(backend.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2))
    expect(sent(1).senderTone).toBeNull()
  })

  it('narrows the subject to a feature and answers a question asked of you', async () => {
    render(<HelpTile target={HELP_TARGETS.writerDraft} fallback="" />)
    fireEvent.click(tab('Send feedback'))
    const form = screen.getByRole('form', { name: 'Send feedback' })
    const narrow = await within(form).findByLabelText('Narrow to a component')
    fireEvent.change(narrow, { target: { value: 'writer/draft/draft' } })
    expect(within(form).getAllByRole('button', { name: 'Draft' }).at(-1)).toHaveAttribute('aria-current', 'location')

    fireEvent.click(tab(/My feedback/))
    const box = await screen.findByLabelText('Your answer to: Which words did you search for?')
    fireEvent.change(box, { target: { value: 'Dragons, and the author name.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send the answer' }))
    expect(await screen.findByText('Dragons, and the author name.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByLabelText(/questions for you/)).toBeNull())
  })
})
