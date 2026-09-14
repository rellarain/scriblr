export type MessageSender = 'user' | 'admin'
export type HelperMessageKind = 'text' | 'form' | 'pageLink'
export type FormFieldKind = 'text' | 'textarea' | 'select' | 'checkbox'

// Replaces SidebarDivider's local MockChat — one per chat head.
export interface HelperConversation {
  id: string
  label: string
}

export type HelperUserType = 'admin' | 'standard'

export interface HelperUserProfile {
  chatId: string
  name: string
  status: string
  userType: HelperUserType
  currentProjectTitle: string
  currentBookTitle?: string
  activity: {
    wordCountTotal: number
    wordCountGoal?: number
    chapterCount: number
    sceneCount: number
    lastActiveAt: string
  }
}

export interface FormFieldDef {
  id: string
  label: string
  kind: FormFieldKind
  options?: string[] // only meaningful when kind === 'select'
}

export interface HelperFormPayload {
  title: string
  fields: FormFieldDef[]
  sent: boolean
}

export interface HelperPageLink {
  target: ChannelTag
  label?: string
}

export interface HelperMessage {
  id: string
  chatId: string
  sender: MessageSender
  sentAt: string
  kind: HelperMessageKind
  text?: string
  form?: HelperFormPayload
  pageLink?: HelperPageLink
}

export const FORM_FIELD_KINDS: Array<{ key: FormFieldKind; label: string }> = [
  { key: 'text', label: 'Short text' },
  { key: 'textarea', label: 'Long text' },
  { key: 'select', label: 'Dropdown' },
  { key: 'checkbox', label: 'Checkbox' },
]

// --- Inbox Console (Toning/Sorting/Explicating) domain types ---
// Moved in from the old Admin-side "feedback pipeline" -- scrilbrPlan.md
// assigns this console to the Helper page, not Admin, and ChannelTag/
// CHANNEL_TAXONOMY were already load-bearing here (HelperPageLink above,
// and the "send a page link" chat composer) even before the move.
export type Tone = 'pleasant' | 'unpleasant' | 'mixed' | 'neutral'

// A channel tag is a path down the page -> component -> feature taxonomy
// (see CHANNEL_TAXONOMY below), not a free-form label.
export interface ChannelTag {
  page: string
  component: string
  feature: string
}

export interface FeedbackItem {
  id: string
  text: string
  author?: string
  submittedAt: string
  senderTone?: Tone           // the sender's own self-identified tone at submission; read-only
  tone?: Tone                 // the admin's secondary tone identification, layered on top of senderTone
  openPage?: string           // page the sender had open when submitting; defaults Sorting's Page select
  selectedComponent?: string  // component the sender had selected; defaults Sorting's Component select
  channels: ChannelTag[]
}

// One Statement per (subject, verb) pair -- Explicate's own standalone
// output, an intention annotation on a sorted/toned feedback subject.
export interface Statement {
  id: string
  feedbackId: string // original feedback text, looked up here, plays the "reason" role
  subject: ChannelTag // the page/component/feature this statement is about, from Sorting
  verb: string
}

export interface ChannelTaxonomyComponent {
  name: string
  features: string[]
}
export interface ChannelTaxonomyPage {
  name: string
  components: ChannelTaxonomyComponent[]
}

// The fixed page -> component -> feature tree the Sorting tab's 3 cascading
// dropdowns (and the chat composer's page-link picker) are populated from.
// Modeled on Scriblr's own interface.
export const CHANNEL_TAXONOMY: ChannelTaxonomyPage[] = [
  {
    name: 'Reader', components: [
      { name: 'Library', features: ['Search', 'Shelves', 'Journal'] },
    ],
  },
  {
    name: 'Writer', components: [
      { name: 'Sidebar', features: ['Shelves', 'Outline', 'Chapters'] },
      { name: 'Editor', features: ['Autosave', 'Draft view'] },
    ],
  },
  {
    name: 'Admin', components: [
      { name: 'Processor', features: ['Voting'] },
    ],
  },
  {
    name: 'Helper', components: [
      { name: 'Inbox', features: ['Tone', 'Sorting', 'Explicate'] },
      { name: 'Chat', features: ['Composer', 'Page link'] },
    ],
  },
]
