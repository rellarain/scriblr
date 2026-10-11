import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The design system's rule (interaction.md, Scrolling): no visible scrollbars anywhere, set once for every element.
describe('scrollbars', () => {
  const css = readFileSync(path.resolve(__dirname, 'App.scss'), 'utf-8')

  it('are hidden on every element, in Firefox and in Chromium', () => {
    expect(css).toContain('* { scrollbar-width: none; }')
    expect(css).toContain('*::-webkit-scrollbar { display: none; }')
  })

  it('are not turned back on anywhere in the stylesheets', () => {
    for (const file of ['App.scss', 'assets/Interfaces/writer/writer.scss', 'assets/Interfaces/admin/resources/resources.scss', 'components/tiles/tiles.scss', 'theme/themeSettings.scss']) {
      const text = readFileSync(path.resolve(__dirname, file), 'utf-8')
      expect(text, file).not.toMatch(/scrollbar-width:[ ]*(auto|thin)/)
      expect(text, file).not.toMatch(/overflow(-[xy])?:[ ]*scroll/)
    }
  })
})
