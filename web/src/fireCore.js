/**
 * Live fire in the painted fireplace - drawing code shared by the game layer (fireplaceFire.jsx)
 * and the preview page (tools/fire_preview.html). Everything is a pure function of time t (seconds).
 *
 * Assets are cut from the painting by tools/fire_assets.py -> export/fire/ (numbers below = fire.json):
 *   plate.png   firebox without the painted flames     flame.png / core.png  the big flame and its heart
 *   tongues.png small detached tongues                 glow.jpg   warm light on the room (screen blend)
 * All coordinates are painting pixels (bg 1917x1080); k = canvas pixels per painting pixel.
 */
export const IMG_W = 1917
export const IMG_H = 1080
export const BOX = { x0: 1196, y0: 380, x1: 1460, y1: 620 } // the sprites
export const FIRE_BOX = { x0: 1196, y0: 330, x1: 1460, y1: 620 } // fire canvas (sprites + room for rising tongues / sparks)
export const GLOW_BOX = { x0: 700, y0: 120, x1: 1620, y1: 860 } // glow canvas
const TONGUES = [[53, 77, 16, 33], [55, 119, 12, 24], [96, 44, 16, 35], [123, 30, 9, 17], [175, 48, 18, 37], [206, 111, 15, 32], [215, 152, 8, 13]]
const FLAME_TOP = 49 // rows of the sprite
const STILL_ROW = 214 // below this row (logs) the flame does not move
const THROAT_Y = 342 // top of the firebox opening: sparks are gone by here
const N_SPARKS = 16

const TAU = Math.PI * 2
const fract = (x) => x - Math.floor(x)
const rnd = (a, b = 0, c = 0) => fract(Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + 3.3) * 43758.5453)
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u) }

/** Calm breathing of the fire, 0..1 (slow sines - no sharp flashes). */
export function flicker(t) {
  return 0.5 + 0.24 * Math.sin(t * 1.9) + 0.14 * Math.sin(t * 3.1 + 1.0) + 0.08 * Math.sin(t * 5.3 + 2.0) + 0.04 * Math.sin(t * 8.9 + 0.5)
}

export function loadFireAssets(base = 'fire/') {
  const load = (name) => new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = base + name
  })
  return Promise.all(['plate.png', 'flame.png', 'core.png', 'tongues.png', 'glow.jpg'].map(load))
    .then(([plate, flame, core, tongues, glow]) => ({ plate, flame, core, tongues, glow }))
}

/** The flame sprite drawn in thin horizontal strips: each strip slides sideways, more the higher it is -> swaying. */
function drawSwaying(ctx, img, t, k, ox, oy, phase, ampK) {
  const W = img.width
  const stretch = 1 + 0.03 * Math.sin(t * 1.7 + phase) + 0.018 * Math.sin(t * 2.9 + 1 + phase) // breathing in height
  const STEP = 2
  // destination row of a sprite row: stretched above the logs, untouched below
  const rowY = (sy) => Math.round((oy + (sy < STILL_ROW ? STILL_ROW - (STILL_ROW - sy) * stretch : sy)) * k)
  for (let sy = 0; sy < img.height; sy += STEP) {
    const up = Math.max(0, STILL_ROW - sy) // height above the logs
    const hgt = up / (STILL_ROW - FLAME_TOP)
    const amp = 5.0 * ampK * Math.pow(hgt, 1.4)
    // waves travelling up the flame
    const dx = amp * (0.62 * Math.sin(TAU * (t / 2.6) - up * 0.03 + phase) + 0.38 * Math.sin(TAU * (t / 1.45) - up * 0.055 + 1.3 + phase * 2))
    const y0 = rowY(sy)
    const y1 = rowY(sy + STEP) // whole pixels: strips neither overlap (visible with `lighter`) nor leave gaps
    if (y1 > y0) ctx.drawImage(img, 0, sy, W, STEP, (ox + dx) * k, y0, W * k, y1 - y0)
  }
}

