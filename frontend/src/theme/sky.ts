import { ZONE_KEYS, type ZoneKey } from './types'

// Pure helpers for the header's sky toggle (SkyToggle.tsx): which zone comes
// next, the moon's phase, today's zodiac constellation, the cloud strips and
// where the sun and moon sit.

export const nextZone = (zone: ZoneKey): ZoneKey => ZONE_KEYS[(ZONE_KEYS.indexOf(zone) + 1) % ZONE_KEYS.length]

// --- the moon ---

const SYNODIC_DAYS = 29.530588853
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)
const DAY_MS = 86_400_000

// Where the moon is in its cycle: 0 = new, .5 = full, back to 1 = new. The
// illuminated share follows from it.
export function moonPhase(date: Date): { fraction: number; illumination: number } {
  const days = (date.getTime() - NEW_MOON_MS) / DAY_MS
  const fraction = (((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS) / SYNODIC_DAYS
  return { fraction, illumination: (1 - Math.cos(2 * Math.PI * fraction)) / 2 }
}

// The lit part of the moon as an SVG path in a `size` box (northern-hemisphere
// view: a waxing moon is lit on the right, a waning one on the left). The
// terminator is an ellipse arc, so the shape changes smoothly day by day.
export function moonPath(fraction: number, size: number): string {
  const r = size / 2
  const rx = Math.abs(Math.cos(2 * Math.PI * fraction)) * r
  const waxing = fraction < 0.5
  // The terminator bulges toward the lit side up to a quarter, then away from it.
  const crescent = waxing ? fraction < 0.25 : fraction > 0.75
  const outer = waxing ? 1 : 0
  const inner = waxing ? (crescent ? 0 : 1) : (crescent ? 1 : 0)
  const f = (n: number) => Number(n.toFixed(2))
  return `M${f(r)} 0A${f(r)} ${f(r)} 0 0 ${outer} ${f(r)} ${f(size)}A${f(rx)} ${f(r)} 0 0 ${inner} ${f(r)} 0Z`
}

// --- the zodiac ---

export type Sign =
  | 'aries' | 'taurus' | 'gemini' | 'cancer' | 'leo' | 'virgo'
  | 'libra' | 'scorpius' | 'sagittarius' | 'capricornus' | 'aquarius' | 'pisces'

// Western (tropical) dates: the sign the Sun is in, by the day each begins.
const SIGN_STARTS: Array<{ sign: Sign; month: number; day: number }> = [
  { sign: 'capricornus', month: 1, day: 1 },
  { sign: 'aquarius', month: 1, day: 20 },
  { sign: 'pisces', month: 2, day: 19 },
  { sign: 'aries', month: 3, day: 21 },
  { sign: 'taurus', month: 4, day: 20 },
  { sign: 'gemini', month: 5, day: 21 },
  { sign: 'cancer', month: 6, day: 21 },
  { sign: 'leo', month: 7, day: 23 },
  { sign: 'virgo', month: 8, day: 23 },
  { sign: 'libra', month: 9, day: 23 },
  { sign: 'scorpius', month: 10, day: 23 },
  { sign: 'sagittarius', month: 11, day: 22 },
  { sign: 'capricornus', month: 12, day: 22 },
]

export function zodiacSign(date: Date): Sign {
  const key = (date.getMonth() + 1) * 100 + date.getDate()
  let current = SIGN_STARTS[0].sign
  for (const s of SIGN_STARTS) if (s.month * 100 + s.day <= key) current = s.sign
  return current
}

// --- the constellations ---

// Each pattern is a real star chart outline: right ascension (hours) and
// declination (degrees) of its main stars, plus the lines that join them. They
// are projected flat and fitted into the sky beside the moon (see `fit`).
interface Chart { stars: Array<[number, number]>; lines: Array<[number, number]>; bright: number }

const CHARTS: Record<Sign, Chart> = {
  aries: {
    bright: 2,
    stars: [[1.892, 19.29], [1.911, 20.81], [2.119, 23.46], [2.678, 27.71], [2.834, 27.26], [2.812, 29.06], [3.172, 19.73]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6]],
  },
  taurus: {
    bright: 2,
    stars: [[5.438, 28.61], [5.627, 21.14], [4.599, 16.51], [4.478, 15.87], [4.33, 15.63], [4.382, 17.54], [4.477, 19.18], [4.011, 12.49], [3.453, 9.73], [3.791, 24.11]],
    lines: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [4, 7], [7, 8]],
  },
  gemini: {
    bright: 0,
    stars: [[7.577, 31.89], [7.755, 28.03], [6.732, 25.13], [6.383, 22.51], [6.248, 22.51], [7.335, 21.98], [7.069, 20.57], [6.629, 16.4], [7.301, 16.54], [6.755, 12.9]],
    lines: [[0, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [5, 8], [8, 9], [2, 6], [0, 1]],
  },
  cancer: {
    bright: 0,
    stars: [[8.275, 9.19], [8.201, 17.65], [8.745, 18.15], [8.721, 21.47], [8.778, 28.76], [8.975, 11.86], [8.667, 19.98]],
    lines: [[0, 2], [1, 2], [2, 3], [3, 4], [2, 5]],
  },
  leo: {
    bright: 0,
    stars: [[10.139, 11.97], [10.122, 16.76], [10.333, 19.84], [10.278, 23.42], [9.879, 26.01], [9.764, 23.77], [11.235, 20.52], [11.818, 14.57], [11.237, 15.43]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [7, 8], [8, 0], [6, 8]],
  },
  virgo: {
    bright: 0,
    stars: [[13.42, -11.16], [13.578, -0.6], [12.694, -1.45], [12.331, -0.67], [11.845, 1.76], [12.927, 3.4], [13.036, 10.96], [14.267, -6.0], [14.717, -5.66]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [1, 7], [7, 8]],
  },
  libra: {
    bright: 0,
    stars: [[14.848, -16.04], [15.283, -9.38], [15.592, -14.79], [15.068, -25.28], [15.617, -28.13], [15.638, -29.78], [15.2, -19.79]],
    lines: [[0, 1], [1, 2], [2, 0], [0, 6], [6, 3], [2, 4], [4, 5]],
  },
  scorpius: {
    bright: 4,
    stars: [[16.09, -19.81], [16.006, -22.62], [15.981, -26.11], [16.353, -25.59], [16.49, -26.43], [16.598, -28.22], [16.836, -34.29], [16.865, -38.05], [16.91, -42.36], [17.203, -43.24], [17.622, -42.99], [17.793, -40.13], [17.708, -39.03], [17.56, -37.1], [17.513, -37.3]],
    lines: [[0, 1], [2, 1], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14]],
  },
  sagittarius: {
    bright: 5,
    stars: [[18.402, -34.38], [18.35, -29.83], [18.466, -25.42], [18.097, -30.42], [18.761, -26.99], [18.921, -26.3], [19.043, -29.88], [19.115, -27.67]],
    lines: [[3, 0], [0, 6], [6, 7], [7, 5], [5, 4], [4, 2], [2, 3], [1, 2], [1, 0], [1, 4]],
  },
  capricornus: {
    bright: 0,
    stars: [[21.784, -16.13], [21.668, -16.66], [21.37, -16.83], [21.1, -17.23], [20.3, -12.51], [20.35, -14.78], [20.768, -25.27], [20.86, -26.92], [21.445, -22.41], [21.62, -19.47]],
    lines: [[4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0], [0, 1], [1, 2], [2, 3], [3, 4]],
  },
  aquarius: {
    bright: 0,
    stars: [[21.526, -5.57], [22.096, -0.32], [22.361, -1.39], [22.48, -0.02], [22.589, -0.12], [22.42, 1.38], [20.795, -9.5], [22.28, -7.78], [22.83, -13.59], [22.911, -15.82], [23.11, -21.17]],
    lines: [[6, 0], [0, 1], [1, 2], [2, 3], [3, 5], [3, 4], [4, 2], [1, 7], [7, 8], [8, 9], [9, 10]],
  },
  // Pisces straddles 0h, so its right ascensions past midnight are written as 24+.
  pisces: {
    bright: 11,
    stars: [[23.286, 3.28], [23.449, 1.26], [23.7, 1.78], [23.66, 5.63], [23.466, 6.38], [23.99, 6.86], [24.81, 7.59], [25.05, 7.89], [25.23, 7.58], [25.23, 6.14], [25.68, 5.49], [26.034, 2.76], [25.76, 9.16], [25.524, 15.35]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13]],
  },
}

