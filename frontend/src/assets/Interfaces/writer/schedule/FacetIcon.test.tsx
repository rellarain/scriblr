import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FACETS } from '../../../../lib/facets'
import { FacetIcon } from './FacetIcon'

describe('FacetIcon', () => {
  it('draws an icon for every facet, in the facet colour, hidden from assistive tech', () => {
    for (const f of FACETS) {
      const { container, unmount } = render(<FacetIcon facet={f} />)
      const host = container.querySelector('.wrFacetIcon') as HTMLElement
      expect(host.getAttribute('aria-hidden')).toBe('true')
      expect(host.style.getPropertyValue('--facet')).toBe(`var(--wr-f-${f})`)
      expect(host.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  it('gives each facet a different drawing', () => {
    const drawn = FACETS.map(f => {
      const { container, unmount } = render(<FacetIcon facet={f} />)
      const html = container.querySelector('svg')!.innerHTML
      unmount()
      return html
    })
    expect(new Set(drawn).size).toBe(FACETS.length)
  })

  it('takes a size', () => {
    const { container } = render(<FacetIcon facet="draft" size={28} />)
    expect(container.querySelector('svg')!.getAttribute('width')).toBe('28')
  })
})
