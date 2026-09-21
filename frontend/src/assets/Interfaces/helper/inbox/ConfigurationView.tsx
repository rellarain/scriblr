import { useState } from 'react'
import { CloseIcon, PlusIcon, TrashIcon } from '../../../icons'
import type { InboxBundle, VerbCategory } from './feedbackTypes'

// Inbox configuration: the verb categories and their keywords (shared; managed with the Configurer role on
// Helper > Inbox). A message's words that match a keyword are highlighted as suggested verbs.

export interface ConfigurationActions {
  addVerb: (name: string, keywords: string[]) => Promise<boolean>
  updateVerb: (verbId: string, patch: { name?: string; keywords?: string[] }) => Promise<boolean>
  deleteVerb: (verbId: string) => Promise<boolean>
}

function VerbRow({ verb, editable, actions }: { verb: VerbCategory; editable: boolean; actions: ConfigurationActions }) {
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

export default function ConfigurationView({ bundle, actions }: { bundle: InboxBundle; actions: ConfigurationActions }) {
  const [name, setName] = useState('')
  const editable = bundle.can.manageVerbs
  const add = async () => {
    if (!name.trim()) return
    if (await actions.addVerb(name, [])) setName('')
  }

  return (
    <div className="settingsView">
      {!editable && <p className="feedbackCardMeta">Verb categories are managed with the Configurer role on Helper &gt; Inbox.</p>}
      {bundle.verbCategories.map(verb => <VerbRow key={verb.id} verb={verb} editable={editable} actions={actions} />)}
      {editable && (
        <div className="statementRow">
          <input
            className="statementField" aria-label="New verb category" placeholder="New verb category…" maxLength={60}
            value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void add() }}
          />
          <button type="button" className="iconBtn" aria-label="Add verb category" title="Add" onClick={() => void add()}><PlusIcon size={16} /></button>
        </div>
      )}
    </div>
  )
}
