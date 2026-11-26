import { useEffect, useRef } from 'react'

/**
 * Light snow behind the window glass of the painted room, glinting in the moonlight.
 *
 * A small 2D canvas over the painting (under the 3D canvas), placed over the window only.
 * Flakes live in painting pixels (bg is 1917×1080) and are clipped to the six glass panes,
 * so they pass behind the window bars. Pane quads come from tools/window_moon.py (same numbers).
 * URL: ?snow=0 turns it off, ?snowN=85 sets the number of flakes.
 *
 * Click on the painted moon: it lights up with a soft glow and shakes off a
 * flurry of bright moonlit snow that falls down through the window. Every click = a new flurry.
 * The click is caught on window level (pointerdown), so 3D objects need not cover the moon.
 */
const IMG_W = 1917
const IMG_H = 1080
const PANES = [
  [[36.7, 81.4], [109.4, 98.4], [109.3, 217.6], [36.6, 204.6]],
  [[117.7, 101.4], [180.4, 116.4], [179.3, 228.6], [117.6, 218.6]],
  [[37.7, 215.4], [107.4, 226.4], [110.4, 342.6], [38.6, 339.6]],
  [[117.7, 228.4], [178.3, 236.4], [179.3, 345.6], [118.7, 343.6]],
  [[36.8, 352.5], [109.3, 353.4], [110.3, 490.6], [36.6, 495.6]],
  [[117.7, 353.4], [179.3, 355.4], [182.3, 483.6], [117.7, 490.6]],
]
const MOON = [150, 158] // moon centre in the painting
const MOON_R = 20 // painted moon radius, painting px
const MOON_HIT = 27 // click radius
const BURST_N = 55 // flakes per click
const MAX_BURST = 320
const BOX = { x0: 34, y0: 78, x1: 186, y1: 498 } // window glass bounding box (painting px)

const q = new URLSearchParams(window.location.search)
export const snowEnabled = q.get('snow') !== '0'
const COUNT = Math.max(0, Number(q.get('snowN') ?? 85))

const rnd = (a, b) => a + Math.random() * (b - a)

// a flake shaken off the moon: born on the disc (more on its lower half), first pushed out and down, then it
// falls faster than the ordinary snow, sways and glints in the moonlight; lives until it leaves the window
function moonFlake(delay) {
  const a = rnd(0, Math.PI * 2)
  const rr = MOON_R * Math.sqrt(Math.random()) * 0.9
  const dx = Math.cos(a), dy = Math.abs(Math.sin(a)) * 0.6 + 0.4 // biased downwards
  const depth = Math.random()
  return {
    delay,
    age: 0,
    x: MOON[0] + Math.cos(a) * rr,
    y: MOON[1] + Math.sin(a) * rr * 0.8 + 4,
    vx: dx * rnd(8, 26),
    vy: dy * rnd(6, 22),
    vt: rnd(34, 62) * (0.75 + 0.5 * depth), // terminal fall speed, px/s
    r: 0.9 + depth * 1.5,
    sway: rnd(1.5, 4.5),
    sw: rnd(0.3, 0.9),
    ph: rnd(0, Math.PI * 2),
    tw: rnd(1.2, 3.2),
    tph: rnd(0, Math.PI * 2),
  }
}

function newFlake(atTop) {
  const depth = Math.random() // 0 = far, 1 = near the glass
  return {
    x: rnd(BOX.x0 - 6, BOX.x1 + 6),
    y: atTop ? rnd(BOX.y0 - 20, BOX.y0 - 2) : rnd(BOX.y0, BOX.y1),
    r: 0.6 + depth * 1.2, // radius, painting px
    vy: 5 + depth * 13, // fall speed, px/s
    vx: rnd(-1.2, 0.6),
    sway: rnd(1, 3.5) * (0.5 + depth),
    sw: rnd(0.25, 0.8), // sway frequency, Hz
    ph: rnd(0, Math.PI * 2),
    a: 0.5 + depth * 0.45, // base opacity
    tw: rnd(0.6, 2.2), // twinkle frequency
    tph: rnd(0, Math.PI * 2),
  }
}

