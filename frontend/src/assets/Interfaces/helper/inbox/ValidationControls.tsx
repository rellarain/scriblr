import { useState } from 'react'
import type { Tone } from '../helperTypes'
import { CloseIcon, FrownIcon, NeutralFaceIcon, ToningIcon } from '../../../icons'
import type {
  AdminValidation, FeedbackChannel, FeedbackStatement, MessageView, TaxonomyPage, VerbCategory,
} from './feedbackTypes'
import { ToneStatusIcon, combineTone, isPleasant, isUnpleasant } from './inboxHelpers'
import { BAND_LABEL, channelLabel, sameChannel, segmentText, toneScoreLabel } from './inboxLogic'

// The three inputs of validation (tone, channel, verb) and the message text with its
// keyword highlights. Every interactive element carries `data-cf` so the case view's
// keyboard shortcuts can move between them.

// A feedback message with the words that could indicate an intention verb marked.
export function MessageText({ view, verbs }: { view: MessageView; verbs: VerbCategory[] }) {
  const name = (id: string) => verbs.find(v => v.id === id)?.name ?? id
  return (
    <p className="feedbackCardText">
      &ldquo;
      {segmentText(view.message.text, view.flags).map((seg, i) => seg.flag
        ? <mark key={i} className="kwMark" title={`Could mean: ${name(seg.flag.categoryId)}`}>{seg.text}</mark>
        : <span key={i}>{seg.text}</span>)}
      &rdquo;
    </p>
  )
}

export function MessageMeta({ view }: { view: MessageView }) {
  const { message, tone } = view
  return (
    <p className="feedbackCardMeta">
      {message.author} · {message.submittedAt} · sender: <ToneStatusIcon tone={message.senderTone ?? undefined} size={12} /> {message.senderTone ?? 'unspecified'}
      <span className={`toneBand toneBand--${tone.band}`} title={`Score ${toneScoreLabel(tone)} over every response, the sender's included`}>
        {BAND_LABEL[tone.band]} · {toneScoreLabel(tone)}
      </span>
    </p>
  )
}

// "Validated by 1 of 3": how far the message is from joining its statement cases.
export function QuorumChip({ view, missing }: { view: MessageView; missing: string[] }) {
  const { complete, required, atQuorum } = view.reconciled
  return (
    <span className={atQuorum ? 'quorumChip quorumChip--met' : 'quorumChip'} title={missing.length ? `Still to validate: ${missing.join(', ')}` : 'Every admin has validated this'}>
      Validated by {complete} of {required}
    </span>
  )
}

export function ToneControl({ mine, disabled, onSet }: { mine: Tone | null; disabled: boolean; onSet: (tone: Tone) => void }) {
  const tone = mine ?? undefined
  const pleasant = isPleasant(tone)
  const unpleasant = isUnpleasant(tone)
  return (
    <div className="toneRow" role="group" aria-label="Your tone">
      <button
        type="button" data-cf disabled={disabled} aria-pressed={pleasant}
        className={pleasant ? 'toneBtn toneBtn--active' : 'toneBtn'}
        onClick={() => onSet(combineTone(!pleasant, unpleasant))}
      >
        <ToningIcon size={14} /> Pleasant
      </button>
      <button
        type="button" data-cf disabled={disabled} aria-pressed={unpleasant}
        className={unpleasant ? 'toneBtn toneBtn--active' : 'toneBtn'}
        onClick={() => onSet(combineTone(pleasant, !unpleasant))}
      >
        <FrownIcon size={14} /> Unpleasant
      </button>
      <button
        type="button" data-cf disabled={disabled} aria-pressed={mine === 'neutral'}
        className={mine === 'neutral' ? 'toneBtn toneBtn--active' : 'toneBtn'}
        onClick={() => onSet('neutral')}
      >
        <NeutralFaceIcon size={14} /> Neutral
      </button>
    </div>
  )
}

