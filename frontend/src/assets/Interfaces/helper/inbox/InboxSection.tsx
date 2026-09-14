import { useState } from 'react'
import type { ComponentType } from 'react'
import { ToningIcon, SortingIcon, ExplicatingIcon, type IconProps } from '../../../icons'
import { useInboxPipeline } from './useInboxPipeline'
import ToneTab from './ToneTab'
import SortingTab from './SortingTab'
import ExplicateTab from './ExplicateTab'

type InboxTabKey = 'tone' | 'sorting' | 'explicate'

const TABS: Array<{ key: InboxTabKey; label: string; Icon: ComponentType<IconProps> }> = [
  { key: 'tone', label: 'Tone', Icon: ToningIcon },
  { key: 'sorting', label: 'Sort', Icon: SortingIcon },
  { key: 'explicate', label: 'Explicate', Icon: ExplicatingIcon },
]

// The Inbox Console: processes assigned feedback through 3 annotation
// steps (scrilbrPlan.md's Helper page, Inbox Console) -- relocated as-is
// from the old Admin-side feedback pipeline, which had these backwards.
function InboxSection() {
  const [activeTab, setActiveTab] = useState<InboxTabKey>('tone')
  const pipeline = useInboxPipeline()

  const counts: Record<InboxTabKey, { count: number; total: number }> = {
    tone: { count: pipeline.untoned.length, total: pipeline.items.length },
    sorting: { count: pipeline.unchanneled.length, total: pipeline.items.length },
    explicate: { count: pipeline.unexplicatedSubjects.length, total: pipeline.subjects.length },
  }

  return (
    <div className="inboxSection">
      <nav className="subTabRow subTabRow--expand" aria-label="Inbox processing steps">
        {TABS.map(({ key, label, Icon }) => {
          const { count, total } = counts[key]
          const pct = total ? Math.round(((total - count) / total) * 100) : 0
          return (
            <button
              key={key} type="button"
              className={key === activeTab ? 'subTabBtn subTabBtn--active subTabBtn--withCount subTabBtn--expand' : 'subTabBtn subTabBtn--withCount subTabBtn--expand'}
              aria-pressed={key === activeTab}
              onClick={() => setActiveTab(key)}
            >
              <span className="subTabBtnMain"><Icon size={16} /> {label}</span>
              <span className="subTabCount">
                <span className="subTabCountFill" style={{ width: `${pct}%` }} />
              </span>
              <span className="subTabCountLabel">
                {count} <span className="subTabCountTotal"><span className="subTabCountSlash">/</span> {total}</span>
              </span>
            </button>
          )
        })}
      </nav>
      <div className={activeTab === 'sorting' ? 'sectionBody sectionBody--noScrollbar' : 'sectionBody'}>
        {activeTab === 'tone' && <ToneTab items={pipeline.items} onSetTone={pipeline.setTone} />}
        {activeTab === 'sorting' && (
          <SortingTab
            items={pipeline.items}
            onAddChannelTag={pipeline.addChannelTag}
            onRemoveChannelTag={pipeline.removeChannelTag}
            toneProcessingOrder={pipeline.toneProcessingOrder}
            onMoveTonePriority={pipeline.moveTonePriority}
          />
        )}
        {activeTab === 'explicate' && (
          <ExplicateTab
            subjects={pipeline.subjects} items={pipeline.items} statements={pipeline.statements}
            onAddStatement={pipeline.addStatement}
            onUpdateStatement={pipeline.updateStatement}
            onRemoveStatement={pipeline.removeStatement}
          />
        )}
      </div>
    </div>
  )
}

export default InboxSection
