import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { minuteOfDay } from './zones'
import type { ZoneKey } from './types'
import { CONSTELLATIONS, SKY_H, SKY_W, cloudStrip, moonPath, moonPhase, orbY, zodiacSign, type CloudStrip } from './sky'
import type { SkyLook } from './skyLook'

// The painted part of the sky toggle, drawn behind whatever text sits on it: the
// sky, the stars, the sun and moon, and two layers of clouds (which pass in front
// of the orbs). Used by the header's toggle and by the zone tabs in Theme
// settings, so both show the same sky. It renders as direct children of its
// `.skyBox` container (a fragment of absolutely placed elements).

const FRONT = { strip: cloudStrip(7, 14), height: 14, speed: 1.5 } // px per second
const BACK = { strip: cloudStrip(23, 9, 0.75), height: 9, speed: 0.8 }
// Where in its loop each layer starts: chosen once per launch.
const START = { front: Math.random(), back: Math.random() }

function CloudLayer({ strip, height, speed, start, look, className }: {
  strip: CloudStrip
  height: number
  speed: number
  start: number
  look: { fill: string; opacity: number }
  className: string
}) {
  const duration = strip.length / speed
  const shapes = (
    <svg width={strip.length} height={height} viewBox={`0 0 ${strip.length} ${height}`} fill={look.fill} aria-hidden="true">
      {strip.clouds.map(cloud => {
        const left = Math.min(...cloud.humps.map(h => h.cx - h.r * 0.84))
        const right = Math.max(...cloud.humps.map(h => h.cx + h.r * 0.84))
        const base = Math.min(...cloud.humps.map(h => h.r)) * 0.4
        return (
          <g key={cloud.x} transform={`translate(${cloud.x} 0)`}>
            {cloud.humps.map((h, i) => <circle key={i} cx={h.cx} cy={height - h.r * 0.55} r={h.r} />)}
            <rect x={left} y={height - base} width={right - left} height={base} />
          </g>
        )
      })}
    </svg>
  )
  const style = {
    '--len': `${strip.length}px`,
    '--dur': `${duration}s`,
    animationDelay: `${-start * duration}s`,
    opacity: look.opacity,
    width: strip.length * 2,
    height,
  } as CSSProperties
  return <span className={`skyCloudLayer ${className}`} style={style}>{shapes}{shapes}</span>
}

function Moon({ fraction, size, x, y, lit, shadow }: { fraction: number; size: number; x: number; y: number; lit: string; shadow: string }) {
  return (
    <svg className="skyMoon" data-testid="moon" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ left: x - size / 2, top: y - size / 2 }} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill={shadow} />
      <path d={moonPath(fraction, size)} fill={lit} />
    </svg>
  )
}

// `following`: the clock is in charge (the orbs shift a little with the hour),
// rather than a locked or fixed zone (they rest in the middle of their band).
function SkyScene({ zone, look, now, following }: { zone: ZoneKey; look: SkyLook; now: Date; following: boolean }) {
  const minute = minuteOfDay(now)
  const orb = orbY(zone, minute, following)
  const { fraction } = moonPhase(now)
  const constellation = CONSTELLATIONS[zodiacSign(now)]
  const night = zone === 'night'
  const twilight = zone === 'dawn' || zone === 'dusk'

  // When the zone changes, the old sky fades out over the new one.
  const [fadeFrom, setFadeFrom] = useState<{ key: number; sky: string } | null>(null)
  const lastZone = useRef(zone)
  const lastSky = useRef(look.sky)
  useEffect(() => {
    if (lastZone.current === zone) return
    lastZone.current = zone
    setFadeFrom({ key: Date.now(), sky: lastSky.current })
    const timer = setTimeout(() => setFadeFrom(null), 1000)
    return () => clearTimeout(timer)
  }, [zone])
  useEffect(() => { lastSky.current = look.sky })

  return (
    <>
      <span className="skySky" style={{ background: look.sky }} />
      {fadeFrom && <span key={fadeFrom.key} className="skyFade" style={{ background: fadeFrom.sky }} />}

      {(night || twilight) && (
        <svg className="skyStars" width={SKY_W} height={SKY_H} viewBox={`0 0 ${SKY_W} ${SKY_H}`} aria-hidden="true" data-testid="constellation" style={{ opacity: night ? 1 : 0.3 }}>
          {night && constellation.lines.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={constellation.stars[a].x} y1={constellation.stars[a].y} x2={constellation.stars[b].x} y2={constellation.stars[b].y}
              stroke={look.star} strokeOpacity={0.22} strokeWidth={0.4} />
          ))}
          {constellation.stars.map((s, i) => (
            <circle key={i} className={night && i % 3 === 1 ? 'skyStar skyStar--twinkle' : 'skyStar'} style={{ animationDelay: `${i * 0.45}s` }}
              cx={s.x} cy={s.y} r={s.bright ? 1.2 : 0.85} fill={look.star} />
          ))}
        </svg>
      )}

      {orb.sun !== undefined && (
        <span className="skySun" data-testid="sun" style={{ left: (twilight ? 14 : 15) - 5, top: orb.sun - 5, background: look.sun }} />
      )}
      {orb.moon !== undefined && (
        <Moon fraction={fraction} size={night ? 10 : 6} x={night ? 15 : 23} y={orb.moon} lit={look.moonLit} shadow={look.moonShadow} />
      )}

      <span className="skyClouds" aria-hidden="true">
        <CloudLayer {...BACK} start={START.back} look={look.cloudBack} className="skyCloudLayer--back" />
        <CloudLayer {...FRONT} start={START.front} look={look.cloudFront} className="skyCloudLayer--front" />
      </span>
    </>
  )
}

export default SkyScene
