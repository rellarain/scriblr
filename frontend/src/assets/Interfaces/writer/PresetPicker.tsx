import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { getPublishedPresets } from '../../../api/presetsApi'
import type { PresetContent, PublishedPresetOut } from '../../../api/types'
import { PlusIcon } from '../../icons'

// The Plot sidebar's "+ Preset": a list of the published plot presets (set up in Admin > Configuration > Plot), each with its name and
// description. Choosing one adds it to the project at once (a plain copy: see plotPreset.ts) and opens it. The list is read each time it opens,
// so a preset published in Admin shows up without reloading the Writer.

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; presets: PublishedPresetOut[] }

export function PresetPicker({ onChoose }: {
  // Add this preset to the project; the picker closes.
  onChoose: (preset: PresetContent) => void
}) {
  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const request = useRef(0)

  function fetchList() {
    const mine = (request.current += 1)
    setLoad({ status: 'loading' })
    getPublishedPresets().then(
      list => { if (request.current === mine) setLoad({ status: 'ready', presets: list.presets }) },
      () => { if (request.current === mine) setLoad({ status: 'error' }) },
    )
  }

  function show() {
    setOpen(true)
    fetchList()
  }
  function close(refocus: boolean) {
    setOpen(false)
    request.current += 1
    if (refocus) button.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) close(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  // When the list arrives (or the note that there is none), the first row has the focus, so the keyboard can go straight to it.
  useEffect(() => {
    if (open && load.status === 'ready') root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open, load.status])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.stopPropagation(); close(true); return }
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (items.length === 0) return
      e.preventDefault()
      items[e.key === 'ArrowDown' ? (at + 1) % items.length : at <= 0 ? items.length - 1 : at - 1].focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      if (items.length === 0) return
      e.preventDefault()
      items[e.key === 'Home' ? 0 : items.length - 1].focus()
    }
  }

  return (
    <div className="wrPresetPickerRoot" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={button} type="button" className="wrSmallBtn wrPlotNavAdd" aria-haspopup="menu" aria-expanded={open}
        onClick={() => (open ? close(false) : show())}
      >
        <PlusIcon size={13} /> Preset
      </button>
      {open && (
        <div className="wrPresetPicker" role="menu" aria-label="Add a preset">
          <div className="wrPresetPickerHead">Add a preset</div>
          {load.status === 'loading' && <div className="wrPresetNote" role="status">Loading presets…</div>}
          {load.status === 'error' && (
            <div className="wrPresetNote" role="alert">
              <span>Couldn&rsquo;t load the presets. Check that Scriblr is running, then try again.</span>
              <button type="button" className="wrSmallBtn wrSmallBtn--accent" onClick={fetchList}>Try again</button>
            </div>
          )}
          {load.status === 'ready' && load.presets.length === 0 && (
            <div className="wrPresetNote" role="status">No presets are published yet. Publish one in Admin &rsaquo; Configuration &rsaquo; Plot.</div>
          )}
          {load.status === 'ready' && load.presets.map(p => (
            <button key={p.id} type="button" role="menuitem" className="wrPresetRow" onClick={() => { close(false); onChoose(p.content) }}>
              <span className="wrPresetName">{p.content.name}</span>
              {p.content.description && <span className="wrPresetDesc">{p.content.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
