export type MainInterface = 'reader' | 'translator' | 'writer'
export type Handedness = 'left' | 'right'

// Which content HUI's main panel shows when no chat head is selected
// (a selected chat always takes priority over this) -- Inbox is the
// default, Settings/Queue are opened via the sidebar divider's buttons.
export type HuiPanel = 'inbox' | 'settings' | 'queue'

// AUI's own panel width, picked from the size buttons at the bottom of
// its rail -- 'full' fills the rest of the screen (minus HUI's own
// current width), 'half' is half the viewport, 'column' matches a single
// HUI-panel-width column (400px).
export type AuiSize = 'full' | 'half' | 'column'
