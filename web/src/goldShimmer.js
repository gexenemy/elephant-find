import * as THREE from 'three'

/**
 * "Golden shimmer + pollen" (Blender: custom property gold_shimmer on the toy's root; the golden pine cone, 22.11).
 * The mesh's emissiveMap is its own base colour (Emission Color = basecolor in Blender), so the scale tips glow
 * brighter than the dark gaps between them. Idle: no glow (the shader multiplies the emissive by uLevel = 0).
 * Click → a band of warm golden light runs down the cone from the cap to the tip; everything it has passed keeps
 * glowing, tiny glints twinkle on the scales, a soft golden halo grows behind the cone. At the bottom the whole
 * cone flares once and slowly goes dark. Golden pollen pours off the scales right where the band passes (so the
 * dust falls from top to bottom following the light), and a last trickle drips from the tip.
 * Blender props (on the root): shimmer_top / shimmer_bottom — heights (mesh-local Blender z) of the cap and the tip;
 * shimmer_center ([x, y, z] of the cone's middle in the root's axes), shimmer_radius — half the cone's width.
 * Knobs: the constants below.
 */
const SWEEP0 = 0.15 // s, the band starts at the cap
const SWEEP = 1.45 // s to run down to the tip
const FLARE_AT = SWEEP0 + SWEEP // the whole cone flares
const HOLD = 0.45 // s of full glow after the flare
const FADE = 0.55 // s, exponential fade (tau)
const END = FLARE_AT + HOLD + FADE * 4
const BAND = 0.8 // emissive at the running band (>1 → bloom-like)
const FILL = 0.28 // glow left behind the band
const FLARE = 0.52 // the whole cone at the flare
const GOLD = new THREE.Color(1.0, 0.56, 0.06) // linear; saturated, because AgX bleaches bright warm light towards cream
const POLLEN = 120 // grains per click (of which TRICKLE drip from the tip after the sweep)
const TRICKLE = 22
const GRAIN = 0.022 // m, grain sprite size

const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x) }

let dotTex = null
function getDot() {
  if (dotTex) return dotTex
  const s = 32
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.22, 'rgba(255,255,255,0.85)')
  gr.addColorStop(0.5, 'rgba(255,255,255,0.18)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, s, s)
  dotTex = new THREE.CanvasTexture(c)
  dotTex.colorSpace = THREE.SRGBColorSpace
  return dotTex
}

