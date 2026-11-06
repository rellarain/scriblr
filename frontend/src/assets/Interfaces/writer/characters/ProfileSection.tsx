import type { CharacterDoc, CharacterField, CharacterPossession, CharacterProfile } from '../../../../api/types'
import { CHARACTER_MAX_FIELDS, CHARACTER_MAX_POSSESSIONS } from '../../../../api/types'
import { PlusIcon, TrashIcon } from '../../../icons'
import { TextField } from './CharFields'
import { nextId } from './story'

// The profile of a character: identity, personality and psychology, background, fields of the author's own, and what they own. Every keystroke goes into the character;
// typing in one field is one undo step.
export function ProfileSection({ doc, edit }: { doc: CharacterDoc; edit: (change: (d: CharacterDoc) => CharacterDoc, group?: string) => void }) {
  const p = doc.profile
  const setProfile = (patch: Partial<CharacterProfile>, group: string) => edit(d => ({ ...d, profile: { ...d.profile, ...patch } }), group)
  const line = (key: keyof CharacterProfile, label: string) => <TextField label={label} value={p[key] as string} max={key === 'role' || key === 'age' || key === 'occupation' || key === 'aliases' ? 120 : 1000} onChange={v => setProfile({ [key]: v } as Partial<CharacterProfile>, `profile.${key}`)} />
  const para = (key: keyof CharacterProfile, label: string, rows = 3) => <TextField label={label} multiline rows={rows} value={p[key] as string} max={8000} onChange={v => setProfile({ [key]: v } as Partial<CharacterProfile>, `profile.${key}`)} />

  const setField = (id: string, patch: Partial<CharacterField>) => setProfile({ fields: p.fields.map(f => (f.id === id ? { ...f, ...patch } : f)) }, `field.${id}`)
  const setItem = (id: string, patch: Partial<CharacterPossession>) => edit(d => ({ ...d, possessions: d.possessions.map(x => (x.id === id ? { ...x, ...patch } : x)) }), `item.${id}`)

  return (
    <div className="charSheet">
      <section className="charPanel" aria-label="Identity">
        <h3 className="charPanelTitle">Identity</h3>
        {line('role', 'Role in the story')}
        <div className="charRow">{line('age', 'Age')}{line('occupation', 'Occupation')}</div>
        {line('aliases', 'Other names')}
        {line('summary', 'In a sentence')}
      </section>
      <section className="charPanel" aria-label="Personality and psychology">
        <h3 className="charPanelTitle">Personality and psychology</h3>
        {para('personality', 'Personality', 4)}
        {line('goal', 'What they want')}
        {line('motivation', 'Why they want it')}
        {line('fear', 'What they fear')}
        {line('flaw', 'Their flaw')}
        {line('strength', 'Their strength')}
      </section>
      <section className="charPanel" aria-label="Background">
        <h3 className="charPanelTitle">Background</h3>
        {para('background', 'History', 8)}
      </section>
      <section className="charPanel" aria-label="Fields of your own">
        <header className="charPanelHead">
          <h3 className="charPanelTitle">Fields of your own</h3>
          <button type="button" className="charIconBtn" aria-label="Add a field" title="Add a field" disabled={p.fields.length >= CHARACTER_MAX_FIELDS} onClick={() => setProfile({ fields: [...p.fields, { id: nextId(p.fields, 'f'), label: '', value: '' }] }, 'fields')}><PlusIcon size={16} /></button>
        </header>
        {p.fields.length === 0 && <p className="charHint">A field is a label and a text: eye colour, a motto, a habit, anything the profile has no place for.</p>}
        <ul className="charList2">
          {p.fields.map((f, i) => (
            <li key={f.id} className="charItem">
              <TextField label={`Label of field ${i + 1}`} value={f.label} max={60} onChange={v => setField(f.id, { label: v })} />
              <TextField label={`Text of field ${i + 1}`} value={f.value} multiline rows={2} max={2000} onChange={v => setField(f.id, { value: v })} />
              <button type="button" className="charIconBtn" aria-label={`Remove field ${i + 1}`} title="Remove this field" onClick={() => setProfile({ fields: p.fields.filter(x => x.id !== f.id) }, 'fields')}><TrashIcon size={16} /></button>
            </li>
          ))}
        </ul>
      </section>
      <section className="charPanel" aria-label="Possessions">
        <header className="charPanelHead">
          <h3 className="charPanelTitle">Possessions</h3>
          <button type="button" className="charIconBtn" aria-label="Add a possession" title="Add a possession" disabled={doc.possessions.length >= CHARACTER_MAX_POSSESSIONS} onClick={() => edit(d => ({ ...d, possessions: [...d.possessions, { id: nextId(d.possessions, 'p'), name: '', description: '' }] }), 'possessions')}><PlusIcon size={16} /></button>
        </header>
        {doc.possessions.length === 0 && <p className="charHint">Things the character owns, with a line about each.</p>}
        <ul className="charList2">
          {doc.possessions.map((x, i) => (
            <li key={x.id} className="charItem">
              <TextField label={`Name of possession ${i + 1}`} value={x.name} max={80} onChange={v => setItem(x.id, { name: v })} />
              <TextField label={`About possession ${i + 1}`} value={x.description} multiline rows={2} max={1000} onChange={v => setItem(x.id, { description: v })} />
              <button type="button" className="charIconBtn" aria-label={`Remove possession ${i + 1}`} title="Remove this possession" onClick={() => edit(d => ({ ...d, possessions: d.possessions.filter(y => y.id !== x.id) }), 'possessions')}><TrashIcon size={16} /></button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
