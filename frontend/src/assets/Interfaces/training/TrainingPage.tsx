import type { ComponentType, ReactNode } from 'react'
import type { IconProps } from '../../icons'
import { TRAINING_PAGES, type TrainingPageKey } from './trainingPages'

// The body of a Training tab: the page's name and what it is, then what is on it (or that nothing is yet).
export function TrainingPage({ page, children }: { page: TrainingPageKey; children?: ReactNode }) {
  const { label, definition } = TRAINING_PAGES[page]
  return (
    <div className="trPage">
      <header className="trPageHead">
        <h3 className="trPageTitle">{label}</h3>
        <p className="trPageDefinition">{definition}</p>
      </header>
      {children}
    </div>
  )
}

export function TrainingEmpty({ children }: { children: ReactNode }) {
  return <p className="wrMuted trEmpty">{children}</p>
}

export interface TrainingRow {
  id: string
  title: string
  // A second line under the title (a course's blurb).
  detail?: string
  onOpen: () => void
  // An icon button at the row's right end (Enrol, Leave).
  action?: { label: string; Icon: ComponentType<IconProps>; pressed?: boolean; onClick: () => void }
}

// A list of things to open: each title opens it, and a row may carry one icon button of its own.
export function TrainingList({ label, openLabel, Icon, rows }: { label: string; openLabel: (title: string) => string; Icon: ComponentType<IconProps>; rows: TrainingRow[] }) {
  return (
    <ul className="trList" aria-label={label}>
      {rows.map(row => (
        <li key={row.id} className="trRow">
          <button type="button" className="trRowOpen" aria-label={openLabel(row.title)} title={openLabel(row.title)} onClick={row.onOpen}>
            <Icon size={18} />
            <span className="trRowText"><span className="trRowTitle">{row.title}</span>{row.detail && <span className="trRowDetail">{row.detail}</span>}</span>
          </button>
          {row.action && (
            <button
              type="button" className="trRowAction" aria-label={row.action.label} title={row.action.label}
              {...(row.action.pressed !== undefined ? { 'aria-pressed': row.action.pressed } : {})} onClick={row.action.onClick}
            >
              <row.action.Icon size={18} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