export interface Star { x: number; y: number; bright: boolean }
export interface Constellation { stars: Star[]; lines: Array<[number, number]> }

// Where the pattern goes in the 120x30 sky: it starts just right of the
// sun/moon button and may run a little past the far edges (the toggle clips it).
export const SKY_W = 120
export const SKY_H = 30
export const CONSTELLATION_BOX = { x: 34, y: 1, w: 90, h: 28 }

// Flat projection (east to the left, as on a star chart), scaled evenly to fill
// the box as far as it will go, left-aligned and centred on the sky.
function fit(chart: Chart): Constellation {
  const decs = chart.stars.map(s => s[1])
  const cosDec = Math.cos((((Math.min(...decs) + Math.max(...decs)) / 2) * Math.PI) / 180)
  const pts = chart.stars.map(([ra, dec]) => ({ x: -ra * 15 * cosDec, y: -dec }))
  const minX = Math.min(...pts.map(p => p.x))
  const maxX = Math.max(...pts.map(p => p.x))
  const minY = Math.min(...pts.map(p => p.y))
  const maxY = Math.max(...pts.map(p => p.y))
  const scale = Math.min(CONSTELLATION_BOX.w / (maxX - minX), CONSTELLATION_BOX.h / (maxY - minY))
  const top = CONSTELLATION_BOX.y + (CONSTELLATION_BOX.h - (maxY - minY) * scale) / 2
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    stars: pts.map((p, i) => ({
      x: round(CONSTELLATION_BOX.x + (p.x - minX) * scale),
      y: round(top + (p.y - minY) * scale),
      bright: i === chart.bright,
    })),
    lines: chart.lines,
  }
}