export default function WindowSnow({ frame }) {
  const ref = useRef(null)
  const flakes = useRef(null)
  if (!flakes.current) flakes.current = Array.from({ length: COUNT }, () => newFlake(false))
  const burst = useRef({ flakes: [], glows: [] }) // moon click: falling flurry + glow pulses

  // painting px -> frame px (the .bg image uses object-fit: cover)
  const s = Math.max(frame.fw / IMG_W, frame.fh / IMG_H)
  const offX = (frame.fw - IMG_W * s) / 2
  const offY = (frame.fh - IMG_H * s) / 2
  const left = offX + BOX.x0 * s
  const top = offY + BOX.y0 * s
  const w = (BOX.x1 - BOX.x0) * s
  const h = (BOX.y1 - BOX.y0) * s

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    const ctx = cv.getContext('2d')
    const k = s * dpr // painting px -> canvas px
    const clip = new Path2D()
    for (const p of PANES) {
      clip.moveTo((p[0][0] - BOX.x0) * k, (p[0][1] - BOX.y0) * k)
      for (let i = 1; i < 4; i++) clip.lineTo((p[i][0] - BOX.x0) * k, (p[i][1] - BOX.y0) * k)
      clip.closePath()
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const B = burst.current

    // click on the painted moon (the canvas itself ignores pointer events; its rect = the window box)
    const onDown = (e) => {
      const rc = cv.getBoundingClientRect()
      if (!rc.width) return
      const px = BOX.x0 + ((e.clientX - rc.left) / rc.width) * (BOX.x1 - BOX.x0)
      const py = BOX.y0 + ((e.clientY - rc.top) / rc.height) * (BOX.y1 - BOX.y0)
      if (Math.hypot(px - MOON[0], py - MOON[1]) > MOON_HIT) return
      B.glows.push({ t: 0 })
      if (reduce) return
      for (let i = 0; i < BURST_N; i++) B.flakes.push(moonFlake(Math.pow(Math.random(), 1.6) * 1.3))
      if (B.flakes.length > MAX_BURST) B.flakes.splice(0, B.flakes.length - MAX_BURST)
    }
    window.addEventListener('pointerdown', onDown)
    let raf = 0
    let last = performance.now()

    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const t = now / 1000
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.save()
      ctx.clip(clip)
      // moon glow: swells quickly, fades slowly (soft, low intensity; the outgoing ring was removed 23.11)
      B.glows = B.glows.filter((g) => (g.t += dt) < 3)
      if (B.glows.length) {
        ctx.globalCompositeOperation = 'lighter'
        const mx = (MOON[0] - BOX.x0) * k
        const my = (MOON[1] - BOX.y0) * k
        for (const g of B.glows) {
          const up = Math.min(1, g.t / 0.18)
          const I = up * up * Math.exp(-Math.max(0, g.t - 0.18) / 0.8)
          let gr = ctx.createRadialGradient(mx, my, MOON_R * 0.6 * k, mx, my, (MOON_R + 34 + 18 * up) * k)
          gr.addColorStop(0, `rgba(255,246,214,${(0.34 * I).toFixed(3)})`)
          gr.addColorStop(0.35, `rgba(220,232,255,${(0.13 * I).toFixed(3)})`)
          gr.addColorStop(1, 'rgba(180,205,255,0)')
          ctx.fillStyle = gr
          ctx.fillRect(mx - 80 * k, my - 80 * k, 160 * k, 160 * k)
        }
        ctx.globalCompositeOperation = 'source-over'
      }
      // flurry shaken off the moon
      B.flakes = B.flakes.filter((f) => f.y < BOX.y1 + 6)
      for (const f of B.flakes) {
        if (f.delay > 0) { f.delay -= dt; continue }
        f.age += dt
        const drag = Math.exp(-2.2 * dt)
        f.vx *= drag
        f.vy = f.vt + (f.vy - f.vt) * Math.exp(-1.4 * dt) // eases into its fall speed
        f.x += f.vx * dt
        f.y += f.vy * dt
        const x = f.x + Math.sin(t * f.sw * 2 * Math.PI + f.ph) * f.sway * Math.min(1, f.age)
        const dm = Math.hypot(x - MOON[0], f.y - MOON[1])
        const moon = Math.exp(-dm / 90)
        const tw = Math.sin(t * f.tw * 2 * Math.PI + f.tph)
        const glint = Math.pow(Math.max(0, tw), 10) * (0.5 + 0.5 * moon)
        const fadeIn = Math.min(1, f.age / 0.15)
        const fadeOut = Math.min(1, (BOX.y1 + 6 - f.y) / 40)
        const alpha = Math.min(1, (0.7 + 0.3 * tw) * (0.8 + 0.4 * moon) * fadeIn * fadeOut + glint * 0.5)
        const cx = (x - BOX.x0) * k
        const cy = (f.y - BOX.y0) * k
        const r = f.r * k * (1 + glint * 0.4)
        ctx.fillStyle = `rgba(${Math.round(235 + 20 * moon)},${Math.round(242 + 8 * moon)},255,${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(r, 0.5), 0, Math.PI * 2)
        ctx.fill()
        if (glint > 0.2 && f.r > 1.0) {
          const L = r * (2.2 + 3.5 * glint)
          ctx.strokeStyle = `rgba(255,250,235,${(glint * 0.8 * fadeOut).toFixed(3)})`
          ctx.lineWidth = Math.max(0.6, 0.35 * k)
          ctx.beginPath()
          ctx.moveTo(cx - L, cy); ctx.lineTo(cx + L, cy)
          ctx.moveTo(cx, cy - L); ctx.lineTo(cx, cy + L)
          ctx.stroke()
        }
      }
      for (const f of flakes.current) {
        if (!reduce) {
          f.y += f.vy * dt
          f.x += f.vx * dt
          if (f.y > BOX.y1 + 4) Object.assign(f, newFlake(true))
        }
        const x = f.x + Math.sin(t * f.sw * 2 * Math.PI + f.ph) * f.sway
        const y = f.y
        // moonlight: flakes near the moon are brighter and glint more often
        const dm = Math.hypot(x - MOON[0], y - MOON[1])
        const moon = Math.exp(-dm / 70)
        const tw = Math.sin(t * f.tw * 2 * Math.PI + f.tph)
        const glint = Math.pow(Math.max(0, tw), 14) * (0.35 + 0.65 * moon) // short bright flashes
        const alpha = Math.min(1, f.a * (0.75 + 0.25 * tw) * (0.85 + 0.5 * moon) + glint * 0.6)
        const cx = (x - BOX.x0) * k
        const cy = (y - BOX.y0) * k
        const r = f.r * k * (1 + glint * 0.35)
        // warm-white near the moon, cool-white elsewhere
        const g = Math.round(238 + 10 * moon)
        const b = Math.round(255 - 20 * moon)
        ctx.fillStyle = `rgba(${Math.round(225 + 30 * moon)},${g},${b},${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(r, 0.5), 0, Math.PI * 2)
        ctx.fill()
        if (glint > 0.25 && f.r > 1.1) {
          // tiny four-point sparkle
          const L = r * (2.2 + 3 * glint)
          ctx.strokeStyle = `rgba(255,250,235,${(glint * 0.7).toFixed(3)})`
          ctx.lineWidth = Math.max(0.6, 0.35 * k)
          ctx.beginPath()
          ctx.moveTo(cx - L, cy); ctx.lineTo(cx + L, cy)
          ctx.moveTo(cx, cy - L); ctx.lineTo(cx, cy + L)
          ctx.stroke()
        }
      }
      ctx.restore()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [w, h, s])

  return (
    <canvas
      ref={ref}
      className="window-snow"
      style={{ position: 'absolute', left, top, width: w, height: h, pointerEvents: 'none' }}
    />
  )
}