/** Fire canvas (covers FIRE_BOX, normal blending). */
export function drawFire(ctx, A, t, k) {
  const ox = BOX.x0 - FIRE_BOX.x0
  const oy = BOX.y0 - FIRE_BOX.y0
  const f = flicker(t)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.drawImage(A.plate, ox * k, oy * k, A.plate.width * k, A.plate.height * k)

  // small tongues: are born at the flame, rise, shrink and dissolve - each on its own loop
  const tongue = (i) => {
    const [sx, sy, sw, sh] = TONGUES[i]
    const P = 2.7 + 1.6 * rnd(i, 1)
    const u = fract(t / P + rnd(i, 2))
    const a = smooth(0, 0.2, u) * (1 - smooth(0.5, 1, u))
    if (a <= 0.01) return
    const sc = (0.55 + 0.45 * smooth(0, 0.32, u)) * (1 - 0.5 * smooth(0.55, 1, u))
    const cx = ox + sx + sw / 2 + 2.6 * Math.sin(TAU * u * 1.4 + i * 1.7)
    const cy = oy + sy + sh / 2 + (0.35 - u) * 56 // passes its painted place at u = 0.35
    ctx.globalAlpha = a
    ctx.drawImage(A.tongues, sx, sy, sw, sh, (cx - (sw * sc) / 2) * k, (cy - (sh * sc) / 2) * k, sw * sc * k, sh * sc * k)
  }
  for (let i = 0; i < TONGUES.length; i++) tongue(i)

  // the big flame sways and breathes
  ctx.globalAlpha = 1
  drawSwaying(ctx, A.flame, t, k, ox, oy, 0, 1)
  ctx.globalCompositeOperation = 'lighter' // the heart moves with the flame and only gets a little brighter / dimmer
  ctx.globalAlpha = 0.22 * f
  drawSwaying(ctx, A.core, t, k, ox, oy, 0, 1)

  // sparks: light, twinkling, drawn into the chimney
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < N_SPARKS; i++) {
    const P = 3.0 + 2.4 * rnd(i, 7)
    const T = t / P + rnd(i, 8)
    const n = Math.floor(T)
    const u = T - n
    if (rnd(i, n, 5) < 0.25) continue // some loops stay empty -> irregular
    const x0 = 1270 + 115 * rnd(i, n, 1)
    const y0 = 455 + 60 * rnd(i, n, 2)
    const y = y0 - (y0 - THROAT_Y) * Math.pow(u, 0.9)
    const x = x0 + (1331 - x0) * 0.4 * u + (3 + 4 * rnd(i, n, 3)) * Math.sin(TAU * u * (1.2 + 1.8 * rnd(i, n, 4)) + i)
    const tw = 0.6 + 0.4 * Math.sin(t * (7 + 6 * rnd(i, 9)) + i * 2.1)
    const a = smooth(0, 0.1, u) * (1 - smooth(0.62, 1, u)) * tw
    if (a <= 0.01) continue
    const r = (1.1 + 0.9 * rnd(i, n, 6)) * (1 - 0.4 * u)
    const px = (x - FIRE_BOX.x0) * k
    const py = (y - FIRE_BOX.y0) * k
    const R = r * 4 * k
    const g = ctx.createRadialGradient(px, py, 0, px, py, R)
    g.addColorStop(0, `rgba(255,236,170,${a})`)
    g.addColorStop(0.25, `rgba(255,170,60,${a * 0.55})`)
    g.addColorStop(1, 'rgba(255,120,20,0)')
    ctx.globalAlpha = 1
    ctx.fillStyle = g
    ctx.fillRect(px - R, py - R, R * 2, R * 2)
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

/** Glow canvas (covers GLOW_BOX, CSS mix-blend-mode: screen): the painted warm light breathes with the fire. */
export function drawGlow(ctx, A, t, k) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.globalAlpha = 0.1 + 0.34 * flicker(t)
  ctx.drawImage(A.glow, 0, 0, A.glow.width * k, A.glow.height * k)
  ctx.globalAlpha = 1
}
