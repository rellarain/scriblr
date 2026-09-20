import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, ExplicatingIcon, SortingIcon, ToningIcon, type IconProps } from '../../../icons'
import type { Tone } from '../helperTypes'
import type { FeedbackChannel, FeedbackStatement, InboxBundle, MessageView, ToneBand } from './feedbackTypes'
import { STAGES, firstUntoned, missingValidators, myValidation, orderMessages, stageCounts, stageDone, type Stage } from './inboxLogic'
import { ChannelControl, ExplicateControl, MessageMeta, MessageText, QuorumChip, ToneControl } from './ValidationControls'

// Validation: each admin gives every message a tone, the channels it is about and a verb for
// each. Two ways to work through the queue, chosen with the Stage | Case switch:
//   by stage  one stage at a time (Tone, Channel, Explicate), every message listed with only
//             that stage's input
//   by case   one message at a time with all three inputs together
// Shortcuts: Tab / Shift+Tab move through the controls (in the case view on to the next and
// previous case), Enter activates the focused control, Shift+Enter jumps to the first control of
// the next stage (after Explicate: the first message still to tone).

const STAGE_META: Record<Stage, { label: string; Icon: ComponentType<IconProps> }> = {
  tone: { label: 'Tone', Icon: ToningIcon },
  channel: { label: 'Channel', Icon: SortingIcon },
  explicate: { label: 'Explicate', Icon: ExplicatingIcon },
}

export type ValidateMode = 'stage' | 'case'

export interface ValidateActions {
  setTone: (messageId: string, tone: Tone) => void
  setChannels: (messageId: string, channels: FeedbackChannel[]) => void
  setStatements: (messageId: string, statements: FeedbackStatement[]) => void
}

interface Props {
  bundle: InboxBundle
  adminId: string
  mode: ValidateMode
  onMode: (mode: ValidateMode) => void
  toneOrder: ToneBand[]
  actions: ValidateActions
}

// One message's input for one stage (or all three, in the case view).
function StageInput({ stage, view, bundle, adminId, actions }: {
  stage: Stage; view: MessageView; bundle: InboxBundle; adminId: string; actions: ValidateActions
}) {
  const mine = myValidation(view, adminId)
  const disabled = !bundle.can.validate
  const id = view.message.id
  if (stage === 'tone') return <ToneControl mine={mine?.tone ?? null} disabled={disabled} onSet={tone => actions.setTone(id, tone)} />
  if (stage === 'channel') {
    return <ChannelControl view={view} taxonomy={bundle.taxonomy} mine={mine?.channels ?? []} disabled={disabled} onSet={c => actions.setChannels(id, c)} />
  }
  return <ExplicateControl view={view} verbs={bundle.verbCategories} mine={mine} disabled={disabled} onSet={s => actions.setStatements(id, s)} />
}

function MessageHead({ view, bundle }: { view: MessageView; bundle: InboxBundle }) {
  return (
    <>
      <MessageText view={view} verbs={bundle.verbCategories} />
      <MessageMeta view={view} />
      <QuorumChip view={view} missing={missingValidators(view, bundle.admins)} />
    </>
  )
}

const firstControl = (root: ParentNode | null, selector = '[data-cf]') =>
  root?.querySelector<HTMLElement>(`${selector}:not(:disabled)`) ?? null

// ---- by stage ---------------------------------------------------------------------------

