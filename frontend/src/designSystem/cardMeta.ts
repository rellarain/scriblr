// What the design system says about each card: its id, the folder it lives in (components/<dir>/), the group it is listed under, a
// one-line summary and the height of its frame. Plain data, read by the cards (cards.tsx) and by the generator (scripts/design-system).

export interface CardMeta { id: string; dir: string; title: string; group: string; summary: string; height: number }

export const CARD_META: CardMeta[] = [
  {
    id: 'level-panels', dir: 'LevelPanels', title: 'Level panels, headers and tabs', group: 'Layout', height: 620,
    summary: 'The four stacked levels (Dash, Project, Outline, Draft) at Min, Mid and Max, each with its header, 30x30 icon tabs and quick actions.',
  },
  {
    id: 'split-tiles', dir: 'SplitTiles', title: 'Tiles, split grid and dividers', group: 'Layout', height: 520,
    summary: 'The open tiles on a split grid: drag a title bar to move a tile, a divider to resize. The layout is remembered.',
  },
  {
    id: 'dashboard', dir: 'Dashboard', title: 'Dashboard cards and analytics', group: 'Layout', height: 620,
    summary: 'Schedule, checklist, analytics bars, the scratchpad and the project tiles beside them.',
  },
  {
    id: 'book-cover', dir: 'BookCover', title: 'Book cover, page edges and edge tabs', group: 'Outline', height: 660,
    summary: 'The Outline as an open book: the cover with its contents, the stack of page edges and the arc and chapter tabs.',
  },
  {
    id: 'outline-cards', dir: 'OutlineCards', title: 'Outline cards', group: 'Outline', height: 660,
    summary: 'Arc, chapter, act, scene and moment cards, each a step deeper than the one it sits in, ending in light inputs.',
  },
  {
    id: 'plotpoint-tiles', dir: 'PlotpointTiles', title: 'Plotpoint tiles', group: 'Outline', height: 640,
    summary: 'The tray of unassigned plotpoints, and plotpoints placed on a moment or standing in the margin, in their category colours.',
  },
  {
    id: 'shelf', dir: 'Shelf', title: 'Book shelf and spines', group: 'Outline', height: 260,
    summary: 'Spines on a board, grouped by series; the selected book swivels into its cover.',
  },
  {
    id: 'draft-page', dir: 'DraftPage', title: 'Draft page, preview and reactions', group: 'Draft', height: 700,
    summary: 'The open chapter on the paper: the chapter, plotpoints and draft tiles, and the preview with its reaction bars.',
  },
  {
    id: 'controls', dir: 'Controls', title: 'Buttons, inputs and alerts', group: 'Controls', height: 620,
    summary: 'Small and icon buttons, tabs, the segmented switch, fields, chips, alert and muted text, and the save control.',
  },
  {
    id: 'hue-slider', dir: 'HueSlider', title: 'Hue slider and colour range', group: 'Controls', height: 420,
    summary: "The single 0 to 360 track, unlimited or limited to 60 degrees round a parent, drawn at the zone's own saturation and lightness.",
  },
  {
    id: 'app-shell', dir: 'AppShell', title: 'App shell: header, sidebar and sky toggle', group: 'Shell', height: 640,
    summary: 'The whole app: the header with the user card and sky toggle, the page switcher, the Writer and the helper sidebar.',
  },
  {
    id: 'sky-toggle', dir: 'SkyToggle', title: 'Sky toggle', group: 'Shell', height: 110,
    summary: "The header's 120x30 painted sky: a sun or moon button that steps the zone, and the time that follows the clock.",
  },
  {
    id: 'theme-settings', dir: 'ThemeSettings', title: 'Theme settings panel', group: 'Shell', height: 640,
    summary: 'Where a user chooses the four hues of each zone and when each zone starts.',
  },
  {
    id: 'icons', dir: 'Icons', title: 'Icons', group: 'Foundations', height: 700,
    summary: 'Every icon, drawn on a 24 grid with a 1.8 stroke and round caps in the current colour, and the six reaction hearts.',
  },
]
