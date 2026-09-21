import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import {
  ChevronLeftIcon, ChevronRightIcon, EyeIcon, ExplicatingIcon, ListIcon, PageIcon, ToningIcon, type IconProps,
} from '../../../icons'
import type { Tone } from '../helperTypes'
import type { FeedbackChannel, FeedbackStatement, InboxBundle, MessageView } from './feedbackTypes'
import {
  STAGES, firstUntoned, messageDone, myValidation, orderMessages, stableOrder, stageCounts, stageDone, stageLocked,
  type MessageSort, type Stage,
} from './inboxLogic'
import { ExplicateControl, MessageMeta, MessageText, ToneControl } from './ValidationControls'

// Validation: each admin gives every message a tone and then the subjects it is about with a verb for each
// (that step builds the feedback statements). Two ways to work through the queue, chosen with the Stage | Case
// switch:
//   by stage  one stage at a time (Tone, Explicate), every message listed with only that stage's input
//   by case   one message at a time with both inputs together
// Shortcuts: Tab / Shift+Tab move through the controls (in the case view on to the next and previous case),
// Enter activates the focused control, Shift+Enter jumps to the first control of the next stage (after
// Explicate: the first message still to tone). The queue keeps its order while you work; "hide done" is up to you.

const STAGE_META: Record<Stage, { label: string; Icon: ComponentType<IconProps> }> = {
  tone: { label: 'Tone', Icon: ToningIcon },
  explicate: { label: 'Explicate', Icon: ExplicatingIcon },
}

export type ValidateMode = 'stage' | 'case'

export interface ValidateActions {
  setTone: (messageId: string, tone: Tone) => void
  // Subjects and verbs together (the server takes the subjects first).
  setExplicate: (messageId: string, channels: FeedbackChannel[], statements: FeedbackStatement[]) => void
}

interface Props {
  bundle: InboxBundle
  mode: ValidateMode
  onMode: (mode: ValidateMode) => void
  hideDone: boolean
  onHideDone: (hide: boolean) => void
  actions: ValidateActions
}

// One message's input for one stage.
function StageInput({ stage, view, bundle, actions }: { stage: Stage; view: MessageView; bundle: InboxBundle; actions: ValidateActions }) {
  const mine = myValidation(view)
  const id = view.message.id
  if (stage === 'tone') {
    return <ToneControl mine={mine?.tone ?? null} disabled={!bundle.can.validate} onSet={tone => actions.setTone(id, tone)} />
  }
  return (
    <ExplicateControl
      view={view} verbs={bundle.verbCategories} taxonomy={bundle.taxonomy} mine={mine}
      disabled={!bundle.can.validate} locked={stageLocked(view, 'explicate')}
      onSet={(channels, statements) => actions.setExplicate(id, channels, statements)}
    />
  )
}

function MessageHead({ view, bundle }: { view: MessageView; bundle: InboxBundle }) {
  return (
    <>
      <MessageText view={view} verbs={bundle.verbCategories} />
      <MessageMeta view={view} showLabels={bundle.can.seeTones} />
    </>
  )
}

const firstControl = (root: ParentNode | null, selector = '[data-cf]') =>
  root?.querySelector<HTMLElement>(`${selector}:not(:disabled)`) ?? null

// The queue in its order at the start, kept while you work (finishing a message changes its tone score,
// which must not move it).
function useStableQueue(views: MessageView[], sort: MessageSort): MessageView[] {
  const known = useRef<string[]>([])
  const sortRef = useRef(sort)
  if (sortRef.current !== sort) { sortRef.current = sort; known.current = [] }
  const fresh = orderMessages(views, sort)
  const ordered = known.current.length ? stableOrder(fresh, known.current) : fresh
  known.current = ordered.map(v => v.message.id)
  return ordered
}

// ---- by stage ---------------------------------------------------------------------------

