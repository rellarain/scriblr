import { useEffect, useState } from 'react'
import type { Handedness, HuiPanel } from '../../interfaceShellTypes'
import type { HelperChats } from './helper/useHelperChats'
import ChatsSection from './helper/ChatsSection'
import InboxSection from './helper/inbox/InboxSection'
import SettingsSection from './helper/SettingsSection'
import QueueSection from './helper/QueueSection'
import { ChatBubblesIcon, GearIcon, HelpIcon, InboxIcon, QueueIcon } from '../icons'
import HelpTile from '../../components/help/HelpTile'
import { HELP_TARGETS } from '../../channels/helpTargets'
import TileArea, { type AreaTile } from '../../components/tiles/TileArea'

interface HUIProps {
  side: Handedness
  helper: HelperChats
  panel: HuiPanel
}

// The Helper panel (400px wide) as tiles, each a console of its own: Inbox, Queue, the selected chat's conversation
// while one is open, Help, and Settings last (the global tile, components/tiles/TileArea.tsx). The sidebar divider's buttons choose
// which tile is open (a selected chat head always wins); the tab bar opens the others.
function HUI({ side, helper, panel }: HUIProps) {
  const chatOpen = helper.selectedChatId != null
  const wanted: string = chatOpen ? 'chat' : panel
  const ids = chatOpen ? ['inbox', 'queue', 'chat', 'help', 'settings'] : ['inbox', 'queue', 'help', 'settings']
  // What the user opened or minimized inside the panel; it gives way whenever the sidebar buttons change the choice.
  const [minimized, setMinimized] = useState<string[] | null>(null)
  useEffect(() => { setMinimized(null) }, [wanted])
  const hidden = minimized ?? ids.filter(id => id !== wanted)

  const tiles: AreaTile[] = [
    { id: 'inbox', title: 'Inbox', Icon: InboxIcon, children: <InboxSection /> },
    { id: 'queue', title: 'Queue', Icon: QueueIcon, children: <QueueSection /> },
  ]
  if (chatOpen) tiles.push({ id: 'chat', title: 'Conversation', Icon: ChatBubblesIcon, children: <ChatsSection helper={helper} /> })
  tiles.push({ id: 'help', title: 'Help', Icon: HelpIcon, children: <HelpTile target={HELP_TARGETS.helper} fallback="Resources and assistance using the Helper panel here." /> })
  // Settings is a console like the others, and always the last in the rail.
  tiles.push({ id: 'settings', title: 'Settings', Icon: GearIcon, children: <SettingsSection /> })

  return (
    <section className="hUI" aria-label={`Helper panel (${side})`}>
      <div className="hUIMain hUIMain--tiles">
        <TileArea
          gridId="hui" label="Helper tiles" bar tiles={tiles} minimized={hidden}
          onMinimizedChange={(id, on) => setMinimized(prev => { const cur = prev ?? hidden; return on ? [...cur.filter(x => x !== id), id] : cur.filter(x => x !== id) })}
        />
      </div>
    </section>
  )
}

export default HUI
