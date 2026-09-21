import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { CheckboxIcon, GearIcon, VotingIcon, type IconProps } from '../../../icons'
import { feedbackApi } from './feedbackApi'
import { changeFeedback, clearFeedbackError, loadFeedback, setFeedbackAdmin, useFeedback } from './feedbackStore'
import { initials, messageDone, needsMyVoteCount } from './inboxLogic'
import ConfigurationView, { type ConfigurationActions } from './ConfigurationView'
import ProcessView, { type ProcessActions } from './ProcessView'
import ValidateView, { type ValidateActions, type ValidateMode } from './ValidateView'

type InboxTabKey = 'validate' | 'process' | 'configuration'

const TABS: Array<{ key: InboxTabKey; label: string; Icon: ComponentType<IconProps> }> = [
  { key: 'validate', label: 'Validate', Icon: CheckboxIcon },
  { key: 'process', label: 'Process', Icon: VotingIcon },
  { key: 'configuration', label: 'Configuration', Icon: GearIcon },
]

// Small per-admin preferences kept in this browser (the Stage | Case switch and hide done).
function readPref<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
function writePref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window */ }
}

// The sign-in chip: there is no login yet, so this initials chip opens a menu that picks the admin (for testing).
function SignInChip({ admins, current, onPick }: { admins: Array<{ id: string; name: string }>; current: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const me = admins.find(a => a.id === current)
  return (
    <div className="signIn" ref={box}>
      <button type="button" className="signInChip" aria-haspopup="menu" aria-expanded={open} aria-label="Signed in as" title="Signed in as (testing)" onClick={() => setOpen(o => !o)}>
        {me ? initials(me.name) : '?'}
      </button>
      {open && (
        <ul className="signInMenu" role="menu">
          {admins.map(a => (
            <li key={a.id} role="none">
              <button type="button" role="menuitemradio" aria-checked={a.id === current} className={a.id === current ? 'signInItem signInItem--on' : 'signInItem'}
                onClick={() => { setOpen(false); onPick(a.id) }}>
                <span className="signInChip signInChip--small">{initials(a.name)}</span>{a.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The Inbox Console: feedback messages are validated (tone, then subjects and verbs) by every admin, then the
// statement cases they form are processed (voting, notes, solutions). Icon tabs with alert-coloured counts.
// See ValidateView and ProcessView. There is no login yet, so the initials chip picks the admin for testing.
function InboxSection() {
  const [tab, setTab] = useState<InboxTabKey>('validate')
  const { bundle, adminId, status, error } = useFeedback()
  const [prefs, setPrefs] = useState(0)

  const modeKey = `scriblr.helper.inbox.mode.${adminId}`
  const hideKey = `scriblr.helper.inbox.hideDone.${adminId}`
  // `prefs` re-reads the stored values after a change.
  void prefs
  const mode = readPref<ValidateMode>(modeKey, 'stage')
  const hideDone = readPref<boolean>(hideKey, false)
  const setMode = (next: ValidateMode) => { writePref(modeKey, next); setPrefs(v => v + 1) }
  const setHideDone = (next: boolean) => { writePref(hideKey, next); setPrefs(v => v + 1) }

  const validate: ValidateActions = {
    setTone: (id, tone) => void changeFeedback(a => feedbackApi.validate(a, id, { tone })),
    setExplicate: (id, channels, statements) => void changeFeedback(a => feedbackApi.validate(a, id, { channels, statements })),
  }
  const process: ProcessActions = {
    voteCase: (caseId, vote) => void changeFeedback(a => feedbackApi.voteCase(a, caseId, vote)),
    voteSolution: (caseId, solutionId, vote) => void changeFeedback(a => feedbackApi.voteSolution(a, caseId, solutionId, vote)),
    propose: (caseId, solution) => changeFeedback(a => feedbackApi.propose(a, caseId, solution)),
    close: (caseId, outcome, note) => changeFeedback(a => feedbackApi.close(a, caseId, outcome, note)),
    reopen: caseId => void changeFeedback(a => feedbackApi.reopen(a, caseId)),
  }
  const configuration: ConfigurationActions = {
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
            : <p className="feedbackCardMeta">Loading…</p>}
        </div>
      </div>
    )
  }

  const counts: Record<InboxTabKey, number> = {
    validate: bundle.messages.filter(v => !messageDone(v)).length,
    process: needsMyVoteCount(bundle.cases),
    configuration: 0,
  }

  return (
    <div className="inboxSection">
      <div className="inboxTop">
        <nav className="inboxTabs" aria-label="Inbox sections">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key} type="button" aria-pressed={key === tab} aria-label={counts[key] > 0 ? `${label}, ${counts[key]}` : label} title={label}
              className={key === tab ? 'inboxTab inboxTab--on' : 'inboxTab'} onClick={() => setTab(key)}
            >
              <Icon size={20} />
              {counts[key] > 0 && <span className="inboxCount">{counts[key]}</span>}
            </button>
          ))}
        </nav>
        <SignInChip admins={bundle.admins} current={adminId} onPick={setFeedbackAdmin} />
      </div>
      {error && (
        <p className="inboxError" role="alert">
          {error} <button type="button" className="inboxErrorClose" aria-label="Dismiss" onClick={clearFeedbackError}>×</button>
        </p>
      )}
      <div className="sectionBody">
        {tab === 'validate' && (
          <ValidateView key={adminId} bundle={bundle} mode={mode} onMode={setMode} hideDone={hideDone} onHideDone={setHideDone} actions={validate} />
        )}
        {tab === 'process' && <ProcessView key={adminId} bundle={bundle} actions={process} />}
        {tab === 'configuration' && <ConfigurationView bundle={bundle} actions={configuration} />}
      </div>
    </div>
  )
}

export default InboxSection
