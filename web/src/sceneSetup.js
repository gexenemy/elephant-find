import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

/** Tuning knobs, overridable from the URL: ?light=1&fill=1&ambient=1&exposure=1&shadows=0&tm=agx&bloom=1&bloomI=0.8&bloomT=1&bloomR=0.4
 *  ?mode=hybrid — painted room as the background, only the interactive objects in 3D (&shadowA=0.25&shadowSoft=12) */
export const params = (() => {
  const q = new URLSearchParams(window.location.search)
  const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d)
  const hybrid = q.get('mode') !== 'full' // hybrid (painting + 3D) is the default; ?mode=full — the all-3D scene
  return {
    mode: hybrid ? 'hybrid' : 'full',
    shadowOpacity: num('shadowA', 0.25), // hybrid: how dark 3D shadows fall on the painting
    shadowSoft: num('shadowSoft', 12), // hybrid: blur radius of 3D shadows (PCF)
    light: num('light', 1), // scale for point lights from the GLB
    fill: num('fill', 1), // scale for the rebuilt area light
    ambient: num('ambient', 1), // scale for the Blender world colour
    exposure: num('exposure', 1),
    shadows: q.get('shadows') !== '0',
    toneMapping: q.get('tm') ?? 'agx', // agx | neutral | aces | none
    bloom: hybrid ? q.get('bloom') === '1' : q.get('bloom') !== '0', // off in hybrid: the painting already has its glow // warm halo around emissive things (garland, flames, candles, lanterns)
    bloomIntensity: num('bloomI', 0.8),
    bloomThreshold: num('bloomT', 1.0), // only HDR values above 1 glow, i.e. emissive strength > 1
    bloomRadius: num('bloomR', 0.4), // spread of the halo (0..1); larger values haze the whole frame
    maxCrop: num('crop', 0.1), // full-3D mode: share of the frame that may be cut off per axis to avoid bars (0 = never crop)
    maxBottomCrop: num('cropBottom', 0.2), // painting mode: frame fills the width, pinned to the top; at most this share of its height is cut off at the bottom
    debug: q.has('debug'),
  }
})()

/** Walks up the hierarchy to the object that carries game data (extras from Blender). */
export function gameRoot(obj) {
  for (let o = obj; o; o = o.parent) {
    if (o.userData?.game_role === 'hidden_target' || o.userData?.click_through) return o
  }
  return null
}

/** One-time preparation of the loaded glTF scene. Returns handles the app needs. */
export function prepareScene(scene) {
  // StrictMode may call this twice in dev: prepare only once per loaded scene.
  if (scene.userData.__prepared) return scene.userData.__prepared
  const camera = scene.getObjectByName('CAM_Main') ?? scene.getObjectByProperty('isPerspectiveCamera', true)
  const targets = []
  const lights = []

  scene.traverse((o) => {
    if (o.isMesh) {
      // GLTFLoader puts extras on the node; a multi-material node becomes a Group of Meshes, so check the parent too.
      const noShadow = o.userData.cast_shadow === false || o.parent?.userData.cast_shadow === false
      o.castShadow = params.shadows && !noShadow && !o.material?.transparent
      o.receiveShadow = params.shadows
    }
    if (o.userData?.game_role === 'hidden_target') targets.push(o)
    if (o.isPointLight) lights.push(o)
  })
  targets.sort((a, b) => a.userData.target_id - b.userData.target_id)

  for (const l of lights) {
    l.intensity *= params.light
    l.castShadow = params.shadows && l.userData.cast_shadow !== false // mirrors Blender's per-light shadow switch
    l.shadow.mapSize.set(1024, 1024)
    l.shadow.bias = -0.002
    // Shadow depth range sized to the room: near 0.5 m (default) skips the fireplace pillars next to the fire,
    // far 500 m (default) loses so much depth precision that the fire casts no shadows at all.
    l.shadow.camera.near = 0.05
    l.shadow.camera.far = 15
    l.shadow.camera.updateProjectionMatrix()
  }

  // glTF has no area lights: Blender's Light_Fill is rebuilt from its extras.
  scene.traverse((o) => {
    const a = o.userData?.area_light
    if (!a || o.userData.__areaBuilt) return
    RectAreaLightUniformsLib.init()
    const pos = new THREE.Vector3()
    o.getWorldPosition(pos)
    // Blender area power -> RectAreaLight: P/(π·A) from the exporter, divided by π more.
    // Matched by comparing brightness patches of the app against the Blender render.
    const rect = new THREE.RectAreaLight(new THREE.Color().setRGB(...a.color, THREE.LinearSRGBColorSpace),
      (a.intensity_nits / Math.PI) * params.fill, a.size_x, a.size_y)
    rect.name = `${o.name}_RectArea`
    rect.position.copy(pos)
    rect.lookAt(new THREE.Vector3(...a.target_gltf))
    scene.add(rect)
    o.userData.__areaBuilt = true
  })

  // Blender world colour -> ambient (three's ambient irradiance = colour * intensity, Lambert divides by π).
  const wc = camera?.userData.world_color
  if (wc) {
    const amb = new THREE.AmbientLight(new THREE.Color().setRGB(...wc, THREE.LinearSRGBColorSpace),
      Math.PI * (camera.userData.world_strength ?? 1) * params.ambient)
    amb.name = 'World_Ambient'
    scene.add(amb)
  }

  scene.userData.__prepared = { camera, targets }
  return scene.userData.__prepared
}

