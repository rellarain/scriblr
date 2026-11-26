export type MainInterface = 'reader' | 'learning' | 'writer'
export type Handedness = 'left' | 'right'

// Which content HUI's main panel shows when no chat head is selected
// (a selected chat always takes priority over this) -- Queue is the
// default; each is opened by HUI's buttons in the band under the header.
export type HuiPanel = 'queue' | 'outbox' | 'settings'
