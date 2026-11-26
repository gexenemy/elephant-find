import * as THREE from 'three'

/**
 * Fireflies (plant on the bookcase shelf, 25.11). Blender: custom property fireflies on the toy's root;
 * fireflies_center (local, Blender axes), fireflies_radius (local units), fireflies_n, fireflies_delay (s after the
 * click), fireflies_life (s).
 * Every click (one swarm at a time): warm glowing fireflies slip out of the leaves, circle round the plant in lazy
 * loops (each its own ellipse, speed and direction, bobbing up and down), blink softly, then fly back into the
 * leaves and go out. They are sprites parented to the toy, so leaves in front hide them (depth test on).
 */
const EMERGE = 0.6 // s: out of the leaves to the loop
const RETURN = 0.7 // s: back into the leaves
const SIZE = 0.15 // sprite size in the toy's local units (the glow; the bright core is a small part of it)

let glowTexture = null
function getGlowTexture() {
  if (glowTexture) return glowTexture
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  gr.addColorStop(0, 'rgba(255,255,235,1)')
  gr.addColorStop(0.12, 'rgba(255,244,170,0.95)')
  gr.addColorStop(0.32, 'rgba(240,225,110,0.42)')
  gr.addColorStop(0.65, 'rgba(190,230,90,0.12)')
  gr.addColorStop(1, 'rgba(160,220,80,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, s, s)
  glowTexture = new THREE.CanvasTexture(c)
  glowTexture.colorSpace = THREE.SRGBColorSpace
  return glowTexture
}

const rnd = (a, b) => a + Math.random() * (b - a)
const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }

export function setupFireflies(scene) {
  const items = new Map()
  scene.traverse((root) => {
    if (!root.userData?.fireflies || items.has(root)) return
    // idempotent under React StrictMode: the sprites live on the root, created once
    if (root.userData.__fireflyItem) { items.set(root, root.userData.__fireflyItem); return }
    const d = root.userData
    const it = {
      root, t: Infinity, flies: [],
      c: d.fireflies_center ?? [0, 0, 0.5], R: d.fireflies_radius ?? 0.4, n: d.fireflies_n ?? 8,
      delay: d.fireflies_delay ?? 0.2, life: d.fireflies_life ?? 3.2,
    }
    for (let i = 0; i < it.n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false, color: new THREE.Color(1.7, 1.55, 0.95), // > 1: brighter than the texture
      }))
      sp.name = `${root.name}_Firefly${i}`
      sp.raycast = () => {} // never blocks clicks
      sp.renderOrder = 9
      sp.visible = false
      root.add(sp)
      it.flies.push({ sp })
    }
    Object.defineProperty(root.userData, '__fireflyItem', { value: it, enumerable: false, configurable: true })
    items.set(root, it)
  })

  const pulse = (toy) => {
    const it = items.get(toy)
    if (!it || it.t < it.life + it.delay) return // the swarm is still out
    const { R, c } = it
    it.t = 0
    it.flies.forEach((f, i) => {
      const a0 = (i / it.n) * Math.PI * 2 + rnd(-0.3, 0.3)
      f.start = [c[0] + rnd(-0.35, 0.35) * R, c[1] + rnd(-0.3, 0.2) * R, c[2] + rnd(-0.15, 0.2) * R] // inside the leaves
      f.a0 = a0
      f.w = (Math.random() < 0.5 ? -1 : 1) * rnd(1.3, 2.3) // rad/s
      f.rr = R * rnd(0.55, 1.0)
      f.h = c[2] + R * rnd(-0.15, 0.6)
      f.bob = R * rnd(0.08, 0.18)
      f.bw = rnd(2.2, 3.6)
      f.blink = rnd(3.5, 6.5)
      f.ph = rnd(0, 6.28)
      f.lag = i * 0.06 // they leave one after another
      f.size = SIZE * rnd(0.8, 1.15)
    })
  }

  const orbit = (it, f, t) => {
    const a = f.a0 + f.w * t
    const x = it.c[0] + f.rr * Math.cos(a)
    const y = it.c[1] - 0.45 * f.rr + 0.6 * f.rr * Math.sin(a) // mostly in front of the plant (Blender −Y = camera)
    const z = f.h + f.bob * Math.sin(f.bw * t + f.ph)
    return [x, y, z]
  }

  const update = (dt) => {
    for (const it of items.values()) {
      if (it.t === Infinity) continue
      it.t += dt
      const T = it.t - it.delay
      if (T > it.life + 0.5) {
        for (const f of it.flies) f.sp.visible = false
        it.t = Infinity
        continue
      }
      for (const f of it.flies) {
        const t = T - f.lag
        if (t <= 0 || t >= it.life) { f.sp.visible = false; continue }
        let p
        const tr = it.life - RETURN
        if (t < EMERGE) {
          const o = orbit(it, f, EMERGE)
          const k = ease(t / EMERGE)
          p = f.start.map((s, j) => s + (o[j] - s) * k)
        } else if (t < tr) {
          p = orbit(it, f, t)
        } else {
          const o = orbit(it, f, tr)
          const k = ease((t - tr) / RETURN)
          p = o.map((s, j) => s + (f.start[j] - s) * k)
        }
        f.sp.position.set(p[0], p[2], -p[1]) // Blender (x, y, z) -> glTF (x, z, -y)
        const fade = Math.min(1, t / 0.3) * Math.min(1, (it.life - t) / 0.35)
        const blink = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(f.blink * t + f.ph), 2)
        f.sp.material.opacity = fade * blink
        f.sp.scale.setScalar(f.size * (0.85 + 0.25 * blink))
        f.sp.visible = true
      }
    }
  }
  window.__fireflies = items
  return { pulse, update }
}
