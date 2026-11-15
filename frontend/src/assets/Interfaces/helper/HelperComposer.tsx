import { useState } from 'react'
import type { FormFieldDef, FormFieldKind } from './helperTypes'
import { FORM_FIELD_KINDS } from './helperTypes'
import { useChannels } from '../../../channels/channelStore'
import { KIND_LABEL, childrenOf } from '../../../channels/channelTree'

interface HelperComposerProps {
  onSendText: (text: string) => void
  onSendForm: (title: string, fields: FormFieldDef[]) => void
  onSendPageLink: (channelId: string, label?: string) => void
}

type ComposerMode = 'text' | 'form' | 'pageLink' | 'helpConfig'

function newFieldId(): string {
  return `field-${Math.random().toString(36).slice(2, 9)}`
}

function TextComposer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('')

  function handleSend() {
    if (!text.trim()) return
    onSend(text)
    setText('')
  }

  return (
    <div className="channelAddForm">
      <input
        className="statementField" value={text} placeholder="Type a response…"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSend()}
      />
      <button type="button" className="toneBtn" disabled={!text.trim()} onClick={handleSend}>Send</button>
    </div>
  )
}

function FormComposer({ onSend }: { onSend: (title: string, fields: FormFieldDef[]) => void }) {
  const [title, setTitle] = useState('')
  const [fields, setFields] = useState<FormFieldDef[]>([])
  const [draftLabel, setDraftLabel] = useState('')
  const [draftKind, setDraftKind] = useState<FormFieldKind>('text')
  const [draftOptions, setDraftOptions] = useState('')

  function handleAddField() {
    if (!draftLabel.trim()) return
    const options = draftKind === 'select'
      ? draftOptions.split(',').map(o => o.trim()).filter(Boolean)
      : undefined
    setFields(prev => [...prev, { id: newFieldId(), label: draftLabel.trim(), kind: draftKind, options }])
    setDraftLabel(''); setDraftKind('text'); setDraftOptions('')
  }

  function handleRemoveField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id))
  }

  function handleUpdateLabel(id: string, label: string) {
    setFields(prev => prev.map(f => (f.id === id ? { ...f, label } : f)))
  }

  function handleSend() {
    if (!title.trim() || fields.length === 0) return
    onSend(title, fields)
    setTitle(''); setFields([])
  }

  return (
    <div className="helperFormBuilder">
      <div className="channelAddForm">
        <input
          className="statementField" value={title} placeholder="Form title…"
          onChange={e => setTitle(e.target.value)}
        />
      </div>
      {fields.map(field => (
        <div key={field.id} className="statementRow">
          <input
            className="statementField" value={field.label}
            onChange={e => handleUpdateLabel(field.id, e.target.value)}
          />
          <span className="feedbackCardMeta">({field.kind})</span>
          <button type="button" className="statementRemoveBtn" onClick={() => handleRemoveField(field.id)}>×</button>
        </div>
      ))}
      <div className="channelAddForm">
        <input
          className="statementField" value={draftLabel} placeholder="Field label…"
          onChange={e => setDraftLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddField()}
        />
        <select value={draftKind} onChange={e => setDraftKind(e.target.value as FormFieldKind)}>
          {FORM_FIELD_KINDS.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        {draftKind === 'select' && (
          <input
            className="statementField" value={draftOptions} placeholder="Options, comma-separated…"
            onChange={e => setDraftOptions(e.target.value)}
          />
        )}
        <button type="button" className="addStatementBtn toneBtn" disabled={!draftLabel.trim()} onClick={handleAddField}>+ Add field</button>
      </div>
      <button
        type="button" className="toneBtn"
        disabled={!title.trim() || fields.length === 0}
        onClick={handleSend}
      >
        Send form
      </button>
    </div>
  )
}

// A link to any place in the app: a node of the channel list, picked a level at a time.
function LinkComposer({ onSend }: { onSend: (channelId: string, label?: string) => void }) {
  const { index } = useChannels()
  const [path, setPath] = useState<string[]>([])
  const [label, setLabel] = useState('')
  const levels: { parentId: string | null; value: string }[] = [{ parentId: null, value: path[0] ?? '' }]
  for (let i = 0; i < path.length; i++) {
    if (childrenOf(index, path[i]).length > 0) levels.push({ parentId: path[i], value: path[i + 1] ?? '' })
  }
  const target = path[path.length - 1] ?? ''

  function choose(depth: number, id: string) {
    setPath(prev => (id ? [...prev.slice(0, depth), id] : prev.slice(0, depth)))
  }
  function handleSend() {
    if (!target) return
    onSend(target, label.trim() || undefined)
    setPath([]); setLabel('')
  }

  return (
    <div className="channelAddForm">
      {levels.map((level, depth) => {
        const options = childrenOf(index, level.parentId)
        const kind = options[0]?.kind
        return (
          <select key={level.parentId ?? 'top'} value={level.value} aria-label={kind ? KIND_LABEL[kind] : 'Place'} onChange={e => choose(depth, e.target.value)}>
            <option value="">{kind ? `${KIND_LABEL[kind]}…` : 'Place…'}</option>
            {options.map(n => <option key={n.id} value={n.id}>{n.name || KIND_LABEL[n.kind]}</option>)}
          </select>
        )
      })}
      <input
        className="statementField" value={label} placeholder="Custom link text (optional)…"
        onChange={e => setLabel(e.target.value)}
      />
      <button type="button" className="toneBtn" disabled={!target} onClick={handleSend}>Send link</button>
    </div>
  )
}

function HelperComposer({ onSendText, onSendForm, onSendPageLink }: HelperComposerProps) {
  const [mode, setMode] = useState<ComposerMode>('text')

  return (
    <div className="helperComposer">
      <div className="helperComposerModeRow">
        <button type="button" className={mode === 'text' ? 'toneBtn toneBtn--active' : 'toneBtn'} onClick={() => setMode('text')}>Response</button>
        <button type="button" className={mode === 'form' ? 'toneBtn toneBtn--active' : 'toneBtn'} onClick={() => setMode('form')}>Form</button>
        <button type="button" className={mode === 'pageLink' ? 'toneBtn toneBtn--active' : 'toneBtn'} onClick={() => setMode('pageLink')}>Link</button>
        <button type="button" className={mode === 'helpConfig' ? 'toneBtn toneBtn--active' : 'toneBtn'} onClick={() => setMode('helpConfig')}>Help tool</button>
      </div>
      {mode === 'text' && <TextComposer onSend={onSendText} />}
      {mode === 'form' && <FormComposer onSend={onSendForm} />}
      {mode === 'pageLink' && <LinkComposer onSend={onSendPageLink} />}
      {mode === 'helpConfig' && (
        <div className="helperPlaceholderContent">
          <h2>Help tool configuration</h2>
          <p>Configure the help tool here.</p>
        </div>
      )}
    </div>
  )
}

export default HelperComposer
