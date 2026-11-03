import type { ComponentType, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { TrainingAssessment, TrainingProgress } from '../../../api/types'
import { CheckboxIcon, type IconProps } from '../../icons'
import { assessmentResult, resultText } from './trainingContent'
import { TRAINING_PAGES, type TrainingPageKey } from './trainingPages'

// A button that marks the thing a page or a row is about complete (or not): pressed when it is.
export interface DoneAction { label: string; done: boolean; onClick: () => void }

function DoneButton({ action }: { action: DoneAction }) {
  return (
    <button type="button" className="trRowAction" aria-label={action.label} title={action.label} aria-pressed={action.done} onClick={action.onClick}>
      <CheckboxIcon size={18} />
    </button>
  )
}

// The body of a Training tab: the page's name and what it is (with, for a page about one thing, the button that marks it complete), then
// what is on it (or that nothing is yet).
export function TrainingPage({ page, done, children }: { page: TrainingPageKey; done?: DoneAction; children?: ReactNode }) {
  const { label, definition } = TRAINING_PAGES[page]
  return (
    <div className="trPage">
      <header className="trPageHead">
        <div className="trPageTitleRow">
          <h3 className="trPageTitle">{label}</h3>
          {done && <DoneButton action={done} />}
        </div>
        <p className="trPageDefinition">{definition}</p>
      </header>
      {children}
    </div>
  )
}

export function TrainingEmpty({ children }: { children: ReactNode }) {
  return <p className="wrMuted trEmpty">{children}</p>
}

export interface RowAction {
  label: string
  Icon: ComponentType<IconProps>
  pressed?: boolean
  onClick: () => void
}

export interface TrainingRow {
  id: string
  title: string
  // A second line under the title.
  detail?: string
  onOpen: () => void
  // Icon buttons at the row's right end (Enrol, Leave, mark complete).
  actions?: RowAction[]
  done?: DoneAction
}

// A list of things to open: each title opens it, and a row may carry icon buttons of its own.
export function TrainingList({ label, openLabel, Icon, rows }: { label: string; openLabel: (title: string) => string; Icon: ComponentType<IconProps>; rows: TrainingRow[] }) {
  return (
    <ul className="trList" aria-label={label}>
      {rows.map(row => (
        <li key={row.id} className="trRow">
          <button type="button" className="trRowOpen" aria-label={openLabel(row.title)} title={openLabel(row.title)} onClick={row.onOpen}>
            <Icon size={18} />
            <span className="trRowText"><span className="trRowTitle">{row.title}</span>{row.detail && <span className="trRowDetail">{row.detail}</span>}</span>
          </button>
          {row.actions?.map(a => (
            <button
              key={a.label} type="button" className="trRowAction" aria-label={a.label} title={a.label}
              {...(a.pressed !== undefined ? { 'aria-pressed': a.pressed } : {})} onClick={a.onClick}
            >
              <a.Icon size={18} />
            </button>
          ))}
          {row.done && <DoneButton action={row.done} />}
        </li>
      ))}
    </ul>
  )
}

// The quizzes, tests or exams of something: each with its pass mark and how the learner did. (There is no taking one yet: a result is kept
// when there is one, through the API.)
export function TrainingAssessments({ label, items, progress, none }: { label: string; items: TrainingAssessment[]; progress: TrainingProgress; none: string }) {
  if (items.length === 0) return <TrainingEmpty>{none}</TrainingEmpty>
  return (
    <ul className="trList" aria-label={label}>
      {items.map(item => (
        <li key={item.id} className="trRow trRow--static">
          <span className="trRowText trRowText--static">
            <span className="trRowTitle">{item.title}</span>
            <span className="trRowDetail">{[item.description, `Pass mark ${item.passMark}%`, resultText(assessmentResult(progress, item.id))].filter(Boolean).join(' · ')}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

// A lesson's material: Markdown.
export function TrainingMarkdown({ source }: { source: string }) {
  return <div className="trMarkdown"><ReactMarkdown>{source}</ReactMarkdown></div>
}
