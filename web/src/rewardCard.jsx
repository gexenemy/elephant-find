import { useEffect, useRef } from 'react'

/**
 * Reward for finding every elephant: the New Year greeting card (export/reward_card.jpg).
 *
 * The room dims and blurs, the card flies up from below spinning (its golden back first), turns its face
 * to the player and settles with a little bounce; when it lands a ring of golden sparkles bursts out of it,
 * then a gleam runs across the card. Soft snow and gold glitter keep falling over everything, the card
 * breathes with a warm glow and tilts after the mouse. Esc / «Закрыть» closes it.
 * Preview without finding the elephants: ?reward=1 (opens a moment after loading) or __finder.showReward().
 */
const LAND = 1.25 // s after opening: the card has landed (sparkle burst)

const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100
  if (a === 1 && b !== 11) return one
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few
  return many
}

function useFx(ref, open) {
  useEffect(() => {
    if (!open) return
    const cv = ref.current
    const ctx = cv.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let W = 0, H = 0
    const resize = () => {
      W = cv.clientWidth; H = cv.clientHeight
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
    }
    resize()
    window.addEventListener('resize', resize)
    const rnd = (a, b) => a + Math.random() * (b - a)
    const snow = Array.from({ length: reduce ? 0 : 90 }, () => ({
      x: Math.random(), y: Math.random(), r: rnd(0.8, 2.6), v: rnd(0.025, 0.07), sw: rnd(0.2, 0.6), ph: rnd(0, 6.3), a: rnd(0.35, 0.85),
    }))
    const glitter = Array.from({ length: reduce ? 0 : 40 }, () => ({
      x: Math.random(), y: Math.random(), v: rnd(0.015, 0.04), tw: rnd(1, 3), ph: rnd(0, 6.3), s: rnd(2, 5),
    }))
    let sparks = []
    let burst = false
    const t0 = performance.now()
    let last = t0
    let raf = 0
    const star = (x, y, s, a, c) => {
      ctx.globalAlpha = a
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s)
      ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s)
      ctx.fill()
    }
    const draw = (now) => {
      const t = (now - t0) / 1000
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      // burst of golden sparkles from the edge of the card when it lands
      if (!burst && t >= LAND && !reduce) {
        burst = true
        const card = document.querySelector('.reward-card')?.getBoundingClientRect()
        const cx = card ? card.left + card.width / 2 : W / 2
        const cy = card ? card.top + card.height / 2 : H / 2
        const rx = card ? card.width / 2 : 200, ry = card ? card.height / 2 : 140
        for (let i = 0; i < 160; i++) {
          const a = rnd(0, Math.PI * 2)
          const sp = rnd(160, 520)
          sparks.push({
            x: cx + Math.cos(a) * rx * rnd(0.7, 1.02), y: cy + Math.sin(a) * ry * rnd(0.7, 1.02),
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(40, 160),
            life: rnd(1.1, 2.2), age: 0, s: rnd(2.5, 7),
            c: ['#ffe9a8', '#ffd36b', '#fff6dc', '#ffb84d', '#ffffff'][i % 5],
          })
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      for (const f of snow) {
        f.y += f.v * dt
        if (f.y > 1.02) { f.y = -0.02; f.x = Math.random() }
        const x = (f.x + 0.012 * Math.sin(t * f.sw * 6.28 + f.ph)) * W
        ctx.globalAlpha = f.a * Math.min(1, t / 0.8)
        ctx.fillStyle = '#f4f8ff'
        ctx.beginPath(); ctx.arc(x, f.y * H, f.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalCompositeOperation = 'lighter'
      for (const g of glitter) {
        g.y += g.v * dt
        if (g.y > 1.02) { g.y = -0.02; g.x = Math.random() }
        const tw = Math.pow(0.5 + 0.5 * Math.sin(t * g.tw * 6.28 + g.ph), 3)
        star(g.x * W, g.y * H, g.s * (0.5 + tw), 0.75 * tw * Math.min(1, Math.max(0, t - LAND)), '#ffd98a')
      }
      sparks = sparks.filter((p) => (p.age += dt) < p.life)
      for (const p of sparks) {
        const drag = Math.exp(-2.6 * dt)
        p.vx *= drag; p.vy = p.vy * drag + 140 * dt
        p.x += p.vx * dt; p.y += p.vy * dt
        const k = 1 - p.age / p.life
        star(p.x, p.y, p.s * (0.6 + 0.6 * k), Math.min(1, k * 1.6), p.c)
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [ref, open])
}

export default function RewardCard({ open, total, onClose }) {
  const fx = useRef(null)
  const tilt = useRef(null)
  useFx(fx, open)

  // Which side faces the player: decided from the card's live transform every frame (backface-visibility alone
  // is not honoured by every renderer - the front was showing mirrored while the card spun).
  useEffect(() => {
    if (!open) return
    let raf = 0
    const tick = () => {
      const card = document.querySelector('.reward-card')
      if (card) {
        const m = getComputedStyle(card).transform
        let front = true
        if (m.startsWith('matrix3d(')) front = parseFloat(m.slice(9).split(',')[10]) >= 0
        card.querySelector('.reward-front').style.visibility = front ? 'visible' : 'hidden'
        card.querySelector('.reward-back').style.visibility = front ? 'hidden' : 'visible'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) return
    const key = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, onClose])

  if (!open) return null
  // the card leans a little after the mouse
  const onMove = (e) => {
    const el = tilt.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`)
  }
  const onLeave = () => {
    const el = tilt.current
    if (!el) return
    el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg')
  }
  return (
    <div className="reward" onPointerDown={(e) => e.stopPropagation()}>
      <canvas ref={fx} className="reward-fx" />
      <div className="reward-title">
        <span>Ура! Все {total} {plural(total, 'слон найден', 'слона найдены', 'слонов найдены')}!</span>
      </div>
      <div className="reward-stage" onMouseMove={onMove} onMouseLeave={onLeave}>
        <div className="reward-tilt" ref={tilt}>
          <div className="reward-card">
            <div className="reward-face reward-front">
              <img src="reward_card.jpg" alt="С Новым годом!" draggable={false} />
              <div className="reward-shine" />
              <div className="reward-gleam" />
            </div>
            <div className="reward-face reward-back">
              <svg viewBox="-50 -50 100 100" className="reward-flake" aria-hidden="true">
                {[0, 60, 120, 180, 240, 300].map((a) => (
                  <g key={a} transform={`rotate(${a})`}>
                    <line x1="0" y1="0" x2="0" y2="-40" />
                    <line x1="0" y1="-16" x2="-9" y2="-25" /><line x1="0" y1="-16" x2="9" y2="-25" />
                    <line x1="0" y1="-28" x2="-7" y2="-35" /><line x1="0" y1="-28" x2="7" y2="-35" />
                  </g>
                ))}
                <circle r="5" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="reward-actions">
        <button onClick={onClose}>Закрыть</button>
        <button className="primary" onClick={() => window.location.reload()}>Играть снова</button>
      </div>
    </div>
  )
}
