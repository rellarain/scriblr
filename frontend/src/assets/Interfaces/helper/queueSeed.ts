import type { QueueDepartment } from './queueTypes'

// Transcribed verbatim from scrilbrPlan.md's `# FRONT-END` section (one
// department per Page, in the doc's own order). Component names are kept
// exactly as written there -- some already end in "Component", some don't.
export const QUEUE_DEPARTMENTS: QueueDepartment[] = [
  {
    name: 'Visitor Page (VUI)',
    consoles: [
      { name: 'Welcome Console', components: ['Reader Services Component', 'Writer Services Component'] },
      { name: 'Registration Console', components: ['Reader Registration', 'Writer Registration', 'Subscription Payment', 'Account Creation'] },
      { name: 'Login Console', components: ['Account Details', 'Password', 'Passkey', 'Forgotten Account', 'Forgotten Password'] },
    ],
  },
  {
    name: 'User Page (UUI)',
    consoles: [
      { name: 'Dashboard Console', components: ['Activity Log Component', 'Schedule Component', 'Notifications Component', 'Settings Component', 'Help Component'] },
      { name: 'Account Console', components: ['Profile Component', 'Subscription Component', 'Portfolio Component', 'Settings Component', 'Help Component'] },
      { name: 'Training Console', components: ['User Training Component', 'Reader Training Component', 'Translator Training Component', 'Writer Training Component', 'Admin Training Component', 'Settings Component', 'Help Component'] },
    ],
  },
  {
    name: 'Reader Page (RUI)',
    consoles: [
      { name: 'Nook Console', components: ['Dashboard Component', 'Bookclub Component', 'Reading Stack Component', 'Journal Component'] },
      { name: 'Library Console', components: ['Browse Component', 'Filter Component', 'Search Component', 'Series Component', 'Book Component'] },
      { name: 'Book Console', components: [] },
      { name: 'Pages Console', components: [] },
    ],
  },
  {
    name: 'Translator Page (TUI)',
    consoles: [],
  },
  {
    name: 'Writer Page (WUI)',
    consoles: [
      { name: 'Shelves Console', components: ['Project Template Component', 'Schedule Component', 'Analytics Component', 'Scratchpad Component', 'Shelves Settings Component', 'Shelves Help Component'] },
      {
        name: 'Shelf Console',
        components: [
          'Project Editor Component', 'Project Analytics Component', 'Project Schedule Component', 'Project History Component',
          'Project Plot Component', 'Plot Template Component', 'Plot Category Component', 'Plotline Component',
          'Project Outline Component', 'Outline Template Component', 'Series Outline Component', 'Book Outline Component',
          'Shelf Settings Component', 'Shelf Help Component',
        ],
      },
      { name: 'Book Console', components: ['Outline Template Component', 'Book Editor Component', 'Arc Outline Component', 'Chapter Outline Component', 'Act Outline Component', 'Scene Outline Component', 'Moment Outline Component', 'Book Settings Component', 'Book Help Component'] },
      { name: 'Page Console', components: ['Bookmark Component', 'Paragraph Component', 'Sentence Component', 'Chapter Outline Component', 'Page Settings Component', 'Page Help Component'] },
      { name: 'Pages Console', components: ['Bookmark Component', 'Reaction Component', 'Export Component', 'Pages Settings Component', 'Pages Help Component'] },
    ],
  },
  {
    name: 'Helper Sidebar Page (HUI)',
    consoles: [
      { name: 'Schedule Console', components: ['Workweek Component', 'Workday Component', 'Schedule Settings Component', 'Schedule Help Component'] },
      { name: 'Chat Console', components: ['User Component', 'Conversation Component', 'Help Tool Component', 'Chat Settings Component', 'Chat Help Component'] },
      { name: 'Inbox Console', components: ['Toning Component', 'Sorting Component', 'Explicating Component', 'Inbox Settings Component', 'Inbox Help Component'] },
      { name: 'Queue Console', components: ['Queue Component', 'Queue Settings Component', 'Queue Help Component'] },
      { name: 'Dispatch Console', components: ['Performance Component', 'Department Component', 'Queue Component', 'Dispatch Settings Component', 'Dispatch Help Component'] },
    ],
  },
  {
    name: 'Admin Page (AUI)',
    consoles: [
      { name: 'Dashboard Console', components: ['Notifications Component', 'Schedule Component'] },
      { name: 'Processor Console', components: ['Voting Component', 'Processor Settings Component', 'Processor Help Component'] },
      { name: 'Organizer Console', components: ['Channel Management', 'Bookclub Management'] },
      { name: 'Manager Console', components: ['Allotment Component', 'Assignment Component', 'Team Schedule Component', 'Manager Settings Component', 'Manager Help Component'] },
      { name: 'Director Console', components: ['Department Details Component', 'Department Roster Component', 'Department Analytics Component', 'Department Component'] },
      { name: 'Office Console', components: ['Monitor Training', 'Department Schedules', 'Hire/Term Admin'] },
      {
        name: 'Configuration Console',
        components: [
          'Project Plan Component', 'Visitor Configuration Component', 'User Configuration Component', 'Reader Configuration Component',
          'Translator Configuration Component', 'Writer Configuration Component', 'Helper Configuration Component', 'Admin Configuration Component',
          'Configuration Settings Component', 'Configuration Help Component',
        ],
      },
    ],
  },
]