export const CONSTELLATIONS = Object.fromEntries(
  (Object.keys(CHARTS) as Sign[]).map(sign => [sign, fit(CHARTS[sign])]),
) as Record<Sign, Constellation>

// --- the clouds ---

export const CLOUD_MIN_WIDTH = 24
export const CLOUD_MAX_WIDTH = 64
export const CLOUD_MAX_GAP = 100
const STRIP_MIN_LENGTH = 240

// One rounded box of a cloud: `x` is from the cloud's left edge, `y` from the top of
// the strip (whose bottom is the cloud's flat base), `w` and `h` its size.
// A `round` one is a circle (w equals h), an occasional puff among the boxes.
export interface CloudBox { x: number; y: number; w: number; h: number; round: boolean }
export interface CloudShape { x: number; w: number; boxes: CloudBox[] }
export const CLOUD_RADIUS = 4
export const CLOUD_MIN_BOX = 8
const CIRCLE_CHANCE = 0.35
const BOX_OVERLAP = 2 // a box sits this far into the one below it, hiding its rounded corners
export interface CloudStrip { clouds: CloudShape[]; length: number }

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A repeating run of flat-based clouds: 2-4 stacked rounded boxes each (some levels
// a circle), every box
// shorter and narrower than the one below it, so a cloud thins out toward the top
// like cirrus. Random widths (24-64px, times `scale`) and random gaps (0-100px,
// never scaled). The strip starts with a cloud and ends with its own gap, so the
// gap where the strip meets its copy is also 0-100px. `height` is the tallest a
// cloud gets.
export function cloudStrip(seed: number, height: number, scale = 1): CloudStrip {
  const rand = mulberry32(seed)
  const clouds: CloudShape[] = []
  let x = 0
  while (x < STRIP_MIN_LENGTH) {
    if (clouds.length > 0) x += Math.floor(rand() * (CLOUD_MAX_GAP + 1))
    const w = Math.round((CLOUD_MIN_WIDTH + rand() * (CLOUD_MAX_WIDTH - CLOUD_MIN_WIDTH)) * scale)
    const n = 2 + Math.floor(rand() * (height >= 12 ? 3 : 2)) // a short strip has room for fewer levels
    // Each level is about 60% as tall as the one below; together they fill 75-100% of `height`.
    const weights = Array.from({ length: n }, (_, i) => 0.6 ** i)
    const total = weights.reduce((a, b) => a + b, 0)
    const fill = (0.75 + rand() * 0.25) * height + BOX_OVERLAP * (n - 1)
    const boxes: CloudBox[] = []
    let bx = 0
    let bw = w
    let top = height
    for (let i = 0; i < n; i++) {
      if (i > 1 && top < CLOUD_MIN_BOX) break // a tall circle can use up the room
      let h = Math.max(3, Math.round(((fill * weights[i]) / total) * 10) / 10)
      let round = false
      if (i > 0) {
        const narrower = Math.max(CLOUD_MIN_BOX, Math.round(bw * (0.5 + rand() * 0.35)))
        // Now and then the level is a circle instead of a box (as wide as it is tall, if it fits).
        const diameter = Math.min(bw, top + BOX_OVERLAP, Math.max(h + 3, CLOUD_MIN_BOX))
        if (rand() < CIRCLE_CHANCE && diameter >= CLOUD_MIN_BOX) {
          round = true
          h = Math.round(diameter * 10) / 10
          bx += Math.round(rand() * (bw - h))
          bw = h
        } else {
          bx += Math.round(rand() * (bw - narrower))
          bw = Math.min(bw, narrower)
        }
      }
      const y = i === 0 ? height - h : Math.max(0, top + BOX_OVERLAP - h)
      boxes.push({ x: bx, y: Math.round(y * 10) / 10, w: bw, h: Math.round((i === 0 ? h : top + BOX_OVERLAP - y) * 10) / 10, round })
      top = y
    }
    clouds.push({ x, w, boxes })
    x += w
  }
  return { clouds, length: x + Math.floor(rand() * (CLOUD_MAX_GAP + 1)) }
}

// --- where the sun and moon sit ---

// Centre of each orb within the 30px-high button. The zone sets the band (day
// high, dawn and dusk low, night in the middle); the hour moves an orb up to
// ORB_NUDGE px within it while the clock is in charge.
export const ORB_BAND: Record<ZoneKey, { sun?: number; moon?: number }> = {
  dawn: { sun: 20, moon: 26 },
  day: { sun: 11 },
  dusk: { sun: 19, moon: 8 },
  night: { moon: 15 },
}
export const ORB_NUDGE = 2

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function orbY(zone: ZoneKey, minute: number, following: boolean): { sun?: number; moon?: number } {
  const band = ORB_BAND[zone]
  if (!following) return band
  // The sun climbs toward noon; the moon toward midnight.
  const sunLift = ORB_NUDGE * clamp01(Math.sin((Math.PI * (minute - 360)) / 720))
  const moonLift = ORB_NUDGE * clamp01(Math.sin((Math.PI * ((minute - 1080 + 1440) % 1440)) / 720))
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    sun: band.sun === undefined ? undefined : round(band.sun - sunLift),
    moon: band.moon === undefined ? undefined : round(band.moon - moonLift),
  }
}
