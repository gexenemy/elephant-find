import * as THREE from 'three'

/**
 * A candy cane that can be eaten (Blender: custom property candy on the toy's root; candy_bites = clicks to eat it,
 * candy_fall = metres it drops from when a new one comes).
 * The mesh carries a second UV map "Along" (glTF uv1): u = geodesic distance from the straight end, 0 … 1 at the
 * tip of the hook. A small shader patch discards everything with along < level (+ a scalloped bite edge), and draws
 * the inside of the remaining tube (back faces) in cream, so the bitten end looks like a cut candy.
 * Every click = one bite: bites 1 … n−1 take 1/(n+1) of the length each (the level jumps to the next step with a
 * quick "chomp" and a puff of red/white crumbs); the n-th bite eats the whole rest at once and the cane is gone (the
 * short hook-only stub that a further step would leave looked broken, so it is skipped); a moment later a new one drops from the branches above onto
 * the same place, bounces on its hook and swings a little.
 */
const CREAM = new THREE.Color(1.0, 0.9, 0.84)

export function setupCandies(scene, sparkles) {
  const items = new Map()
  scene.traverse((root) => {
    if (!root.userData?.candy || items.has(root)) return
    // set up only once per scene: React may call this twice (StrictMode / hot reload); a second setup would put a
    // new material with its own uniforms on the mesh while the first instance keeps driving the old ones
    if (root.userData.__candyItem) { items.set(root, root.userData.__candyItem); return }
    let mesh = null
    root.traverse((o) => { if (!mesh && o.isMesh) mesh = o })
    if (!mesh) return
    const g = mesh.geometry
    const uv1 = g.attributes.uv1
    if (!uv1) { console.warn('candy: no "Along" uv1 on', mesh.name); return }
    const along = new Float32Array(uv1.count)
    for (let i = 0; i < uv1.count; i++) along[i] = uv1.getX(i)
    g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1))

    const uniforms = { uLevel: { value: 0 }, uCream: { value: CREAM } }
    const mat = mesh.material.clone()
    mat.side = THREE.DoubleSide // once, at load (never toggled later: it is part of the shader key)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLevel = uniforms.uLevel
      sh.uniforms.uCream = uniforms.uCream
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlong;\nvarying float vAlong;\nvarying vec3 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = aAlong;\nvLocal = position;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLevel;\nuniform vec3 uCream;\nvarying float vAlong;\nvarying vec3 vLocal;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (uLevel > 0.0) {
            // scalloped bite edge: little round tooth marks around the tube
            float bump = 0.03 * abs(sin(vLocal.x * 520.0 + vLocal.z * 300.0) * sin(vLocal.y * 430.0 - vLocal.z * 610.0));
            if (vAlong < uLevel + bump) discard;
          }`)
        .replace('#include <map_fragment>', '#include <map_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = uCream;')
    }
    mat.customProgramCacheKey = () => 'candy-bite'
    mesh.material = mat

    // a click on an already eaten part must not count
    const raycast = mesh.raycast.bind(mesh)
    mesh.raycast = (rc, out) => {
      const n = out.length
      raycast(rc, out)
      for (let i = out.length - 1; i >= n; i--) {
        const f = out[i].face
        const a = f ? (along[f.a] + along[f.b] + along[f.c]) / 3 : 1
        if (a < uniforms.uLevel.value + 0.02) out.splice(i, 1)
      }
    }

    // where the bite front is, for each level (local centroid of the vertices around that "along")
    const pos = g.attributes.position
    const front = (level) => {
      const c = new THREE.Vector3()
      let n = 0
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(along[i] - level) < 0.04) { c.x += pos.getX(i); c.y += pos.getY(i); c.z += pos.getZ(i); n++ }
      }
      return n ? c.divideScalar(n) : c
    }
    const bites = root.userData.candy_bites ?? 4
    const step = 1 / (bites + 1)
    const fronts = Array.from({ length: bites + 1 }, (_, k) => front(k >= bites ? 0.9 : k * step))
    const item = {
      root, mesh, uniforms, bites, step, fronts, eaten: 0, level: 0, target: 0, phase: 'idle', t: 0,
      fall: root.userData.candy_fall ?? 0.22, baseY: mesh.position.y, baseRot: mesh.rotation.z,
    }
    Object.defineProperty(root.userData, '__candyItem', { value: item, enumerable: false })
    items.set(root, item)
  })

  scene.userData.__candies = items // for checks from the browser console

  // returns false while the cane is gone / falling (the click is ignored)
  const bite = (toy) => {
    const it = items.get(toy)
    if (!it || it.phase !== 'idle') return false
    it.eaten++
    it.target = it.eaten >= it.bites ? 1.05 : it.eaten * it.step
    const at = it.mesh.localToWorld(it.fronts[Math.min(it.eaten, it.bites)].clone())
    sparkles?.burst(toy, { style: 'crumbs', at, radius: 0.012 })
    return true
  }

  const update = (dt) => {
    for (const it of items.values()) {
      let fdt = dt
      if (it.level < it.target) it.level = Math.min(it.target, it.level + Math.max(0.02, (it.target - it.level) * 14) * dt * 3)
      it.uniforms.uLevel.value = it.level
      if (it.phase === 'idle' && it.level >= 1) { it.phase = 'gone'; it.t = 0; it.mesh.visible = false }
      else if (it.phase === 'gone') {
        it.t += fdt
        if (it.t > 0.7) {
          // a fresh cane drops from the branches above
          it.phase = 'falling'; it.t = 0
          it.eaten = 0; it.level = 0; it.target = 0; it.uniforms.uLevel.value = 0
          fdt = 0 // pose it at the top of the drop in this same frame (it must never show up at rest first)
        }
      }
      if (it.phase === 'falling') {
        it.t += fdt
        const g = 2.6
        const tLand = Math.sqrt((2 * it.fall) / g)
        let y, swing = 0, s = 1
        if (it.t < tLand) {
          y = it.fall - 0.5 * g * it.t * it.t
          s = Math.min(1, 0.55 + it.t / tLand) // comes out of the branches
        } else {
          const u = it.t - tLand
          y = -0.012 * Math.exp(-5 * u) * Math.sin(2 * Math.PI * 2.2 * u) // lands on its hook and bounces
          swing = 0.18 * Math.exp(-2.2 * u) * Math.sin(2 * Math.PI * 1.1 * u)
          if (u > 2.2) { y = 0; swing = 0; it.phase = 'idle' }
        }
        it.mesh.position.y = it.baseY + y
        it.mesh.rotation.z = it.baseRot + swing
        it.mesh.scale.setScalar(s)
        it.mesh.visible = true
      }
    }
  }
  return { bite, update }
}
