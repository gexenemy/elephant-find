import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

/**
 * "You found an elephant!" - a quiet celebration, drawn on a canvas over the whole window (author 25.11: softer
 * than before - no flash, no star of rays, no ring, no big stars; the elephant is no longer lit gold):
 * light golden pollen drifts up around the elephant and twinkles out, a caption ("Слон найден!  5 из 12") floats
 * up, and a small soft golden mote with a pollen trail flies into the counter (.hud), which flares up (.bump).
 * The golden outline along the elephant's contour is drawn in 3D (foundGlow.js).
 * Usage: <FoundFx ref={fx} />, fx.current.burst(x, y, n, total, box) with client (CSS) coordinates;
 * box = { x0, y0, x1, y1 } - the elephant on screen (optional, otherwise around the click point).
 */
const rnd = (a, b) => a + Math.random() * (b - a)
const COLORS = ['#fff3cf', '#ffe29a', '#ffd06a', '#ffbf55']
const POLLEN = 34 // motes per find
const FLY_AT = 0.7 // s: the mote leaves for the counter
const FLY = 0.9 // s: flight time

const FoundFx = forwardRef(function FoundFx(_, ref) {
  const cv = useRef(null)
  const caps = useRef(null)
  const st = useRef({ motes: [], orbs: [] })
  window.__foundFx = st.current // for poking around in the console

  useImperativeHandle(ref, () => ({
    burst(x, y, n, total, box) {
      const S = st.current
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (!reduce) {
        // pollen: born around the elephant's outline (ellipse in its screen box), drifts slowly up and twinkles out
        const b = box && box.x1 > box.x0 ? box : { x0: x - 40, y0: y - 40, x1: x + 40, y1: y + 40 }
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
        const rx = Math.max(18, (b.x1 - b.x0) / 2), ry = Math.max(18, (b.y1 - b.y0) / 2)
        for (let i = 0; i < POLLEN; i++) {
          const a = rnd(0, Math.PI * 2), k = rnd(0.75, 1.1)
          S.motes.push({
            x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k,
            vx: Math.cos(a) * rnd(4, 14), vy: rnd(-26, -8), sway: rnd(0, 6.3), sw: rnd(1.2, 2.4),
            life: rnd(1.4, 2.6), age: -rnd(0, 0.9), s: rnd(0.8, 1.6), c: COLORS[i % COLORS.length], tw: rnd(5, 10),
          })
        }
        S.orbs.push({ x0: x, y0: y, t: -FLY_AT })
      } else {
        setTimeout(() => bumpHud(), 300)
      }
      // caption
      const el = document.createElement('div')
      el.className = 'found-caption'
      el.innerHTML = `<b>Слон найден!</b><span>${n} из ${total}</span>`
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      caps.current?.appendChild(el)
      setTimeout(() => el.remove(), 2600)
    },
  }))

  useEffect(() => {
    const c = cv.current
    const ctx = c.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => { c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr) }
    resize()
    window.addEventListener('resize', resize)
    // a soft round speck of golden light
    const speck = (x, y, r, a, col) => {
      if (a <= 0.003) return
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2)
      g.addColorStop(0, col); g.addColorStop(0.3, col); g.addColorStop(1, 'rgba(255,190,80,0)')
      ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = g
      ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4)
    }
    let last = performance.now(), raf = 0
    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const S = st.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      ctx.globalCompositeOperation = 'lighter'
      // pollen
      S.motes = S.motes.filter((p) => (p.age += dt) < p.life)
      for (const p of S.motes) {
        if (p.age < 0) continue
        const drag = Math.exp(-0.8 * dt)
        p.vx *= drag; p.vy = p.vy * drag - 4 * dt // floats up a little faster with time
        p.x += (p.vx + Math.sin(p.age * p.sw + p.sway) * 6) * dt; p.y += p.vy * dt
        const u = p.age / p.life
        const env = Math.min(1, u / 0.18) * (1 - u) ** 1.2
        const tw = 0.55 + 0.45 * Math.sin(p.age * p.tw + p.sway)
        speck(p.x, p.y, p.s, 0.65 * env * tw, p.c)
      }
      // mote flying into the counter
      // into the live number of the counter (25.11: the number sits in one line with the label)
      const hud = (document.querySelector('.hud-num') ?? document.querySelector('.hud'))?.getBoundingClientRect()
      S.orbs = S.orbs.filter((o) => {
        o.t += dt
        if (o.t < 0) return true
        const u = Math.min(1, o.t / FLY)
        const tx = hud ? hud.left + hud.width / 2 : 40, ty = hud ? hud.top + hud.height / 2 : 24
        // gentle arc that bulges upwards but stays on screen
        const L = Math.hypot(tx - o.x0, ty - o.y0)
        const mx = (o.x0 + tx) / 2 + (ty - o.y0) * 0.18 * Math.sign(tx - o.x0 || 1)
        const my = Math.max(60, (o.y0 + ty) / 2 - 0.18 * L)
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
        const x = (1 - e) * (1 - e) * o.x0 + 2 * (1 - e) * e * mx + e * e * tx
        const y = (1 - e) * (1 - e) * o.y0 + 2 * (1 - e) * e * my + e * e * ty
        const fade = Math.min(1, o.t / 0.15)
        speck(x, y, 3.2, 0.7 * fade, '#fff1c8')
        if (Math.random() < 0.6) S.motes.push({ x: x + rnd(-3, 3), y: y + rnd(-3, 3), vx: rnd(-10, 10), vy: rnd(-10, 6), sway: rnd(0, 6.3), sw: 2, life: rnd(0.4, 0.8), age: 0, s: rnd(0.7, 1.4), c: COLORS[(Math.random() * 4) | 0], tw: 8 })
        if (u >= 1) {
          bumpHud()
          for (let i = 0; i < 10; i++) {
            const a = rnd(0, Math.PI * 2), sp = rnd(15, 45)
            S.motes.push({ x: tx, y: ty, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sway: rnd(0, 6.3), sw: 2, life: rnd(0.6, 1.0), age: 0, s: rnd(0.8, 1.5), c: COLORS[i % 4], tw: 8 })
          }
          return false
        }
        return true
      })
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <>
      <canvas ref={cv} className="found-fx" />
      <div ref={caps} className="found-captions" />
    </>
  )
})

function bumpHud() {
  const h = document.querySelector('.hud')
  if (!h) return
  h.classList.remove('bump')
  void h.offsetWidth // restart the CSS animation
  h.classList.add('bump')
}

export default FoundFx
