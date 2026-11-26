import * as THREE from 'three'
import { PALETTE } from './treeLights.jsx'

/**
 * Toys whose painted pattern lights up (Blender: custom property glow_cycle on the toy's root; the glowing part is
 * the material's emissive texture, a white mask of the pattern, e.g. the white snowflake on the red medallion).
 * The toy starts unlit. Every click lights the pattern in the NEXT garland colour (treeLights.jsx PALETTE: red,
 * green, blue, amber, purple, yellow, then round again): a bright flash that settles to a steady glow, plus a soft
 * halo of that colour around the toy. The colour crossfades from the previous one and stays until the next click.
 * glow_center (local, Blender axes) and glow_radius (m) place the halo.
 *
 * glow_flash = '#rrggbb' (cream ball with the golden star): a one-shot mode instead of the colour cycle — every click
 * the pattern flares up in that one warm colour with its halo and then fades out completely in ~2 s.
 */
const FLASH = 2.4 // emissive intensity at the peak of the flash
const STEADY = 1.1 // and once it has settled
const HALO = 0.5 // halo opacity once settled (the flash doubles it)

let haloTexture = null
function getHaloTexture() {
  if (haloTexture) return haloTexture
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gr.addColorStop(0, 'rgba(255,255,255,0.9)')
  gr.addColorStop(0.35, 'rgba(255,255,255,0.4)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  haloTexture = new THREE.CanvasTexture(c)
  haloTexture.colorSpace = THREE.SRGBColorSpace
  return haloTexture
}

export function setupGlowCycles(scene) {
  const items = new Map()
  scene.traverse((root) => {
    if (!root.userData?.glow_cycle || items.has(root)) return
    const meshes = []
    root.traverse((o) => { if (o.isMesh && o.material?.emissiveMap) meshes.push(o) })
    if (!meshes.length) return
    const bc = root.userData.glow_center ?? [0, 0, 0]
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getHaloTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    }))
    halo.name = `${root.name}_GlowHalo`
    halo.raycast = () => {} // never blocks clicks
    halo.renderOrder = 7
    halo.position.set(bc[0], bc[2], -bc[1]) // Blender (x, y, z) -> glTF (x, z, -y); swings with the toy
    halo.scale.setScalar(2 * 2.1 * (root.userData.glow_radius ?? 0.06))
    halo.visible = false
    root.add(halo)
    const flash = root.userData.glow_flash ? new THREE.Color(root.userData.glow_flash) : null
    items.set(root, { meshes, halo, next: 0, t: Infinity, colour: new THREE.Color(), target: null, lit: 0, flash })
  })

  // The material may be swapped after setup (ornament.js clones it): always work on the current one.
  const setEmissive = (it, colour, intensity) => {
    for (const m of it.meshes) {
      m.material.emissive.copy(colour)
      m.material.emissiveIntensity = intensity
    }
  }
  for (const it of items.values()) setEmissive(it, it.colour, 0) // unlit until the first click

  const pulse = (toy) => {
    const it = items.get(toy)
    if (!it) return
    if (it.flash) { // one-shot flare in a fixed colour
      it.colour.copy(it.flash)
      it.target = it.flash
      it.lit = 1
      it.t = 0
      return
    }
    const c = PALETTE[it.next++ % PALETTE.length]
    it.target = new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255)
    if (!it.lit) it.colour.copy(it.target) // first click: start straight in the new colour
    it.t = 0
  }

  const update = (dt) => {
    for (const it of items.values()) {
      if (!it.target) continue
      it.t += dt
      if (it.flash) {
        // quick rise (0.1 s), then fades out to nothing over ~2 s
        const env = it.t < 0.1 ? it.t / 0.1 : Math.exp(-(it.t - 0.1) / 0.6)
        setEmissive(it, it.colour, FLASH * 1.1 * env)
        it.halo.visible = env > 0.004
        it.halo.material.color.copy(it.colour)
        it.halo.material.opacity = HALO * 1.6 * env
        if (it.t > 4) { setEmissive(it, it.colour, 0); it.halo.visible = false; it.target = null }
        continue
      }
      it.colour.lerp(it.target, Math.min(1, dt * 7))
      it.lit = Math.min(1, it.lit + dt * 6)
      // fast flash (0.08 s up), then settles to the steady glow in ~0.6 s
      const flash = it.t < 0.08 ? it.t / 0.08 : Math.exp(-(it.t - 0.08) / 0.28)
      const I = it.lit * (STEADY + (FLASH - STEADY) * flash)
      setEmissive(it, it.colour, I)
      it.halo.visible = true
      it.halo.material.color.copy(it.colour)
      it.halo.material.opacity = it.lit * HALO * (1 + flash)
    }
  }
  return { pulse, update }
}
