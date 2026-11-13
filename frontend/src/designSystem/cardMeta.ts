// What the design system says about each card: its id, the folder it lives in (components/<dir>/), the group it is listed under, a
// one-line summary and the height of its frame. Plain data, read by the cards (cards.tsx) and by the generator (scripts/design-system).

export interface CardMeta { id: string; dir: string; title: string; group: string; summary: string; height: number }

export const CARD_META: CardMeta[] = [
  {
    id: 'level-panels', dir: 'LevelPanels', title: 'Level panels, headers and tabs', group: 'Layout', height: 620,
    summary: 'The four stacked levels (Dash, Project, Outline, Draft) at Min, Mid and Max, each with its header, 30x30 icon tabs and quick actions.',
  },
  {
    id: 'training', dir: 'TrainingLevels', title: 'Training: five stacked levels', group: 'Layout', height: 640,
    summary: 'The Training interface: the Desk, the open Course, its Module, the Lesson and the Practice as stacked levels, each with its tabs, the deepest focused and the others in a side column.',
  },
  {
    id: 'split-tiles', dir: 'SplitTiles', title: 'Tiles, split grid and dividers', group: 'Layout', height: 520,
    summary: 'The open tiles on a split grid: drag a title bar to move a tile, a divider to resize. The layout is remembered.',
  },
  {
    id: 'dashboard', dir: 'Dashboard', title: 'Schedule console and Dash', group: 'Layout', height: 760,
    summary: 'The Schedule: goals, activity as a grid or lines, a week of shifts with the backlog beside it, analytics and a review, each a tile; then the scratchpad and the project tiles.',
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
    id: 'plot-presets', dir: 'PlotPresets', title: 'Plot presets', group: 'Outline', height: 700,
    summary: "Admin > Configuration > Plot, where presets are set up, saved as drafts and published one by one, and the Plot sidebar's + Preset that adds a published preset to a project.",
  },
  {
    id: 'instructor', dir: 'Instructor', title: 'Instructor: the Training builder', group: 'Outline', height: 700,
    summary: 'Admin > Instructor, where the Training curricula and courses are written: a tree of courses, modules, lessons and assessments beside the open item, with the Save cluster.',
  },
  {
    id: 'maps', dir: 'Maps', title: 'Maps: the setting builder', group: 'Outline', height: 700,
    summary: 'Project > Maps, where the setting is mapped: the list of maps (nested ones under their map), the canvas to paint terrain on, and the terrains, layers and fields beside it, with the Save cluster.',
  },
  {
    id: 'character-models', dir: 'CharacterModels', title: 'Character models: the designer', group: 'Outline', height: 900,
    summary: 'The Designer console, where the shapes characters are drawn from are designed: the list of models, a tree of groups, objects and shapes, a canvas with draggable points and curve handles, an inspector, previews at random sizes and the checks, with draft and publish like the Plot presets; and the Configuration page that sets the limits for the models writers design for themselves.',
  },
  {
    id: 'characters', dir: 'Characters', title: 'Characters: the cast builder', group: 'Outline', height: 760,
    summary: 'Project > Characters, where the cast is built: the list of characters and, in the Portrait section, a flat portrait card drawn from a set of choices made with picture dropdowns, on one page of collapsible sections (head, hair, face, body, fantasy, card) that scrolls beside the card, with Randomise and a lock for each section.',
  },
  {
    id: 'items', dir: 'Items', title: 'Items: the library of things that change hands', group: 'Outline', height: 700,
    summary: 'Project > Items, where the things that pass from hand to hand are kept: the library list, the open item with who has it from which chapter or scene on, and the links it belongs to, with the Save cluster.',
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
    summary: "A level's colour as one row: an Inherit toggle, the hue's degrees in a chip, the track (30 to 180 degrees round the parent's hue, or the whole wheel at 360) and a range button, drawn at the zone's own saturation and lightness.",
  },
  {
    id: 'reader', dir: 'Reader', title: 'Reader: pages, rails and consoles', group: 'Reader', height: 760,
    summary: 'The Nook, the Library and a book: earlier pages as rails, consoles as an icon, a tile or the full console, the credit pill, the Book page with its level badge, edge tabs, clubs and reviews, the e-reader (Pages), and the plan, borrow and review dialogs.',
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
