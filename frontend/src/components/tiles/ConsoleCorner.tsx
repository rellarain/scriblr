import { useState, type ReactNode } from 'react'
import { GearIcon, HelpIcon } from '../../assets/icons'

// Settings and Help for an expanded console: two round buttons at its bottom right.
// Each opens a panel over the console (the same button closes it again). The
// console must be positioned (`position: relative`) for them to sit in its corner.
const DEFAULT_SETTINGS = 'Preferences, customization and configuration for this console.'
const DEFAULT_HELP = 'Resources and assistance using this console.'

// `under`: the corner belongs to a screen that has tiles which expand over it, so it sits beneath them.
function ConsoleCorner({ settings, help, under, initial = null }: { settings?: ReactNode; help?: ReactNode; under?: boolean; initial?: 'settings' | 'help' | null }) {
  const [panel, setPanel] = useState<'settings' | 'help' | null>(initial)
  const toggle = (which: 'settings' | 'help') => setPanel(cur => (cur === which ? null : which))
  return (
    <>
      {panel && (
        <div className={under ? 'ccPanel ccPanel--under' : 'ccPanel'} role="region" aria-label={panel === 'settings' ? 'Settings' : 'Help'}>
          <h2>{panel === 'settings' ? 'Settings' : 'Help'}</h2>
          {panel === 'settings' ? (settings ?? <p>{DEFAULT_SETTINGS}</p>) : (help ?? <p>{DEFAULT_HELP}</p>)}
        </div>
      )}
      <div className={under ? 'ccButtons ccButtons--under' : 'ccButtons'}>
        <button type="button" className={panel === 'help' ? 'ccBtn ccBtn--on' : 'ccBtn'} aria-label="Help" title="Help" aria-pressed={panel === 'help'} onClick={() => toggle('help')}>
          <HelpIcon size={16} />
        </button>
        <button type="button" className={panel === 'settings' ? 'ccBtn ccBtn--on' : 'ccBtn'} aria-label="Settings" title="Settings" aria-pressed={panel === 'settings'} onClick={() => toggle('settings')}>
          <GearIcon size={16} />
        </button>
      </div>
    </>
  )
}

export default ConsoleCorner
