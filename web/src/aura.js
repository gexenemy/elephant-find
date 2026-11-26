import * as THREE from 'three'
import { PALETTE } from './treeLights.jsx'

/**
 * Glowing aura in the shape of the toy itself (Blender: custom property aura on the toy's root; aura_cut = local
 * height below which the mesh counts as the body, so the hanging loop is left out of the silhouette).
 * The silhouette is drawn once from the toy's own triangles (front view) into a canvas and blurred:
 *   halo = soft filled glow, ring = glowing outline.
 * Every click: a halo flash + three outline waves that spread out and fade, the toy itself lights up, and a faint
 * glow stays behind. The colour is the garland's red (treeLights.jsx PALETTE[0]).
 *
 * aura_style = 'outline' (open star on the tree; aura_color = '#rrggbb'): the toy's contour lights up in that colour
 * instead — the glowing outline sits right on the toy (no spreading waves), beats softly a few times (brightness and
 * a few per cent of size) and fades out completely; the toy itself glows a little with it. Nothing stays behind.
 */
const TEX = 256
const FILL = 0.42 // the silhouette takes this share of the canvas; the rest is room for the glow and the waves
const LIFE = 2.1
const RINGS = 3
const BEHIND = 0.04 // m: how far behind the toy the glow layers sit
const OUTLINE_LIFE = 2.8 // s, outline style
const OUTLINE_BEATS = 1.6 // Hz, outline style

// silhouettes are cached per geometry: React StrictMode runs the setup twice
const SIL_CACHE = new Map()
function silhouette(mesh, cut) {
  const key = `${mesh.geometry.uuid}|${cut}`
  if (!SIL_CACHE.has(key)) SIL_CACHE.set(key, buildSilhouette(mesh, cut))
  return SIL_CACHE.get(key)
}
function buildSilhouette(mesh, cut) {
  const pos = mesh.geometry.attributes.position
  const idx = mesh.geometry.index
  const nTri = (idx ? idx.count : pos.count) / 3
  const tris = []
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let t = 0; t < nTri; t++) {
    const p = [0, 1, 2].map((k) => {
      const i = idx ? idx.getX(t * 3 + k) : t * 3 + k
      return [pos.getX(i), pos.getY(i)]
    })
    if (p.some((q) => q[1] > cut)) continue // the loop above the body
    tris.push(p)
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]) }
  }
  const size = Math.max(x1 - x0, y1 - y0)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const s = (FILL * TEX) / size
  const mask = document.createElement('canvas')
  mask.width = mask.height = TEX
  const g = mask.getContext('2d')
  g.fillStyle = g.strokeStyle = '#fff'
  g.lineWidth = 1.5 // closes the hairline gaps between triangles
  // filled in batches: one path with 24k sub-paths (the heart) took ~2.8 s to build, batches of 256 take ~0.1 s
  g.beginPath()
  tris.forEach((p, i) => {
    g.moveTo(TEX / 2 + (p[0][0] - cx) * s, TEX / 2 - (p[0][1] - cy) * s)
    g.lineTo(TEX / 2 + (p[1][0] - cx) * s, TEX / 2 - (p[1][1] - cy) * s)
    g.lineTo(TEX / 2 + (p[2][0] - cx) * s, TEX / 2 - (p[2][1] - cy) * s)
    g.closePath()
    if (i % 256 === 255) { g.fill(); g.stroke(); g.beginPath() }
  })
  g.fill()
  g.stroke()
  const make = (draw) => {
    const c = document.createElement('canvas')
    c.width = c.height = TEX
    draw(c.getContext('2d'))
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
  const blurred = (c, px, scale = 1) => {
    c.save()
    if ('filter' in c) c.filter = `blur(${px}px)`
    c.translate(TEX / 2, TEX / 2)
    c.scale(scale, scale)
    c.drawImage(mask, -TEX / 2, -TEX / 2)
    c.restore()
  }
  const halo = make((c) => { blurred(c, 16, 1.12); c.globalAlpha = 0.6; blurred(c, 6, 1.04) })
  const ring = make((c) => {
    blurred(c, 5, 1.08)
    c.globalCompositeOperation = 'destination-out'
    blurred(c, 4, 0.96)
    blurred(c, 4, 0.96)
  })
  return { halo, ring, centre: new THREE.Vector3(cx, cy, 0), plane: size / FILL }
}

