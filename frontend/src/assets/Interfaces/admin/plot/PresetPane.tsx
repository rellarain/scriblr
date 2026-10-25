import { useEffect, useMemo, useRef, useState } from 'react'
import type { PresetContent, PresetEntry } from '../../../../api/types'
import { focusNodeField, useNodeKeys, type NodeKeysAdapter } from '../../../../lib/nodeKeys'
import { CopyIcon, EyeOffIcon, ExportIcon, HistoryIcon, UndoIcon } from '../../../icons'
import { PresetTree, type TreeCtx } from './PresetCards'
import { StatusBadge, presetLabel } from './PresetList'
import {
  NAME_MAX, ROOT, addCluster, addSubcategory, blankContent, countOf, describeChanges, findCard, isBlankCard, nameTaken, publishFaults,
  removeCard, sameContent, siblingIds, statusOf, updateCard, type MakeId,
} from './presetModel'
import type { PlotPresets } from './usePlotPresets'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`}`

// The preset's name, which refuses a name another preset has (the text is kept while it is typed, and put back when the field is left).
function PresetNameField({ entry, entries, onRename }: { entry: PresetEntry; entries: PresetEntry[]; onRename: (name: string) => void }) {
  const value = entry.draft.name
  const [text, setText] = useState(value)
  const [taken, setTaken] = useState(false)
  useEffect(() => { setText(value); setTaken(false) }, [value, entry.id])
  return (
    <span className="plpNameWrap">
      <input
        className="plpName" data-kf="" maxLength={NAME_MAX} aria-label="Preset name" placeholder="Preset name" aria-invalid={taken}
        aria-describedby={taken ? 'plp-name-taken' : undefined} value={text}
        onChange={e => {
          const next = e.target.value
          setText(next)
          const clash = nameTaken(entries, next, entry.id)
          setTaken(clash)
          if (!clash) onRename(next)
        }}
        onBlur={() => { if (taken) { setText(value); setTaken(false) } }}
      />
      {taken && <span id="plp-name-taken" className="plpErr" role="alert">Another preset is already called that.</span>}
    </span>
  )
}

// The versions of a preset: the one published now, and the ten before it, each of which can be brought back into the draft.
function VersionsMenu({ entry, onBring }: { entry: PresetEntry; onBring: (version: number) => void }) {
  const versions = [...(entry.published ? [entry.published] : []), ...entry.history]
  return (
    <div className="plpMenu" role="group" aria-label={`Versions of ${presetLabel(entry)}`}>
      {versions.map(v => {
        const n = countOf(v.content)
        const current = entry.published?.version === v.version
        return (
          <div className="plpMenuItem" key={v.version}>
            <span>v{v.version} · {when(v.publishedAt)}<small>{current ? 'Published now' : `${plural(n.fields, 'field')}, ${plural(n.subcategories, 'subcategory')}`}</small></span>
            {current
              ? <span className="plpBadge">Current</span>
              : <button type="button" className="plpBtn plpBtn--small" onClick={() => onBring(v.version)}>Bring into draft</button>}
          </div>
        )
      })}
    </div>
  )
}

function PublishDialog({ entry, onCancel, onPublish }: { entry: PresetEntry; onCancel: () => void; onPublish: () => void }) {
  const changes = useMemo(() => describeChanges(entry.published?.content ?? null, entry.draft), [entry.published, entry.draft])
  const first = useRef<HTMLButtonElement>(null)
  const last = useRef<HTMLButtonElement>(null)
  useEffect(() => { last.current?.focus() }, [])
  const lines = [
    ...changes.added.map(t => `Added: ${t}`), ...changes.changed.map(t => `Changed: ${t}`), ...changes.removed.map(t => `Removed: ${t}`),
  ]
  return (
    <div className="plpScrim">
      <div
        className="plpDialog" role="dialog" aria-modal="true" aria-label={`Publish ${presetLabel(entry)}`}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
          if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === first.current) { e.preventDefault(); last.current?.focus() }
            else if (!e.shiftKey && document.activeElement === last.current) { e.preventDefault(); first.current?.focus() }
          }
        }}
      >
        <h3>Publish {presetLabel(entry)} as v{entry.nextVersion}?</h3>
        <ul>{lines.map(l => <li key={l}>{l}</li>)}</ul>
        <p>The Plot sidebar&rsquo;s + Preset list will show this version. Projects that already added {presetLabel(entry)} keep their copy.</p>
        <div className="plpFoot">
          <button type="button" ref={first} className="plpBtn" onClick={onCancel}>Cancel</button>
          <button type="button" ref={last} className="plpBtn plpBtn--primary" onClick={onPublish}>Publish v{entry.nextVersion}</button>
        </div>
      </div>
    </div>
  )
}

type Confirm = { kind: 'delete' } | { kind: 'discard' } | { kind: 'restore'; version: number }

