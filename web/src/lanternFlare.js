import * as THREE from 'three'

/**
 * Red lantern on the mantel (Mantel_Lantern38): a click rocks it from side to side and the candle inside flares up (25.11).
 * Blender: custom property lantern_flare on the lantern's root; the rocking itself is the clip LanternRock on the body
 * (anim_on_click, anim_repeat). The flame, the light, the glow and the glass already flicker in FinderScene's frame
 * loop (scene.userData.__flicker); this module runs AFTER that loop and adds on top of what it has just set:
 *   - the flame lags behind the rocking body on a damped spring: it leans against each tilt and swings back;
 *   - the candle flares up: flame taller, light, halo and glass brighter (up in 0.25 s, holds, fades out by 2.6 s);
 *   - on each "knock" of the base on the mantel a puff of warm embers flies out of the roof top, rises and fades.
 * One run at a time (the clip's anim_repeat guard); debug: window.__lanternFlare.
 */
const LIFE = 2.8
const KNOCKS = [[0.40, 9], [0.73, 7], [1.0, 5]] // seconds after the click (LanternRock frames 12, 22, 30 at 30 fps), embers
const EMBERS = 21
const TOP = 0.278 // roof finial height above the base, metres (Blender, body-local)

let emberTexture = null
function getEmberTexture() {
  if (emberTexture) return emberTexture
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  gr.addColorStop(0, 'rgba(255,250,220,1)')
  gr.addColorStop(0.2, 'rgba(255,200,110,0.9)')
  gr.addColorStop(0.5, 'rgba(255,130,40,0.3)')
  gr.addColorStop(1, 'rgba(255,90,20,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, s, s)
  emberTexture = new THREE.CanvasTexture(c)
  emberTexture.colorSpace = THREE.SRGBColorSpace
  return emberTexture
}

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t) }
const isUnder = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false }
const V = new THREE.Vector3()

export function setupLanternFlare(scene) {
  const items = new Map()
  const flicker = scene.userData.__flicker ?? []
  scene.traverse((root) => {
    if (!root.userData?.lantern_flare || items.has(root)) return
    if (root.userData.__lanternItem) { items.set(root, root.userData.__lanternItem); return }
    const parts = flicker.filter((f) => isUnder(f.obj, root))
    const flame = parts.find((f) => f.kind === 'flame')?.obj
    const body = flame?.parent ?? root
    const ws = new THREE.Vector3()
    root.getWorldScale(ws)
    const unit = 1 / ws.x // metres -> root's local units
    const embers = []
    for (let i = 0; i < EMBERS; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getEmberTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
        blending: THREE.AdditiveBlending, color: new THREE.Color(1.0, 0.72, 0.38),
      }))
      sp.name = `${root.name}_Ember${i}`
      sp.raycast = () => {}
      sp.renderOrder = 7
      sp.visible = false
      root.add(sp)
      embers.push({ sp, t0: Infinity, life: 1, from: new THREE.Vector3(), vx: 0, vz: 0, rise: 0, size: 0, ph: 0 })
    }
    const it = { root, parts, flame, body, unit, embers, t: Infinity, knock: 0, lean: 0, leanV: 0 }
    Object.defineProperty(root.userData, '__lanternItem', { value: it, enumerable: false, configurable: true })
    items.set(root, it)
  })

  const pulse = (toy) => {
    const it = items.get(toy)
    if (!it || it.t < LIFE) return
    it.t = 0
    it.knock = 0
    it.lean = it.leanV = 0
  }

  const puff = (it, n) => {
    // roof top in the root's frame (the body is tilted at this moment)
    V.set(0, TOP * it.unit, 0)
    it.body.localToWorld(V)
    it.root.worldToLocal(V)
    let k = 0
    for (const e of it.embers) {
      if (k >= n) break
      if (e.t0 !== Infinity) continue
      e.t0 = it.t
      e.life = 1.0 + 0.6 * Math.random()
      e.from.copy(V)
      const a = Math.random() * Math.PI * 2
      const r = (0.02 + 0.03 * Math.random()) * it.unit
      e.vx = Math.cos(a) * r
      e.vz = Math.sin(a) * r
      e.rise = (0.09 + 0.07 * Math.random()) * it.unit
      e.size = (0.024 + 0.01 * Math.random()) * it.unit // sprite incl. its soft halo; the hot core is ~1/4 of it
      e.ph = Math.random() * 10
      k++
    }
  }

  // flare of the candle over time: 0 -> 1 -> 0
  const flareK = (t) => ease(t / 0.25) * (1 - ease((t - 1.3) / 1.3))

  const update = (dt) => {
    const step = Math.min(dt, 0.05) * (window.__lanternSlow ?? 1) // debug: slow motion
    for (const it of items.values()) {
      if (it.t === Infinity) continue
      it.t += step
      const t = it.t
      while (it.knock < KNOCKS.length && t >= KNOCKS[it.knock][0]) puff(it, KNOCKS[it.knock++][1])
      // flame on a spring: it wants to stay upright in the world, so it lags behind the body's tilt
      const target = -it.body.rotation.z
      it.leanV += (-160 * (it.lean - target) - 7 * it.leanV) * step
      it.lean += it.leanV * step
      const fk = t < LIFE ? flareK(t) : 0
      const knockFlick = KNOCKS.reduce((s, [kt]) => s + Math.max(0, 1 - Math.abs(t - kt) / 0.12), 0)
      for (const f of it.parts) {
        if (f.kind === 'flame') {
          f.obj.rotation.z += it.lean * 1.15
          const grow = 1 + 0.45 * fk + 0.12 * knockFlick
          f.obj.scale.y *= grow
          f.obj.scale.x *= 1 + 0.12 * fk
          f.obj.scale.z *= 1 + 0.12 * fk
        } else if (f.kind === 'light') f.obj.intensity *= 1 + 1.1 * fk + 0.25 * knockFlick
        else if (f.kind === 'glow') f.obj.material.opacity *= 1 + 0.9 * fk + 0.2 * knockFlick
        else if (f.kind === 'glass') f.obj.material.emissiveIntensity *= 1 + 1.4 * fk
      }
      // embers: rise with a little sway, twinkle, cool from yellow-white to orange and fade
      let alive = false
      for (const e of it.embers) {
        if (e.t0 === Infinity) { e.sp.visible = false; continue }
        const u = (t - e.t0) / e.life
        if (u >= 1) { e.t0 = Infinity; e.sp.visible = false; continue }
        alive = true
        const up = e.rise * (1 - (1 - u) ** 2)
        const sway = 0.008 * it.unit * Math.sin(u * 7 + e.ph)
        e.sp.position.set(e.from.x + e.vx * u + sway, e.from.y + 0.006 * it.unit + up, e.from.z + e.vz * u)
        e.sp.scale.setScalar(e.size * (1 - 0.5 * u))
        const tw = 0.75 + 0.25 * Math.sin(t * 31 + e.ph * 3)
        e.sp.material.opacity = Math.min(1, u / 0.08) * (1 - u) ** 1.2 * tw
        e.sp.material.color.setRGB(1.0, 0.85 - 0.35 * u, 0.55 - 0.4 * u)
        e.sp.visible = true
      }
      if (t >= LIFE && !alive && Math.abs(it.lean) < 0.002 && Math.abs(it.leanV) < 0.01) it.t = Infinity
    }
  }
  window.__lanternFlare = items
  return { pulse, update }
}
