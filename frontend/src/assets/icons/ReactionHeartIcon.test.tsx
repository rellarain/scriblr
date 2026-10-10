import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReactionHeartIcon } from '.'

const paths = (kind: 'like' | 'dislike', level: 1 | 2 | 3) => {
  const { container } = render(<ReactionHeartIcon kind={kind} level={level} />)
  return Array.from(container.querySelectorAll('path'))
}
const filled = (p: SVGPathElement) => p.getAttribute('fill') === 'currentColor'

describe('ReactionHeartIcon', () => {
  it('like 1 is a single heart outline', () => {
    const p = paths('like', 1)
    expect(p).toHaveLength(1)
    expect(filled(p[0])).toBe(false)
  })

  it('like 2 is two concentric outlines, the inner one smaller and not filled', () => {
    const p = paths('like', 2)
    expect(p).toHaveLength(2)
    expect(p[0].getAttribute('d')).toBe(p[1].getAttribute('d'))
    expect(p[0].getAttribute('transform')).toBeNull()
    expect(p[1].getAttribute('transform')).toContain('scale(0.5)')
    expect(p.some(filled)).toBe(false)
  })

  it('like 3 is one filled heart', () => {
    const p = paths('like', 3)
    expect(p).toHaveLength(1)
    expect(filled(p[0])).toBe(true)
  })

  it('dislike 1 is the outline with a straight line down its middle', () => {
    const p = paths('dislike', 1)
    expect(p).toHaveLength(2)
    expect(p[1].getAttribute('d')).toBe('M12 7.6v12.9')
    expect(p.some(filled)).toBe(false)
  })

  it('dislike 2 is two separate outlined halves, moved apart', () => {
    const p = paths('dislike', 2)
    expect(p).toHaveLength(2)
    expect(p.map(x => x.getAttribute('transform'))).toEqual(['translate(-1.6 0)', 'translate(1.6 0)'])
    expect(p.some(filled)).toBe(false)
  })

  it('dislike 3 is two separate filled halves', () => {
    const p = paths('dislike', 3)
    expect(p).toHaveLength(2)
    expect(p.every(filled)).toBe(true)
  })
})