function StageView({ bundle, ordered, hideDone, actions }: { bundle: InboxBundle; ordered: MessageView[]; hideDone: boolean; actions: ValidateActions }) {
  const [stage, setStage] = useState<Stage>('tone')
  const listRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const focusFirst = useRef(false)
  const counts = stageCounts(ordered)
  const shown = hideDone ? ordered.filter(v => !stageDone(v, stage)) : ordered

  useEffect(() => {
    if (!focusFirst.current) return
    focusFirst.current = false
    // Toning starts at the first message this admin has not toned yet; the other stage at its first control.
    const target = stage === 'tone' ? firstControl(listRef.current, '[data-done="false"] [data-cf]') : null
    // A stage with nothing to fill in yet keeps the cursor on its tab, so the next Shift+Enter still moves on.
    ;(target ?? firstControl(listRef.current) ?? navRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]'))?.focus()
  }, [stage])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' || !e.shiftKey) return
    e.preventDefault()
    focusFirst.current = true
    setStage(STAGES[(STAGES.indexOf(stage) + 1) % STAGES.length])
  }

  return (
    <div onKeyDown={onKeyDown}>
      <nav ref={navRef} className="stageTabs" aria-label="Validation stages">
        {STAGES.map(key => {
          const { Icon, label } = STAGE_META[key]
          const { count, total } = counts[key]
          const pct = total ? Math.round(((total - count) / total) * 100) : 0
          return (
            <button
              key={key} type="button" aria-pressed={key === stage} aria-label={`${label}: ${count} of ${total} to do`} title={label}
              className={key === stage ? 'stageTab stageTab--on' : 'stageTab'} onClick={() => setStage(key)}
            >
              <Icon size={18} />
              <span className="stageProgress"><span style={{ width: `${pct}%` }} /></span>
              {count > 0 && <span className="stageCount">{count}</span>}
            </button>
          )
        })}
      </nav>
      <div className="feedbackList" ref={listRef} data-stage={stage}>
        {shown.length === 0 && <p className="feedbackCardMeta">{ordered.length === 0 ? 'No feedback to validate.' : 'All done here.'}</p>}
        {shown.map(view => (
          <div
            key={view.message.id} data-done={stageDone(view, stage)}
            className={stageDone(view, stage) ? 'feedbackCard feedbackCard--done' : 'feedbackCard'}
          >
            <MessageHead view={view} bundle={bundle} />
            <StageInput stage={stage} view={view} bundle={bundle} actions={actions} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- by case ----------------------------------------------------------------------------

function CaseView({ bundle, ordered, hideDone, actions }: { bundle: InboxBundle; ordered: MessageView[]; hideDone: boolean; actions: ValidateActions }) {
  const [currentId, setCurrentId] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pending = useRef<null | { where: 'first' | 'last' | Stage }>(null)

  const queue = hideDone ? ordered.filter(v => !messageDone(v) || v.message.id === currentId) : ordered
  const found = queue.findIndex(v => v.message.id === currentId)
  const index = found === -1 ? 0 : found
  const view = queue[index]
  const unfinished = ordered.filter(v => !messageDone(v)).length

  const go = (i: number, where: 'first' | 'last' | Stage = 'first') => {
    if (i < 0 || i >= queue.length) return
    pending.current = { where }
    setCurrentId(queue[i].message.id)
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
      // The first later stage that has a control (Explicate has none until the message is toned).
      for (const next of STAGES.slice(STAGES.indexOf(stage) + 1)) {
        const el = focusStage(next)
        if (el) { el.focus(); return }
      }
      // Past the last stage: the next case, or after the last one the first case still to tone.
      const to = index + 1 < queue.length ? index + 1 : firstUntoned(queue, 0)
      if (to === -1) return
      if (to === index) focusStage('tone')?.focus()
      else go(to, 'tone')
      return
    }
    if (e.key === 'Tab') {
      const all = [...root.querySelectorAll<HTMLElement>('[data-cf]:not(:disabled)')].filter(el => el.tabIndex >= 0)
      if (!e.shiftKey && active === all[all.length - 1] && index + 1 < queue.length) { e.preventDefault(); go(index + 1, 'first') }
      if (e.shiftKey && active === all[0] && index > 0) { e.preventDefault(); go(index - 1, 'last') }
    }
  }

  if (!view) return <p className="feedbackCardMeta">{ordered.length === 0 ? 'No feedback to validate.' : 'All done.'}</p>
  return (
    <div onKeyDown={onKeyDown}>
      <div className="caseNav">
        <button type="button" className="iconBtn" aria-label="Previous case" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeftIcon size={16} /></button>
        <span className="caseNavLabel">{index + 1} / {queue.length} · {unfinished} to do</span>
        <button type="button" className="iconBtn" aria-label="Next case" disabled={index + 1 >= queue.length} onClick={() => go(index + 1)}><ChevronRightIcon size={16} /></button>
      </div>
      <div className="feedbackCard" ref={bodyRef}>
        <MessageHead view={view} bundle={bundle} />
        {STAGES.map(stage => (
          <section key={stage} className="caseStage" data-stage={stage} aria-label={STAGE_META[stage].label}>
            <h4 className="caseStageTitle">
              {(() => { const { Icon } = STAGE_META[stage]; return <Icon size={14} /> })()} {STAGE_META[stage].label}
              {stageDone(view, stage) && <span className="caseStageDone" aria-label="done"> ✓</span>}
            </h4>
            <StageInput stage={stage} view={view} bundle={bundle} actions={actions} />
          </section>
        ))}
      </div>
    </div>
  )
}

export default function ValidateView({ bundle, mode, onMode, hideDone, onHideDone, actions }: Props) {
  const [sort, setSort] = useState<MessageSort>('tone')
  const ordered = useStableQueue(bundle.messages, bundle.can.seeTones ? sort : 'tone')
  const message = useMemo(() => (bundle.can.validate ? null : 'Validating needs the Processor role on Helper > Inbox.'), [bundle.can.validate])
  return (
    <div className="validateView">
      <div className="validateBar">
        <div className="segSwitch" role="group" aria-label="Validation mode">
          <button type="button" aria-pressed={mode === 'stage'} className={mode === 'stage' ? 'segSwitchBtn segSwitchBtn--on' : 'segSwitchBtn'} onClick={() => onMode('stage')}>
            <ListIcon size={14} /> Stage
          </button>
          <button type="button" aria-pressed={mode === 'case'} className={mode === 'case' ? 'segSwitchBtn segSwitchBtn--on' : 'segSwitchBtn'} onClick={() => onMode('case')}>
            <PageIcon size={14} /> Case
          </button>
        </div>
        <button
          type="button" className={hideDone ? 'iconBtn iconBtn--on' : 'iconBtn'} aria-pressed={hideDone}
          aria-label="Hide done" title={hideDone ? 'Showing what is left; click to show done too' : 'Hide done'} onClick={() => onHideDone(!hideDone)}
        >
          <EyeIcon size={16} />
        </button>
        {bundle.can.seeTones && (
          <select className="sortSelect" aria-label="Sort messages" value={sort} onChange={e => setSort(e.target.value as MessageSort)}>
            <option value="tone">By tone</option>
            <option value="fewest">Fewest validations first</option>
            <option value="most">Most validations first</option>
          </select>
        )}
      </div>
      {message && <p className="feedbackCardMeta">{message}</p>}
      {mode === 'stage'
        ? <StageView bundle={bundle} ordered={ordered} hideDone={hideDone} actions={actions} />
        : <CaseView bundle={bundle} ordered={ordered} hideDone={hideDone} actions={actions} />}
    </div>
  )
}
