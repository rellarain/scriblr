import { useState, type ReactNode } from 'react'
import { useChannels } from '../../../../channels/channelStore'
import { childrenOf, labelOf } from '../../../../channels/channelTree'
import ChannelPicker from '../../../../feedback/ChannelPicker'
import { staffFeedbackApi } from '../../../../feedback/feedbackApi'
import { inVoting, scopeOf, votesWaiting } from '../../../../feedback/feedbackLogic'
import type { MessageActions } from '../../../../feedback/MessageCard'
import StatementCard from '../../../../feedback/StatementCard'
import { TonePicker } from '../../../../feedback/ToneFaces'
import VoteControl from '../../../../feedback/VoteControl'
import type { StaffBundle, Statement } from '../../../../feedback/feedbackTypes'
import { changeStaff, clearStaffError, loadStaff, useStaff } from '../../../../feedback/staffStore'
import '../../../../feedback/feedback.scss'

// Admin > Office > Voting and Channel Management: the statements in voting (checked feedback, lumped by subject and verb), for
// one console or all of them. Voting gives a yes, no or pass with a note (advice for the Project Plan's planner). Channel
// Management corrects each message's subject, verb and tone (a message moved leaves its statement for another one), and asks the
// writer a question or leaves staff a comment. Both act as the owner, who holds every role (universal access).

const messageActions: MessageActions = {
  ask: (id, text) => changeStaff(a => staffFeedbackApi.ask(a, id, text)),
  comment: (id, text) => changeStaff(a => staffFeedbackApi.comment(a, id, text)),
}

function Frame({ label, children, count }: { label: string; count?: number; children: (bundle: StaffBundle, under: string | null) => ReactNode }) {
  const { bundle, status, error } = useStaff()
  const { index } = useChannels()
  const [under, setUnder] = useState<string | null>(null)
  const scopes = childrenOf(index, null).flatMap(i => [i, ...childrenOf(index, i.id)])

  if (!bundle) {
    return (
      <div className="fbPage fbScope">
        {status === 'error'
          ? <p className="fbError" role="alert">{error} <button type="button" className="fbIconBtn" onClick={() => void loadStaff()}>Retry</button></p>
          : <p className="fbMuted">Loading…</p>}
      </div>
    )
  }

  return (
    <div className="fbPage fbScope" aria-label={label}>
      <div className="fbBar">
        <select className="fbSelect" aria-label="Show statements about" value={under ?? ''} onChange={e => setUnder(e.target.value || null)}>
          <option value="">Every console</option>
          {scopes.map(n => <option key={n.id} value={n.id}>{n.kind === 'interface' ? `${n.name} (all)` : labelOf(index, n.id)}</option>)}
        </select>
        {count !== undefined && count > 0 && <span className="fbBadge" title="Waiting for your vote">{count} to vote on</span>}
      </div>
      {error && (
        <p className="fbError" role="alert">
          {error} <button type="button" className="fbIconBtn" aria-label="Dismiss" title="Dismiss" onClick={clearStaffError}>×</button>
        </p>
      )}
      {children(bundle, under)}
    </div>
  )
}

function Empty({ list }: { list: Statement[] }) {
  return list.length === 0 ? <p className="fbMuted">Nothing in voting.</p> : null
}

export function VotingPage() {
  const { bundle } = useStaff()
  const { index } = useChannels()
  return (
    <Frame label="Voting" count={bundle ? votesWaiting(bundle) : undefined}>
      {(b, under) => {
        const list = inVoting(b, under)
        return (
          <div className="fbList">
            <Empty list={list} />
            {list.map(s => {
              const title = `${s.verbName} ${labelOf(index, s.channelId)}`
              return (
                <StatementCard key={s.id} statement={s} bundle={b} actions={messageActions}>
                  <VoteControl
                    vote={s.votes.find(v => v.mine)} label={title} disabled={!s.can.vote}
                    disabledReason={`Voting needs the Voter role on ${labelOf(index, scopeOf(s.channelId))}.`}
                    onChange={vote => void changeStaff(a => staffFeedbackApi.vote(a, s.id, vote))}
                  />
                </StatementCard>
              )
            })}
          </div>
        )
      }}
    </Frame>
  )
}

export function ChannelManagementPage() {
  return (
    <Frame label="Channel Management">
      {(b, under) => {
        const list = inVoting(b, under)
        return (
          <div className="fbList">
            <Empty list={list} />
            {list.map(s => (
              <StatementCard
                key={s.id} statement={s} bundle={b} actions={messageActions}
                messageControls={m => {
                  const disabled = !s.can.correct
                  const edit = (patch: Parameters<typeof staffFeedbackApi.edit>[2]) => void changeStaff(a => staffFeedbackApi.edit(a, m.id, patch))
                  return (
                    <div className="fbControls">
                      <span className="fbLabel">About</span>
                      <ChannelPicker value={m.channelId} disabled={disabled} label={`What feedback ${m.id} is about`} onChange={id => edit({ channelId: id })} />
                      <span className="fbLabel">Verb</span>
                      <select
                        className="fbSelect" value={m.verbId} disabled={disabled} aria-label={`What should happen, feedback ${m.id}`}
                        onChange={e => edit({ verbId: e.target.value })}
                      >
                        {b.verbCategories.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <span className="fbLabel">Tone</span>
                      <TonePicker value={m.tone} disabled={disabled} label={`Tone of feedback ${m.id}`} onChange={tone => { if (tone) edit({ tone }) }} />
                    </div>
                  )
                }}
              />
            ))}
          </div>
        )
      }}
    </Frame>
  )
}
