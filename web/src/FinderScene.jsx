import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { applyBlenderCamera } from './blenderCamera.js'
import { gameRoot, params, prepareHybrid, prepareScene } from './sceneSetup.js'
import { interactiveRoot, setupSnowGlobes } from './snowGlobe.js'
import { setupTrains } from './train.js'
import { setupOrnaments } from './ornament.js'
import { setupSparkles } from './sparkle.js'
import { setupAuras } from './aura.js'
import { setupGlowCycles } from './glowCycle.js'
import { setupCandies } from './candy.js'
import { setupFrost } from './frost.js'
import { setupBerryLights } from './berryLights.js'
import { setupGoldShimmer } from './goldShimmer.js'
import { setupClocks } from './clock.js'
import { setupIdleLoops } from './idleLoop.js'
import { setupFoundGlow } from './foundGlow.js'
import { setupFireflies } from './fireflies.js'
import { setupCandleBlow } from './candleBlow.js'
import { setupLanternFlare } from './lanternFlare.js'
import { setupFlameEscape } from './flameEscape.js'

export const GLB_URL = params.mode === 'hybrid' ? 'hybrid.glb' : 'finder_room.glb'
const FOUND_GLOW = new THREE.Color(1.0, 0.78, 0.35)
const GOLD_TMP = new THREE.Color()

