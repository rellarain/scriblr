import { useState } from 'react'
import { CloseIcon, PlusIcon, TrashIcon } from '../../../icons'
import type { InboxBundle, ToneBand, VerbCategory } from './feedbackTypes'
import { BAND_LABEL } from './inboxLogic'

// Inbox settings: the order tones are worked through (the admin's own, kept in this browser)
// and the verb categories with their keywords (shared; needs configuration access to
// Helper > Inbox). A message's words that match a keyword are highlighted as suggested verbs.

export interface SettingsActions {
  addVerb: (name: string, keywords: string[]) => Promise<boolean>
  updateVerb: (verbId: string, patch: { name?: string; keywords?: string[] }) => Promise<boolean>
  deleteVerb: (verbId: string) => Promise<boolean>
}

function TonePriority({ order, onMove }: { order: ToneBand[]; onMove: (band: ToneBand, direction: 'up' | 'down') => void }) {
  return (
    <div className="tonePriorityList">
      {order.map((band, index) => (
        <div key={band} className="tonePriorityRow">
          <span className="tonePriorityLabel"><span className={`toneBand toneBand--${band}`}>{BAND_LABEL[band]}</span></span>
          <div>
            <button type="button" className="tonePriorityMoveBtn" aria-label={`Move ${BAND_LABEL[band]} up`} disabled={index === 0} onClick={() => onMove(band, 'up')}>▲</button>
            <button type="button" className="tonePriorityMoveBtn" aria-label={`Move ${BAND_LABEL[band]} down`} disabled={index === order.length - 1} onClick={() => onMove(band, 'down')}>▼</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function VerbRow({ verb, editable, actions }: { verb: VerbCategory; editable: boolean; actions: SettingsActions }) {
  const [name, setName] = useState(verb.name)
  const [keyword, setKeyword] = useState('')
  const [confirming, setConfirming] = useState(false)

  const addKeyword = () => {
    const kw = keyword.trim()
    if (!kw) return
    setKeyword('')
    void actions.updateVerb(verb.id, { keywords: [...verb.keywords, kw] })
  }

  return (
    <div className="verbRow">
      <div className="verbRowHead">
        <input
          className="statementField" aria-label={`Name of ${verb.name}`} value={name} disabled={!editable} maxLength={60}
          onChange={e => setName(e.target.value)}
          onBlur={async () => {
            if (name.trim() && name.trim() !== verb.name) { if (!(await actions.updateVerb(verb.id, { name }))) setName(verb.name) }
            else setName(verb.name)
          }}
        />
        {editable && (confirming ? (
          <span className="verbConfirm">
            Delete?
            <button type="button" className="toneBtn" onClick={() => { void actions.deleteVerb(verb.id); setConfirming(false) }}>Delete</button>
            <button type="button" className="toneBtn" onClick={() => setConfirming(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" className="statementRemoveBtn" aria-label={`Delete ${verb.name}`} title="Delete this category" onClick={() => setConfirming(true)}>
            <TrashIcon size={14} />
          </button>
        ))}
      </div>
      <div className="channelPillRow">
        {verb.keywords.length === 0 && <span className="feedbackCardMeta">No keywords</span>}
        {verb.keywords.map(kw => (
          <span key={kw} className="channelPill">
            {kw}
            {editable && (
              <button
                type="button" className="channelPillRemove" aria-label={`Remove keyword ${kw} from ${verb.name}`}
                onClick={() => void actions.updateVerb(verb.id, { keywords: verb.keywords.filter(k => k !== kw) })}
              >
                <CloseIcon size={10} />
              </button>
            )}
          </span>
        ))}
        {editable && (
          <input
            className="statementField statementField--keyword" aria-label={`Add a keyword to ${verb.name}`} placeholder="Add keyword…"
            value={keyword} onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
          />
        )}
      </div>
    </div>
  )
}

export default function SettingsView({ bundle, toneOrder, onMoveTone, actions }: {
  bundle: InboxBundle
  toneOrder: ToneBand[]
  onMoveTone: (band: ToneBand, direction: 'up' | 'down') => void
  actions: SettingsActions
}) {
  const [name, setName] = useState('')
  const editable = bundle.can.manageVerbs
  const add = async () => {
    if (!name.trim()) return
    if (await actions.addVerb(name, [])) setName('')
  }

  return (
    <div className="settingsView">
      <h3 className="implementGroupHeader">Tone priority</h3>
      <p className="feedbackCardMeta">Messages are worked through in this order, most important first. It is your own setting.</p>
      <TonePriority order={toneOrder} onMove={onMoveTone} />

      <h3 className="implementGroupHeader">Verb categories</h3>
      <p className="feedbackCardMeta">
        {editable
          ? 'Each message is scanned for these keywords and matching words are highlighted as suggested verbs.'
          : 'Managing verb categories needs configuration access to Helper > Inbox. You can read them here.'}
      </p>
      {bundle.verbCategories.map(verb => <VerbRow key={verb.id} verb={verb} editable={editable} actions={actions} />)}
      {editable && (
        <div className="statementRow">
          <input
            className="statementField" aria-label="New verb category" placeholder="New verb category…" maxLength={60}
            value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void add() }}
          />
          <button type="button" className="toneBtn" onClick={() => void add()}><PlusIcon size={14} /> Add</button>
        </div>
      )}
    </div>
  )
}
