/**
 * Custom cursor: a red knitted mitten pointing with its tip (author 25.11; three frames from the author,
 * export/ui/cursor/cursor_mitten_1..3.webp - plain, glowing, glowing with sparkles).
 *   - click: frames 1 → 2 → 3 → back (the mitten only lights up, its size does not change),
 *     a small golden flash with thin rays and a few sparks at the tip;
 *   - moving: tiny golden stars are left behind and twinkle out;
 *   - standing still: a soft star at the tip gently pulses.
 * The system cursor is hidden only on devices with a fine pointer (mouse); touch screens keep the usual behaviour.
 * ?cursor=0 - the ordinary cursor. Debug: window.__mittenCursor.
 */
const q = new URLSearchParams(window.location.search)
const FINE = window.matchMedia?.('(pointer: fine)').matches ?? true
const ENABLED = q.get('cursor') !== '0' && FINE
const REDUCE = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// frame box in CSS px and the tip (hotspot) inside it: the frames are 149×181, tip at 15.4 % / 14.1 %
const BOX_W = 48
const BOX_H = BOX_W * 181 / 149
const HOT_X = BOX_W * 0.154
const HOT_Y = BOX_H * 0.1414
const IDLE_AFTER = 380 // ms without movement -> the tip star starts to pulse
const TRAIL_STEP = 9 // px of travel per trail star
const GOLD = ['#fff6d6', '#ffe49a', '#ffd067', '#ffbf4d', '#fff']

const rnd = (a, b) => a + Math.random() * (b - a)