export default function FinderScene({ onFound, onReady, frame }) {
  // the 4th argument reports download progress to the start screen (intro.jsx)
  const gltf = useLoader(GLTFLoader, GLB_URL, undefined, reportProgress)
  // Animations exported from Blender (actions), e.g. "Salute" for the nutcracker; played when the target is found.
  const mixer = useMemo(() => new THREE.AnimationMixer(gltf.scene), [gltf])
  const { camera, targets } = useMemo(() => {
    const r = prepareScene(gltf.scene)
    if (params.mode === 'hybrid') prepareHybrid(gltf.scene)
    return r
  }, [gltf])
  // Invisible click areas (Blender: hit_proxy on a mesh, e.g. the disc inside the open star): never drawn, but
  // still caught by the raycast, so a click into the hole of a hollow toy counts.
  useMemo(() => gltf.scene.traverse((o) => {
    if (o.isMesh && o.userData.hit_proxy) o.material = new THREE.MeshBasicMaterial({ visible: false })
  }), [gltf])
  // Snow globes: click = shake (see snowGlobe.js)
  const globes = useMemo(() => setupSnowGlobes(gltf.scene), [gltf])
  // Toy train: its cars dissolve while they pass behind the painted tree (see train.js)
  const trains = useMemo(() => setupTrains(gltf.scene), [gltf])
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const pops = useRef([])
  // Little burst of falling sparkles for toys tagged with sparkle (the red ball on the tree), see sparkle.js
  const sparkles = useMemo(() => setupSparkles(gltf.scene), [gltf])
  // Heart on the tree: every click sends out a glowing heart-shaped aura in the next garland colour (aura.js)
  const auras = useMemo(() => setupAuras(gltf.scene, camera), [gltf, camera])
  // Glass ornament on the tree: glossy room reflection + the nearest garland bulbs mirrored in it (ornament.js)
  const ornaments = useMemo(() => setupOrnaments(gltf.scene, gl, camera), [gltf, gl, camera])
  // Medallion with the white snowflake: every click lights the snowflake in the next garland colour (glowCycle.js).
  // Set up after ornaments: works on the cloned materials.
  const glows = useMemo(() => (ornaments, setupGlowCycles(gltf.scene)), [gltf, ornaments])
  // Candy cane on the tree: eaten bite by bite, then a new one drops from the branches (candy.js)
  const candies = useMemo(() => setupCandies(gltf.scene, sparkles), [gltf, sparkles])
  // Red ball with the gold snowflake: a click frosts it over, then the frost melts (frost.js)
  const frosts = useMemo(() => setupFrost(gltf.scene), [gltf])
  // Ball with holly: the berries light up and run round like a tiny garland (berryLights.js)
  const berries = useMemo(() => setupBerryLights(gltf.scene), [gltf])
  // Golden pine cone: a band of golden light runs down it, golden pollen falls off (goldShimmer.js)
  const shimmers = useMemo(() => setupGoldShimmer(gltf.scene, camera), [gltf, camera])
  // Clock on the bookcase shelf: the hands show the computer's local time (clock.js)
  const clocks = useMemo(() => setupClocks(gltf.scene), [gltf])
  // Cat on the windowsill: sleeps in a loop (breathing, tail), a click wakes it up for a while (idleLoop.js)
  const idles = useMemo(() => setupIdleLoops(gltf.scene, mixer, gltf.animations), [gltf, mixer])
  // Found elephant: a light golden outline along its contour, follows it while it moves (foundGlow.js)
  const outlines = useMemo(() => setupFoundGlow(gltf.scene, camera, gl), [gltf, camera, gl])
  // Plant on the bookcase shelf: fireflies fly out of the leaves, circle round it and hide again (fireflies.js)
  const fireflies = useMemo(() => setupFireflies(gltf.scene), [gltf])
  // Candle jar on the table: a click blows it out, a curl of smoke, then it lights up again (candleBlow.js)
  const candles = useMemo(() => setupCandleBlow(gltf.scene), [gltf])
  // Red lantern on the mantel: rocks (clip LanternRock), the flame lags behind and flares, embers from the roof
  const lanterns = useMemo(() => setupLanternFlare(gltf.scene), [gltf])
  // Black lantern on the bookcase: the flame jumps out, sits on the roof, flies round and dives back (flameEscape.js)
  const flameWalks = useMemo(() => setupFlameEscape(gltf.scene, camera), [gltf, camera])

  // Use the camera from Blender as the R3F default camera (manual: R3F must not touch its aspect).
  useLayoutEffect(() => {
    if (!camera) return
    camera.manual = true
    set({ camera })
  }, [camera, set])

  useLayoutEffect(() => {
    if (camera) applyBlenderCamera(camera, size.width, size.height, frame)
  }, [camera, size.width, size.height, frame])

  // Warm-up before the scene is shown: the first frame used to upload all textures (~26 Mpx) and compile all
  // shaders in one go - ~3 s with the main thread frozen (the start screen stuttered). Now textures are uploaded
  // a few at a time between frames and shaders compile in parallel (compileAsync), then the scene is attached.
  // Progress goes to the start screen as 'finder:progress' with stage 'warm'.
  const [warm, setWarm] = useState(false)
  useEffect(() => {
    let cancelled = false
    const texs = new Set()
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return
      for (const m of [].concat(o.material)) {
        for (const k of Object.keys(m)) if (m[k]?.isTexture) texs.add(m[k])
      }
    })
    const list = [...texs]
    const n = list.length + 1
    const report = (k) => window.dispatchEvent(new CustomEvent('finder:progress', { detail: { stage: 'warm', k, n } }))
    let i = 0
    const step = () => {
      if (cancelled) return
      const t0 = performance.now()
      while (i < list.length && performance.now() - t0 < 24) gl.initTexture(list[i++])
      report(i)
      if (i < list.length) { setTimeout(step, 0); return }
      const done = () => { if (!cancelled) { report(n); setWarm(true) } }
      if (gl.compileAsync) gl.compileAsync(gltf.scene, camera).then(done, done)
      else done()
    }
    setTimeout(step, 0)
    return () => { cancelled = true }
  }, [gltf, gl, camera])

  useEffect(() => {
    if (!warm) return
    onReady?.({ scene: gltf.scene, camera, targets, gl, mixer, animations: gltf.animations })
  }, [warm, gltf, camera, targets, gl, mixer, onReady])

  // Found elephants also flare up with a warm golden glow for a moment (on top of their own animation).
  // Materials are changed in place and restored (cloning would break modules holding them, e.g. train.js).
  const glowFound = (target) => {
    const mats = new Set()
    target.traverse((o) => {
      if (!o.isMesh) return
      for (const m of [].concat(o.material)) {
        if (m?.emissive && !m.transparent && !m.userData.__foundGlow) mats.add(m)
      }
    })
    for (const m of mats) m.userData.__foundGlow = { color: m.emissive.clone(), I: m.emissiveIntensity }
    founds.current.push({ mats: [...mats], t: 0 })
  }
  const founds = useRef([])

  const markFound = (target, at) => {
    if (target.userData.found) return
    target.userData.found = true
    // 25.11 (author): no golden flare of the whole elephant any more - a light outline instead (below)
    // anim_on_found may list several clips ("BoatRock,Elephant03Rise"): one Blender action per animated object.
    const names = String(target.userData.anim_on_found ?? '').split(',').map((n) => n.trim()).filter(Boolean)
    const clips = names.map((n) => THREE.AnimationClip.findByName(gltf.animations, n)).filter(Boolean)
    if (clips.length) {
      // Own animation (e.g. the nutcracker's salute): play once and keep the last pose, no highlight.
      for (const clip of clips) {
        const action = mixer.clipAction(clip)
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
        action.reset().play()
      }
    } else {
      // Placeholder for elephants without their own animation: warm tint + small "pop".
      target.traverse((o) => {
        if (!o.isMesh) return
        o.material = o.material.clone() // materials are shared between elephants
        o.material.emissive = FOUND_GLOW
        o.material.emissiveIntensity = 0.6
      })
      pops.current.push({ obj: target, t: 0, base: target.scale.clone() })
    }
    // how long the elephant's own show lasts: the card waits for it (App.jsx)
    const showTime = clips.length ? Math.max(...clips.map((c) => c.duration)) : 0.45
    outlines.start(target, showTime + 1.3)
    onFound?.(target, at && { ...at, box: outlines.screenBox(target) }, showTime)
  }

  // Decor with interactive = "anim": the first click plays the clips listed in anim_on_click once and keeps the
  // last pose (the teddy opens its cloak: shape keys of Teddy_Cloak + a little bounce of the bear).
  // With anim_repeat (gingerbread man on the tree: a twirl on its thread) every click replays the clips, but only
  // after the previous run has finished; such clips must end in the pose they start from.
  const playOnce = (toy) => {
    if (toy.userData.candy && !candies.bite(toy)) return // gone / falling: nothing to bite
    if (toy.userData.aura) auras.pulse(toy) // every click, even while the sway is still playing
    if (toy.userData.glow_cycle) glows.pulse(toy) // every click: next colour
    if (toy.userData.anim_repeat) {
      if (toy.userData.__actions?.some((a) => a.isRunning())) return
    } else if (toy.userData.played) return
    toy.userData.played = true
    toy.userData.__actions = []
    if (toy.userData.sparkle) sparkles.burst(toy)
    if (toy.userData.frost) frosts.pulse(toy)
    if (toy.userData.berry_lights) berries.pulse(toy)
    if (toy.userData.gold_shimmer) shimmers.pulse(toy)
    if (toy.userData.fireflies) fireflies.pulse(toy)
    if (toy.userData.candle_blow) candles.pulse(toy)
    if (toy.userData.lantern_flare) lanterns.pulse(toy)
    if (toy.userData.flame_escape) flameWalks.pulse(toy)
    const names = String(toy.userData.anim_on_click ?? '').split(',').map((n) => n.trim()).filter(Boolean)
    for (const n of names) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, n)
      if (!clip) continue
      const action = mixer.clipAction(clip)
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.reset().play()
      toy.userData.__actions.push(action)
    }
    if (toy.userData.anim_idle) idles.onPlay(toy)
  }

  useFrame((state, dt) => {
    mixer.update(dt)
    idles.update()
    trains.update()
    ornaments.update()
    sparkles.update(dt)
    auras.update(dt)
    glows.update(dt)
    candies.update(dt)
    frosts.update(dt)
    berries.update(dt)
    shimmers.update(dt)
    fireflies.update(dt)
    clocks.update()
    // Candle flicker: a few incommensurate sines = soft, never-repeating breathing of the light and its halo.
    const t = state.clock.elapsedTime
    for (const g of globes) g.update(dt, t)
    for (const [i, f] of (gltf.scene.userData.__flicker ?? []).entries()) {
      if (f.kind === 'window') {
        // toy house windows: very slow, smooth light-up / fade-out, each window in its own turn
        const u = (t / f.period + f.phase) % 1
        const ease = (a, b, x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (x - a) / (b - a))))
        const I = ease(0, 0.3, u) * (1 - ease(0.55, 0.85, u))
        f.obj.material.emissiveIntensity = f.base * I
        if (f.sprite) f.sprite.material.opacity = 0.55 * I
        continue
      }
      const k = 1 + 0.07 * Math.sin(t * 11.3 + i) + 0.05 * Math.sin(t * 23.7 + 2 * i) + 0.04 * Math.sin(t * 4.1 + 3 * i)
      if (f.kind === 'light') f.obj.intensity = f.base * k
      else if (f.kind === 'glass') f.obj.material.emissiveIntensity = f.base * k
      else if (f.kind === 'flame') {
        // the flame's origin sits on the wick: it stretches, narrows and sways from there
        const a = (k - 1) / 0.16
        f.obj.scale.set(f.base.x * (1 - 0.06 * a), f.base.y * (1 + 0.14 * a), f.base.z * (1 - 0.06 * a))
        f.obj.rotation.z = 0.05 * Math.sin(t * 3.3 + i) + 0.025 * Math.sin(t * 7.9)
        f.obj.rotation.x = 0.04 * Math.sin(t * 2.7 + 2 * i)
      } else f.obj.material.opacity = f.base * k
    }
    candles.update(dt) // after the flicker loop: scales what it has just set
    lanterns.update(dt) // same: adds the lean and the flare on top of the flicker
    flameWalks.update(dt) // same: moves the flame, the light and the halo, dims the empty lantern
    // golden flare of a just-found elephant: up in 0.15 s, fades over ~1.5 s, then the material is restored
    founds.current = founds.current.filter((f) => {
      f.t += dt
      const I = f.t < 0.15 ? f.t / 0.15 : Math.exp(-(f.t - 0.15) / 0.5)
      const done = f.t > 2.2
      for (const m of f.mats) {
        const b = m.userData.__foundGlow
        if (!b) continue
        if (done) { m.emissive.copy(b.color); m.emissiveIntensity = b.I; delete m.userData.__foundGlow; continue }
        // gold of ~0.45 on top of the own emissive (under AgX more would wash the elephant out to cream)
        const Ie = b.I > 0 ? b.I : 1
        m.emissiveIntensity = Ie
        m.emissive.copy(b.color).lerp(GOLD_TMP.copy(FOUND_GLOW).multiplyScalar(0.45 / Ie), Math.min(1, I))
      }
      return !done
    })
    // Small "pop" for elephants without their own animation (placeholder).
    pops.current = pops.current.filter((p) => {
      p.t += dt
      const k = 1 + 0.35 * Math.sin(Math.min(p.t / 0.45, 1) * Math.PI)
      p.obj.scale.copy(p.base).multiplyScalar(k)
      return p.t < 0.45
    })
    outlines.update(dt) // last: draws its mask with every animation of this frame applied
  })

  // First hit decides; transparent containers (glass bauble, snow globe, candle jar) let the click through.
  const handlePointerDown = (e) => {
    e.stopPropagation()
    if (params.debug) console.log('click hits:', e.intersections.map((h) => h.object.name).join(', '))
    for (const hit of e.intersections) {
      if (hit.object.userData.hybrid_role === 'shadow_catcher') continue // invisible proxy of the painted room
      const root = gameRoot(hit.object)
      if (root?.userData.click_through) continue
      if (root?.userData.game_role === 'hidden_target') markFound(root, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
      else {
        const toy = interactiveRoot(hit.object) // decor one can play with (snow globe, wrapped teddy)
        if (toy?.userData.interactive === 'anim') playOnce(toy)
        else if (toy) globes.find((g) => g.root === toy)?.shake()
      }
      break
    }
  }

  return warm ? <primitive object={gltf.scene} onPointerDown={handlePointerDown} /> : null
}

// no useLoader.preload here: a preloaded file would give the start screen no progress events
function reportProgress(e) {
  window.__finderProgress = { loaded: e.loaded, total: e.total, n: (window.__finderProgress?.n ?? 0) + 1 } // debug
  window.dispatchEvent(new CustomEvent('finder:progress', { detail: { loaded: e.loaded, total: e.total } }))
}
