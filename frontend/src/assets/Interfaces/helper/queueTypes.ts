// The Queue Console's "view of all assigned/active console queues" is
// built from scrilbrPlan.md's front-end Page -> Console -> Component
// hierarchy: one department per Page, each holding its own consoles,
// each console listing its component names.
export interface QueueConsoleEntry {
  name: string
  components: string[]
}

export interface QueueDepartment {
  name: string
  consoles: QueueConsoleEntry[]
}
