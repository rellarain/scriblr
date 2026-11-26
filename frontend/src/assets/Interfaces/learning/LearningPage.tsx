import { useState, type ComponentType, type ReactNode } from 'react'
import type { TrainingAssessment, TrainingProgress } from '../../../api/types'
import CopyPlainText from '../../../components/markup/CopyPlainText'
import Markup, { MarkupInline } from '../../../components/markup/Markup'
import MarkupPlace from '../../../components/markup/MarkupPlace'
import QuizTaker from '../../../components/markup/QuizTaker'
import { recordAttempt } from './learningStore'
import { CheckboxIcon, ChevronLeftIcon, PlayIcon, type IconProps } from '../../icons'
import { assessmentResult, resultText } from './learningContent'
import { LEARNING_PAGES, type LearningPageKey } from './learningPages'

// A button that marks the thing a page or a row is about complete (or not): pressed when it is.
export interface DoneAction { label: string; done: boolean; onClick: () => void }

function DoneButton({ action }: { action: DoneAction }) {
  return (
    <button type="button" className="lrRowAction" aria-label={action.label} title={action.label} aria-pressed={action.done} onClick={action.onClick}>
      <CheckboxIcon size={18} />
    </button>
  )
}

// The body of a Learning tab: the page's name and what it is (with, for a page about one thing, the button that marks it complete), then
// what is on it (or that nothing is yet).
export function LearningPage({ page, done, children }: { page: LearningPageKey; done?: DoneAction; children?: ReactNode }) {
  const { label, definition } = LEARNING_PAGES[page]
  return (
    <div className="lrPage">
      <header className="lrPageHead">
        <div className="lrPageTitleRow">
          <h3 className="lrPageTitle">{label}</h3>
          {done && <DoneButton action={done} />}
        </div>
        <p className="lrPageDefinition">{definition}</p>
      </header>
      {children}
    </div>
  )
}

export function LearningEmpty({ children }: { children: ReactNode }) {
  return <p className="wrMuted lrEmpty">{children}</p>
}

export interface RowAction {
  label: string
  Icon: ComponentType<IconProps>
  pressed?: boolean
  onClick: () => void
}

export interface LearningRow {
  id: string
  title: string
  // A second line under the title: what it is (a description in the markup, its first line's words only), then `detail`.
  about?: string
  detail?: string
  onOpen: () => void
  // Icon buttons at the row's right end (Enrol, Leave, mark complete).
  actions?: RowAction[]
  done?: DoneAction
}

// A list of things to open: each title opens it, and a row may carry icon buttons of its own.
export function LearningList({ label, openLabel, Icon, rows }: { label: string; openLabel: (title: string) => string; Icon: ComponentType<IconProps>; rows: LearningRow[] }) {
  return (
    <ul className="lrList" aria-label={label}>
      {rows.map(row => (
        <li key={row.id} className="lrRow">
          <button type="button" className="lrRowOpen" aria-label={openLabel(row.title)} title={openLabel(row.title)} onClick={row.onOpen}>
            <Icon size={18} />
            <span className="lrRowText"><span className="lrRowTitle">{row.title}</span><RowDetail about={row.about} detail={row.detail} /></span>
          </button>
          {row.actions?.map(a => (
            <button
              key={a.label} type="button" className="lrRowAction" aria-label={a.label} title={a.label}
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

// A row's second line: the first line of its description (in the markup) and the rest, with a dot between.
export function RowDetail({ about, detail }: { about?: string; detail?: string }) {
  const hasAbout = !!about && about.trim() !== ''
  if (!hasAbout && !detail) return null
  return <span className="lrRowDetail">{hasAbout && <MarkupInline text={about} />}{hasAbout && detail ? ' · ' : ''}{detail}</span>
}

// What a course, module, lesson, exercise or project is: its description in the markup (a link in it opens in its place, with Back).
export function LearningAbout({ text }: { text: string }) {
  if (text.trim() === '') return null
  return <MarkupPlace><Markup text={text} baseLevel={3} className="lrAbout" /></MarkupPlace>
}

// The quizzes, tests or exams of something: each with its pass mark and how the learner did, and a button that takes it (the quiz taker, in
// place of the list, with Back). Submitting keeps the result; passing marks the lesson, module or course complete.
export function LearningAssessments({ label, items, progress, none }: { label: string; items: TrainingAssessment[]; progress: TrainingProgress; none: string }) {
  const [taking, setTaking] = useState<string | null>(null)
  const open = items.find(i => i.id === taking)
  if (items.length === 0) return <LearningEmpty>{none}</LearningEmpty>
  if (open) {
    return (
      <section className="lrQuiz" aria-label={open.title}>
        <div className="lrQuizHead">
          <button type="button" className="lrRowAction" aria-label="Back" title="Back" onClick={() => setTaking(null)}><ChevronLeftIcon size={18} /></button>
          <h4 className="lrQuizTitle">{open.title}</h4>
        </div>
        <LearningAbout text={open.description} />
        <QuizTaker key={open.id} text={open.text} passMark={open.passMark} onSubmit={score => recordAttempt(open.id, score)} />
      </section>
    )
  }
  return (
    <ul className="lrList" aria-label={label}>
      {items.map(item => (
        <li key={item.id} className="lrRow">
          <span className="lrRowText lrRowText--static lrRowText--grow">
            <span className="lrRowTitle">{item.title}</span>
            <RowDetail about={item.description} detail={[`Pass mark ${item.passMark}%`, resultText(assessmentResult(progress, item.id))].filter(Boolean).join(' · ')} />
          </span>
          <button type="button" className="lrRowAction" aria-label={`Take ${item.title}`} title={`Take ${item.title}`} onClick={() => setTaking(item.id)}><PlayIcon size={18} /></button>
        </li>
      ))}
    </ul>
  )
}

// A lesson's material, formatted from the markup, with Copy as plain text. A link in it opens in the lesson's place, with Back.
export function LearningMaterial({ source, title }: { source: string; title: string }) {
  return (
    <MarkupPlace className="lrMaterial">
      <div className="lrMaterialBar"><CopyPlainText text={source} label={`Copy ${title} as plain text`} /></div>
      <Markup text={source} baseLevel={3} />
    </MarkupPlace>
  )
}
