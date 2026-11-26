import * as THREE from 'three'

/**
 * Candle in the glass jar on the table: a click blows it out and it lights up again (25.11).
 * Blender: custom property candle_blow on the candle's root (its children: the flame, the light, the glow plane and
 * the glass - all of them already flicker in FinderScene's frame loop, scene.userData.__flicker).
 * This module runs AFTER that loop every frame and multiplies what the loop has just set:
 *   0.00-0.30 s  a gust: the flame leans to one side, stretches and thins out, the light wavers
 *   0.30-0.60 s  the flame shrinks to nothing, the light, the halo and the glow in the glass fade almost out
 *   0.55-2.3 s   a thin curl of grey smoke rises from the wick, sways and melts away
 *   1.75-1.95 s  a spark at the wick
 *   1.90-2.45 s  the flame pops back up (with a little overshoot), light and halo return
 * One run at a time; clicks during a run are ignored. Debug: window.__candleBlow.
 */
const LIFE = 2.6
const WISPS = 9

let smokeTexture = null
function getSmokeTexture() {
  if (smokeTexture) return smokeTexture
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  gr.addColorStop(0, 'rgba(235,230,225,0.9)')
  gr.addColorStop(0.4, 'rgba(210,205,200,0.45)')
  gr.addColorStop(1, 'rgba(200,195,190,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, s, s)
  smokeTexture = new THREE.CanvasTexture(c)
  smokeTexture.colorSpace = THREE.SRGBColorSpace
  return smokeTexture
}

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t) }
const isUnder = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false }

export function setupCandleBlow(scene) {
  const items = new Map()
  const flicker = scene.userData.__flicker ?? []
  scene.traverse((root) => {
    if (!root.userData?.candle_blow || items.has(root)) return
    if (root.userData.__candleItem) { items.set(root, root.userData.__candleItem); return }
    const parts = flicker.filter((f) => isUnder(f.obj, root))
    const flame = parts.find((f) => f.kind === 'flame')?.obj
    const ws = new THREE.Vector3()
    root.getWorldScale(ws)
    const unit = 1 / ws.x // metres -> root's local units
    const wick = flame ? flame.position.clone() : new THREE.Vector3(0, 0.8, 0)
    const wisps = []
    for (let i = 0; i < WISPS; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getSmokeTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
        color: new THREE.Color(0.78, 0.76, 0.74),
      }))
      sp.name = `${root.name}_Smoke${i}`
      sp.raycast = () => {}
      sp.renderOrder = 6
      sp.visible = false
      root.add(sp)
      wisps.push(sp)
    }
    const it = { root, parts, flame, wick, unit, wisps, t: Infinity, side: 1 }
    Object.defineProperty(root.userData, '__candleItem', { value: it, enumerable: false, configurable: true })
    items.set(root, it)
  })

  const pulse = (toy) => {
    const it = items.get(toy)
    if (!it || it.t < LIFE) return
    it.t = 0
    it.side = Math.random() < 0.5 ? -1 : 1
  }

  // flame size factor and light factor over time
  const flameK = (t) => {
    if (t < 0.3) return 1 - 0.25 * ease(t / 0.3)
    if (t < 0.6) return 0.75 * (1 - ease((t - 0.3) / 0.3))
    if (t < 1.9) return 0
    if (t < 2.15) return 1.3 * ease((t - 1.9) / 0.25)
    if (t < 2.45) return 1.3 - 0.3 * ease((t - 2.15) / 0.3)
    return 1
  }
  const lightK = (t) => {
    if (t < 0.3) return 1 - 0.3 * ease(t / 0.3) + 0.12 * Math.sin(t * 60)
    if (t < 0.6) return 0.7 - 0.62 * ease((t - 0.3) / 0.3)
    if (t < 1.75) return 0.08
    if (t < 1.95) return 0.08 + 0.5 * Math.sin(Math.PI * (t - 1.75) / 0.2) // the spark
    if (t < 2.45) return 0.08 + 1.07 * ease((t - 1.9) / 0.4)
    return 1.15 - 0.15 * ease((t - 2.45) / 0.15)
  }

  const update = (dt) => {
    for (const it of items.values()) {
      if (it.t === Infinity) continue
      it.t += dt
      const t = it.t
      if (t >= LIFE) {
        it.t = Infinity
        for (const w of it.wisps) w.visible = false
        if (it.flame) it.flame.visible = true
        continue // the flicker loop restores everything on its own next frame
      }
      const fk = flameK(t)
      const lk = Math.max(0, lightK(t))
      for (const f of it.parts) {
        if (f.kind === 'flame') {
          // gust: lean and stretch thin, then shrink to nothing
          const gust = t < 0.6 ? Math.sin(Math.PI * clamp01(t / 0.6)) : 0
          f.obj.scale.x *= fk * (1 - 0.35 * gust)
          f.obj.scale.z *= fk * (1 - 0.35 * gust)
          f.obj.scale.y *= fk * (1 + 0.25 * gust)
          f.obj.rotation.z += it.side * 0.55 * gust
          f.obj.visible = fk > 0.01
        } else if (f.kind === 'light') f.obj.intensity *= lk
        else if (f.kind === 'glow') f.obj.material.opacity *= Math.min(1.6, lk * (t > 1.75 && t < 1.95 ? 1.6 : 1))
        else if (f.kind === 'glass') f.obj.material.emissiveIntensity *= Math.max(0.1, lk)
      }
      // smoke: wisps leave the wick one after another and rise in a lazy curl
      it.wisps.forEach((w, i) => {
        const u = (t - 0.55 - i * 0.11) / 1.4
        if (u <= 0 || u >= 1) { w.visible = false; return }
        const rise = 0.11 * it.unit * ease(u) + 0.01 * it.unit
        const sway = 0.02 * it.unit * Math.sin(u * 6.5 + i * 0.9) * u + it.side * 0.01 * it.unit * u
        w.position.set(it.wick.x + sway, it.wick.y + 0.012 * it.unit + rise, it.wick.z)
        w.scale.setScalar((0.014 + 0.045 * u) * it.unit)
        w.material.opacity = 0.55 * Math.min(1, u / 0.15) * (1 - u) ** 1.3
        w.visible = true
      })
    }
  }
  window.__candleBlow = items
  return { pulse, update }
}
