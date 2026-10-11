import type { ClubView, ReaderLevel, ReaderState, Review } from '../api/reader'
import { bookCardFixture, clubsFixture, feedFixture } from './readerFixtures'

// The Reader's community in the design system's mock backend: levels, reviews, follows, clubs, notes and reports change the copy in memory, and
// the account answers with it as it stands. (The real rules, such as the re-read order, are the backend's and are tested there.)

export function createMockSocial(getReader: () => ReaderState, setReader: (next: ReaderState) => void) {
  let clubs: ClubView[] = clubsFixture()
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

  // A response for a social route, or null when the route is not one of these.
  return function route(method: string, rest: string[], body: unknown): Response | null {
    const reader = getReader()
    const set = (next: Partial<ReaderState>) => setReader({ ...reader, ...next })
    const b = (body ?? {}) as Record<string, unknown>
    const id = rest[1]
    const now = new Date().toISOString()
    const draft = { status: 'draft' as const, score: null, criteria: {}, comment: '', spoilerEssay: '', noteIds: [], postedAt: null, editedAt: null }

    if (method === 'GET' && rest[0] === 'books' && rest[2] === 'card') {
      const card = bookCardFixture(id)
      const mine = reader.reviews.find(r => r.bookId === id)?.reads.filter(r => r.status === 'posted').pop()
      if (mine && mine.score !== null) {
        card.reviews.unshift({ id: `mine-${id}`, readerId: 'me', name: 'You', initials: 'Y', score: mine.score, criteria: mine.criteria, comment: mine.comment, spoilerEssay: mine.spoilerEssay, reads: 1, at: now, edited: mine.editedAt !== null, mine: true })
      }
      return json(card)
    }
    if (method === 'GET' && rest[0] === 'clubs') return json(clubs)
    if (method === 'GET' && rest[0] === 'feed') return json(feedFixture().filter(f => reader.following.includes(f.whoId) || reader.joinedClubs.includes(f.whoId)))

    if (rest[0] === 'levels' && method === 'PUT') {
      const level = b.level as ReaderLevel | null
      const levels = { ...reader.levels }
      if (level === null) delete levels[id]
      else levels[id] = { level, invitedBy: levels[id]?.invitedBy ?? null, override: true }
      set({ levels })
    } else if (rest[0] === 'criteria' && method === 'PUT') {
      set({ criteriaNames: (b.names as string[]) ?? reader.criteriaNames })
    } else if (rest[0] === 'reviews' && method === 'PUT') {
      const existing = reader.reviews.find(r => r.bookId === id)
      const reads = existing ? [...existing.reads] : [{ n: 1, startedAt: now, ...draft }]
      const last = reads[reads.length - 1]
      reads[reads.length - 1] = {
        ...last, score: (b.score as number | null) ?? null, criteria: (b.criteria as Record<string, number>) ?? {}, comment: (b.comment as string) ?? '',
        spoilerEssay: (b.spoilerEssay as string) ?? '', noteIds: (b.noteIds as string[]) ?? [], editedAt: last.status === 'posted' ? now : null,
      }
      set({ reviews: [...reader.reviews.filter(r => r.bookId !== id), { bookId: id, reads } as Review] })
    } else if (rest[0] === 'reviews' && rest[2] === 'post') {
      set({ reviews: reader.reviews.map(r => (r.bookId === id ? { ...r, reads: r.reads.map((x, i) => (i === r.reads.length - 1 ? { ...x, status: 'posted' as const, postedAt: now } : x)) } : r)) })
    } else if (rest[0] === 'reviews' && rest[2] === 'reread') {
      set({ reviews: reader.reviews.map(r => (r.bookId === id ? { ...r, reads: [...r.reads, { n: r.reads.length + 1, startedAt: now, ...draft }] } : r)) })
    } else if (rest[0] === 'reviews' && rest[2] === 'draft' && method === 'DELETE') {
      set({ reviews: reader.reviews.filter(r => r.bookId !== id || r.reads[r.reads.length - 1].status === 'posted') })
    } else if (rest[0] === 'notes' && method === 'POST') {
      set({ notes: [...reader.notes, { id: `n${reader.notes.length + 1}`, bookId: b.bookId as string, quote: (b.quote as string) ?? '', note: (b.note as string) ?? '', at: now }] })
    } else if (rest[0] === 'notes' && method === 'DELETE') {
      set({ notes: reader.notes.filter(n => n.id !== id) })
    } else if (rest[0] === 'following') {
      set({ following: method === 'PUT' ? [...new Set([...reader.following, id])] : reader.following.filter(f => f !== id) })
    } else if (rest[0] === 'clubs' && rest[2] === 'membership') {
      set({ joinedClubs: method === 'PUT' ? [...new Set([...reader.joinedClubs, id])] : reader.joinedClubs.filter(c => c !== id) })
      clubs = clubs.map(c => (c.club.id === id ? { ...c, joined: method === 'PUT', memberCount: c.memberCount + (method === 'PUT' ? 1 : -1) } : c))
    } else if (rest[0] === 'clubs' && rest[2] === 'posts') {
      clubs = clubs.map(c => (c.club.id === id
        ? { ...c, posts: [...c.posts, { id: `mp${c.posts.length + 1}`, clubId: id, authorId: 'me', text: b.text as string, at: now, spoiler: Boolean(b.spoiler), replyTo: (b.replyTo as string | null) ?? null }] }
        : c))
    } else if (rest[0] === 'clubs' && method === 'POST') {
      const made = { id: `club-${clubs.length + 1}`, name: b.name as string, description: (b.description as string) ?? '', bookId: (b.bookId as string | null) ?? null, meets: (b.meets as string) ?? '', nextMeetingAt: null, members: [], mine: true }
      clubs = [...clubs, { club: made, joined: true, memberCount: 1, posts: [] }]
      set({ joinedClubs: [...reader.joinedClubs, made.id] })
    } else if (rest[0] === 'reports') {
      set(method === 'POST'
        ? { reports: [...reader.reports, { id: `rep${reader.reports.length + 1}`, kind: b.kind as 'review' | 'post', targetId: b.targetId as string, reason: (b.reason as string) ?? 'hide', at: now }] }
        : { reports: reader.reports.filter(r => r.id !== id) })
    } else if (rest[0] === 'blocked') {
      set({ blocked: method === 'PUT' ? [...new Set([...reader.blocked, id])] : reader.blocked.filter(r => r !== id), following: method === 'PUT' ? reader.following.filter(f => f !== id) : reader.following })
    } else {
      return null
    }
    return json(getReader())
  }
}
