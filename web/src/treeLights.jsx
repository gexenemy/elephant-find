import { useEffect, useRef } from 'react'

/**
 * Live multicoloured Christmas lights on the painted tree.
 *
 * The painted (warm, always-on) bulbs were removed from the background by tools/garland_off.py;
 * this layer draws them back: a bulb core on a normal canvas and its glow + soft coloured spill on
 * the needles on a second canvas blended with `screen`, so neighbouring colours mix on the tree.
 * Bulb positions are painting pixels (bg 1917×1080), in order along the wire (top → bottom). They are measured by
 * tools/garland_off.py (-> tools/garland.json): copy that list here whenever the background is rebuilt.
 *
 * URL ?lights=
 *   chase  (default) only the chasing waves running down the wire
 *   mix    the chasing waves + every 7th bulb is a flash diode
 *   flash  steady bulbs, every 5th bulb flashes like sparkling snow
 *   steady all on, no animation
 */
const IMG_W = 1917
const IMG_H = 1080
// [x, y, strand] along the wire, top to bottom
export const BULBS = [[462,9,0],[493,26,0],[516,61,0],[548,81,0],[585,101,0],[623,104,0],[665,124,0],[704,136,0],[732,124,0],[769,130,0],[734,183,1],[708,218,1],[675,246,1],[641,251,1],[610,279,1],[574,282,1],[541,305,1],[507,299,1],[467,316,1],[409,321,1],[370,316,1],[480,404,2],[434,418,2],[401,431,2],[377,436,2],[336,445,2],[294,455,2],[297,523,3],[343,551,3],[390,566,3],[441,574,3],[502,574,3],[537,555,3],[565,564,3],[591,552,3],[631,543,3],[668,533,3],[704,529,3],[731,505,3],[774,491,3],[809,478,3],[837,457,3],[854,428,3],[819,398,3]]
// red, green, blue, amber, purple, yellow — neighbours never share a colour
export const PALETTE = [[255, 45, 40], [40, 225, 80], [45, 120, 255], [255, 140, 20], [185, 60, 255], [255, 215, 60]]
const BOX = { x0: 180, y0: 0, x1: 950, y1: 670 } // tree area incl. glow (painting px)
const CORE_R = 5.0 // bulb radius, painting px
const GLOW_R = 30
const SPILL_R = 86

const q = new URLSearchParams(window.location.search)
export const MODE = ['mix', 'chase', 'flash', 'steady'].includes(q.get('lights')) ? q.get('lights') : 'chase'