let haloTex = null
function getHalo() {
  if (haloTex) return haloTex
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  gr.addColorStop(0, 'rgba(255,255,255,0.9)')
  gr.addColorStop(0.3, 'rgba(255,255,255,0.45)')
  gr.addColorStop(0.65, 'rgba(255,255,255,0.1)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, s, s)
  haloTex = new THREE.CanvasTexture(c)
  haloTex.colorSpace = THREE.SRGBColorSpace
  return haloTex
}

// cone half-width along its height (0 = cap, 1 = tip), as a share of the widest part
const profile = (h) => (h < 0.38 ? 0.62 + 0.38 * sm(h / 0.38) : 1 - 0.8 * ((h - 0.38) / 0.62) ** 1.6)

const TINTS = [[1, 0.84, 0.42], [1, 0.74, 0.3], [1, 0.93, 0.66], [1, 0.66, 0.22]]

export function setupGoldShimmer(scene, camera) {
  const items = new Map()
  scene.traverse((root) => {
    if (!root.userData?.gold_shimmer || items.has(root)) return
    if (root.userData.__shimmerItem) { items.set(root, root.userData.__shimmerItem); return } // React may set up twice
    const d = root.userData
    const top = d.shimmer_top ?? 0
    const bottom = d.shimmer_bottom ?? -0.1
    const uniforms = {
      uLevel: { value: 0 }, uSweep: { value: -1 }, uFill: { value: 0 }, uBand: { value: 0 }, uTime: { value: 0 },
      uTop: { value: top }, uBottom: { value: bottom }, uGold: { value: new THREE.Vector3(GOLD.r, GOLD.g, GOLD.b) },
    }
    root.traverse((o) => {
      if (!o.isMesh || !o.material?.emissiveMap) return
      const mat = o.material.clone()
      mat.emissive = new THREE.Color(1, 1, 1)
      mat.emissiveIntensity = 1
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uniforms)
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vShPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShPos = position;')
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float uLevel; uniform float uSweep; uniform float uFill; uniform float uBand; uniform float uTime;
uniform float uTop; uniform float uBottom; uniform vec3 uGold;
varying vec3 vShPos;
float shHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float h = (uTop - vShPos.y) / (uTop - uBottom);           // 0 at the cap, 1 at the tip
  float band = exp(-pow((h - uSweep) / 0.11, 2.0));
  float lit = smoothstep(-0.04, 0.08, uSweep - h);           // already passed by the band
  float cell = shHash(floor(vShPos * 260.0));
  float glint = step(0.9, cell) * pow(0.5 + 0.5 * sin(uTime * 9.0 + cell * 60.0), 4.0) * 2.2 * lit;
  // only the brightness of the scales is used, recoloured to a yellow gold: the copper texture itself
  // (orange-pink) washes out to peach under the AgX tone mapping when it glows
  float lum = dot(totalEmissiveRadiance, vec3(0.2126, 0.7152, 0.0722));
  totalEmissiveRadiance = uGold * smoothstep(0.02, 0.35, lum) * uLevel * (uFill * lit + uBand * band + glint);
}`)
      }
      mat.customProgramCacheKey = () => 'goldShimmer'
      o.material = mat
    })
    // soft golden halo behind the cone (moves with the swinging root)
    const c = d.shimmer_center ?? [0, 0, (top + bottom) / 2]
    const R = d.shimmer_radius ?? 0.045
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getHalo(), color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    }))
    halo.position.set(c[0], c[2], -c[1]) // Blender (x, y, z) -> glTF (x, z, -y)
    halo.scale.setScalar(R * 6)
    halo.raycast = () => {} // never blocks clicks
    halo.renderOrder = 2
    halo.visible = false
    root.add(halo)
    const item = { root, uniforms, halo, t: -1, top, bottom, R }
    Object.defineProperty(root.userData, '__shimmerItem', { value: item, enumerable: false })
    items.set(root, item)
  })

  const dusts = []
  const tmp = new THREE.Vector3()

  // golden pollen: each grain is born on the camera side of the cone at the height the band passes at that moment
  const spawnPollen = (it) => {
    const N = POLLEN
    const pos = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    const vel = new Float32Array(N * 3)
    const born = new Float32Array(N)
    const life = new Float32Array(N)
    const hgt = new Float32Array(N)
    const ang = new Float32Array(N)
    const seed = new Float32Array(N)
    const base = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      if (i < N - TRICKLE) {
        const h = Math.random() ** 0.85
        hgt[i] = h
        born[i] = SWEEP0 + ((h + 0.1) / 1.2) * SWEEP + Math.random() * 0.18
      } else {
        hgt[i] = 1 // drip from the tip after the band has reached it
        born[i] = FLARE_AT + Math.random() * 1.1
      }
      ang[i] = (Math.random() - 0.5) * Math.PI * 1.15
      life[i] = 2.0 + Math.random() * 1.1
      seed[i] = Math.random() * 10
      base.set(TINTS[i % TINTS.length], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.PointsMaterial({
      size: GRAIN, map: getDot(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, toneMapped: false, sizeAttenuation: true,
    })
    const points = new THREE.Points(geo, mat)
    points.name = `${it.root.name}_Pollen`
    points.frustumCulled = false
    points.raycast = () => {}
    points.renderOrder = 13
    scene.add(points)
    dusts.push({ it, points, vel, born, life, hgt, ang, seed, base, alive: new Uint8Array(N), t: 0 })
  }

  const placeGrain = (s, i) => {
    const it = s.it
    const root = it.root
    root.updateWorldMatrix(true, false)
    const h = s.hgt[i]
    const y = it.top + (it.bottom - it.top) * h
    const axis = root.localToWorld(tmp.set(0, y, 0)).clone()
    const toCam = new THREE.Vector3(camera.position.x - axis.x, 0, camera.position.z - axis.z).normalize()
    const right = new THREE.Vector3(toCam.z, 0, -toCam.x)
    const r = it.R * profile(Math.min(1, h)) * 1.05
    const a = s.ang[i]
    const out = toCam.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a))
    const p = axis.addScaledVector(out, h >= 1 ? r * 0.2 : r)
    s.points.geometry.attributes.position.array.set([p.x, p.y, p.z], i * 3)
    const sp = 0.012 + 0.02 * Math.random()
    s.vel.set([out.x * sp, -0.004 + 0.016 * Math.random() - (h >= 1 ? 0.02 : 0), out.z * sp], i * 3)
  }

  const pulse = (toy) => {
    const it = items.get(toy)
    if (!it) return
    it.t = 0 // a click restarts the shimmer
    spawnPollen(it)
  }

  const update = (dt) => {
    for (const it of items.values()) {
      if (it.t < 0) continue
      it.t += dt
      const t = it.t
      const u = it.uniforms
      u.uTime.value += dt
      u.uSweep.value = -0.15 + 1.3 * Math.min(1, Math.max(0, (t - SWEEP0) / SWEEP))
      let level = 1
      let fill = FILL * sm(t / 0.25)
      let band = BAND * sm((t - SWEEP0 + 0.1) / 0.2) * (1 - sm((t - FLARE_AT + 0.05) / 0.3))
      if (t > FLARE_AT) {
        const k = t - FLARE_AT
        fill = FILL + (FLARE - FILL) * (sm(k / 0.15) - 0.35 * sm((k - 0.15) / 0.3))
        if (k > HOLD) level = Math.exp(-(k - HOLD) / FADE)
      }
      u.uLevel.value = level
      u.uFill.value = fill
      u.uBand.value = band
      const swept = Math.min(1, Math.max(0, u.uSweep.value))
      it.halo.visible = true
      it.halo.material.opacity = level * (0.12 + 0.38 * swept + 0.25 * (fill > FILL ? (fill - FILL) / (FLARE - FILL) : 0))
      it.halo.scale.setScalar(it.R * (5 + 1.5 * swept))
      if (t >= END) {
        it.t = -1
        u.uLevel.value = 0
        u.uSweep.value = -1
        it.halo.visible = false
      }
    }

    for (let b = dusts.length - 1; b >= 0; b--) {
      const s = dusts[b]
      s.t += dt
      const N = s.born.length
      const pos = s.points.geometry.attributes.position
      const col = s.points.geometry.attributes.color
      const drag = Math.exp(-1.6 * dt)
      let any = false
      for (let i = 0; i < N; i++) {
        const age = s.t - s.born[i]
        if (age < 0) { any = true; col.array.fill(0, i * 3, i * 3 + 3); continue }
        if (age > s.life[i]) { col.array.fill(0, i * 3, i * 3 + 3); continue }
        any = true
        if (!s.alive[i]) { s.alive[i] = 1; placeGrain(s, i) }
        const term = 0.035 + 0.03 * (s.seed[i] / 10)
        s.vel[i * 3 + 1] = Math.max(s.vel[i * 3 + 1] - 0.12 * dt, -term)
        s.vel[i * 3] *= drag
        s.vel[i * 3 + 2] *= drag
        const sway = 0.012 * 2.2 * Math.cos(age * 2.2 + s.seed[i] * 2.1)
        pos.array[i * 3] += (s.vel[i * 3] + sway) * dt
        pos.array[i * 3 + 1] += s.vel[i * 3 + 1] * dt
        pos.array[i * 3 + 2] += s.vel[i * 3 + 2] * dt
        const fade = Math.min(1, age / 0.12) * (1 - age / s.life[i]) ** 1.2
        const tw = 0.4 + 0.6 * Math.sin(age * 11 + s.seed[i] * 6.3) ** 2
        const k = fade * tw * 1.5
        col.array[i * 3] = s.base[i * 3] * k
        col.array[i * 3 + 1] = s.base[i * 3 + 1] * k
        col.array[i * 3 + 2] = s.base[i * 3 + 2] * k
      }
      pos.needsUpdate = true
      col.needsUpdate = true
      if (!any) {
        scene.remove(s.points)
        s.points.geometry.dispose()
        s.points.material.dispose()
        dusts.splice(b, 1)
      }
    }
  }
  scene.userData.__shimmer = { items, dusts } // for checks from the browser console
  return { pulse, update }
}
