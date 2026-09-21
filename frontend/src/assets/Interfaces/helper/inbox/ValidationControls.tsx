import type { ComponentType } from 'react'
import type { Tone } from '../helperTypes'
import { CloseIcon, FrownIcon, LockIcon, MixedFaceIcon, NeutralFaceIcon, ToningIcon, type IconProps } from '../../../icons'
import type {
  AdminValidation, FeedbackChannel, FeedbackStatement, MessageView, TaxonomyPage, ToneCategory, ToneSummary, VerbCategory,
} from './feedbackTypes'
import { CATEGORY_LABEL, channelAncestors, sameChannel, segmentText } from './inboxLogic'
import { SubjectField } from './SubjectField'

// The two inputs of validation (tone, then subjects and verbs), the tone displays, and the message text with
// its keyword highlights. Every interactive element carries `data-cf` so the case view's keyboard shortcuts
// can move between them. Colours: pleasant / yes = the admin accent, unpleasant / no = the accent, neutral /
// pass = the theme (see the .inboxSection rules in App.scss).

const TONE_ICON: Record<Tone, ComponentType<IconProps>> = {
  pleasant: ToningIcon, unpleasant: FrownIcon, mixed: MixedFaceIcon, neutral: NeutralFaceIcon,
}
const TONE_NAME: Record<Tone, string> = { pleasant: 'Pleasant', unpleasant: 'Unpleasant', mixed: 'Mixed', neutral: 'Neutral' }
const TONES: Tone[] = ['pleasant', 'unpleasant', 'mixed', 'neutral']

export function ToneFace({ tone, size = 14 }: { tone: Tone; size?: number }) {
  const Icon = TONE_ICON[tone]
  return <span className={`toneFaceIcon toneFaceIcon--${tone}`} title={TONE_NAME[tone]}><Icon size={size} /></span>
}

// A small square in the colour of a tone category (mixed is half admin accent, half accent).
export function ToneSwatch({ category }: { category: ToneCategory | null }) {
  if (!category) return <span className="toneSwatch toneSwatch--none" title="No tone yet" />
  return <span className={`toneSwatch toneSwatch--${category}`} title={CATEGORY_LABEL[category]} aria-label={CATEGORY_LABEL[category]} />
}

