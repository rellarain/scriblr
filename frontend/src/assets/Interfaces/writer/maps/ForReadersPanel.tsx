import { useState } from 'react'
import { shareOf } from '../../../../api/types'
import { BookPick, ReachSelect, RevealSelect, usePreview, useExtrasInfo, Warnings } from '../readers/ReaderControls'
import { MapView } from '../readers/WorldViews'
import type { ItemRef } from './mapItems'
import { setShare, type MapDraft } from './mapModel'
import type { Maps } from './useMaps'

// The map for readers: whether it is published (shown in the Reader's book page once the book is published), from which chapter, from which chapter the chosen symbol, label
// or line is shown, and a preview as a reader who has reached a chapter. Chapters are numbered as in the published edition.
export function ForReadersPanel({ projectId, m, draft, selected }: { projectId: string; m: Maps; draft: MapDraft; selected: ItemRef | null }) {
  const share = shareOf(draft)
  const savedAt = m.saveStatus.lastSavedAt
  const info = useExtrasInfo(projectId, savedAt)
  const [reach, setReach] = useState(1)
  const [open, setOpen] = useState(false)
  const chapters = info.book?.chapters ?? []
  const preview = usePreview(projectId, open ? info.book?.bookId ?? null : null, reach, savedAt)
  const shown = preview?.maps.find(x => x.id === draft.id) ?? null
  const warnings = (info.book?.warnings ?? []).filter(w => (w.kind === 'map' || w.kind === 'place') && (w.targetId === draft.id || w.targetId.startsWith(`${draft.id}/`)))

  const revealOf = (id: string) => share.reveals[id] ?? null
  const setReveal = (id: string, chapter: number | null) => {
    const reveals = { ...share.reveals }
    if (chapter === null) delete reveals[id]
    else reveals[id] = chapter
    m.apply(setShare(draft, { ...share, reveals }))
  }
  const chosen = selected
    ? { id: selected.id, name: selected.kind === 'symbol' ? draft.symbols.find(s => s.id === selected.id)?.name || 'this symbol' : selected.kind === 'label' ? 'this label' : draft.shapes.find(s => s.id === selected.id)?.name || 'this shape' }
    : null

  return (
    <section className="mapPanel" aria-label="For readers">
      <header className="mapPanelHead"><h3 className="mapPanelTitle">For readers</h3></header>
      <label className="rvCheck">
        <input type="checkbox" checked={share.published} onChange={e => m.apply(setShare(draft, { ...share, published: e.target.checked }))} />
        Show this map to readers
      </label>
      {share.published && (
        <div className="rvField">
          <span className="rvLabel" aria-hidden="true">Shown to readers</span>
          <RevealSelect label="Map shown to readers from" value={share.revealAt} chapters={chapters} onChange={chapter => m.apply(setShare(draft, { ...share, revealAt: chapter }))} />
        </div>
      )}
      {share.published && chosen && (
        <div className="rvField">
          <span className="rvLabel" aria-hidden="true">{chosen.name}</span>
          <RevealSelect label="Chosen part shown from" value={revealOf(chosen.id)} chapters={chapters} onChange={chapter => setReveal(chosen.id, chapter)} />
        </div>
      )}
      <p className="rvHint">Readers see a published map in the book&rsquo;s page once you publish the book: it is copied then, as the chapters are.</p>
      <BookPick books={info.books} bookId={info.book?.bookId ?? null} onPick={info.setBook} />
      {info.failed && <p className="rvHint" role="alert">The chapters of the book could not be loaded.</p>}
      {share.published && <Warnings warnings={warnings} />}
      <div className="rvRow">
        <button type="button" className="mapChip" aria-pressed={open} onClick={() => setOpen(o => !o)}>Preview as a reader</button>
      </div>
      {open && (
        <div className="rvPreview">
          <ReachSelect chapters={chapters} value={reach} onChange={setReach} />
          {shown ? <MapView doc={shown} biomes={preview?.biomes} /> :<p className="rvHint" role="status">{share.published ? 'Not shown yet at this point of the book, or not saved yet: the preview is of what is saved.' : 'Not shown to readers.'}</p>}
        </div>
      )}
    </section>
  )
}
