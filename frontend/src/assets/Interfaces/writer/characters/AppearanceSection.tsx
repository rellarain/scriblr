import { useState } from 'react'
import type { CharacterDoc } from '../../../../api/types'
import { CheckIcon, CloseIcon, PencilIcon, RedoIcon } from '../../../icons'
import { CommitText, Field, TextField } from './CharFields'
import { APPEARANCE_FIELDS, describeLook, emptyAppearanceFields, writeFromLook, type AppearanceField } from './describe'

// How the character looks, in words: a paragraph and a field for each thing a stranger would notice (height, build, skin, hair, eyes, face, voice, bearing, dress, marks).
// The words are the author's own; the buttons write a first draft from the look (the choices the art is drawn from), for the empty fields or, when asked twice, for all.
// Every keystroke goes into the character; typing in one field is one undo step. Each field can be shown to readers (For readers).
export function AppearanceSection({ doc, edit, rename }: { doc: CharacterDoc; edit: (change: (d: CharacterDoc) => CharacterDoc, group?: string) => void; rename: (name: string) => void }) {
  const p = doc.profile
  const [confirming, setConfirming] = useState(false)
  // The empty fields the look has words for (it has none for a voice).
  const words = describeLook(doc.look)
  const empty = emptyAppearanceFields(p).filter(k => words[k] !== '')
  const write = (keys: AppearanceField[]) => edit(d => ({ ...d, profile: writeFromLook(d.profile, d.look, keys) }), 'appearance.draft')
  const set = (key: AppearanceField, value: string) => edit(d => ({ ...d, profile: { ...d.profile, [key]: value } }), `appearance.${key}`)
  const [overall, ...rest] = APPEARANCE_FIELDS

  return (
    <div className="charSheet">
      <section className="charPanel charPanel--start" aria-label="Name and a first look">
        <header className="charPanelHead">
          <h3 className="charPanelTitle">Appearance</h3>
          <span className="charRow">
            <button
              type="button" className="charIconBtn" aria-label="Write the empty fields from the look" title="Write the empty fields from the look (a first draft in words of the choices made in Look)"
              disabled={empty.length === 0} onClick={() => write(empty)}
            ><PencilIcon size={16} /></button>
            {confirming ? (
              <span className="charConfirm" role="group" aria-label="Write every field from the look?">
                <button type="button" className="charIconBtn" aria-label="Confirm: write every field from the look" title="Write every field again from the look (what is written now is replaced)" onClick={() => { setConfirming(false); write(APPEARANCE_FIELDS.map(f => f.key)) }}><CheckIcon size={16} /></button>
                <button type="button" className="charIconBtn" aria-label="Cancel" title="Cancel" onClick={() => setConfirming(false)}><CloseIcon size={16} /></button>
              </span>
            ) : (
              <button type="button" className="charIconBtn" aria-label="Write every field again from the look" title="Write every field again from the look (asks first)" onClick={() => setConfirming(true)}><RedoIcon size={16} /></button>
            )}
          </span>
        </header>
        <Field label="Name"><CommitText label="Name of the character" value={doc.name} max={120} onCommit={rename} /></Field>
        <TextField label={overall.label} multiline rows={overall.rows} max={8000} placeholder={overall.hint} value={p.appearance} onChange={v => set('appearance', v)} />
        <p className="charHint">Write the whole in a paragraph, or piece by piece below, or both. The drawing is in Look and is only a sketch of these words.</p>
      </section>
      <section className="charPanel charPanel--start" aria-label="Parts of the appearance">
        <h3 className="charPanelTitle">Piece by piece</h3>
        {rest.map(f => (
          <TextField key={f.key} label={f.label} multiline={f.rows > 1} rows={f.rows} max={f.key === 'height' || f.key === 'build' ? 120 : 1000} placeholder={f.hint} value={p[f.key]} onChange={v => set(f.key, v)} />
        ))}
      </section>
    </div>
  )
}