function StageView({ bundle, adminId, ordered, actions }: { bundle: InboxBundle; adminId: string; ordered: MessageView[]; actions: ValidateActions }) {
  const [stage, setStage] = useState<Stage>('tone')
  const listRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const focusFirst = useRef(false)
  const counts = stageCounts(ordered, adminId)

  useEffect(() => {
    if (!focusFirst.current) return
    focusFirst.current = false
    // Toning starts at the first message this admin has not toned yet; the other stages at their first control.
    const target = stage === 'tone' ? firstControl(listRef.current, '[data-done="false"] [data-cf]') : null
    // A stage with nothing to fill in yet (Explicate before any channel) keeps the cursor on its tab,
    // so the next Shift+Enter still moves on.
    ;(target ?? firstControl(listRef.current) ?? navRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]'))?.focus()
  }, [stage])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' || !e.shiftKey) return
    e.preventDefault()
    focusFirst.current = true
    // After Explicate the queue starts over at Tone: the first message this admin has not toned.
    setStage(STAGES[(STAGES.indexOf(stage) + 1) % STAGES.length])
  }

  return (
    <div onKeyDown={onKeyDown}>
      <nav ref={navRef} className="subTabRow subTabRow--expand validateTabs" aria-label="Validation stages">
        {STAGES.map(key => {
          const { Icon, label } = STAGE_META[key]
          const { count, total } = counts[key]
          const pct = total ? Math.round(((total - count) / total) * 100) : 0
          return (
            <button
              key={key} type="button" aria-pressed={key === stage}
              className={key === stage ? 'subTabBtn subTabBtn--active subTabBtn--withCount subTabBtn--expand' : 'subTabBtn subTabBtn--withCount subTabBtn--expand'}
              onClick={() => setStage(key)}
            >
              <span className="subTabBtnMain"><Icon size={16} /> {label}</span>
              <span className="subTabCount"><span className="subTabCountFill" style={{ width: `${pct}%` }} /></span>
              <span className="subTabCountLabel">{count} <span className="subTabCountTotal"><span className="subTabCountSlash">/</span> {total}</span></span>
            </button>
          )
        })}
      </nav>
      <div className="feedbackList" ref={listRef} data-stage={stage}>
        {ordered.length === 0 && <p className="feedbackCardMeta">No feedback to validate.</p>}
        {ordered.map(view => (
          <div
            key={view.message.id} data-done={stageDone(view, adminId, stage)}
            className={stageDone(view, adminId, stage) ? 'feedbackCard' : 'feedbackCard feedbackCard--pending'}
          >
            <MessageHead view={view} bundle={bundle} />
            <StageInput stage={stage} view={view} bundle={bundle} adminId={adminId} actions={actions} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- by case ----------------------------------------------------------------------------

function CaseView({ bundle, adminId, ordered, actions }: { bundle: InboxBundle; adminId: string; ordered: MessageView[]; actions: ValidateActions }) {
  const [currentId, setCurrentId] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pending = useRef<null | { where: 'first' | 'last' | Stage }>(null)

  const found = ordered.findIndex(v => v.message.id === currentId)
  const index = found === -1 ? 0 : found
  const view = ordered[index]
  const unfinished = ordered.filter(v => !STAGES.every(s => stageDone(v, adminId, s))).length

  const go = (i: number, where: 'first' | 'last' | Stage = 'first') => {
    if (i < 0 || i >= ordered.length) return
    pending.current = { where }
    setCurrentId(ordered[i].message.id)
  }

  // After moving to another case (or stage), the cursor goes where the shortcut said.
  useEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    const root = bodyRef.current
    if (!root) return
    if (p.where === 'last') {
      const all = root.querySelectorAll<HTMLElement>('[data-cf]:not(:disabled)')
      all[all.length - 1]?.focus()
    } else if (p.where === 'first') {
      firstControl(root)?.focus()
    } else {
      firstControl(root.querySelector(`[data-stage="${p.where}"]`))?.focus()
    }
  }, [view?.message.id])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const root = bodyRef.current
    if (!root || !view) return
    const active = document.activeElement as HTMLElement | null
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      const stage = (active?.closest('[data-stage]')?.getAttribute('data-stage') ?? null) as Stage | null
      const focusStage = (s: Stage) => firstControl(root.querySelector(`[data-stage="${s}"]`))
      if (stage === null) { focusStage('tone')?.focus(); return }
      // The first later stage that has a control (Explicate has none until a channel is added).
      for (const next of STAGES.slice(STAGES.indexOf(stage) + 1)) {
        const el = focusStage(next)
        if (el) { el.focus(); return }
      }
      // Past Explicate: the next case, or after the last one the first case still to tone.
      const to = index + 1 < ordered.length ? index + 1 : firstUntoned(ordered, adminId, 0)
      if (to === -1) return
      if (to === index) focusStage('tone')?.focus()
      else go(to, 'tone')
      return
    }
    if (e.key === 'Tab') {
      const all = [...root.querySelectorAll<HTMLElement>('[data-cf]:not(:disabled)')].filter(el => el.tabIndex >= 0)
      if (!e.shiftKey && active === all[all.length - 1] && index + 1 < ordered.length) { e.preventDefault(); go(index + 1, 'first') }
      if (e.shiftKey && active === all[0] && index > 0) { e.preventDefault(); go(index - 1, 'last') }
    }
  }

  if (!view) return <p className="feedbackCardMeta">No feedback to validate.</p>
  return (
    <div onKeyDown={onKeyDown}>
      <div className="caseNav">
        <button type="button" className="toneBtn" aria-label="Previous case" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeftIcon size={14} /></button>
        <span className="caseNavLabel">Case {index + 1} of {ordered.length} · {unfinished} unfinished</span>
        <button type="button" className="toneBtn" aria-label="Next case" disabled={index + 1 >= ordered.length} onClick={() => go(index + 1)}><ChevronRightIcon size={14} /></button>
      </div>
      <div className="feedbackCard" ref={bodyRef}>
        <MessageHead view={view} bundle={bundle} />
        {STAGES.map(stage => (
          <section key={stage} className="caseStage" data-stage={stage} aria-label={STAGE_META[stage].label}>
            <h4 className="caseStageTitle">
              {STAGE_META[stage].label}{stageDone(view, adminId, stage) && <span className="caseStageDone"> · done</span>}
            </h4>
            <StageInput stage={stage} view={view} bundle={bundle} adminId={adminId} actions={actions} />
          </section>
        ))}
      </div>
    </div>
  )
}

export default function ValidateView({ bundle, adminId, mode, onMode, toneOrder, actions }: Props) {
  const ordered = useMemo(() => orderMessages(bundle.messages, toneOrder), [bundle.messages, toneOrder])
  return (
    <div className="validateView">
      <div className="segSwitch" role="group" aria-label="Validation mode">
        <button type="button" aria-pressed={mode === 'stage'} className={mode === 'stage' ? 'segSwitchBtn segSwitchBtn--on' : 'segSwitchBtn'} onClick={() => onMode('stage')}>By stage</button>
        <button type="button" aria-pressed={mode === 'case'} className={mode === 'case' ? 'segSwitchBtn segSwitchBtn--on' : 'segSwitchBtn'} onClick={() => onMode('case')}>By case</button>
      </div>
      {!bundle.can.validate && <p className="feedbackCardMeta">Validating feedback needs feedback processing access to Helper &gt; Inbox. You can read but not change it.</p>}
      {mode === 'stage'
        ? <StageView bundle={bundle} adminId={adminId} ordered={ordered} actions={actions} />
        : <CaseView bundle={bundle} adminId={adminId} ordered={ordered} actions={actions} />}
    </div>
  )
}
