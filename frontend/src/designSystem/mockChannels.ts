import type { ResourceNode, ResourceNodeKind, ResourcesFile } from '../api/types'

// The design system's pretend channel list (the Resources node tree, backend storage/channels.py): a sample of the app's screens
// and a few features, edited in memory through the same routes the app uses (/resources/nodes..., /channels).

const KINDS: ResourceNodeKind[] = ['interface', 'console', 'component', 'feature']

// Each line is an id; the name is the last line given, the kind its depth.
const SAMPLE: [string, string][] = [
  ['writer', 'Writer'],
  ['writer/dashboard', 'Dashboard'], ['writer/dashboard/schedule', 'Schedule'], ['writer/dashboard/scratchpad', 'Scratchpad'],
  ['writer/dashboard/scratchpad/notes', 'Notes'],
  ['writer/project', 'Project'], ['writer/project/plot', 'Plot'], ['writer/project/characters', 'Characters'], ['writer/project/maps', 'Maps'],
  ['writer/book', 'Book'], ['writer/book/book-outline', 'Book outline'], ['writer/book/publish', 'Publish'],
  ['writer/draft', 'Draft'], ['writer/draft/chapter', 'Chapter'], ['writer/draft/draft', 'Draft'], ['writer/draft/draft/autosave', 'Autosave'],
  ['reader', 'Reader'], ['reader/nook', 'Nook'], ['reader/nook/stack', 'Stack'], ['reader/library', 'Library'], ['reader/library/catalog', 'Catalog'],
  ['training', 'Training'], ['training/desk', 'Desk'], ['training/desk/courses', 'Courses'],
  ['user', 'User'], ['user/dashboard', 'Dashboard'], ['user/dashboard/notifications', 'Notifications'],
  ['helper', 'Helper'], ['helper/inbox', 'Inbox'], ['helper/inbox/check', 'Check'], ['helper/queue', 'Queue'], ['helper/chat', 'Chat'], ['helper/outbox', 'Outbox'],
  ['admin', 'Admin'], ['admin/project-plan', 'Project Plan'], ['admin/office', 'Office'], ['admin/office/desk', 'Desk'],
  ['admin/office/channel', 'Channel'], ['admin/configuration', 'Configuration'], ['admin/configuration/channels', 'Channels'],
]

function sampleNodes(): ResourceNode[] {
  const order = new Map<string | null, number>()
  return SAMPLE.map(([id, name]) => {
    const parts = id.split('/')
    const parentId = parts.length > 1 ? parts.slice(0, -1).join('/') : null
    const at = order.get(parentId) ?? 0
    order.set(parentId, at + 1)
    return { id, name, parentId, kind: KINDS[parts.length - 1], order: at }
  })
}

// The console queues of a channel list, in its order (interfaces, then each one's consoles).
export function consoleIds(nodes: Array<{ id: string; kind: string; parentId: string | null; order: number }>): string[] {
  const by = (a: { order: number }, b: { order: number }) => a.order - b.order
  return nodes.filter(n => n.kind === 'interface').sort(by).flatMap(i => nodes.filter(n => n.kind === 'console' && n.parentId === i.id).sort(by).map(n => n.id))
}

export function createMockChannels() {
  let nodes = sampleNodes()
  let next = 1
  const file = (): ResourcesFile => ({ schemaVersion: 2, nodes, content: {}, assessments: {}, screensVersion: 1 })
  const ok = (body: unknown) => ({ status: 200, body })

  return {
    // GET /channels
    channels: () => ok({ nodes }),
    // /resources and /resources/nodes...
    resources(method: string, parts: string[], body: unknown): { status: number; body: unknown } {
      const b = (body ?? {}) as Record<string, unknown>
      if (parts.length === 0) return ok(file())
      if (parts[0] !== 'nodes') return ok(file())
      if (method === 'POST' && parts.length === 1) {
        const parentId = (b.parentId as string | null) ?? null
        const id = parentId ? `${parentId}/new-${next++}` : `new-${next++}`
        const siblings = nodes.filter(n => n.parentId === parentId)
        nodes = [...nodes, { id, parentId, kind: b.kind as ResourceNodeKind, name: String(b.name ?? ''), order: siblings.length }]
        return ok(file())
      }
      if (method === 'PUT' && parts[1] === 'reorder') {
        const ids = (b.orderedIds as string[]) ?? []
        nodes = nodes.map(n => (n.parentId === ((b.parentId as string | null) ?? null) && ids.includes(n.id) ? { ...n, order: ids.indexOf(n.id) } : n))
        return ok(file())
      }
      const tail = parts[parts.length - 1]
      if (method === 'PUT' && tail === 'name') {
        const id = parts.slice(1, -1).join('/')
        nodes = nodes.map(n => (n.id === id ? { ...n, name: String(b.name ?? '') } : n))
        return ok(file())
      }
      if (method === 'DELETE') {
        const id = parts.slice(1).join('/')
        nodes = nodes.filter(n => n.id !== id && !n.id.startsWith(`${id}/`))
        return ok(file())
      }
      return ok(file())
    },
  }
}
