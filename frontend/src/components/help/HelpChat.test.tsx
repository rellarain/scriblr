import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { HELP_TARGETS } from '../../channels/helpTargets'
import { __resetStaffForTests, loadStaff } from '../../feedback/staffStore'
import { chatAction, getStaffChats, loadStaffChats, sendStaffMessage, takeChat } from '../../support/supportStores'
import { feedbackBackend } from '../../test/feedbackBackend'
import HelpTile from './HelpTile'

beforeEach(() => {
  feedbackBackend()
  __resetStaffForTests('hlp-ari')
})

async function startFromDraft() {
  render(<HelpTile target={HELP_TARGETS.writerDraft} fallback="" />)
  fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
  const ask = await screen.findByLabelText('Your question')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start the chat' })).toBeDisabled())
  fireEvent.change(ask, { target: { value: 'My draft will not save.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Start the chat' }))
  await screen.findByText('Waiting for someone to answer…')
}

// The staff side, as the helper acting: takes the chat and does something in it.
async function asHelper(run: (chatId: string) => Promise<unknown>) {
  await act(async () => {
    await loadStaff()
    await loadStaffChats()
    const id = getStaffChats().view.waiting[0]?.id ?? getStaffChats().view.mine[0]?.id
    if (getStaffChats().view.waiting.length) await takeChat(id)
    await run(id)
  })
}

describe('Help tile > Chat', () => {
  it('starts a chat in the console\'s queue, and shows the helper\'s answer', async () => {
    await startFromDraft()
    const log = screen.getByRole('log', { name: 'Conversation' })
    expect(within(log).getByText('My draft will not save.')).toBeInTheDocument()
    await asHelper(id => sendStaffMessage(id, 'Does it say anything?'))
    expect(await within(log).findByText('Does it say anything?')).toBeInTheDocument()
    expect(within(log).getByText('Someone is here to help.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'No, nothing.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send the message' }))
    expect(await within(log).findByText('No, nothing.')).toBeInTheDocument()
  })

  it('opens a guide the helper sends, and sends feedback they drafted as mine', async () => {
    await startFromDraft()
    await asHelper(async id => {
      await chatAction(id, { action: 'resource', nodeId: 'writer/draft/draft' })
      await chatAction(id, { action: 'feedbackInitiated', draft: { channelId: 'writer/draft/draft', verbId: 'verb-fix', text: 'Saving does nothing.', tone: 'unpleasant' } })
    })
    const log = screen.getByRole('log', { name: 'Conversation' })
    expect(await within(log).findByText('Guide: Writer > Draft > Draft')).toBeInTheDocument()
    const draft = await within(log).findByRole('group', { name: 'Feedback drafted for you' })
    fireEvent.click(within(draft).getByRole('button', { name: 'Send this feedback as mine' }))
    expect(await within(draft).findByText('Sent. It is under My feedback.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /My feedback/ }))
    const sent = (await screen.findByText('Saving does nothing.')).closest('article') as HTMLElement
    // It waits in the helper's Outbox to be completed and sent on to the Inbox, so it is received, not checked yet.
    expect(within(sent).getByRole('listitem', { current: 'step' })).toHaveTextContent('Received')
  })

  it('closes the chat, and a new question starts a new one', async () => {
    await startFromDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Close the chat' }))
    expect(await screen.findByLabelText('Your question')).toBeInTheDocument()
  })
})