// The score as a bar: pleasant votes, unpleasant votes and neutral validators, and the category next to it.
export function ToneBar({ summary }: { summary: ToneSummary }) {
  const total = summary.pleasant + summary.unpleasant + summary.neutral
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`
  const label = summary.category
    ? `${CATEGORY_LABEL[summary.category]}: ${summary.pleasant} pleasant, ${summary.unpleasant} unpleasant, ${summary.neutral} neutral`
    : 'No tone yet'
  return (
    <span className="toneScore" title={label}>
      <ToneSwatch category={summary.category} />
      <span className="toneBar" role="img" aria-label={label}>
        <i className="toneBar-yes" style={{ width: pct(summary.pleasant) }} />
        <i className="toneBar-no" style={{ width: pct(summary.unpleasant) }} />
        <i className="toneBar-mid" style={{ width: pct(summary.neutral) }} />
      </span>
    </span>
  )
}

// A feedback message with the words that could indicate an intention verb marked.
export function MessageText({ view, verbs }: { view: MessageView; verbs: VerbCategory[] }) {
  const name = (id: string) => verbs.find(v => v.id === id)?.name ?? id
  return (
    <p className="feedbackCardText">
      {segmentText(view.message.text, view.flags).map((seg, i) => seg.flag
        ? <mark key={i} className="kwMark" title={`Could mean: ${name(seg.flag.categoryId)}`}>{seg.text}</mark>
        : <span key={i}>{seg.text}</span>)}
    </p>
  )
}

// The date, the sender's own tone (shown, not counted), the score, and how many validators have finished.
// Configurers also see each other validator's label.
export function MessageMeta({ view, showLabels }: { view: MessageView; showLabels: boolean }) {
  const others = view.validations.filter(v => !v.mine && v.tone)
  return (
    <div className="messageMeta">
      <span className="feedbackCardMeta">{view.message.submittedAt}</span>
      {view.message.senderTone && <span className="senderTone" title={`The sender said ${view.message.senderTone}`}><ToneFace tone={view.message.senderTone} size={12} /></span>}
      <ToneBar summary={view.tone} />
      <span className="validatorCount" title={`${view.validationCount} validator${view.validationCount === 1 ? '' : 's'} finished`}>{view.validationCount}</span>
      {showLabels && others.length > 0 && (
        <span className="otherTones" title="Other validators' tone labels">
          {others.map((v, i) => <ToneFace key={i} tone={v.tone as Tone} size={12} />)}
        </span>
      )}
    </div>
  )
}

// Four faces, no words: pleasant, unpleasant, mixed (one of each) and neutral.
export function ToneControl({ mine, disabled, onSet }: { mine: Tone | null; disabled: boolean; onSet: (tone: Tone) => void }) {
  return (
    <div className="toneRow toneRow--faces" role="group" aria-label="Your tone">
      {TONES.map(tone => {
        const Icon = TONE_ICON[tone]
        return (
          <button
            key={tone} type="button" data-cf disabled={disabled} aria-pressed={mine === tone}
            aria-label={TONE_NAME[tone]} title={TONE_NAME[tone]}
            className={`toneFace toneFace--${tone}${mine === tone ? ' toneFace--on' : ''}`}
            onClick={() => onSet(tone)}
          >
            <Icon size={20} />
          </button>
        )
      })}
    </div>
  )
}

// Subjects and verbs, the step that builds the feedback statements: every subject any validator chose with the
// verbs chosen for it (most common first, each with how many validators chose it), a chip per verb that adds or
// removes yours, the categories the message's keywords suggest, and the subject field for adding another one.
export function ExplicateControl({ view, verbs, taxonomy, mine, disabled, locked, onSet }: {
  view: MessageView
  verbs: VerbCategory[]
  taxonomy: TaxonomyPage[]
  mine: AdminValidation | undefined
  disabled: boolean
  // Tone comes first.
  locked: boolean
  onSet: (channels: FeedbackChannel[], statements: FeedbackStatement[]) => void
}) {
  const myChannels = mine?.channels ?? []
  const myStatements = mine?.statements ?? []
  const name = (id: string) => verbs.find(v => v.id === id)?.name ?? id
  const suggested = [...new Set(view.flags.map(f => f.categoryId))].filter(id => verbs.some(v => v.id === id))
  const has = (c: FeedbackChannel, verbId: string) => myStatements.some(s => s.verbId === verbId && sameChannel(s.channel, c))
  const off = disabled || locked

  function toggle(channel: FeedbackChannel, verbId: string) {
    if (has(channel, verbId)) { onSet(myChannels, myStatements.filter(s => !(s.verbId === verbId && sameChannel(s.channel, channel)))); return }
    const channels = myChannels.some(c => sameChannel(c, channel)) ? myChannels : [...myChannels, channel]
    onSet(channels, [...myStatements, { channel, verbId }])
  }

  const rows = view.selections

  return (
    <div className="explicateList">
      {locked && <span className="lockHint" title="Tone this message first"><LockIcon size={14} /></span>}
      {rows.map(sel => {
        const isMine = myChannels.some(c => sameChannel(c, sel.channel))
        const shown = [...sel.verbs.map(v => ({ id: v.verbId, count: v.chosenBy })),
          ...suggested.filter(id => !sel.verbs.some(v => v.verbId === id)).map(id => ({ id, count: 0 }))]
        return (
          <div key={sel.channel.page + sel.channel.console + sel.channel.component + sel.channel.feature} className={isMine ? 'subjectRow subjectRow--mine' : 'subjectRow'}>
            <div className="subjectAncestors">{channelAncestors(sel.channel).join(' / ')}</div>
            <div className="subjectMain">
              <span className="subjectFeature">{sel.channel.feature}</span>
              <span className="subjectCount" title={`${sel.chosenBy} validator${sel.chosenBy === 1 ? '' : 's'} chose this subject`}>{sel.chosenBy}</span>
              {isMine && (
                <button
                  type="button" className="subjectRemove" data-cf disabled={off} aria-label={`Remove ${sel.channel.feature}`} title="Remove this subject"
                  onClick={() => onSet(myChannels.filter(c => !sameChannel(c, sel.channel)), myStatements.filter(s => !sameChannel(s.channel, sel.channel)))}
                >
                  <CloseIcon size={10} />
                </button>
              )}
            </div>
            <div className="verbChips">
              {shown.map(v => (
                <button
                  key={v.id} type="button" data-cf disabled={off} aria-pressed={has(sel.channel, v.id)}
                  className={`verbChip${has(sel.channel, v.id) ? ' verbChip--mine' : ''}${v.count === 0 ? ' verbChip--suggest' : ''}`}
                  title={v.count === 0 ? 'Suggested by a keyword in the message' : `${v.count} validator${v.count === 1 ? '' : 's'} chose ${name(v.id)}`}
                  onClick={() => toggle(sel.channel, v.id)}
                >
                  {name(v.id)}{v.count > 0 && <span className="verbCount">{v.count}</span>}
                </button>
              ))}
              <select
                className="verbPicker" data-cf disabled={off} value="" aria-label={`Add a verb to ${sel.channel.feature}`}
                onChange={e => { if (e.target.value) toggle(sel.channel, e.target.value) }}
              >
                <option value="">+</option>
                {verbs.filter(v => !shown.some(s => s.id === v.id)).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>
        )
      })}
      <SubjectField
        taxonomy={taxonomy} disabled={off}
        start={{ page: view.message.openPage, console: view.message.openConsole, component: view.message.selectedComponent }}
        onAdd={channel => { if (!myChannels.some(c => sameChannel(c, channel))) onSet([...myChannels, channel], myStatements) }}
      />
    </div>
  )
}