/**
 * Hybrid mode: the room is a painting behind the canvas; the GLB holds the interactive objects plus invisible
 * proxies of the painted furniture (tagged in Blender with hybrid_role):
 *  - occluder:       writes depth only, so painted things in front (tree, tablecloth, fireplace) hide 3D objects
 *  - shadow_catcher: invisible, shows only the shadows 3D objects cast onto the painted floor, shelves, walls
 */
export function prepareHybrid(scene) {
  if (scene.userData.__hybrid) return
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false })
  depthOnly.name = 'HYBRID_DepthOnly'
  const catcher = new THREE.ShadowMaterial({ opacity: params.shadowOpacity })
  catcher.name = 'HYBRID_ShadowCatcher'
  const meshes = []
  scene.traverse((o) => o.isMesh && meshes.push(o)) // collect first: depth twins are added while iterating
  scene.updateMatrixWorld(true)
  const flicker = [] // candle light + its halo: gently flickering in FinderScene's frame loop
  meshes.forEach((o) => {
    if (o.userData.glow) {
      flicker.push({ obj: makeGlowSprite(o), base: o.userData.glow_opacity ?? 0.5, kind: 'glow' })
      return
    }
    if (o.userData.glass) {
      // Thin candle glass: mostly see-through, glossy, and faintly lit from inside by the flame.
      o.material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(1.0, 0.94, 0.86),
        roughness: 0.06,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
        emissive: new THREE.Color(1.0, 0.6, 0.28),
        emissiveIntensity: 0.22,
      })
      o.renderOrder = 5
      o.castShadow = o.receiveShadow = false
      flicker.push({ obj: o, base: 0.22, kind: 'glass' })
      return
    }
    if (o.userData.flame) {
      o.castShadow = o.receiveShadow = false
      flicker.push({ obj: o, base: o.scale.clone(), kind: 'flame' })
      return
    }
    const wm = /^MAT_ToyHouse_Win_(\w+)/.exec(o.material?.name ?? '')
    if (wm) {
      // Toy house on the mantel: each window has its own emissive material; FinderScene fades them in and out
      const house = o.parent?.userData.window_glow ? o.parent : o
      const PHASES = { Attic: 0.0, FrontL: 0.27, FrontR: 0.53, SideR: 0.4, SideL: 0.8 }
      const max = o.material.emissiveIntensity || 2.2
      o.material.emissiveIntensity = 0
      const w = { obj: o, kind: 'window', base: max, phase: PHASES[wm[1]] ?? Math.random(), period: house.userData.window_period ?? 14, sprite: null }
      if (wm[1].startsWith('Front') || wm[1] === 'Attic') {
        // soft warm halo on the wall around a front window (the side windows face away from the camera)
        o.geometry.computeBoundingBox()
        const c = o.geometry.boundingBox.getCenter(new THREE.Vector3())
        const mat = new THREE.SpriteMaterial({
          map: getGlowTexture(), color: new THREE.Color(1.0, 0.55, 0.2), transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
        })
        const sp = new THREE.Sprite(mat)
        sp.name = `${o.name}_Halo`
        sp.raycast = () => {}
        sp.renderOrder = 10
        sp.position.copy(c)
        sp.scale.setScalar(0.32) // object-local units (the house model is ~1 unit tall)
        o.add(sp)
        w.sprite = sp
      }
      flicker.push(w)
      o.receiveShadow = false
      return
    }
    if (o.userData.globe_glass) {
      // Snow globe glass: painted glints + rim (texture alpha), drawn after the snow inside
      o.material.depthWrite = false
      o.renderOrder = 6
      o.castShadow = o.receiveShadow = false
      return
    }
    const role = o.userData.hybrid_role ?? o.parent?.userData.hybrid_role
    if (role === 'occluder') {
      o.material = depthOnly
      o.renderOrder = -1 // fill the depth buffer before anything visible is drawn
      o.castShadow = o.receiveShadow = false
    } else if (role === 'shadow_catcher') {
      o.material = catcher
      o.castShadow = false
      o.receiveShadow = params.shadows
      // ShadowMaterial is transparent, so it is drawn after the 3D objects and cannot hide them. A depth-only twin
      // makes painted surfaces occlude like in Cycles (e.g. the front lip of the shelf hides the bottom of the boat).
      const twin = new THREE.Mesh(o.geometry, depthOnly)
      twin.name = `${o.name}_Depth`
      twin.renderOrder = -1
      twin.raycast = () => {} // clicks keep treating catchers as see-through
      o.add(twin)
    } else if (o.material?.transparent) {
      o.material.depthWrite = false // contact shadow decal: blend over the painting, never hide anything
      o.receiveShadow = false
    } else {
      o.receiveShadow = false // only the painting receives; the figure keeps its own lighting clean
    }
  })
  scene.traverse((o) => {
    if (o.isLight && o.userData.flicker) flicker.push({ obj: o, base: o.intensity, kind: 'light' })
  })
  scene.userData.__flicker = flicker
  // The figure is small on screen: give the fire's shadow map more resolution.
  scene.traverse((o) => {
    if (o.isPointLight && o.castShadow) {
      o.shadow.mapSize.set(1024, 1024)
      o.shadow.radius = params.shadowSoft // PCF blur: the fire is a big soft source, a hard shadow reads as a dark streak
      o.shadow.blurSamples = 16
      o.shadow.map?.dispose()
      o.shadow.map = null
    }
  })
  scene.userData.__hybrid = true
}

