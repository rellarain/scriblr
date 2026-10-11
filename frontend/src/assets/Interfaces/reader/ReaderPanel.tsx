import type { ComponentType, ReactNode } from 'react'
import { ChevronDownIcon, type IconProps } from '../../icons'
import { anyFull, grow, shrink, toggleIcon, type ConsoleState, type ConsoleStates } from './consoleStates'

// One Reader page: a header with the page's title, an icon for each of its consoles, then the open consoles as tiles or the one full console.

export interface ConsoleDef {
  id: string
  label: string
  Icon: ComponentType<IconProps>
  render: (size: Exclude<ConsoleState, 'min'>) => ReactNode
  // Takes the whole row of the grid (the e-reader's page).
  wide?: boolean
}

interface ReaderPanelProps {
  title: string
  Icon: ComponentType<IconProps>
  // The level's fill (a CSS colour); white text is on it.
  color: string
  consoles: ConsoleDef[]
  states: ConsoleStates
  onStates: (next: ConsoleStates) => void
  right?: ReactNode
  // Shown above the consoles (a badge, a notice).
  notice?: ReactNode
  // Edge tabs down the panel's right edge.
  edge?: ReactNode
  className?: string
}

export function ReaderPanel({ title, Icon, color, consoles, states, onStates, right, notice, edge, className }: ReaderPanelProps) {
  const open = consoles.filter(c => states[c.id] && states[c.id] !== 'min')
  return (
    <section className={['rdLevel', edge ? 'rdLevel--edge' : '', className ?? ''].filter(Boolean).join(' ')} style={{ ['--rd-f' as string]: color }} aria-label={title}>
      {edge}
      <header className="rdLevelHead">
        <h2 className="rdLevelTitle"><Icon size={20} />{title}</h2>
        <div className="rdBar" role="toolbar" aria-label={`${title} consoles`}>
          {consoles.map(c => {
            const state = states[c.id] ?? 'min'
            return (
              <button
                key={c.id} type="button" aria-label={c.label} title={c.label} aria-pressed={state !== 'min'}
                className={`rdIconBtn${state === 'tile' ? ' rdIconBtn--open' : state === 'full' ? ' rdIconBtn--full' : ''}`}
                onClick={() => onStates(toggleIcon(states, c.id))}
              >
                <c.Icon size={20} />
              </button>
            )
          })}
        </div>
        <div className="rdLevelRight">{right}</div>
      </header>
      {notice}
      <div className={anyFull(states) ? 'rdGrid rdGrid--one' : 'rdGrid'}>
        {open.map(c => {
          const size = states[c.id] as Exclude<ConsoleState, 'min'>
          return (
            <section key={c.id} className={`rdCon rdCon--${size}${c.wide ? ' rdCon--wide' : ''}`} aria-label={c.label}>
              <div className="rdConHead">
                <button type="button" className="rdConTitle" onClick={() => onStates(grow(states, c.id))}><c.Icon size={20} />{c.label}</button>
                <button type="button" className="rdIconBtn rdIconBtn--small" aria-label={`Make ${c.label} smaller`} onClick={() => onStates(shrink(states, c.id))}>
                  <ChevronDownIcon size={20} />
                </button>
              </div>
              <div className="rdConBody">{c.render(size)}</div>
            </section>
          )
        })}
        {open.length === 0 && <p className="rdEmpty">Every console is an icon. Open one from the bar above.</p>}
      </div>
    </section>
  )
}
