import * as THREE from 'three'

/**
 * Real-time clock hands (Blender: custom property clock_hand = 'hour' | 'minute' | 'second' on each hand object,
 * clock_axis = rotation axis in the hand's own Blender axes, default [0, 1, 0] — the face normal; positive angle =
 * clockwise as seen from the front; the hands are modelled pointing at 12 with their origin on the centre pin).
 * Every frame the hands show the computer's local time: the hour hand moves smoothly with the minutes, the minute
 * hand with the seconds, the second hand ticks once a second with a short springy step.
 */
const TICK = 0.16 // s, duration of the second hand's step

export function setupClocks(scene) {
  const hands = []
  scene.traverse((o) => {
    const kind = o.userData?.clock_hand
    if (!kind) return
    const a = o.userData.clock_axis ?? [0, 1, 0]
    const axis = new THREE.Vector3(a[0], a[2], -a[1]).normalize() // Blender (x, y, z) -> glTF (x, z, -y)
    hands.push({ o, kind, axis, base: o.quaternion.clone(), q: new THREE.Quaternion() })
    o.raycast = () => {} // clicks go to the clock itself
  })
  const ease = (x) => {
    // overshoot a little and settle (spring-like tick)
    x = Math.min(1, Math.max(0, x))
    return 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2
  }
  const update = () => {
    if (!hands.length) return
    const now = new Date()
    const ms = now.getMilliseconds() / 1000
    const s = now.getSeconds()
    const m = now.getMinutes() + (s + ms) / 60
    const h = (now.getHours() % 12) + m / 60
    const sec = s - 1 + ease(ms / TICK)
    for (const it of hands) {
      const turns = it.kind === 'hour' ? h / 12 : it.kind === 'minute' ? m / 60 : sec / 60
      it.q.setFromAxisAngle(it.axis, turns * Math.PI * 2)
      it.o.quaternion.copy(it.base).multiply(it.q)
    }
  }
  scene.userData.__clocks = hands // for checks from the browser console
  return { update }
}