// The page > console > component > feature picker and the channels chosen so far.
export function ChannelControl({ view, taxonomy, mine, disabled, onSet }: {
  view: MessageView
  taxonomy: TaxonomyPage[]
  mine: FeedbackChannel[]
  disabled: boolean
  onSet: (channels: FeedbackChannel[]) => void
}) {
  // Where the sender was when they wrote the message is the starting point.
  const { openPage, openConsole, selectedComponent } = view.message
  const startPage = taxonomy.find(p => p.name === openPage)
  const startConsole = startPage?.consoles.find(c => c.name === openConsole)
  const startComponent = startConsole?.components.find(c => c.name === selectedComponent)
  const [page, setPage] = useState(startPage?.name ?? '')
  const [consoleName, setConsole] = useState(startConsole?.name ?? '')
  const [component, setComponent] = useState(startComponent?.name ?? '')
  const [feature, setFeature] = useState('')

  const pageDef = taxonomy.find(p => p.name === page)
  const consoleDef = pageDef?.consoles.find(c => c.name === consoleName)
  const componentDef = consoleDef?.components.find(c => c.name === component)

  function add() {
    if (!page || !consoleName || !component || !feature) return
    const next: FeedbackChannel = { page, console: consoleName, component, feature }
    if (!mine.some(c => sameChannel(c, next))) onSet([...mine, next])
    setFeature('')
  }

  const select = (label: string, value: string, options: string[], on: (v: string) => void, off: boolean) => (
    <select aria-label={label} data-cf value={value} disabled={disabled || off} onChange={e => on(e.target.value)}>
      <option value="">{label}…</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div>
      <div className="channelPillRow">
        {mine.length === 0 && <span className="feedbackCardMeta">No channel yet</span>}
        {mine.map(tag => (
          <span key={channelLabel(tag)} className="channelPill">
            {channelLabel(tag)}
            <button
              type="button" className="channelPillRemove" data-cf disabled={disabled} aria-label={`Remove ${channelLabel(tag)}`}
              onClick={() => onSet(mine.filter(c => !sameChannel(c, tag)))}
            >
              <CloseIcon size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="channelAddForm channelAddForm--four">
        {select('Page', page, taxonomy.map(p => p.name), v => { setPage(v); setConsole(''); setComponent(''); setFeature('') }, false)}
        {select('Console', consoleName, pageDef?.consoles.map(c => c.name) ?? [], v => { setConsole(v); setComponent(''); setFeature('') }, !pageDef)}
        {select('Component', component, consoleDef?.components.map(c => c.name) ?? [], v => { setComponent(v); setFeature('') }, !consoleDef)}
        {select('Feature', feature, componentDef?.features ?? [], setFeature, !componentDef)}
        <button type="button" className="toneBtn" data-cf disabled={disabled || !feature} onClick={add}>Add</button>
      </div>
    </div>
  )
}

// A verb (a managed category) for each channel chosen, with the categories the message's
// keywords suggest.
export function ExplicateControl({ view, verbs, mine, disabled, onSet }: {
  view: MessageView
  verbs: VerbCategory[]
  mine: AdminValidation | undefined
  disabled: boolean
  onSet: (statements: FeedbackStatement[]) => void
}) {
  const channels = mine?.channels ?? []
  const statements = mine?.statements ?? []
  const suggested = [...new Set(view.flags.map(f => f.categoryId))]
  const name = (id: string) => verbs.find(v => v.id === id)?.name ?? id
  const has = (c: FeedbackChannel, verbId: string) => statements.some(s => s.verbId === verbId && sameChannel(s.channel, c))
  const add = (channel: FeedbackChannel, verbId: string) => { if (verbId && !has(channel, verbId)) onSet([...statements, { channel, verbId }]) }

  if (channels.length === 0) return <span className="feedbackCardMeta">Add a channel first, then choose what should happen there.</span>
  return (
    <div className="explicateList">
      {channels.map(channel => {
        const mineHere = statements.filter(s => sameChannel(s.channel, channel))
        const offered = suggested.filter(id => !has(channel, id) && verbs.some(v => v.id === id))
        return (
          <div key={channelLabel(channel)} className="explicateChannel">
            <span className="channelPill">{channelLabel(channel)}</span>
            <div className="channelPillRow">
              {mineHere.length === 0 && <span className="feedbackCardMeta">No verb yet</span>}
              {mineHere.map(s => (
                <span key={s.verbId} className="channelPill channelPill--verb">
                  {name(s.verbId)}
                  <button
                    type="button" className="channelPillRemove" data-cf disabled={disabled} aria-label={`Remove ${name(s.verbId)} from ${channelLabel(channel)}`}
                    onClick={() => onSet(statements.filter(x => x !== s))}
                  >
                    <CloseIcon size={10} />
                  </button>
                </span>
              ))}
              {offered.map(id => (
                <button key={id} type="button" className="channelPill channelPill--suggest" data-cf disabled={disabled} title="Suggested by a keyword in the message" onClick={() => add(channel, id)}>
                  + {name(id)}
                </button>
              ))}
            </div>
            <select
              aria-label={`Add a verb to ${channelLabel(channel)}`} data-cf disabled={disabled} value=""
              onChange={e => add(channel, e.target.value)}
            >
              <option value="">Add a verb…</option>
              {verbs.filter(v => !has(channel, v.id)).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )
      })}
    </div>
  )
}
