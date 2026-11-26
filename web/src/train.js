import * as THREE from 'three'

/**
 * Toy train of elephant #8 (Blender: Elephant_08_Train, an empty in the centre of the track circle).
 * The lap itself is a normal glTF clip ("TrainLap" rotates the root once around the tree). This module only adds
 * the dissolve: every car fades out while it is behind the painted tree and fades back in when it comes out on
 * the other side. The rule is the same as fade_opacity() in fg_train.py inside the .blend:
 *   userData.train_fade_y = [y0, y1] in Blender world Y (= -Z in three): solid at y <= y0, gone at y >= y1.
 *
 * The car materials are made transparent ONCE here and stay that way; during the lap only the opacity uniform
 * changes. Switching material.transparent on the fly selects another shader program (three's OPAQUE define), and
 * compiling it mid-animation froze the picture for a moment exactly when the train went under the tree.
 */
export function setupTrains(scene) {
  const trains = []
  scene.traverse((root) => {
    const range = root.userData?.train_fade_y
    if (!range || root.userData.__train) return
    root.userData.__train = true
    const cars = root.children
      .filter((c) => c.userData?.train_car)
      .map((car) => {
        const parts = []
        car.traverse((o) => {
          if (!o.isMesh) return
          const decal = o.material.transparent // contact shadow: already blended, no depth write
          o.material = o.material.clone() // the cars share materials: each one fades on its own
          o.material.transparent = true // fixed for good: no shader switch while the train runs
          parts.push({ mesh: o, base: o.material.opacity, shadow: o.castShadow && !decal })
        })
        return { car, parts, last: -1 }
      })
    trains.push({ root, cars, y0: range[0], y1: range[1] })
  })

  const p = new THREE.Vector3()
  const update = () => {
    for (const t of trains) {
      for (const c of t.cars) {
        c.car.getWorldPosition(p)
        const k = THREE.MathUtils.clamp((-p.z - t.y0) / (t.y1 - t.y0), 0, 1)
        const a = 1 - k * k * (3 - 2 * k)
        if (Math.abs(a - c.last) < 1e-3) continue
        c.last = a
        for (const q of c.parts) {
          q.mesh.material.opacity = q.base * a
          q.mesh.visible = a > 0.004
          q.mesh.castShadow = q.shadow && a > 0.5
        }
      }
    }
  }
  update()
  return { trains, update }
}