const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`
const mixW = (c, w) => c.map((v) => v + (255 - v) * w) // towards white

/** Radial glow sprite (white-hot centre → colour → transparent), drawn once per colour. */
function glowSprite(c, size = 128) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')
  const r = size / 2
  const gr = g.createRadialGradient(r, r, 0, r, r, r)
  gr.addColorStop(0, `rgba(${mixW(c, 0.75).map(Math.round)},1)`)
  gr.addColorStop(0.12, `rgba(${mixW(c, 0.25).map(Math.round)},0.85)`)
  gr.addColorStop(0.35, `rgba(${c},0.38)`)
  gr.addColorStop(0.7, `rgba(${c},0.08)`)
  gr.addColorStop(1, `rgba(${c},0)`)
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  return cv
}

/**
 * Brightness of bulb i at time t (seconds of performance.now()) without the random sparkles: the same waves the
 * canvas draws. Used by the glass ornament (ornament.js) so the bulbs reflected in it blink in step with the garland.
 */
export function bulbLevel(i, t) {
  if (MODE === 'steady') return 1
  if (MODE === 'flash') return 0.82 + 0.06 * Math.sin(t * 1.3 + i * 1.7)
  const w = 0.5 + 0.5 * Math.cos(2 * Math.PI * (t / 3.2 - i / 7))
  return MODE === 'chase' ? 0.15 + 0.85 * w * w : 0.32 + 0.68 * w * w
}

/** Brightness of bulb i at time t (0.15 … ~1.6; above 1 = flash). */
function makeIntensity(n) {
  const flashEvery = MODE === 'flash' ? 5 : 7
  const flashers = new Map()
  for (let i = 0; i < n; i++) {
    if ((MODE === 'mix' || MODE === 'flash') && (i + 3) % flashEvery === 0) flashers.set(i, { next: Math.random() * 3, t0: -10 })
  }
  return (i, t) => {
    let I
    if (MODE === 'steady') return 1
    if (MODE === 'flash') I = 0.82 + 0.06 * Math.sin(t * 1.3 + i * 1.7) // gentle breathing
    else {
      // waves running down the wire: wavelength 7 bulbs, one wave per 3.2 s
      const w = 0.5 + 0.5 * Math.cos(2 * Math.PI * (t / 3.2 - i / 7))
      I = MODE === 'chase' ? 0.15 + 0.85 * w * w : 0.32 + 0.68 * w * w
    }
    const f = flashers.get(i)
    if (f) {
      if (t >= f.next) { f.t0 = t; f.next = t + 1.2 + Math.random() * 3.2 }
      const dt = t - f.t0
      // fast attack, quick decay: a sparkle
      const spike = dt < 0 ? 0 : dt < 0.05 ? dt / 0.05 : Math.exp(-(dt - 0.05) / 0.12)
      // in "flash" the flash diodes idle a bit dimmer, so the sparkle reads stronger
      I = (MODE === 'flash' ? 0.5 : I) + spike * (MODE === 'flash' ? 1.1 : 0.9)
    }
    return I
  }
}

export default function TreeLights({ frame }) {
  const glowRef = useRef(null)
  const coreRef = useRef(null)

  const s = Math.max(frame.fw / IMG_W, frame.fh / IMG_H)
  const offX = (frame.fw - IMG_W * s) / 2
  const offY = (frame.fh - IMG_H * s) / 2
  const left = offX + BOX.x0 * s
  const top = offY + BOX.y0 * s
  const w = (BOX.x1 - BOX.x0) * s
  const h = (BOX.y1 - BOX.y0) * s

  useEffect(() => {
    const gcv = glowRef.current
    const ccv = coreRef.current
    if (!gcv || !ccv) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    for (const cv of [gcv, ccv]) {
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
    }
    const g = gcv.getContext('2d')
    const c = ccv.getContext('2d')
    const k = s * dpr
    const sprites = PALETTE.map((col) => glowSprite(col))
    const intensity = makeIntensity(BULBS.length)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0

    const draw = (now) => {
      const t = now / 1000
      g.clearRect(0, 0, gcv.width, gcv.height)
      c.clearRect(0, 0, ccv.width, ccv.height)
      g.globalCompositeOperation = 'lighter' // colours of neighbouring bulbs add up on the needles
      for (let i = 0; i < BULBS.length; i++) {
        const [bx, by] = BULBS[i]
        const ci = i % PALETTE.length
        const col = PALETTE[ci]
        const I = reduce ? 1 : intensity(i, t)
        const x = (bx - BOX.x0) * k
        const y = (by - BOX.y0) * k
        // wide soft spill on the needles ("otbleski")
        const rs = SPILL_R * k
        g.globalAlpha = Math.min(1, 0.42 * I)
        g.drawImage(sprites[ci], x - rs, y - rs, rs * 2, rs * 2)
        // the glow around the bulb
        const rg = GLOW_R * k * (0.75 + 0.35 * Math.min(I, 1.6))
        g.globalAlpha = Math.min(1, 1.0 * I)
        g.drawImage(sprites[ci], x - rg, y - rg, rg * 2, rg * 2)
        // the bulb itself: dark coloured glass when dim, white-hot centre when bright
        const r = CORE_R * k
        const lit = Math.min(I, 1)
        const flash = Math.max(0, I - 1)
        const gr = c.createRadialGradient(x - r * 0.25, y - r * 0.3, 0, x, y, r)
        gr.addColorStop(0, rgb(mixW(col, 0.25 + 0.55 * lit + 0.2 * flash), 0.35 + 0.65 * lit))
        gr.addColorStop(0.6, rgb(col, 0.3 + 0.7 * lit))
        gr.addColorStop(1, rgb(col, 0.18 + 0.5 * lit))
        c.fillStyle = gr
        c.beginPath()
        c.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2)
        c.fill()
      }
      g.globalAlpha = 1
      if (!reduce && MODE !== 'steady') raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [w, h, s])

  const style = { position: 'absolute', left, top, width: w, height: h, pointerEvents: 'none' }
  return (
    <>
      <canvas ref={glowRef} className="tree-glow" style={{ ...style, mixBlendMode: 'screen' }} />
      <canvas ref={coreRef} className="tree-bulbs" style={style} />
    </>
  )
}
