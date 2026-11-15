import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setChannels } from '../../../channels/channelStore'
import { createMockChannels } from '../../../designSystem/mockChannels'
import { __resetStaffForTests, loadStaff } from '../../../feedback/staffStore'
import type { ResourceNode } from '../../../api/types'
import { getStaffChats, startChat, useUserChats } from '../../../support/supportStores'
import { feedbackBackend } from '../../../test/feedbackBackend'
import ChatsSection from './ChatsSection'
import { useHelperChats } from './useHelperChats'

beforeEach(async () => {
  feedbackBackend()
  __resetStaffForTests('hlp-ari')
  setChannels((createMockChannels().channels().body as { nodes: ResourceNode[] }).nodes)
  await act(async () => { await loadStaff(); await startChat('writer/draft/draft', 'Pasting freezes the editor.') })
})

// The sidebar's New chat and chat heads, and the Conversation tile, as HUI and the sidebar put them together.
function Harness() {
  const helper = useHelperChats()
  return (
    <div>
      <button type="button" onClick={() => helper.createConversation()}>New chat</button>
      <span data-testid="heads">{helper.conversations.map(c => c.label).join(',')}</span>
      <span data-testid="waiting">{helper.profiles.filter(p => p.status === 'Waiting').length}</span>
      {helper.selectedChatId && <ChatsSection helper={helper} />}
    </div>
  )
}

function Writer() {
  const { view } = useUserChats()
  return <ul aria-label="Writer's view">{view.chats[0]?.events.map(e => <li key={e.id}>{e.kind}:{e.text}</li>)}</ul>
}

describe('Helper > Conversation', () => {
  it('takes the next chat waiting and answers it, which the writer sees', async () => {
    render(<><Harness /><Writer /></>)
    await waitFor(() => expect(screen.getByTestId('waiting')).toHaveTextContent('1'))
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    const chat = await screen.findByRole('region', { name: /Chat with Jordan Ellis/ }).catch(() => screen.findByLabelText(/Chat with/))
    expect(screen.getByTestId('heads')).toHaveTextContent('Jordan Ellis')
    expect(within(chat).getByText('Pasting freezes the editor.')).toBeInTheDocument()
    fireEvent.change(within(chat).getByLabelText('Your response'), { target: { value: 'How long is the text?' } })
    fireEvent.click(within(chat).getByRole('button', { name: 'Send the response' }))
    expect(await within(screen.getByRole('list', { name: "Writer's view" })).findByText('helperMessage:How long is the text?')).toBeInTheDocument()
  })

  it('sets the stage, sends a guide and transfers the chat to another queue', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getByTestId('waiting')).toHaveTextContent('1'))
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    const chat = await screen.findByLabelText(/Chat with/)
    await waitFor(() => expect(getStaffChats().view.mine).toHaveLength(1))
    fireEvent.change(within(chat).getByLabelText('Stage'), { target: { value: 'issue' } })
    await waitFor(() => expect(getStaffChats().view.mine[0].stage).toBe('issue'))
    fireEvent.click(within(chat).getByRole('tab', { name: 'Guide' }))
    fireEvent.click(within(chat).getByRole('button', { name: 'Send the guide' }))
    expect(await within(chat).findByText('Guide sent: Writer > Draft > Draft')).toBeInTheDocument()
    fireEvent.change(within(chat).getByLabelText('Transfer to'), { target: { value: 'reader/library' } })
    fireEvent.click(within(chat).getByRole('button', { name: 'Transfer' }))
    // Back to waiting, in the Reader > Library queue: no longer this helper's chat.
    await waitFor(() => expect(getStaffChats().view.waiting[0]?.queue).toBe('reader/library'))
    await waitFor(() => expect(screen.queryByLabelText(/Chat with/)).toBeNull())
  })

  it('drafts feedback for the writer to confirm', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getByTestId('waiting')).toHaveTextContent('1'))
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    const chat = await screen.findByLabelText(/Chat with/)
    fireEvent.click(within(chat).getByRole('tab', { name: 'Feedback' }))
    const form = within(chat).getByRole('form', { name: 'Draft feedback' })
    await waitFor(() => expect(within(form).getByRole('button', { name: 'Fix' })).toBeInTheDocument())
    fireEvent.click(within(form).getByRole('button', { name: 'Fix' }))
    fireEvent.change(within(form).getByLabelText('The feedback'), { target: { value: 'Pasting freezes.' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Draft it for the writer to confirm' }))
    expect(await within(chat).findByText('Feedback drafted: Writer > Draft > Draft')).toBeInTheDocument()
  })
})
