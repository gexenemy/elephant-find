import * as THREE from 'three'
import { gameRoot, params } from './sceneSetup.js'

const EXPECTED_GROUPS = ['ROOM', 'FIREPLACE', 'TREE', 'TREE_ORNAMENTS', 'SHELVES', 'TABLE', 'TABLE_PROPS', 'GIFTS',
  'TRAIN', 'STOCKINGS', 'MANTEL_PROPS', 'SHELF_PROPS', 'BOOKCASE_PROPS', 'UNDERTREE_PROPS', 'DECOR', 'ELEPHANTS']

/** Checks that what Blender exported arrived in three.js intact. Returns lines [ok, text]. */
export function buildReport({ scene, camera, targets, gl }) {
  const out = []
  const add = (ok, text) => out.push([ok, text])
  const hybrid = params.mode === 'hybrid'
  if (hybrid) {
    const roles = { occluder: 0, shadow_catcher: 0 }
    scene.traverse((o) => { const r = o.userData?.hybrid_role; if (o.isMesh && r in roles) roles[r]++ })
    add(roles.occluder > 0 && roles.shadow_catcher > 0, `hybrid proxies: ${roles.occluder} occluders, ${roles.shadow_catcher} shadow catchers`)
  }
  const groups = (hybrid ? [] : EXPECTED_GROUPS).map((n) => [n, scene.getObjectByName(n)])
  const missing = groups.filter(([, o]) => !o).map(([n]) => n)
  if (!hybrid) add(!missing.length, `groups: ${EXPECTED_GROUPS.length - missing.length}/${EXPECTED_GROUPS.length}${missing.length ? ' missing ' + missing.join(',') : ''}`)
  const ids = targets.map((t) => t.userData.target_id)
  const want = hybrid ? targets.length || 1 : 11
  add(targets.length === want && new Set(ids).size === want, `hidden targets: ${targets.length} ids [${ids.join(',')}]`)
  add(!!camera, `camera: ${camera?.name} fov ${camera?.fov.toFixed(2)} aspect ${camera?.aspect.toFixed(3)}`)
  add(camera?.view?.enabled, `lens shift via setViewOffset: offsetY ${camera?.view?.offsetY.toFixed(1)}px`)
  let meshes = 0
  scene.traverse((o) => { if (o.isMesh) meshes++ })
  // with post-processing gl.info only holds the last full-screen pass, so count the scene itself
  let tris = 0
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return
    const g = o.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  add(true, `meshes ${meshes} (≈ draw calls) | triangles ${Math.round(tris / 1000)}k`)

  // GPU and post-processing: what the glow needs on this machine
  const ctx = gl.getContext()
  const dbg = ctx.getExtension('WEBGL_debug_renderer_info')
  const gpu = dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)
  add(true, `GPU: ${String(gpu).slice(0, 70)} | dpr ${gl.getPixelRatio()}`)
  const halfFloat = !!(ctx.getExtension('EXT_color_buffer_half_float') || ctx.getExtension('EXT_color_buffer_float'))
  const composer = window.__composer
  add(!params.bloom || (composer && halfFloat),
    params.bloom
      ? `bloom: ${composer ? `composer ${composer.passes.length} passes` : 'composer NOT mounted'} | half-float targets ${halfFloat ? 'yes' : 'NO'} | I ${params.bloomIntensity} R ${params.bloomRadius} T ${params.bloomThreshold}`
      : `bloom: off (${hybrid ? 'hybrid mode' : '?bloom=0'})`)
  let emissive = 0
  scene.traverse((o) => { if (o.isMesh && o.material?.emissiveIntensity > 1) emissive++ })
  if (!hybrid) add(emissive > 0, `meshes that glow (emissive > 1): ${emissive}`)

  // What share of each elephant's on-screen area is clickable? (same rule as the game's click handler)
  const ray = new THREE.Raycaster()
  const w = gl.domElement.clientWidth, h = gl.domElement.clientHeight
  const N = 12
  for (const t of targets) {
    // screen-space bounding box of the elephant's vertices
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    const v = new THREE.Vector3()
    t.updateWorldMatrix(true, true)
    t.traverse((o) => {
      if (!o.isMesh || gameRoot(o) !== t) return // skip attached decals (contact shadow) and other click-through parts
      const pos = o.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        // getVertexPosition applies skinning, so animated (rigged) targets are measured in their current pose
        o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).project(camera)
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
      }
    })
    let covered = 0, visible = 0
    const blockers = new Map()
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const p = new THREE.Vector2(x0 + ((x1 - x0) * (i + 0.5)) / N, y0 + ((y1 - y0) * (j + 0.5)) / N)
        ray.setFromCamera(p, camera)
        if (!ray.intersectObject(t, true).some((h) => gameRoot(h.object) === t)) continue // this sample misses the elephant entirely
        covered++
        for (const hit of ray.intersectObject(scene, true)) {
          const role = hit.object.userData.hybrid_role
          if (role === 'shadow_catcher') continue // invisible, only shows shadows
          const root = gameRoot(hit.object)
          if (root?.userData.click_through) continue
          if (root === t) visible++
          else { const n = hit.object.parent?.name || hit.object.name; blockers.set(n, (blockers.get(n) || 0) + 1) }
          break
        }
      }
    }
    const share = covered ? visible / covered : 0
    const sizePx = `${Math.round(((x1 - x0) / 2) * w)}x${Math.round(((y1 - y0) / 2) * h)}px`
    const top = [...blockers].sort((a, b) => b[1] - a[1])[0]
    add(share >= 0.2, `#${String(t.userData.target_id).padStart(2)} ${t.name.padEnd(26)} ${sizePx.padStart(9)} visible ${Math.round(share * 100)}%` +
      (top && share < 0.9 ? ` (behind ${top[0]})` : ''))
  }
  return out
}
