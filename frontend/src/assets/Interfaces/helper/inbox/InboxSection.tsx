import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { ExplicatingIcon, GearIcon, VotingIcon, type IconProps } from '../../../icons'
import { feedbackApi } from './feedbackApi'
import { changeFeedback, clearFeedbackError, loadFeedback, setFeedbackAdmin, useFeedback } from './feedbackStore'
import type { FeedbackChannel, FeedbackStatement, ToneBand } from './feedbackTypes'
import { STAGES, TONE_BANDS, needsMyVoteCount, stageDone } from './inboxLogic'
import ProcessView, { type ProcessActions } from './ProcessView'
import SettingsView, { type SettingsActions } from './SettingsView'
import ValidateView, { type ValidateActions, type ValidateMode } from './ValidateView'

type InboxTabKey = 'validate' | 'process' | 'settings'

const TABS: Array<{ key: InboxTabKey; label: string; Icon: ComponentType<IconProps> }> = [
  { key: 'validate', label: 'Validate', Icon: ExplicatingIcon },
  { key: 'process', label: 'Process', Icon: VotingIcon },
  { key: 'settings', label: 'Settings', Icon: GearIcon },
]

// Small per-admin preferences kept in this browser (the mode switch and the tone order).
function readPref<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
function writePref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window */ }
}

// The Inbox Console: feedback messages are validated (tone, channel, verb) by every admin, then
// the statement cases they form are processed (voting, notes, solutions). See ValidateView and
// ProcessView. There is no login yet, so a "Signed in as" selector picks the admin for testing.
function InboxSection() {
  const [tab, setTab] = useState<InboxTabKey>('validate')
  const { bundle, adminId, status, error } = useFeedback()
  const [prefsVersion, setPrefsVersion] = useState(0)

  const modeKey = `scriblr.helper.inbox.mode.${adminId}`
  const orderKey = `scriblr.helper.inbox.toneOrder.${adminId}`
  // `prefsVersion` re-reads the stored values after a change.
  const mode = useMemo(() => readPref<ValidateMode>(modeKey, 'stage'), [modeKey, prefsVersion])
  const toneOrder = useMemo(() => {
    const stored = readPref<ToneBand[]>(orderKey, TONE_BANDS)
    return TONE_BANDS.every(b => stored.includes(b)) && stored.length === TONE_BANDS.length ? stored : TONE_BANDS
  }, [orderKey, prefsVersion])

  const setMode = (next: ValidateMode) => { writePref(modeKey, next); setPrefsVersion(v => v + 1) }
  const moveTone = (band: ToneBand, direction: 'up' | 'down') => {
    const i = toneOrder.indexOf(band)
    const j = direction === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= toneOrder.length) return
    const next = [...toneOrder]
    ;[next[i], next[j]] = [next[j], next[i]]
    writePref(orderKey, next)
    setPrefsVersion(v => v + 1)
  }

  const validate: ValidateActions = {
    setTone: (id, tone) => void changeFeedback(a => feedbackApi.validate(a, id, { tone })),
    setChannels: (id: string, channels: FeedbackChannel[]) => void changeFeedback(a => feedbackApi.validate(a, id, { channels })),
    setStatements: (id: string, statements: FeedbackStatement[]) => void changeFeedback(a => feedbackApi.validate(a, id, { statements })),
  }
  const process: ProcessActions = {
    voteCase: (caseId, vote) => void changeFeedback(a => feedbackApi.voteCase(a, caseId, vote)),
    voteSolution: (caseId, solutionId, vote) => void changeFeedback(a => feedbackApi.voteSolution(a, caseId, solutionId, vote)),
    propose: (caseId, solution) => changeFeedback(a => feedbackApi.propose(a, caseId, solution)),
    close: (caseId, outcome, note) => changeFeedback(a => feedbackApi.close(a, caseId, outcome, note)),
    reopen: caseId => void changeFeedback(a => feedbackApi.reopen(a, caseId)),
  }
  const settings: SettingsActions = {
    addVerb: (name, keywords) => changeFeedback(a => feedbackApi.addVerb(a, name, keywords)),
    updateVerb: (id, patch) => changeFeedback(a => feedbackApi.updateVerb(a, id, patch)),
    deleteVerb: id => changeFeedback(a => feedbackApi.deleteVerb(a, id)),
  }

  if (!bundle) {
    return (
      <div className="inboxSection">
        <div className="sectionBody">
          {status === 'error'
            ? <p className="inboxError" role="alert">{error} <button type="button" className="toneBtn" onClick={() => void loadFeedback()}>Retry</button></p>
            : <p className="feedbackCardMeta">Loading the inbox…</p>}
        </div>
      </div>
    )
  }

  const needsVote = needsMyVoteCount(bundle.cases, adminId)
  const unfinished = bundle.messages.filter(v => !STAGES.every(s => stageDone(v, adminId, s))).length
  const counts: Record<InboxTabKey, number> = { validate: unfinished, process: needsVote, settings: 0 }

  return (
    <div className="inboxSection">
      <div className="inboxWho">
        <label>
          Signed in as{' '}
          <select value={adminId} onChange={e => setFeedbackAdmin(e.target.value)} aria-label="Signed in as">
            {bundle.admins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      <nav className="subTabRow subTabRow--expand" aria-label="Inbox sections">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key} type="button" aria-pressed={key === tab}
            className={key === tab ? 'subTabBtn subTabBtn--active subTabBtn--expand' : 'subTabBtn subTabBtn--expand'}
            onClick={() => setTab(key)}
          >
            <span className="subTabBtnMain"><Icon size={16} /> {label}</span>
            {counts[key] > 0 && (
              <span className="inboxCount" aria-label={key === 'process' ? `${counts[key]} need your vote` : `${counts[key]} unfinished`}>{counts[key]}</span>
            )}
          </button>
        ))}
      </nav>
      {error && (
        <p className="inboxError" role="alert">
          {error} <button type="button" className="inboxErrorClose" aria-label="Dismiss" onClick={clearFeedbackError}>×</button>
        </p>
      )}
      <div className="sectionBody">
        {tab === 'validate' && <ValidateView bundle={bundle} adminId={adminId} mode={mode} onMode={setMode} toneOrder={toneOrder} actions={validate} />}
        {tab === 'process' && <ProcessView bundle={bundle} adminId={adminId} actions={process} />}
        {tab === 'settings' && <SettingsView bundle={bundle} toneOrder={toneOrder} onMoveTone={moveTone} actions={settings} />}
      </div>
    </div>
  )
}

export default InboxSection
