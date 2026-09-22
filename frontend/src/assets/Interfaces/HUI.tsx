import { useEffect, useState } from 'react'
import type { Handedness, HuiPanel } from '../../interfaceShellTypes'
import type { HelperChats } from './helper/useHelperChats'
import ChatsSection from './helper/ChatsSection'
import InboxSection from './helper/inbox/InboxSection'
import SettingsSection from './helper/SettingsSection'
import QueueSection from './helper/QueueSection'
import { ChatBubblesIcon, GearIcon, InboxIcon, QueueIcon } from '../icons'
import TileGrid from '../../components/tiles/TileGrid'
import { TileSub } from '../../components/tiles/tileParts'
import type { TileDef } from '../../components/tiles/tileTypes'

interface HUIProps {
  side: Handedness
  helper: HelperChats
  panel: HuiPanel
}

// The Helper panel (400px wide) as tiles in one column: Inbox, Queue and Settings, plus
// the selected chat's conversation while one is open. The sidebar divider's buttons
// choose which console is open (a selected chat head always wins); Back returns to the
// tiles, and the mini tiles switch consoles from there.
function HUI({ side, helper, panel }: HUIProps) {
  const wanted: string = helper.selectedChatId != null ? 'chat' : panel
  // What the user did inside the panel (Back, a mini tile); it gives way whenever the buttons change the choice.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined)
  useEffect(() => { setChosen(undefined) }, [wanted])
  const open = chosen !== undefined ? chosen : wanted

  const tiles: TileDef[] = [
    {
      id: 'inbox', title: 'Inbox', Icon: InboxIcon, defaultShape: 'mid',
      summary: 'Validate, process and configure feedback',
      render: () => <TileSub>Feedback messages are validated by every admin, then processed as cases.</TileSub>,
      console: () => <InboxSection />,
    },
    {
      id: 'queue', title: 'Queue', Icon: QueueIcon, defaultShape: 'mid',
      summary: 'Chats you are accepting',
      render: () => <TileSub>Check a queue to accept chats from it.</TileSub>,
      console: () => <QueueSection />,
    },
    {
      id: 'settings', title: 'Settings', Icon: GearIcon, defaultShape: 'mini',
      summary: 'Helper page settings',
      render: () => <TileSub>Configure Helper page settings here.</TileSub>,
      console: () => <SettingsSection />,
    },
  ]
  if (helper.selectedChatId != null) {
    tiles.push({
      id: 'chat', title: 'Conversation', Icon: ChatBubblesIcon, defaultShape: 'mid',
      summary: 'The chat you have open',
      render: () => <TileSub>The chat you have open.</TileSub>,
      console: () => <ChatsSection helper={helper} />,
    })
  }

  return (
    <section className="hUI" aria-label={`Helper panel (${side})`}>
      <div className="hUIMain hUIMain--tiles">
        <TileGrid gridId="hui" label="Helper tiles" tiles={tiles} crumbs={[{ label: 'Helper' }]} open={open} onOpenChange={setChosen} />
      </div>
    </section>
  )
}

export default HUI
