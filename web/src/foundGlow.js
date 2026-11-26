import * as THREE from 'three'

/**
 * Found elephant: a light golden outline along the elephant's own contour (author 25.11: softer than the old
 * golden flare of the whole elephant). Screen space, so it follows the elephant while it moves (rises from the
 * box, rides the train...):
 *   1. every frame while an effect runs, the scene is drawn once more into a half-size mask: the found elephant's
 *      meshes white, every other opaque mesh black (so walls of the box, branches, painted-furniture proxies hide
 *      it exactly as on screen), glass / glows / particles left out;
 *   2. a full-screen quad (added on top of the scene, additive) turns the mask edge into a thin soft golden line,
 *      with a faint twinkle and one gentle golden sweep crossing the elephant.
 * Envelope: fades in over 0.45 s, stays soft, fades out; lasts the elephant's own show + ~1.3 s (2.6–4.5 s).
 * Knobs below. Debug: window.__foundGlow.
 */
const PEAK = 0.5 // brightness of the outline at its strongest
const SWEEP = 1.5 // s: the golden sweep crosses the elephant once
const COLOR = new THREE.Color(1.0, 0.84, 0.46) // warm gold (linear values, written as-is)
const R1 = 1.1 // mask texels (half resolution): inner and outer sampling ring -> width of the line
const R2 = 2.4
const SKIP = /glass|glow|flame|halo|aura|shadow|thread|spark|snow|flake|rays/i

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const frag = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform float uTime;
uniform float uSweep;
uniform vec4 uBox;
uniform vec3 uColor;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec4 c = texture2D(uMask, vUv);
  float b = c.r * 0.25;
  float g = c.g;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 d = vec2(cos(a), sin(a)) * uTexel;
    vec4 s1 = texture2D(uMask, vUv + d * ${R1.toFixed(2)});
    vec4 s2 = texture2D(uMask, vUv + d * ${R2.toFixed(2)});
    b += (s1.r * 0.55 + s2.r * 0.45) * 0.75 / 12.0;
    g = max(g, max(s1.g, s2.g));
  }
  float edge = clamp(4.0 * b * (1.0 - b), 0.0, 1.0);
  edge = edge * edge * (3.0 - 2.0 * edge);
  edge *= 1.0 - 0.55 * c.r; // mostly outside the contour: the elephant itself is hardly tinted
  // one soft diagonal band of brighter gold, from the upper left to the lower right of the elephant
  vec2 q = (vUv - uBox.xy) / max(uBox.zw - uBox.xy, vec2(1e-4));
  float ph = q.x * 0.55 + (1.0 - q.y) * 0.45;
  float band = exp(-pow((ph - (uSweep * 1.5 - 0.25)) / 0.13, 2.0));
  float tw = 0.78 + 0.22 * sin(uTime * 5.0 + hash(floor(gl_FragCoord.xy / 3.0)) * 6.2832);
  float a = edge * g * (0.75 * tw + 0.55 * band);
  gl_FragColor = vec4(uColor * a, a);
}`

export function setupFoundGlow(scene, camera, gl) {
  // StrictMode runs the setup twice: one quad per scene
  if (scene.userData.__foundGlowItem) return scene.userData.__foundGlowItem
  const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true })
  rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter
  rt.texture.generateMipmaps = false
  const mats = {} // black blockers per side
  const black = (side) => (mats[side] ??= new THREE.MeshBasicMaterial({ color: 0x000000, side, toneMapped: false }))
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, premultipliedAlpha: true,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      uMask: { value: rt.texture }, uTexel: { value: new THREE.Vector2() }, uTime: { value: 0 },
      uSweep: { value: 0 }, uBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uColor: { value: COLOR },
    },
  }))
  quad.name = 'FoundGlow_Quad'
  quad.frustumCulled = false
  quad.renderOrder = 10000
  quad.visible = false
  quad.raycast = () => {}
  scene.add(quad)

  const effects = []
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  const size = new THREE.Vector2()
  const clear = new THREE.Color()
  let time = 0

  // the elephant itself: meshes named *_Body*; otherwise every mesh of the target except glass, glow, flame, thread
  const elephantMeshes = (target) => {
    const all = []
    target.traverse((o) => { if (o.isMesh) all.push(o) })
    const body = all.filter((o) => /_Body/.test(o.name))
    return body.length ? body : all.filter((o) => !SKIP.test(`${o.name} ${o.material?.name ?? ''}`) && !o.userData.glow)
  }

  // bounding box in the mesh's own space; a skinned mesh (nutcracker) needs its posed box - recomputed on demand
  const meshBox = (m, refresh) => {
    if (m.isSkinnedMesh) { if (refresh || !m.boundingBox) m.computeBoundingBox(); return m.boundingBox }
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    return m.geometry.boundingBox
  }

  const start = (target, life = 3) => {
    const meshes = elephantMeshes(target)
    if (!meshes.length) return
    for (const m of meshes) meshBox(m, true)
    const white = new THREE.MeshBasicMaterial({ toneMapped: false })
    effects.push({ target, meshes: new Set(meshes), white, whites: {}, t: 0, life: Math.min(4.5, Math.max(2.6, life)) })
  }

  const whiteFor = (e, side) => {
    if (!e.whites[side]) { e.whites[side] = e.white.clone(); e.whites[side].side = side }
    return e.whites[side]
  }

  const update = (dt) => {
    time += dt
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]
      e.t += dt
      if (e.t >= e.life) {
        e.white.dispose()
        for (const m of Object.values(e.whites)) m.dispose()
        effects.splice(i, 1)
      }
    }
    quad.visible = effects.length > 0
    if (!effects.length) return
    let root = scene
    while (root.parent) root = root.parent

    gl.getDrawingBufferSize(size)
    const w = Math.max(4, Math.round(size.x / 2)), h = Math.max(4, Math.round(size.y / 2))
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h)
    quad.material.uniforms.uTexel.value.set(1 / w, 1 / h)
    quad.material.uniforms.uTime.value = time

    // envelope of each effect -> green channel of its white material (red = mask)
    const owner = new Map()
    let latest = null
    for (const e of effects) {
      const fin = Math.min(1, e.t / 0.45)
      const fout = 1 - Math.max(0, (e.t - (e.life - 1.3)) / 1.3)
      const env = PEAK * (fin * fin * (3 - 2 * fin)) * Math.max(0, fout) ** 1.5
      for (const side of Object.keys(e.whites)) e.whites[side].color.setRGB(1, env, 0, THREE.LinearSRGBColorSpace)
      e.white.color.setRGB(1, env, 0, THREE.LinearSRGBColorSpace)
      for (const m of e.meshes) owner.set(m, e)
      latest = e
    }
    // the sweep and its box follow the latest find
    quad.material.uniforms.uSweep.value = Math.min(1.2, latest.t / SWEEP)
    box.makeEmpty()
    for (const m of latest.meshes) {
      const bb = meshBox(m, false)
      for (let k = 0; k < 8; k++) {
        v.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z)
        m.localToWorld(v).project(camera)
        box.expandByPoint(v)
      }
    }
    quad.material.uniforms.uBox.value.set(box.min.x * 0.5 + 0.5, box.min.y * 0.5 + 0.5, box.max.x * 0.5 + 0.5, box.max.y * 0.5 + 0.5)

    // mask pass: swap materials, hide what must not block, draw, put everything back
    const saved = []
    root.traverseVisible((o) => {
      if (o === quad) { saved.push([o, 'visible', true]); return }
      if (o.isPoints || o.isSprite || o.isLine) { saved.push([o, 'visible', true]); return }
      if (!o.isMesh) return
      const e = owner.get(o)
      const mat = o.material
      const m0 = Array.isArray(mat) ? mat[0] : mat
      if (e) { saved.push([o, 'material', mat]); o.material = whiteFor(e, m0?.side ?? THREE.FrontSide); return }
      // invisible proxies of the painted furniture (occluder, shadow_catcher) always hide what is behind them
      const blocks = o.userData.hybrid_role ? !o.userData.hit_proxy : m0 && m0.visible !== false && m0.blending === THREE.NormalBlending && m0.opacity > 0.9 &&
        !(m0.alphaTest > 0) && !SKIP.test(`${o.name} ${m0.name}`) && !o.userData.glow && !o.userData.glass &&
        !o.userData.globe_glass && !o.userData.hit_proxy
      if (!blocks) { saved.push([o, 'visible', true]); return }
      saved.push([o, 'material', mat])
      o.material = black(m0.side ?? THREE.FrontSide)
    })
    for (const [o, k] of saved) if (k === 'visible') o.visible = false
    const prevTarget = gl.getRenderTarget()
    gl.getClearColor(clear)
    const prevAlpha = gl.getClearAlpha()
    const prevShadows = gl.shadowMap.enabled
    const prevBg = root.background
    try {
      root.background = null
      gl.shadowMap.enabled = false
      gl.setRenderTarget(rt)
      gl.setClearColor(0x000000, 0)
      gl.clear(true, true, false)
      gl.render(root, camera)
    } finally {
      gl.setRenderTarget(prevTarget)
      gl.setClearColor(clear, prevAlpha)
      gl.shadowMap.enabled = prevShadows
      root.background = prevBg
      for (const [o, k, val] of saved) o[k] = val
    }
  }

  // the elephant's box on screen in client (CSS) pixels - the pollen of foundFx.jsx is born around it
  const screenBox = (target) => {
    const r = gl.domElement.getBoundingClientRect()
    const bb3 = new THREE.Box3()
    for (const m of elephantMeshes(target)) {
      const bb = meshBox(m, true)
      for (let k = 0; k < 8; k++) {
        v.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z)
        m.localToWorld(v).project(camera)
        bb3.expandByPoint(v)
      }
    }
    if (bb3.isEmpty()) return null
    return {
      x0: r.left + (bb3.min.x * 0.5 + 0.5) * r.width, x1: r.left + (bb3.max.x * 0.5 + 0.5) * r.width,
      y0: r.top + (0.5 - bb3.max.y * 0.5) * r.height, y1: r.top + (0.5 - bb3.min.y * 0.5) * r.height,
    }
  }

  const item = { start, update, screenBox, effects, quad, rt }
  Object.defineProperty(scene.userData, '__foundGlowItem', { value: item, enumerable: false, configurable: true })
  window.__foundGlow = item
  return item
}