function setup() {
  const root = document.documentElement
  root.classList.add('mc-on')

  const el = document.createElement('div')
  el.className = 'mc mc-hidden'
  el.style.width = `${BOX_W}px`
  el.style.height = `${BOX_H}px`
  el.innerHTML = `
    <div class="mc-idle" style="left:${HOT_X}px;top:${HOT_Y}px"><i></i></div>
    <div class="mc-press" style="transform-origin:${HOT_X}px ${HOT_Y}px">
      <img class="mc-f" src="ui/cursor/cursor_mitten_1.webp" alt="" draggable="false">
      <img class="mc-f mc-f2" src="ui/cursor/cursor_mitten_2.webp" alt="" draggable="false">
      <img class="mc-f mc-f3" src="ui/cursor/cursor_mitten_3.webp" alt="" draggable="false">
    </div>`
  document.body.appendChild(el)
  const f2 = el.querySelector('.mc-f2')
  const f3 = el.querySelector('.mc-f3')

  const cv = document.createElement('canvas')
  cv.className = 'mc-fx'
  document.body.appendChild(cv)
  const ctx = cv.getContext('2d')
  let dpr = 1
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr)
  }
  resize()
  window.addEventListener('resize', resize)

  const S = { x: -100, y: -100, lastX: null, lastY: null, travel: 0, parts: [], flashes: [], raf: 0, idleT: 0 }
  window.__mittenCursor = S

  // ---- position, idle, visibility ----
  const place = (x, y) => { el.style.transform = `translate3d(${x - HOT_X}px, ${y - HOT_Y}px, 0)` }
  const onMove = (e) => {
    if (e.pointerType === 'touch') return
    S.x = e.clientX; S.y = e.clientY
    place(S.x, S.y)
    el.classList.remove('mc-hidden', 'mc-still')
    clearTimeout(S.idleT)
    S.idleT = setTimeout(() => el.classList.add('mc-still'), IDLE_AFTER)
    // trail: one star per TRAIL_STEP px travelled, spread along the path
    if (S.lastX != null && !REDUCE) {
      const dx = S.x - S.lastX, dy = S.y - S.lastY
      const d = Math.hypot(dx, dy)
      S.travel += d
      let n = 0
      while (S.travel >= TRAIL_STEP && n < 4) {
        S.travel -= TRAIL_STEP; n++
        const k = Math.random()
        spawnTrail(S.lastX + dx * k, S.lastY + dy * k)
      }
    }
    S.lastX = S.x; S.lastY = S.y
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerleave', () => el.classList.add('mc-hidden'))
  document.documentElement.addEventListener('mouseleave', () => { el.classList.add('mc-hidden'); S.lastX = null })
  window.addEventListener('blur', () => { el.classList.add('mc-hidden'); S.lastX = null })

  // ---- click: frames + tap + flash ----
  const onDown = (e) => {
    if (e.pointerType === 'touch' || e.button > 0) return
    S.x = e.clientX; S.y = e.clientY
    place(S.x, S.y)
    el.classList.remove('mc-hidden', 'mc-still')
    clearTimeout(S.idleT)
    S.idleT = setTimeout(() => el.classList.add('mc-still'), IDLE_AFTER + 500)
    const opt = { duration: 720, easing: 'linear' }
    f2.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.82 }, { opacity: 0 }], opt)
    f3.animate([{ opacity: 0 }, { opacity: 0, offset: 0.08 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.42 }, { opacity: 0, offset: 0.7 }, { opacity: 0 }], opt)
    // 25.11 (author): no squeeze/grow on click any more - only the glowing frames 2 and 3
    S.flashes.push({ x: S.x, y: S.y, t: 0, rot: rnd(0, Math.PI) })
    if (!REDUCE) {
      for (let i = 0; i < 9; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(40, 110)
        S.parts.push({ x: S.x, y: S.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 60, life: rnd(0.35, 0.65), age: 0, s: rnd(1.6, 2.8), c: GOLD[i % GOLD.length], tw: rnd(10, 18), drag: 4 })
      }
    }
    kick()
  }
  window.addEventListener('pointerdown', onDown, true)

  function spawnTrail(x, y) {
    S.parts.push({
      x: x + rnd(-3, 3), y: y + rnd(-3, 3), vx: rnd(-14, 14), vy: rnd(-10, 12), g: 28,
      life: rnd(0.45, 0.9), age: 0, s: rnd(1.3, 2.9), c: GOLD[(Math.random() * GOLD.length) | 0], tw: rnd(8, 16), drag: 2,
    })
    if (S.parts.length > 220) S.parts.splice(0, S.parts.length - 220)
    kick()
  }

  // ---- effects canvas: runs only while something is alive ----
  const star = (x, y, s, a, col) => {
    ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s)
    ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill()
  }
  const glow = (x, y, r, a) => {
    if (a <= 0.003) return
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(255,246,215,${a})`); g.addColorStop(0.35, `rgba(255,200,90,${a * 0.5})`); g.addColorStop(1, 'rgba(255,180,60,0)')
    ctx.globalAlpha = 1; ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
  }
  let last = 0
  function kick() {
    if (S.raf) return
    last = performance.now()
    S.raf = requestAnimationFrame(draw)
  }
  function draw(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    ctx.globalCompositeOperation = 'lighter'
    // click flash: warm glow + thin rays, ~0.4 s
    S.flashes = S.flashes.filter((f) => (f.t += dt) < 0.45)
    for (const f of S.flashes) {
      const u = f.t / 0.45
      const k = Math.min(1, f.t / 0.05) * (1 - u) ** 2
      glow(f.x, f.y, 10 + 22 * Math.min(1, f.t / 0.12), 0.85 * k)
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot + f.t * 1.2)
      for (let i = 0; i < 8; i++) {
        const L = (i % 2 ? 10 : 17) * (0.5 + 0.7 * Math.min(1, f.t / 0.15))
        const gr = ctx.createLinearGradient(0, 0, L, 0)
        gr.addColorStop(0, `rgba(255,240,190,${0.7 * k})`); gr.addColorStop(1, 'rgba(255,200,90,0)')
        ctx.fillStyle = gr; ctx.globalAlpha = 1
        ctx.beginPath(); ctx.moveTo(3, -1.2); ctx.lineTo(L, 0); ctx.lineTo(3, 1.2); ctx.closePath(); ctx.fill()
        ctx.rotate(Math.PI / 4)
      }
      ctx.restore()
    }
    // stars: trail and click sparks
    S.parts = S.parts.filter((p) => (p.age += dt) < p.life)
    for (const p of S.parts) {
      const drag = Math.exp(-p.drag * dt)
      p.vx *= drag; p.vy = p.vy * drag + p.g * dt
      p.x += p.vx * dt; p.y += p.vy * dt
      const u = p.age / p.life
      const a = Math.min(1, u / 0.12) * (1 - u) ** 1.3
      const tw = 0.6 + 0.4 * Math.sin(p.age * p.tw + p.s * 3)
      const s = p.s * (1 - 0.5 * u) * (0.8 + 0.2 * tw)
      glow(p.x, p.y, s * 3.2, 0.35 * a)
      star(p.x, p.y, s * 1.6, a * tw, p.c)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    if (S.parts.length || S.flashes.length) S.raf = requestAnimationFrame(draw)
    else { S.raf = 0; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height) }
  }
}

if (ENABLED) {
  if (document.body) setup()
  else window.addEventListener('DOMContentLoaded', setup, { once: true })
}

export const mittenCursorEnabled = ENABLED
