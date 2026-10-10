import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ColorRange } from '../components/ColorRange'
import { DEFAULT_PALETTE } from '../theme/defaults'
import { deriveTokens } from '../theme/tokens'
import { ThemeZoneProvider } from '../theme/useTheme'
import { ZONE_KEYS, ZONE_LABEL, type ZoneKey, type ZonePalette } from '../theme/types'
import { ZONE_LOOKS } from '../theme/zoneLooks'
import { ZONE_ICON } from '../theme/zoneIcons'
import './preview.scss'

// The frame every design-system card is shown in: a toolbar (which zones to show side by side, the screen width to show them at, the theme
// and accent hue, and the card's own views) over a stage of frames, one per zone, each as wide as the chosen screen (the container grows with it). Each frame is the app's theme scope (`.wrBookScope`
// with the zone's derived tokens) and a ThemeZoneProvider, so the real components inside draw for that zone and palette.

export const SCREEN_WIDTHS = [400, 800, 1200] as const
export type ScreenWidth = (typeof SCREEN_WIDTHS)[number]

export interface FrameContext { view: string; zone: ZoneKey; width: number; palette: ZonePalette }

export interface CardDef {
  id: string
  title: string
  group: string
  summary: string
  // The height of a frame (px).
  height: number
  // The frame's own element: the Writer's `main.wUI.wr`, or a plain scope (the whole app shell brings its own).
  frame?: 'writer' | 'plain'
  defaults?: { zones?: ZoneKey[]; width?: ScreenWidth; view?: string }
  // A selector for the card's own variants (the Writer's levels, say).
  views?: Array<{ id: string; label: string }>
  render: (ctx: FrameContext) => ReactNode
}

const HUE_BASIS = { sat: ZONE_LOOKS.day.themeS, light: ZONE_LOOKS.day.themeL }

function Frame({ card, zone, width, palette, view }: { card: CardDef; zone: ZoneKey; width: number; palette: ZonePalette; view: string }) {
  const vars = useMemo(() => deriveTokens(palette, 'admin', zone), [palette, zone])
  const style = { ...vars, width: '100%', height: card.height } as CSSProperties
  const children = card.render({ view, zone, width, palette })
  return (
    <ThemeZoneProvider value={{ zone, palette }}>
      {card.frame === 'plain'
        ? <div className="wrBookScope uiPreviewFrame uiPreviewFrame--plain" style={style}>{children}</div>
        : <main className="wUI wr wrBookScope uiPreviewFrame" style={style}>{children}</main>}
    </ThemeZoneProvider>
  )
}

function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className={on ? 'uiPvToggle uiPvToggle--on' : 'uiPvToggle'} aria-pressed={on} title={title} onClick={onClick}>
      {children}
    </button>
  )
}

export function Preview({ card }: { card: CardDef }) {
  const [zones, setZones] = useState<ZoneKey[]>(card.defaults?.zones ?? ['day', 'night'])
  const [width, setWidth] = useState<ScreenWidth>(card.defaults?.width ?? 800)
  const [view, setView] = useState<string>(card.defaults?.view ?? card.views?.[0]?.id ?? '')
  const [palette, setPalette] = useState<ZonePalette>(DEFAULT_PALETTE)

  const toggle = <T,>(list: T[], item: T, order: readonly T[]): T[] => {
    const next = list.includes(item) ? list.filter(x => x !== item) : [...list, item]
    return next.length === 0 ? list : order.filter(x => next.includes(x))
  }
  const hue = (key: 'theme' | 'accent' | 'alert') => (value: number) => setPalette(p => ({ ...p, [key]: { h: value }, ...(key === 'accent' ? { accent2: { h: (value + 228) % 360 } } : {}) }))

  return (
    <div className="uiPreview" style={{ '--pv-w': `${width}px` } as CSSProperties}>
      <div className="uiPvBar" role="toolbar" aria-label={`${card.title} preview controls`}>
        <div className="uiPvGroup" role="group" aria-label="Zones">
          <span className="uiPvLabel">Zone</span>
          {ZONE_KEYS.map(z => {
            const Icon = ZONE_ICON[z]
            return <Toggle key={z} on={zones.includes(z)} onClick={() => setZones(list => toggle(list, z, ZONE_KEYS))} title={ZONE_LOOKS[z].summary}><Icon size={14} /> {ZONE_LABEL[z]}</Toggle>
          })}
        </div>
        <div className="uiPvGroup" role="group" aria-label="Screen width">
          <span className="uiPvLabel">Screen</span>
          {SCREEN_WIDTHS.map(w => <Toggle key={w} on={width === w} onClick={() => setWidth(w)}>{w}px</Toggle>)}
        </div>
        {card.views && (
          <div className="uiPvGroup" role="group" aria-label="View">
            <span className="uiPvLabel">View</span>
            {card.views.map(v => <Toggle key={v.id} on={view === v.id} onClick={() => setView(v.id)}>{v.label}</Toggle>)}
          </div>
        )}
        <div className="uiPvGroup uiPvGroup--hues">
          <label className="uiPvHue"><span className="uiPvLabel">Theme hue {palette.theme.h}</span>
            <ColorRange label="Theme hue" value={palette.theme.h} onChange={hue('theme')} sat={HUE_BASIS.sat} light={HUE_BASIS.light} className="uiPvRange" /></label>
          <label className="uiPvHue"><span className="uiPvLabel">Accent hue {palette.accent.h}</span>
            <ColorRange label="Accent hue" value={palette.accent.h} onChange={hue('accent')} sat={80} light={42} className="uiPvRange" /></label>
          <label className="uiPvHue"><span className="uiPvLabel">Alert hue {palette.alert.h}</span>
            <ColorRange label="Alert hue" value={palette.alert.h} onChange={hue('alert')} sat={100} light={46} className="uiPvRange" /></label>
        </div>
      </div>
      <div className="uiPvStage">
        {zones.map(zone => (
          <figure key={`${zone}-${view}`} className="uiPvFigure" style={{ width }}>
            <figcaption>{ZONE_LABEL[zone]} · {width}px</figcaption>
            <div className="uiPvBox">
              <Frame card={card} zone={zone} width={width} palette={palette} view={view} />
            </div>
          </figure>
        ))}
      </div>
    </div>
  )
}
