import * as THREE from 'three'

// Decor that lives on its own (Blender: anim_idle on the toy root, e.g. the sleeping cat on the windowsill):
// the idle clip loops forever from a random moment. While the toy's click clips (anim_on_click) run, the idle
// fades out; when they have finished (they hold their last pose), the idle fades back in from its first frame.
// So click clips must end in the pose of the idle clip's first frame (and best start in it too).
const FADE = 0.45

export function setupIdleLoops(scene, mixer, animations) {
  const items = []
  scene.traverse((o) => {
    const name = o.userData?.anim_idle
    if (!name) return
    const clip = THREE.AnimationClip.findByName(animations, name)
    if (!clip) return
    const idle = mixer.clipAction(clip) // cached per clip: safe when React sets this up twice
    idle.setLoop(THREE.LoopRepeat, Infinity)
    idle.reset().play()
    idle.time = Math.random() * clip.duration
    items.push({ root: o, idle, busy: false })
  })

  // called by playOnce right after the click clips were started
  const onPlay = (toy) => {
    const it = items.find((i) => i.root === toy)
    if (!it) return
    for (const a of toy.userData.__actions ?? []) a.fadeIn(FADE)
    it.idle.fadeOut(FADE)
    it.busy = true
  }

  const update = () => {
    for (const it of items) {
      if (!it.busy) continue
      const acts = it.root.userData.__actions ?? []
      if (acts.some((a) => a.isRunning())) continue
      it.idle.reset().fadeIn(FADE).play()
      for (const a of acts) a.fadeOut(FADE)
      it.busy = false
    }
  }

  scene.userData.__idles = items
  return { onPlay, update }
}
