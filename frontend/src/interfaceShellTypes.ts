export type MainInterface = 'reader' | 'translator' | 'writer'
export type Handedness = 'left' | 'right'

// Which content HUI's main panel shows when no chat head is selected
// (a selected chat always takes priority over this) -- Inbox is the
// default, Settings/Queue are opened via the sidebar divider's buttons.
export type HuiPanel = 'inbox' | 'settings' | 'queue'