/** Soft round halo texture (white centre fading to transparent), generated once. */
let glowTexture = null
function getGlowTexture() {
  if (glowTexture) return glowTexture
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const img = g.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)
      const a = Math.pow(Math.max(0, 1 - r), 2.2) // same falloff as the halo material in Blender
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(a * 255)
    }
  }
  g.putImageData(img, 0, 0)
  glowTexture = new THREE.CanvasTexture(c)
  glowTexture.colorSpace = THREE.SRGBColorSpace
  return glowTexture
}

/**
 * A halo plane from Blender (custom property glow) becomes a camera-facing additive sprite:
 * it brightens the painting around a light source (candle) instead of hiding it.
 */
function makeGlowSprite(plane) {
  const d = plane.userData
  const mat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: new THREE.Color().setRGB(...(d.glow_color ?? [1, 0.6, 0.25]), THREE.SRGBColorSpace),
    transparent: true,
    opacity: d.glow_opacity ?? 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false, // light spills over the shelf edge too, no hard cut-off
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.name = `${plane.name}_Sprite`
  sprite.raycast = () => {} // never blocks clicks
  sprite.renderOrder = 10
  const parent = plane.parent
  sprite.position.copy(plane.position)
  const ps = new THREE.Vector3()
  parent.getWorldScale(ps)
  sprite.scale.setScalar((2 * (d.glow_radius ?? 0.3)) / ps.x)
  parent.add(sprite)
  plane.visible = false
  plane.raycast = () => {}
  return sprite
}
