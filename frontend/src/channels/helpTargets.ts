// Where each Help tile of the app sits in the channel list: the id of its screen (one of backend storage/channels.py's
// APP_SCREENS, checked by helpTargets.test.ts) and the names its guides were found by before the list had ids, so guides
// written under older nodes still show.

export interface HelpTarget {
  id: string
  aliases: string[]
}

export const HELP_TARGETS = {
  writerDashboard: { id: 'writer/dashboard', aliases: ['dashboard', 'dash', 'shelves'] },
  writerProject: { id: 'writer/project', aliases: ['project', 'shelf', 'project console'] },
  writerBook: { id: 'writer/book', aliases: ['outline', 'book'] },
  writerDraft: { id: 'writer/draft', aliases: ['draft', 'chapter'] },
  // Learning's channel nodes keep its old name (the ids are saved with the guides, feedback and queues filed under them).
  learningDesk: { id: 'training/desk', aliases: ['training', 'desk'] },
  readerNook: { id: 'reader/nook', aliases: [] },
  readerLibrary: { id: 'reader/library', aliases: [] },
  readerBook: { id: 'reader/book', aliases: [] },
  readerPages: { id: 'reader/pages', aliases: [] },
  user: { id: 'user', aliases: [] },
  helper: { id: 'helper', aliases: [] },
  admin: { id: 'admin', aliases: [] },
} satisfies Record<string, HelpTarget>
