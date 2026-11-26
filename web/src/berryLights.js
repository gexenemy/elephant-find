import * as THREE from 'three'
import { PALETTE } from './treeLights.jsx'

/**
 * "Berry lights" (Blender: custom property berry_lights on the toy's root; the red-and-cream ball with holly, 22.11).
 * The mesh's emissiveMap is a mask of the little red holly berries (textures/T_Ball32_Berries.png). Idle: dark.
 * Click → the berries light up like a tiny garland in the colours of the tree garland (PALETTE: red, green, blue,
 * amber, violet, yellow — by sectors round the ball, so each berry cluster gets its own colour): two spots of light
 * run round the ball (around its vertical axis, through the berries), speeding up; then every berry flashes at once
 * and the glow fades out. (First version was all deep red: under the AgX tone mapping bright red washes out to pink.)
 * Done in the material: a shader patch multiplies the emissive by a running wave of the angle round the ball.
 * Blender props used: berry_center ([x, y, z] of the ball centre in the mesh's own Blender axes).
 */
const RAMP = 0.3 // s to light up
const RUN = 2.3 // s of running lights
const FLASH = 0.22 // s all berries flare
const FADE = 0.9 // s to go dark
const SECTORS = 12 // colour sectors round the ball (PALETTE repeats twice)
const PEAK = 1.6 // emissive at the top of a running spot (>1 → bloom halo)
const FLARE = 2.0 // emissive of the final flash
const PAL = PALETTE.map((c) => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear())

export function setupBerryLights(scene) {
  const items = new Map()
  scene.traverse((root) => {
    if (!root.userData?.berry_lights || items.has(root)) return
    if (root.userData.__berryItem) { items.set(root, root.userData.__berryItem); return } // React may set up twice
    const uniforms = {
      uLevel: { value: 0 }, uSteady: { value: 0 }, uPhase: { value: 0 }, uCenter: { value: new THREE.Vector3() },
      uPal: { value: PAL.map((c) => new THREE.Vector3(c.r, c.g, c.b)) },
    }
    root.traverse((o) => {
      if (!o.isMesh || !o.material?.emissiveMap) return
      const c = o.userData.berry_center ?? root.userData.berry_center ?? [0, 0, 0]
      uniforms.uCenter.value.set(c[0], c[2], -c[1]) // Blender (x, y, z) -> glTF (x, z, -y)
      const mat = o.material.clone()
      mat.emissive = new THREE.Color(1, 1, 1)
      mat.emissiveIntensity = 1
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uniforms)
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vBlPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlPos = position;')
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float uLevel; uniform float uSteady; uniform float uPhase; uniform vec3 uCenter; uniform vec3 uPal[${PAL.length}];
varying vec3 vBlPos;`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 q = vBlPos - uCenter;
  float a = atan(q.x, q.z);                            // 0 = the side facing the camera
  float wave = pow(0.5 + 0.5 * cos(2.0 * a - uPhase), 6.0); // two spots of light running round
  int sec = int(floor((a + PI) / (2.0 * PI) * ${SECTORS}.0)) % ${PAL.length};
  vec3 col = uPal[0];
  for (int i = 1; i < ${PAL.length}; i++) if (i == sec) col = uPal[i];
  totalEmissiveRadiance *= col * uLevel * mix(wave, 1.0, uSteady);
}`)
      }
      mat.customProgramCacheKey = () => 'berryLights'
      o.material = mat
    })
    const item = { root, uniforms, t: -1 }
    Object.defineProperty(root.userData, '__berryItem', { value: item, enumerable: false })
    items.set(root, item)
  })

  const pulse = (toy) => {
    const it = items.get(toy)
    if (it) it.t = 0 // a click restarts the show
  }

  const update = (dt) => {
    for (const it of items.values()) {
      if (it.t < 0) continue
      it.t += dt
      const t = it.t
      const u = it.uniforms
      const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x) }
      // running: speeds up from 0.6 to 1.6 turns/s of the pattern
      const speed = 2 * Math.PI * (0.6 + 1.0 * sm(t / RUN))
      u.uPhase.value += speed * dt * 2.0
      const T1 = RAMP + RUN
      if (t < T1) {
        u.uLevel.value = PEAK * sm(t / RAMP)
        u.uSteady.value = 0.12 * sm(t / RAMP) // the other berries glow faintly between the spots
      } else if (t < T1 + FLASH) {
        const k = sm((t - T1) / FLASH)
        u.uLevel.value = PEAK + (FLARE - PEAK) * k
        u.uSteady.value = 0.12 + 0.88 * k
      } else if (t < T1 + FLASH + FADE) {
        const k = (t - T1 - FLASH) / FADE
        u.uLevel.value = FLARE * (1 - k) ** 2
        u.uSteady.value = 1
      } else {
        it.t = -1
        u.uLevel.value = 0
        u.uSteady.value = 0
      }
    }
  }
  scene.userData.__berries = items // for checks from the browser console
  return { pulse, update }
}
