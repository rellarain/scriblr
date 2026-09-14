import { GearIcon, HelpIcon } from '../../icons'
import type { SubTabDef } from './wuiSubTabDefs'

interface ConsoleCornerButtonsProps<K extends string> {
  activeKey: K
  helpSubTab?: SubTabDef<K>
  settingsSubTab?: SubTabDef<K>
  onSelect: (key: K) => void
}

// Persistent Help/Settings corner buttons, decentralized to each console's
// own mount point (see WuiSidebar/ShelfLayer/BookLayer) rather than one
// shared cross-console dispatcher -- keeps each console self-contained.
function ConsoleCornerButtons<K extends string>({ activeKey, helpSubTab, settingsSubTab, onSelect }: ConsoleCornerButtonsProps<K>) {
  return (
    <>
      <button
        type="button"
        className={activeKey === helpSubTab?.key ? 'wUICornerBtn wUICornerBtn--help wUICornerBtn--active' : 'wUICornerBtn wUICornerBtn--help'}
        aria-label="Help" title="Help"
        disabled={!helpSubTab}
        onClick={() => helpSubTab && onSelect(helpSubTab.key)}
      >
        <HelpIcon size={18} />
      </button>
      <button
        type="button"
        className={activeKey === settingsSubTab?.key ? 'wUICornerBtn wUICornerBtn--settings wUICornerBtn--active' : 'wUICornerBtn wUICornerBtn--settings'}
        aria-label="Settings" title="Settings"
        disabled={!settingsSubTab}
        onClick={() => settingsSubTab && onSelect(settingsSubTab.key)}
      >
        <GearIcon size={18} />
      </button>
    </>
  )
}

export default ConsoleCornerButtons
