import { useRef, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { IconProps } from '../../../icons'
import { useStoredState } from '../../writer/storage'

// A tile of the Office (2026-11-16) with its parts as tabs in its title bar (icons, the open one pressed: the tile tab bar's look), and,
// for a tile about one of several things (a department, a team, a console, a person, a user), a picker at the top of its body. The open
// tab and the thing picked are remembered on this computer.

export interface OfficeTab { id: string; label: string; Icon: ComponentType<IconProps>; render: (subject: string) => ReactNode }
export interface OfficeSubject { id: string; name: string }

export function TabbedTile({ id, label, tabs, host, subjects, subjectLabel, empty }: {
  id: string
  label: string
  tabs: OfficeTab[]
  // the slot in the tile's title bar (the tabs are drawn at the top of the body until it is there)
  host: HTMLElement | null
  subjects?: OfficeSubject[]
  subjectLabel?: string
  // shown in place of the picker when there is nothing to pick (or while the things are loading)
  empty?: ReactNode
}) {
  const [tabId, setTab] = useStoredState(`scriblr.office.${id}.tab`, tabs[0].id)
  const [chosen, setSubject] = useStoredState(`scriblr.office.${id}.subject`, '')
  const tab = tabs.find(t => t.id === tabId) ?? tabs[0]
  const subject = subjects ? (subjects.some(s => s.id === chosen) ? chosen : subjects[0]?.id ?? '') : ''
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})
  const onKey = (e: KeyboardEvent, k: number) => {
    const n = tabs.length
    const next = e.key === 'ArrowRight' ? (k + 1) % n : e.key === 'ArrowLeft' ? (k - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setTab(tabs[next].id)
    buttons.current[tabs[next].id]?.focus()
  }
  const bar = (
    <div className="tileTabBar ofTabs" role="tablist" aria-label={`${label} tabs`}>
      {tabs.map((t, k) => {
        const on = t.id === tab.id
        return (
          <button
            key={t.id} ref={el => { buttons.current[t.id] = el }} type="button" role="tab" id={`of-${id}-${t.id}`} aria-selected={on} aria-controls={`of-${id}-panel`}
            tabIndex={on ? 0 : -1} className={on ? 'tileTabBtn tileTabBtn--on' : 'tileTabBtn'} aria-label={t.label} title={t.label}
            onClick={() => setTab(t.id)} onKeyDown={e => onKey(e, k)}
          ><t.Icon size={14} /></button>
        )
      })}
    </div>
  )
  return (
    <div className="ofTile">
      {host ? createPortal(bar, host) : bar}
      {subjects && (subjects.length > 0
        ? (
          <select className="fbSelect ofPicker" value={subject} aria-label={subjectLabel ?? label} onChange={e => setSubject(e.target.value)}>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )
        : <div className="fbMuted">{empty ?? 'Nothing yet.'}</div>)}
      <div className="ofPanel" role="tabpanel" id={`of-${id}-panel`} aria-labelledby={`of-${id}-${tab.id}`}>
        {!subjects || subject ? tab.render(subject) : null}
      </div>
    </div>
  )
}

// A part that has no data in the app yet: what it will hold (the user, 2026-11-16).
export function Soon({ children }: { children: ReactNode }) {
  return <p className="fbMuted ofSoon">{children}</p>
}
