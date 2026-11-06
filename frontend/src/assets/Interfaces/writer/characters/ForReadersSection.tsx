import { useState } from 'react'
import { CHARACTER_SHARE_FIELDS, shareOf, type CharacterDoc, type ReaderShare } from '../../../../api/types'
import { BookPick, RevealSelect, ReachSelect, usePreview, useExtrasInfo, Warnings } from '../readers/ReaderControls'
import { CharacterCard } from '../readers/WorldViews'

// The character for readers: whether it is published (shown in the Reader's book page once the book is published), from which chapter, which fields are public and from
// which chapter each is shown, and a preview as a reader who has reached a chapter. The look is always shown with a published character; the rest of the profile never is.
export function ForReadersSection({ projectId, doc, edit, savedAt }: {
  projectId: string
  doc: CharacterDoc
  edit: (change: (d: CharacterDoc) => CharacterDoc, group?: string) => void
  savedAt: number | null
}) {
  const share = shareOf(doc)
  const info = useExtrasInfo(projectId, savedAt)
  const [reach, setReach] = useState(1)
  const chapters = info.book?.chapters ?? []
  const preview = usePreview(projectId, info.book?.bookId ?? null, reach, savedAt)
  const card = preview?.characters.find(c => c.id === doc.id) ?? null

  const set = (patch: Partial<ReaderShare>, group: string) => edit(d => ({ ...d, reader: { ...shareOf(d), ...patch } }), group)
  const setReveal = (key: string, chapter: number | null) => edit(d => {
    const s = shareOf(d)
    const reveals = { ...s.reveals }
    if (chapter === null) delete reveals[key]
    else reveals[key] = chapter
    return { ...d, reader: { ...s, reveals } }
  }, `reader.${key}`)
  const toggle = (key: string, on: boolean) => edit(d => {
    const s = shareOf(d)
    const reveals = { ...s.reveals }
    if (!on) delete reveals[key]
    return { ...d, reader: { ...s, reveals, fields: on ? [...s.fields.filter(f => f !== key), key] : s.fields.filter(f => f !== key) } }
  }, `reader.${key}`)

  const parts: Array<{ key: string; label: string }> = [
    ...CHARACTER_SHARE_FIELDS.map(([key, label]) => ({ key, label })),
    ...doc.profile.fields.map((f, i) => ({ key: `field:${f.id}`, label: f.label || `Field ${i + 1}` })),
  ]
  const warnings = (info.book?.warnings ?? []).filter(w => w.kind === 'character' && w.targetId === doc.id)

  return (
    <div className="charSheet">
      <section className="charPanel" aria-label="For readers">
        <h3 className="charPanelTitle">For readers</h3>
        <label className="rvCheck">
          <input type="checkbox" checked={share.published} onChange={e => set({ published: e.target.checked }, 'reader.published')} />
          Show {doc.name} to readers
        </label>
        <p className="rvHint">
          Readers meet a published character in the book&rsquo;s page, as a card, once you publish the book: the character is copied then, as the chapters are, so a later change waits for the next edition. Chapters are numbered as in the published edition.
        </p>
        {share.published && (
          <div className="rvField">
            <span className="rvLabel" aria-hidden="true">Shown to readers</span>
            <RevealSelect label="Shown to readers from" value={share.revealAt} chapters={chapters} onChange={chapter => set({ revealAt: chapter }, 'reader.revealAt')} />
          </div>
        )}
        <BookPick books={info.books} bookId={info.book?.bookId ?? null} onPick={info.setBook} />
        {info.failed && <p className="rvHint" role="alert">The chapters of the book could not be loaded.</p>}
        {info.book && chapters.length === 0 && <p className="rvHint">No chapter of this book is published yet, so there are no chapters to reveal at.</p>}
        {info.books.length === 0 && !info.failed && <p className="rvHint">Add a book to the outline to publish for readers.</p>}
      </section>
      {share.published && (
        <section className="charPanel" aria-label="What readers are told">
          <h3 className="charPanelTitle">What readers are told</h3>
          <p className="rvHint">The look is always shown. Tick what else is public, and from which chapter.</p>
          <ul className="rvList">
            {parts.map(p => {
              const on = share.fields.includes(p.key)
              return (
                <li key={p.key} className="rvPart">
                  <label className="rvCheck"><input type="checkbox" checked={on} onChange={e => toggle(p.key, e.target.checked)} />{p.label}</label>
                  {on && <RevealSelect label={`${p.label} shown from`} value={share.reveals[p.key] ?? null} chapters={chapters} onChange={chapter => setReveal(p.key, chapter)} />}
                </li>
              )
            })}
          </ul>
          <p className="rvHint">Relationships show only the characters you have published too.</p>
        </section>
      )}
      {share.published && warnings.length > 0 && (
        <section className="charPanel" aria-label="Spoilers">
          <h3 className="charPanelTitle">Spoilers</h3>
          <Warnings warnings={warnings} />
        </section>
      )}
      <section className="charPanel" aria-label="Preview as a reader">
        <h3 className="charPanelTitle">Preview as a reader</h3>
        <div className="rvPreview">
          <ReachSelect chapters={chapters} value={reach} onChange={setReach} />
          {card ? <CharacterCard card={card} /> : <p className="rvHint" role="status">{share.published ? 'Not shown yet at this point of the book, or not saved yet: the preview is of what is saved.' : 'Not shown to readers.'}</p>}
        </div>
      </section>
    </div>
  )
}
