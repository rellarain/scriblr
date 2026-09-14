import { useState } from 'react'
import type { ChannelTag, FormFieldDef, FormFieldKind } from './helperTypes'
import { CHANNEL_TAXONOMY, FORM_FIELD_KINDS } from './helperTypes'

interface HelperComposerProps {
  onSendText: (text: string) => void
  onSendForm: (title: string, fields: FormFieldDef[]) => void
  onSendPageLink: (target: ChannelTag, label?: string) => void
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

function LinkComposer({ onSend }: { onSend: (target: ChannelTag, label?: string) => void }) {
  const [page, setPage] = useState('')
  const [component, setComponent] = useState('')
  const [feature, setFeature] = useState('')
  const [label, setLabel] = useState('')

  const pageDef = CHANNEL_TAXONOMY.find(p => p.name === page)
  const componentDef = pageDef?.components.find(c => c.name === component)

  function handleSend() {
    if (!page || !component || !feature) return
    onSend({ page, component, feature }, label.trim() || undefined)
    setPage(''); setComponent(''); setFeature(''); setLabel('')
  }

  return (
    <div className="channelAddForm">
      <select value={page} onChange={e => { setPage(e.target.value); setComponent(''); setFeature('') }}>
        <option value="">Page…</option>
        {CHANNEL_TAXONOMY.map(p => (
          <option key={p.name} value={p.name}>{p.name}</option>
        ))}
      </select>
      <select value={component} disabled={!pageDef} onChange={e => { setComponent(e.target.value); setFeature('') }}>
        <option value="">Component…</option>
        {pageDef?.components.map(c => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>
      <select value={feature} disabled={!componentDef} onChange={e => setFeature(e.target.value)}>
        <option value="">Feature…</option>
        {componentDef?.features.map(f => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <input
        className="statementField" value={label} placeholder="Custom link text (optional)…"
        onChange={e => setLabel(e.target.value)}
      />
      <button type="button" className="toneBtn" disabled={!feature} onClick={handleSend}>Send link</button>
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
