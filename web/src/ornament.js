import * as THREE from 'three'
import { BULBS, PALETTE, bulbLevel } from './treeLights.jsx'

/**
 * Glass ornament on the painted tree (Blender: custom property glass_ornament on the root, the ball is the mesh
 * with material MAT_Orn05_Glass). The hybrid scene has no environment, so a glossy ball would be a flat disc:
 *  1) a tiny procedural "room" (dark walls, warm fireplace on the right, cool window on the left, warm floor)
 *     is baked into an environment map used by the ornament only: that is the glass shine;
 *  2) the nearest garland bulbs are mirrored in the ball as small coloured glints that blink in step with the
 *     2D garland layer (same bulb list, colours and wave as treeLights.jsx).
 * Extras from Blender: ball_center (local, Blender axes), ball_radius (m), px_center / px_radius (painting px).
 */
const N_GLINTS = 7

function roomEnvironment(gl) {
  const scene = new THREE.Scene()
  const add = (color, k, w, h, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...color).multiplyScalar(k), side: THREE.DoubleSide }))
    m.position.set(...pos)
    m.lookAt(0, 0, 0)
    scene.add(m)
  }
  scene.background = new THREE.Color(0.012, 0.02, 0.035) // dark blue room
  add([1.0, 0.42, 0.1], 9, 2.2, 1.6, [6, -1.2, 3]) // fireplace: right, low, a bit towards the camera
  add([1.0, 0.5, 0.2], 1.2, 9, 9, [0, -5, 2]) // floor lit by the fire
  add([0.3, 0.5, 1.0], 3.5, 1.4, 2.6, [-6, 1.2, 2.5]) // moonlit window: left
  add([0.9, 0.75, 0.5], 0.5, 8, 5, [0, 1, 8]) // the room behind the camera
  add([0.25, 0.45, 0.15], 0.5, 8, 8, [0, 0, -5]) // the tree behind the ball
  const pmrem = new THREE.PMREMGenerator(gl)
  const tex = pmrem.fromScene(scene, 0.03).texture
  pmrem.dispose()
  scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose() })
  return tex
}

let glintTexture = null
function getGlintTexture() {
  if (glintTexture) return glintTexture
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.18, 'rgba(255,255,255,0.85)')
  gr.addColorStop(0.45, 'rgba(255,255,255,0.22)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  glintTexture = new THREE.CanvasTexture(c)
  glintTexture.colorSpace = THREE.SRGBColorSpace
  return glintTexture
}

export function setupOrnaments(scene, gl, camera) {
  const items = []
  let env = null
  scene.updateMatrixWorld(true)
  scene.traverse((root) => {
    const d = root.userData
    if (!d?.glass_ornament || d.__ornament || !camera) return
    d.__ornament = true
    env ??= roomEnvironment(gl)
    root.traverse((o) => {
      if (!o.isMesh) return
      o.material = o.material.clone()
      o.material.envMap = env
      if (/Glass/.test(o.material.name)) {
        o.material.envMapIntensity = 0.7 // more than this washes out the elephant mirrored in the ball
        // a glass ball is never black: it glows a little with its own colour (and with the elephant in it)
        o.material.emissiveMap = o.material.map
        o.material.emissive = new THREE.Color(1, 1, 1)
        o.material.emissiveIntensity = 0.5
      } else o.material.envMapIntensity = 1.2
      o.castShadow = false
    })
    // centre of the ball in world space: Blender (x, y, z) -> glTF (x, z, -y)
    const bc = d.ball_center ?? [0, 0, 0]
    const centre = root.localToWorld(new THREE.Vector3(bc[0], bc[2], -bc[1]))
    const R = d.ball_radius ?? 0.06
    const view = new THREE.Vector3()
    camera.getWorldPosition(view)
    view.sub(centre).normalize()
    // the bulbs closest to the ball in the painting
    const [cx, cy] = d.px_center
    const near = BULBS.map((b, i) => ({ i, dx: b[0] - cx, dy: b[1] - cy }))
      .map((b) => ({ ...b, dist: Math.hypot(b.dx, b.dy) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, N_GLINTS)
    const dMin = near[0].dist
    const glints = near.map((b) => {
      // mirror ball: a light in direction L shows where the normal is halfway between L and the view direction.
      // The bulbs hang on the tree around the ball and a little behind it.
      const L = new THREE.Vector3(b.dx, -b.dy, -0.35 * b.dist).normalize()
      const n = L.add(view).normalize()
      const mat = new THREE.SpriteMaterial({
        map: getGlintTexture(), color: new THREE.Color(...PALETTE[b.i % PALETTE.length].map((v) => v / 255)),
        transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
      })
      const sp = new THREE.Sprite(mat)
      sp.name = `${root.name}_Glint_${b.i}`
      sp.raycast = () => {} // never blocks clicks
      sp.renderOrder = 12
      sp.position.copy(centre).addScaledVector(n, R * 1.01) // re-placed every frame in update(): the ball may swing
      scene.add(sp)
      // nearer bulbs: bigger and brighter reflections
      const k = THREE.MathUtils.clamp(dMin / b.dist, 0.35, 1)
      return { sp, i: b.i, k, n, size: R * (0.34 + 0.3 * k) }
    })
    items.push({ root, glints, R, local: new THREE.Vector3(bc[0], bc[2], -bc[1]) })
  })

  const c = new THREE.Vector3()
  const update = () => {
    const t = performance.now() / 1000 // the garland canvas runs on the same clock (requestAnimationFrame time)
    for (const it of items) {
      c.copy(it.local)
      it.root.localToWorld(c) // follows a swinging ball (the glints stay on the camera side, they do not spin with it)
      for (const g of it.glints) {
        const I = bulbLevel(g.i, t)
        g.sp.position.copy(c).addScaledVector(g.n, it.R * 1.01)
        g.sp.material.opacity = Math.min(1, (0.1 + 0.9 * I) * (0.45 + 0.55 * g.k) * 0.8)
        g.sp.scale.setScalar(g.size * (0.75 + 0.35 * Math.min(I, 1.4)))
      }
    }
  }
  update()
  return { items, update }
}
