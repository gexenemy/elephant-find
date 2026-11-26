import * as THREE from 'three'

/**
 * Black lantern on the bookcase (Shelf_Lantern37): a click lets the candle flame out for a little walk (25.11).
 * Blender: custom property flame_escape on the lantern's root; clip Lantern37Hop on the body (a rattle when the flame
 * jumps out, a hop with a squash when it dives back in; anim_on_click, anim_repeat). The flame, the light, the glow and
 * the glass flicker in FinderScene's frame loop (scene.userData.__flicker); this module runs AFTER that loop:
 *   0.00-0.30 s  the flame stretches tall and fidgets (wind-up), the lantern rattles
 *   0.30-0.70 s  it jumps out through the front glass and up in an arc onto the ring on top of the roof
 *   0.70-1.50 s  lands with a squash, hops twice on the spot, looks left and right
 *   1.50-2.50 s  flies once round the lantern in a descending spiral, leaving a trail of sparks
 *   2.50-2.85 s  dives back through the glass onto the wick (the lantern hops)
 *   2.85-3.40 s  flares up, a ring of sparks pops round the wick, everything settles
 * While the flame is out the light travels with it, a small halo follows it, and the glass and the lantern's own glow
 * go dim. Debug: window.__flameEscape (slow motion: window.__lanternSlow, shared with lanternFlare.js).
 */
const LIFE = 3.4
const SPARKS = 40
const TOP = 0.285 // top of the ring on the roof, metres above the base (Blender, body-local)

let sparkTexture = null
function getSparkTexture() {
  if (sparkTexture) return sparkTexture
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  gr.addColorStop(0, 'rgba(255,250,225,1)')
  gr.addColorStop(0.2, 'rgba(255,205,120,0.9)')
  gr.addColorStop(0.5, 'rgba(255,140,50,0.3)')
  gr.addColorStop(1, 'rgba(255,100,30,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, s, s)
  sparkTexture = new THREE.CanvasTexture(c)
  sparkTexture.colorSpace = THREE.SRGBColorSpace
  return sparkTexture
}

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t) }
const isUnder = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false }
const bez = (out, a, b, c, d, u) => {
  const v = 1 - u
  return out.set(0, 0, 0)
    .addScaledVector(a, v * v * v).addScaledVector(b, 3 * v * v * u)
    .addScaledVector(c, 3 * v * u * u).addScaledVector(d, u * u * u)
}
const V = new THREE.Vector3()
const CAM = new THREE.Vector3()