export function setupAuras(scene, camera) {
  const items = new Map()
  scene.traverse((root) => {
    if (!root.userData?.aura || items.has(root)) return
    let mesh = null
    root.traverse((o) => { if (!mesh && o.isMesh) mesh = o })
    if (!mesh) return
    mesh.material = mesh.material.clone()
    mesh.material.emissive = new THREE.Color(0, 0, 0)
    const sil = silhouette(mesh, root.userData.aura_cut ?? Infinity)
    const geo = new THREE.PlaneGeometry(sil.plane, sil.plane)
    const layer = (map, order) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }))
      m.raycast = () => {} // never blocks clicks
      m.renderOrder = order
      m.visible = false
      scene.add(m)
      return m
    }
    const outline = root.userData.aura_style === 'outline'
    const it = { root, mesh, sil, layer, next: 0, pulses: [], colour: new THREE.Color(), glow: 0, outline,
      tint: outline ? new THREE.Color(root.userData.aura_color ?? '#ffc45a') : null }
    it.rest = layer(sil.halo, 8) // the faint glow that stays after a click
    it.rest.name = `${root.name}_AuraRest`
    items.set(root, it)
  })

  const pulse = (toy) => {
    const it = items.get(toy)
    if (!it) return
    if (it.outline) {
      const halo = it.layer(it.sil.halo, 9)
      const ring = it.layer(it.sil.ring, 10)
      for (const m of [halo, ring]) m.material.color.copy(it.tint)
      it.pulses.push({ t: 0, colour: it.tint, halo, rings: [ring], outline: true })
      return
    }
    // The author chose red only (the garland's red). To cycle the garland colours again: PALETTE[it.next++ % PALETTE.length]
    const c = PALETTE[0]
    const colour = new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255)
    const halo = it.layer(it.sil.halo, 9)
    const rings = Array.from({ length: RINGS }, () => it.layer(it.sil.ring, 10))
    for (const m of [halo, ...rings]) m.material.color.copy(colour)
    it.pulses.push({ t: 0, colour, halo, rings })
    it.target = colour
  }

  const p = new THREE.Vector3()
  const eye = new THREE.Vector3()
  const ease = (x) => 1 - (1 - x) ** 3
  let time = 0
  const update = (dt) => {
    time += dt
    for (const it of items.values()) {
      // behind the toy (the camera looks along -Z), so the toy stays readable in front of its own glow
      // Pushed back ALONG THE LINE OF SIGHT, not straight along Z: the camera sees the toy at an angle, so a plane
      // moved straight back slid ~8 px sideways on screen. All layers are scaled by the same factor `depth`, so on
      // screen they keep the toy's exact size and place. (Keep this name distinct from the flash envelope `k`
      // inside the pulse loop: once they shared a name and the waves scaled with the flash, swelling and collapsing.)
      p.copy(it.sil.centre)
      it.mesh.localToWorld(p)
      let depth = 1
      if (camera) {
        camera.getWorldPosition(eye)
        p.sub(eye)
        depth = 1 + BEHIND / p.length()
        p.multiplyScalar(depth).add(eye)
      }
      let flash = 0
      for (let i = it.pulses.length - 1; i >= 0; i--) {
        const q = it.pulses[i]
        q.t += dt
        if (q.outline) {
          if (q.t >= OUTLINE_LIFE) {
            for (const m of [q.halo, ...q.rings]) { scene.remove(m); m.material.dispose() }
            it.pulses.splice(i, 1)
            continue
          }
          // in over 0.15 s, gentle beats, out by the end of OUTLINE_LIFE
          const env = Math.min(1, q.t / 0.15) * (1 - Math.max(0, (q.t - 0.6) / (OUTLINE_LIFE - 0.6)) ** 1.5)
          const beat = 0.5 + 0.5 * Math.cos(2 * Math.PI * OUTLINE_BEATS * q.t) // 1 at the start of each beat
          const kk = env * (0.65 + 0.35 * beat)
          flash = Math.max(flash, kk * 0.55)
          const ring = q.rings[0]
          ring.visible = q.halo.visible = true
          ring.position.copy(p)
          q.halo.position.copy(p)
          ring.scale.setScalar(depth * (1 + 0.05 * beat * env))
          q.halo.scale.setScalar(depth * (1 + 0.08 * beat * env))
          ring.material.opacity = 1.0 * kk
          q.halo.material.opacity = 0.35 * kk
          continue
        }
        if (q.t >= LIFE) {
          for (const m of [q.halo, ...q.rings]) { scene.remove(m); m.material.dispose() }
          it.pulses.splice(i, 1)
          continue
        }
        const k = Math.min(1, q.t / 0.1) * Math.exp(-Math.max(0, q.t - 0.1) / 0.55)
        flash = Math.max(flash, k)
        q.halo.visible = true
        q.halo.position.copy(p)
        q.halo.material.opacity = 0.95 * k
        q.halo.scale.setScalar(depth * (1 + 0.3 * ease(Math.min(1, q.t / 0.9))))
        q.rings.forEach((m, j) => {
          const u = (q.t - 0.17 * j) / 1.35
          m.visible = u > 0 && u < 1
          if (!m.visible) return
          m.position.copy(p)
          m.scale.setScalar(depth * (1 + 1.25 * ease(u)))
          m.material.opacity = 0.85 * (1 - u) ** 1.6
        })
      }
      if (it.outline) {
        it.mesh.material.emissive.copy(it.tint)
        it.mesh.material.emissiveIntensity = flash
      }
      if (it.target) {
        it.colour.lerp(it.target, Math.min(1, dt * 6))
        it.glow = Math.min(1, it.glow + dt * 1.5)
        it.rest.visible = true
        it.rest.position.copy(p)
        it.rest.scale.setScalar(depth)
        it.rest.material.color.copy(it.colour)
        it.rest.material.opacity = it.glow * (0.26 + 0.07 * Math.sin(time * 1.7))
        // the toy itself is lit by its aura
        it.mesh.material.emissive.copy(it.colour)
        it.mesh.material.emissiveIntensity = 0.1 * it.glow + 0.7 * flash
      }
    }
  }
  return { pulse, update }
}
