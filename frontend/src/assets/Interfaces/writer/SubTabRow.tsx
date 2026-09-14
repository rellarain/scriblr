import type { SubTabDef } from './wuiSubTabDefs'

function SubTabRow<K extends string>({ subTabs, activeKey, onSelect }: {
  subTabs: SubTabDef<K>[]
  activeKey: K
  onSelect: (key: K) => void
}) {
  return (
    <nav className="subTabRow" aria-label="Sub-section tabs">
      {subTabs.map(({ key, label, Icon }) => (
        <button
          key={key} type="button"
          className={key === activeKey ? 'subTabBtn subTabBtn--active' : 'subTabBtn'}
          aria-pressed={key === activeKey}
          onClick={() => onSelect(key)}
        >
          <span className="subTabBtnMain"><Icon /> {label}</span>
        </button>
      ))}
    </nav>
  )
}

export default SubTabRow