export function setupFlameEscape(scene, camera) {
  const items = new Map()
  const flicker = scene.userData.__flicker ?? []
  scene.traverse((root) => {
    if (!root.userData?.flame_escape || items.has(root)) return
    if (root.userData.__flameEscItem) { items.set(root, root.userData.__flameEscItem); return }
    const parts = flicker.filter((f) => isUnder(f.obj, root))
    const flame = parts.find((f) => f.kind === 'flame')?.obj
    if (!flame) return
    const light = parts.find((f) => f.kind === 'light')?.obj
    const body = flame.parent
    const ws = new THREE.Vector3()
    root.getWorldScale(ws)
    const unit = 1 / ws.x
    // halo that follows the flame while it is out
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getSparkTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      blending: THREE.AdditiveBlending, color: new THREE.Color(1.0, 0.62, 0.28),
    }))
    halo.name = `${root.name}_FlameHalo`
    halo.raycast = () => {}
    halo.renderOrder = 7
    halo.visible = false
    body.add(halo)
    const sparks = []
    for (let i = 0; i < SPARKS; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getSparkTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
        blending: THREE.AdditiveBlending, color: new THREE.Color(1.0, 0.8, 0.45),
      }))
      sp.name = `${root.name}_Spark${i}`
      sp.raycast = () => {}
      sp.renderOrder = 7
      sp.visible = false
      root.add(sp)
      sparks.push({ sp, t0: Infinity, life: 0.5, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0 })
    }
    const it = {
      root, parts, flame, light, body, unit, halo, sparks,
      home: flame.position.clone(), lightHome: light ? light.position.clone() : null,
      t: Infinity, prev: new THREE.Vector3(), nextSpark: 0, popped: false,
      F: new THREE.Vector3(0, 0, 1), S: new THREE.Vector3(1, 0, 0),
    }
    Object.defineProperty(root.userData, '__flameEscItem', { value: it, enumerable: false, configurable: true })
    items.set(root, it)
  })

  // point in the lantern's frame: s = sideways (screen right), h = height above the base, f = towards the camera
  const P = (it, s, h, f, out = new THREE.Vector3()) =>
    out.set(0, 0, 0).addScaledVector(it.S, s * it.unit).addScaledVector(it.F, f * it.unit).setY(h * it.unit)

  const pulse = (toy) => {
    const it = items.get(toy)
    if (!it || it.t < LIFE) return
    // which way is "towards the camera" in the body's frame
    camera.getWorldPosition(CAM)
    it.body.worldToLocal(CAM)
    it.F.set(CAM.x, 0, CAM.z).normalize()
    it.S.set(0, 1, 0).cross(it.F).normalize() // Up x F: screen right when F points at the camera
    it.t = 0
    it.nextSpark = 0.3
    it.popped = false
    it.prev.copy(it.home)
  }

  const emit = (it, posBody, vel, life, size) => {
    const e = it.sparks.find((s) => s.t0 === Infinity)
    if (!e) return
    V.copy(posBody)
    it.body.localToWorld(V)
    it.root.worldToLocal(V)
    e.pos.copy(V)
    e.vel.copy(vel)
    e.t0 = it.t
    e.life = life
    e.size = size
  }

  // where the flame is at time t (body-local), and how "out" it is (0 = on the wick, 1 = outside)
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3()
  const place = (it, t, out) => {
    const W = it.home
    if (t < 0.3) { out.copy(W); return 0 }
    if (t < 0.7) {
      const u = ease((t - 0.3) / 0.4)
      return bez(out, W, P(it, 0, 0.12, 0.14, B), P(it, 0, 0.37, 0.08, C), P(it, 0, TOP, 0, D), u), Math.min(1, (t - 0.3) / 0.12)
    }
    if (t < 1.5) {
      const hop = (a, b, h) => (t > a && t < b ? h * Math.sin(Math.PI * (t - a) / (b - a)) : 0)
      P(it, 0, TOP + hop(0.9, 1.07, 0.022) + hop(1.15, 1.3, 0.03), 0, out)
      return 1
    }
    if (t < 2.5) {
      const u = (t - 1.5) / 1.0
      const a = 2 * Math.PI * ease(u)
      const R = 0.1 * ease(u / 0.18)
      const h = TOP + 0.02 * Math.sin(Math.PI * Math.min(1, u / 0.25)) - 0.115 * ease(u)
      P(it, R * Math.sin(a), h, R * Math.cos(a), out)
      return 1
    }
    if (t < 2.85) {
      const u = ease((t - 2.5) / 0.35)
      P(it, 0, TOP - 0.115, 0.1, A)
      return bez(out, A, P(it, 0, 0.22, 0.15, B), P(it, 0, 0.13, 0.07, C), W, u), 1 - clamp01((t - 2.73) / 0.12)
    }
    out.copy(W)
    return 0
  }

  const POS = new THREE.Vector3()
  const VEL = new THREE.Vector3()
  const update = (dt) => {
    const step = Math.min(dt, 0.05) * (window.__lanternSlow ?? 1)
    for (const it of items.values()) {
      const active = it.t !== Infinity
      if (active) it.t += step
      const t = active ? it.t : Infinity
      if (active && t < LIFE) {
        const away = place(it, t, POS)
        VEL.copy(POS).sub(it.prev).divideScalar(Math.max(step, 1e-4) * it.unit) // m/s in the body's frame
        if (step > 0) it.prev.copy(POS)
        const f = it.flame
        f.position.copy(POS)
        // size: wind-up stretch, bigger while outside (so it reads at this distance), squash on landings, pop at home
        let sy = 1, sx = 1
        if (t < 0.3) { const w = Math.sin(Math.PI * t / 0.3); sy = 1 + 0.6 * w; sx = 1 - 0.2 * w }
        const big = 1 + 0.7 * away
        const land = (a) => Math.max(0, 1 - Math.abs(t - a) / 0.08)
        const squash = 0.35 * (land(0.72) + land(1.08) + land(1.31))
        const speed = Math.min(1, VEL.length() / 1.2)
        sy *= big * (1 - squash + 0.4 * speed)
        sx *= big * (1 + 0.6 * squash - 0.15 * speed)
        if (t > 2.85) { const p = 1 + 0.7 * Math.max(0, 1 - (t - 2.85) / 0.5) ** 2; sy *= p; sx *= 1 + (p - 1) * 0.5 }
        f.scale.x *= sx
        f.scale.z *= sx
        f.scale.y *= sy
        // the tip trails behind the motion; on the roof it looks left and right
        const lean = 0.5
        let rz = Math.max(-0.9, Math.min(0.9, VEL.x * lean))
        let rx = Math.max(-0.9, Math.min(0.9, -VEL.z * lean))
        if (t > 0.7 && t < 1.5) rz += 0.35 * Math.sin(Math.PI * clamp01((t - 1.3) / 0.2) * 2) * (t > 1.3 ? 1 : 0)
        if (t < 0.3) rz += 0.15 * Math.sin(t * 60)
        f.rotation.z += rz
        f.rotation.x += rx
        // light travels with the flame; the lantern itself goes dim while it is empty
        if (it.light) it.light.position.copy(POS).add(V.set(0, 0.018 * it.unit, 0))
        const pop = t > 2.85 ? Math.max(0, 1 - (t - 2.85) / 0.55) : 0
        for (const p of it.parts) {
          if (p.kind === 'light') p.obj.intensity *= 1 + 0.3 * away + 1.2 * pop
          else if (p.kind === 'glow') p.obj.material.opacity *= (1 - 0.8 * away) * (1 + 0.8 * pop)
          else if (p.kind === 'glass') p.obj.material.emissiveIntensity *= (1 - 0.75 * away) * (1 + 1.2 * pop)
        }
        it.halo.visible = away > 0.01
        it.halo.position.copy(POS).add(V.set(0, 0.014 * it.unit, 0))
        it.halo.scale.setScalar(0.065 * it.unit)
        it.halo.material.opacity = 0.8 * away
        // trail: a spark every few hundredths of a second while flying
        const flying = (t > 0.3 && t < 0.7) || (t > 1.5 && t < 2.85)
        if (flying && t >= it.nextSpark) {
          it.nextSpark = t + 0.035
          V.set((Math.random() - 0.5) * 0.02, 0.01 + 0.02 * Math.random(), (Math.random() - 0.5) * 0.02).multiplyScalar(it.unit)
          emit(it, POS, V, 0.45 + 0.2 * Math.random(), (0.012 + 0.006 * Math.random()) * it.unit)
        }
        if (t > 2.85 && !it.popped) {
          it.popped = true
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3
            V.set(Math.cos(a) * 0.09, 0.05 + 0.05 * Math.random(), Math.sin(a) * 0.09).multiplyScalar(it.unit)
            emit(it, it.home, V, 0.5 + 0.2 * Math.random(), (0.014 + 0.006 * Math.random()) * it.unit)
          }
        }
      } else if (active) {
        // done: everything back home (the flicker loop already resets scale, rotation, light and glass)
        it.flame.position.copy(it.home)
        if (it.light) it.light.position.copy(it.lightHome)
        it.halo.visible = false
      }
      // sparks keep living after the flame is home
      let alive = false
      for (const e of it.sparks) {
        if (e.t0 === Infinity) continue
        const u = active ? (it.t - e.t0) / e.life : 1
        if (u >= 1) { e.t0 = Infinity; e.sp.visible = false; continue }
        alive = true
        e.sp.position.copy(e.pos).addScaledVector(e.vel, u * e.life * (1 - 0.4 * u))
        e.sp.scale.setScalar(e.size * (1 - 0.6 * u))
        e.sp.material.opacity = Math.min(1, u / 0.1) * (1 - u) ** 1.3 * (0.8 + 0.2 * Math.sin(it.t * 37 + e.size * 9e3))
        e.sp.material.color.setRGB(1.0, 0.88 - 0.35 * u, 0.6 - 0.45 * u)
        e.sp.visible = true
      }
      if (active && it.t >= LIFE && !alive) it.t = Infinity
    }
  }
  window.__flameEscape = items
  return { pulse, update }
}
