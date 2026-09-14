import type { FeedbackItem, Statement } from '../helperTypes'

// Deliberately staggered across the pipeline (not all bunched at stage 1)
// so every tab shows non-trivial state on first load.
export const SEED_ITEMS: FeedbackItem[] = [
  {
    id: 'fb-1',
    text: 'The editor freezes for a second every time I paste a large block of text.',
    author: 'j.rivera',
    submittedAt: '2026-08-10',
    senderTone: 'unpleasant',
    tone: 'unpleasant',
    openPage: 'Writer',
    selectedComponent: 'Editor',
    channels: [{ page: 'Writer', component: 'Editor', feature: 'Autosave' }],
  },
  {
    id: 'fb-2',
    text: 'I love the new dark mode, but the sidebar icons are hard to see in it.',
    author: 'a.kim',
    submittedAt: '2026-08-11',
    // Deliberate disagreement: the sender felt purely negative about the
    // icon contrast, while the admin also credited the dark-mode
    // compliment and logged it as mixed — proves the two fields track
    // independently.
    senderTone: 'unpleasant',
    tone: 'mixed',
    openPage: 'Writer',
    selectedComponent: 'Sidebar',
    channels: [{ page: 'Writer', component: 'Sidebar', feature: 'Shelves' }],
  },
  {
    id: 'fb-3',
    text: 'Search inside the library is basically useless, it never finds anything relevant.',
    author: 'm.okafor',
    submittedAt: '2026-08-12',
    senderTone: 'unpleasant',
    tone: 'unpleasant',
    openPage: 'Reader',
    selectedComponent: 'Library',
    channels: [{ page: 'Reader', component: 'Library', feature: 'Search' }],
  },
  {
    id: 'fb-4',
    text: 'Just wanted to say the reading progress tracker is great, keep it up!',
    author: 'j.rivera',
    submittedAt: '2026-08-13',
    senderTone: 'pleasant',
    tone: 'pleasant',
    openPage: 'Reader',
    selectedComponent: 'Library',
    channels: [{ page: 'Reader', component: 'Library', feature: 'Journal' }],
  },
  {
    id: 'fb-5',
    text: 'Not sure what this button does??',
    author: 'a.kim',
    submittedAt: '2026-08-14',
    senderTone: 'neutral',
    openPage: 'Admin',
    selectedComponent: 'Processor',
    channels: [],
  },
]

export const SEED_STATEMENTS: Statement[] = [
  {
    id: 'st-1',
    feedbackId: 'fb-1',
    subject: { page: 'Writer', component: 'Editor', feature: 'Autosave' },
    verb: 'Optimize large-paste handling',
  },
  {
    id: 'st-2',
    feedbackId: 'fb-2',
    subject: { page: 'Writer', component: 'Sidebar', feature: 'Shelves' },
    verb: 'Increase icon contrast in dark mode',
  },
  {
    id: 'st-3',
    feedbackId: 'fb-3',
    subject: { page: 'Reader', component: 'Library', feature: 'Search' },
    verb: 'Improve search relevance',
  },
]
