import { useState } from 'react'
import type { ComponentType } from 'react'
import { CheckboxIcon, GearIcon, type IconProps } from '../../../icons'
import ActingAs from '../../../../feedback/ActingAs'
import { staffFeedbackApi } from '../../../../feedback/feedbackApi'
import { toCheck } from '../../../../feedback/feedbackLogic'
import { changeStaff, clearStaffError, loadStaff, useStaff } from '../../../../feedback/staffStore'
import '../../../../feedback/feedback.scss'
import CheckView, { type CheckActions } from './CheckView'
import ConfigurationView, { type ConfigurationActions } from './ConfigurationView'

type InboxTabKey = 'check' | 'configuration'

const TABS: Array<{ key: InboxTabKey; label: string; Icon: ComponentType<IconProps> }> = [
  { key: 'check', label: 'Check', Icon: CheckboxIcon },
  { key: 'configuration', label: 'Verbs', Icon: GearIcon },
]

// The Inbox Console: feedback arrives here as statements the writers wrote (what it is about and what should happen). A helper
// checks each one (Check) and keeps the verbs the writers choose from (Verbs). Checked messages go on to voting in the Office.
// There is no login yet, so the Acting as chip picks the staff member.
function InboxSection() {
  const [tab, setTab] = useState<InboxTabKey>('check')
  const { bundle, status, error } = useStaff()

  const check: CheckActions = {
    edit: (id, edit) => changeStaff(a => staffFeedbackApi.edit(a, id, edit)),
    ask: (id, text) => changeStaff(a => staffFeedbackApi.ask(a, id, text)),
    comment: (id, text) => changeStaff(a => staffFeedbackApi.comment(a, id, text)),
  }
  const configuration: ConfigurationActions = {
    addVerb: (name, keywords) => changeStaff(a => staffFeedbackApi.addVerb(a, name, keywords)),
    updateVerb: (id, patch) => changeStaff(a => staffFeedbackApi.updateVerb(a, id, patch)),
    deleteVerb: id => changeStaff(a => staffFeedbackApi.deleteVerb(a, id)),
  }

  if (!bundle) {
    return (
      <div className="inboxSection fbScope">
        <div className="sectionBody">
          {status === 'error'
            ? <p className="inboxError" role="alert">{error} <button type="button" className="toneBtn" onClick={() => void loadStaff()}>Retry</button></p>
            : <p className="feedbackCardMeta">Loading…</p>}
        </div>
      </div>
    )
  }

  const counts: Record<InboxTabKey, number> = { check: toCheck(bundle).length, configuration: 0 }

  return (
    <div className="inboxSection fbScope">
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
        <ActingAs />
      </div>
      {error && (
        <p className="inboxError" role="alert">
          {error} <button type="button" className="inboxErrorClose" aria-label="Dismiss" onClick={clearStaffError}>×</button>
        </p>
      )}
      <div className="sectionBody">
        {tab === 'check' && <CheckView bundle={bundle} actions={check} />}
        {tab === 'configuration' && <ConfigurationView bundle={bundle} actions={configuration} />}
      </div>
    </div>
  )
}

export default InboxSection