// One preset: what it can do (publish, discard, unpublish, versions, duplicate, export), where it stands, and its card tree.
export function PresetPane({ entry, presets, makeId, onSelect, onRemove, onExport }: {
  entry: PresetEntry
  presets: PlotPresets
  makeId: MakeId
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onExport: (entry: PresetEntry) => void
}) {
  const { entries } = presets
  const status = statusOf(entry)
  const faults = useMemo(() => publishFaults(entry.draft), [entry.draft])
  const faultMap: TreeCtx['faults'] = useMemo(() => new Map(faults.map(f => [f.id, f.message])), [faults])
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const menuRoot = useRef<HTMLSpanElement>(null)
  useEffect(() => { setConfirm(null); setPublishing(false); setVersionsOpen(false) }, [entry.id])
  useEffect(() => {
    if (!versionsOpen) return
    const away = (e: Event) => { if (!menuRoot.current?.contains(e.target as Node)) setVersionsOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setVersionsOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [versionsOpen])

  const edit = (change: (d: PresetContent) => PresetContent, immediate = false) => presets.edit(entry.id, change, immediate)
  const label = presetLabel(entry)
  const versions = [...(entry.published ? [entry.published] : []), ...entry.history]
  // A draft that is none of its versions would be lost by going back to one.
  const draftWouldBeLost = !versions.some(v => sameContent(v.content, entry.draft))
  const nothingToPublish = status === 'live'
  // With a published copy Discard goes back to it; without one there is nothing to go back to, so it clears the preset and keeps its name.
  const canDiscard = entry.published ? status === 'pending' : !sameContent(entry.draft, { ...blankContent(), name: entry.draft.name })

  // The Outline's keyboard shortcuts on the cards: Enter a sibling, Shift+Enter a child, Backspace on an empty card removes it.
  const adapter: NodeKeysAdapter = {
    parentOf: id => {
      if (id === entry.id) return null
      const parent = findCard(entry.draft, id)?.parentId
      return parent === ROOT ? entry.id : parent ?? null
    },
    siblingsOf: id => (id === entry.id ? [entry.id] : siblingIds(entry.draft, id)),
    isEmpty: id => {
      const found = id === entry.id ? { card: entry.draft } : findCard(entry.draft, id)
      if (!found) return false
      return isBlankCard(found.card) && (id !== entry.id || (!entry.published && entry.history.length === 0))
    },
    createSibling: id => {
      if (id === entry.id) { const next = presets.addPreset(blankContent(), entry.id); onSelect(next); return next }
      const found = findCard(entry.draft, id)
      const created = makeId(found?.kind === 'cluster' ? 'cluster' : 'sub')
      if (found?.kind === 'cluster') edit(c => addCluster(c, found.parentId!, created, id), true)
      else edit(c => addSubcategory(c, created, id), true)
      return created
    },
    canCreateChild: id => findCard(entry.draft, id === entry.id ? ROOT : id)?.kind !== 'cluster',
    createChild: id => {
      if (id === entry.id) { const created = makeId('sub'); edit(c => addSubcategory(c, created, c.subcategories.at(-1)?.id), true); return created }
      const created = makeId('cluster')
      edit(c => {
        const found = findCard(c, id)
        return addCluster(c, id, created, found && 'clusters' in found.card ? found.card.clusters.at(-1)?.id : undefined)
      }, true)
      return created
    },
    canCreateParentSibling: id => id !== entry.id,
    createParentSibling: id => {
      const found = findCard(entry.draft, id)
      if (found?.kind === 'cluster') { const created = makeId('sub'); edit(c => addSubcategory(c, created, found.parentId!), true); return created }
      const next = presets.addPreset(blankContent(), entry.id)
      onSelect(next)
      return next
    },
    remove: id => {
      if (id === entry.id) onRemove(entry.id)
      else edit(c => removeCard(c, id), true)
    },
  }
  const keys = useNodeKeys(adapter)

  function ask(next: Confirm) {
    setVersionsOpen(false)
    setConfirm(next)
  }
  const bring = (version: number) => (draftWouldBeLost ? ask({ kind: 'restore', version }) : void presets.restore(entry.id, version))

  const summary = (() => {
    if (faults.length > 0) return <><b>Cannot publish yet.</b> {faults[0].message}{faults.length > 1 ? ` (${faults.length - 1} more)` : ''}</>
    if (status === 'live') return <>Live since {when(entry.published!.publishedAt)}. The draft matches it. Projects keep the copy they already made.</>
    if (status === 'pending') {
      const c = describeChanges(entry.published!.content, entry.draft)
      const parts = [c.added.length && `${c.added.length} added`, c.changed.length && `${c.changed.length} changed`, c.removed.length && `${c.removed.length} removed`].filter(Boolean)
      return <>Live since {when(entry.published!.publishedAt)}. The draft differs{parts.length ? `: ${parts.join(', ')}` : ''}. Projects keep the copy they already made.</>
    }
    if (status === 'off') return <>The Plot sidebar no longer offers it. Publish it to offer it again.</>
    return <>Publish it to offer it in the Plot sidebar&rsquo;s + Preset list.</>
  })()

  const confirmText = confirm?.kind === 'delete'
    ? (entry.published || entry.history.length > 0
      ? <>Delete <b>{label}</b>? It also leaves the + Preset list, and its published versions are removed. Categories already in projects stay.</>
      : <>Delete <b>{label}</b>? It was never published, so the Plot sidebar is not affected.</>)
    : confirm?.kind === 'discard'
      ? (entry.published
        ? <>Discard your changes to <b>{label}</b> and go back to v{entry.published.version}?</>
        : <>Clear <b>{label}</b>? It has no published copy to go back to, so its description, keywords, fields, subcategories and clusters are removed. Its name stays{entry.history.length > 0 ? ', and its earlier versions stay under Versions' : ''}.</>)
      : confirm?.kind === 'restore'
        ? <>Bring v{confirm.version} into the draft? Your unpublished changes to <b>{label}</b> will be replaced.</>
        : null

  function runConfirm() {
    const c = confirm
    setConfirm(null)
    if (!c) return
    if (c.kind === 'delete') onRemove(entry.id)
    else if (c.kind === 'discard') void presets.discard(entry.id)
    else void presets.restore(entry.id, c.version)
  }

  const ctx: TreeCtx = { edit, makeId, faults: faultMap }

  return (
    <div className="plpPane" onKeyDown={keys.onKeyDown}>
      <fieldset className="plpFieldset" disabled={presets.busy} aria-busy={presets.busy}>
        <div className="plpTools" role="toolbar" aria-label={`Actions for ${label}`}>
          <div className="plpToolGroup">
            <button
              type="button" className="plpBtn plpBtn--primary" disabled={faults.length > 0 || nothingToPublish}
              title={faults.length > 0 ? faults[0].message : nothingToPublish ? `Nothing has changed since v${entry.published?.version}` : undefined}
              onClick={() => setPublishing(true)}
            >Publish v{entry.nextVersion}</button>
            <button type="button" className="plpBtn" disabled={!canDiscard} title={entry.published ? undefined : 'No published copy to go back to: clears the preset'} onClick={() => ask({ kind: 'discard' })}><UndoIcon size={13} /> Discard changes</button>
            <button type="button" className="plpBtn" disabled={!entry.published} onClick={() => void presets.unpublish(entry.id)}><EyeOffIcon size={13} /> Unpublish</button>
            <span className="plpMenuAnchor" ref={menuRoot}>
              <button type="button" className="plpBtn" aria-expanded={versionsOpen} disabled={versions.length === 0} onClick={() => setVersionsOpen(o => !o)}><HistoryIcon size={13} /> Versions</button>
              {versionsOpen && <VersionsMenu entry={entry} onBring={bring} />}
            </span>
          </div>
          <div className="plpToolGroup">
            <button type="button" className="plpBtn" onClick={() => { const id = presets.duplicatePreset(entry.id); if (id) { onSelect(id); focusNodeField(id, 'first') } }}><CopyIcon size={13} /> Duplicate</button>
            <button type="button" className="plpBtn" onClick={() => onExport(entry)}><ExportIcon size={13} /> Export</button>
          </div>
        </div>
        <p className="plpStatus" role="status"><StatusBadge entry={entry} /> {summary}</p>
        {presets.actionError && (
          <p className="plpErr" role="alert">
            {presets.actionError} <button type="button" className="plpLink" onClick={presets.clearActionError}>Dismiss</button>
          </p>
        )}
        {confirm && (
          <div className="plpConfirmBar" role="alertdialog" aria-label="Confirm">
            <span>{confirmText}</span>
            <span className="plpConfirmBtns">
              <button type="button" className="plpBtn plpBtn--small plpBtn--primary" onClick={runConfirm}>Confirm</button>
              <button type="button" className="plpBtn plpBtn--small" onClick={() => setConfirm(null)}>Cancel</button>
            </span>
          </div>
        )}
        <div className="plpTree">
          <PresetTree
            content={entry.draft} entryId={entry.id} ctx={ctx}
            nameInput={<PresetNameField entry={entry} entries={entries} onRename={name => edit(c => updateCard(c, ROOT, { name }))} />}
            onDelete={() => (isBlankCard(entry.draft) && !entry.published && entry.history.length === 0 ? onRemove(entry.id) : ask({ kind: 'delete' }))}
          />
        </div>
      </fieldset>
      {publishing && (
        <PublishDialog
          entry={entry} onCancel={() => setPublishing(false)}
          onPublish={() => { setPublishing(false); void presets.publish(entry.id) }}
        />
      )}
    </div>
  )
}
