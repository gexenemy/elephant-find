import * as THREE from 'three'

/**
 * Frost on a toy (Blender: custom property frost on the toy's root; the red ball with the gold snowflake).
 * Click → white hoarfrost creeps over the toy from the cap downwards with a feathery, uneven front and tiny
 * twinkling ice glints, stays a moment, then melts away in patches. The toy's own clips (a cold "shiver") play
 * alongside (anim_on_click).
 * Done in the material: a shader patch mixes the base colour towards frosty white-blue where the frost is and adds
 * the glints to the emissive. Three uniforms drive it: uGrow (how far down the front has come, 0 … 1.3),
 * uMelt (0 … 1, patches thaw where the noise is lowest first) and uTime (glint twinkle).
 * The frost is laid out in the mesh's own space (y up in glTF), from its top (cap) to its bottom.
 */
const GROW = 0.95 // s for the front to cover the toy
const HOLD = 1.35 // s fully frosted
const MELT = 1.3 // s to thaw

const NOISE = `
float frH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float frN(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(frH(i), frH(i + vec3(1,0,0)), f.x), mix(frH(i + vec3(0,1,0)), frH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(frH(i + vec3(0,0,1)), frH(i + vec3(1,0,1)), f.x), mix(frH(i + vec3(0,1,1)), frH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float frF(vec3 p) { return 0.5 * frN(p) + 0.3 * frN(p * 2.13) + 0.2 * frN(p * 4.41); }
`

export function setupFrost(scene) {
  const items = new Map()
  scene.traverse((root) => {
    if (!root.userData?.frost || items.has(root)) return
    if (root.userData.__frostItem) { items.set(root, root.userData.__frostItem); return } // React may set up twice
    const uniforms = {
      uGrow: { value: 0 }, uMelt: { value: 0 }, uTime: { value: 0 },
      uTop: { value: 0 }, uSize: { value: 1 },
    }
    root.traverse((o) => {
      if (!o.isMesh) return
      o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox
      uniforms.uTop.value = bb.max.y
      uniforms.uSize.value = Math.max(1e-4, bb.max.y - bb.min.y)
      const mat = o.material.clone()
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uniforms)
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vFrPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFrPos = position;')
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float uGrow; uniform float uMelt; uniform float uTime; uniform float uTop; uniform float uSize;
varying vec3 vFrPos;
${NOISE}
float frAmt = 0.0; vec3 frQ = vec3(0.0);`)
          .replace('#include <map_fragment>', `#include <map_fragment>
if (uGrow > 0.0) {
  frQ = vFrPos / uSize;
  float k = (uTop - vFrPos.y) / uSize;                 // 0 at the cap … 1 at the bottom
  float front = k + 0.28 * (frF(frQ * 7.0) - 0.5);      // uneven, finger-like front
  float cover = smoothstep(uGrow, uGrow - 0.12, front);
  float thaw = smoothstep(uMelt - 0.08, uMelt + 0.08, frF(frQ * 5.0 + 3.7) * 0.9 + 0.1);
  // crystalline texture: fine frost grains, denser in feathery streaks; the red shows through in between
  float grain = smoothstep(0.3, 0.72, frF(frQ * 38.0));
  float streak = smoothstep(0.35, 0.8, frF(vec3(frQ.x * 14.0, frQ.y * 5.0, frQ.z * 14.0) + 1.3));
  float feather = clamp(0.25 + 0.5 * grain + 0.35 * streak, 0.0, 1.0);
  frAmt = cover * thaw * feather;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.93, 1.0), frAmt * 0.78);
}`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (frAmt > 0.0) {
  vec3 cell = floor(frQ * 95.0);
  float r = frH(cell);
  float tw = 0.5 + 0.5 * sin(uTime * 8.0 + frH(cell + 5.1) * 40.0);
  totalEmissiveRadiance += vec3(0.85, 0.93, 1.0) * step(0.975, r) * frAmt * tw * 1.6
                         + vec3(0.25, 0.3, 0.38) * frAmt * 0.35;  // a faint cold sheen
}`)
      }
      mat.customProgramCacheKey = () => 'frost'
      o.material = mat
    })
    const item = { root, uniforms, t: -1 }
    Object.defineProperty(root.userData, '__frostItem', { value: item, enumerable: false })
    items.set(root, item)
  })

  const pulse = (toy) => {
    const it = items.get(toy)
    if (it && it.t < 0) it.t = 0 // a new frost only once the last one has melted
  }

  const update = (dt) => {
    for (const it of items.values()) {
      const u = it.uniforms
      u.uTime.value += dt
      if (it.t < 0) continue
      it.t += dt
      const t = it.t
      const e = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 2
      u.uGrow.value = 1.3 * e(t / GROW)
      u.uMelt.value = t < GROW + HOLD ? 0 : Math.min(1.1, (t - GROW - HOLD) / MELT * 1.1)
      if (t > GROW + HOLD + MELT) { it.t = -1; u.uGrow.value = 0; u.uMelt.value = 0 }
    }
  }
  scene.userData.__frost = items // for checks from the browser console
  return { pulse, update }
}
