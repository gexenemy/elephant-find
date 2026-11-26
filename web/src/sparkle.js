import * as THREE from 'three'

/**
 * A short burst of particles that fall off a toy when it is clicked (Blender: custom property sparkle on the toy's
 * root, sparkle_center = centre of the ball in the root's local Blender axes, sparkle_radius in metres,
 * sparkle_style = 'glitter' (default) | 'snow' | 'flakes' | 'gold' | 'rays' | 'crumbs' | 'petals' | 'confetti' | 'breeze' | 'sweep').
 * One Points object per burst; it fades within the style's life time and is removed.
 *  - glitter (red ball, spinning top): twinkling warm sparks start on the camera side of the ball, fly out a little,
 *    fall slowly and fade.
 *  - snow (green ball with the snow cap): soft white flakes are shaken off the snowy top, drift down at a gentle
 *    terminal speed, sway from side to side and melt away.
 *  - flakes (white ball with the snowflake band): a ring of six-armed snowflakes flies off the band round the
 *    ball's middle, spreads out sideways, slowly sinks and fades; most are white, every third one red like the band.
 *  - gold (red ball with the gold snowflake): golden snowflakes spin off the turning ball and drift down.
 *  - rays (red five-pointed star): five jets of warm sparks shoot out of the star's five tips (in the plane facing
 *    the camera: up, then every 72°), slow down, sink a little and twinkle out — the star "shines" for a moment.
 *  - petals (wooden folk-painted diamond): painted petals — tulip red, ochre, cream and leaf green — float off the
 *    toy's face, flutter down slowly swaying from side to side and "turn over" (brightness flicker), then fade.
 *  - confetti (polka-dot gift on the floor, lid pops off): after a short delay (the lid has just jumped) a fountain
 *    of paper confetti — red, green, gold, cream, blue — shoots up out of the open box, tumbles (flicker), drifts
 *    down swaying and fades. sparkle_center = middle of the box mouth, sparkle_radius = half its width.
 */
const STYLES = {
  glitter: {
    n: 46, life: 1.9, size: 0.42, gravity: 0.32, drag: 1.6, terminal: Infinity, sway: 0, twinkle: 17,
    tints: [[1, 1, 1], [1, 0.9, 0.6], [1, 0.78, 0.4], [1, 0.85, 0.85]], star: true,
  },
  snow: {
    n: 64, life: 3.0, size: 0.34, gravity: 0.22, drag: 2.2, terminal: 0.085, sway: 0.018, twinkle: 0,
    tints: [[0.95, 0.97, 1], [0.85, 0.9, 1], [1, 1, 1]], star: false,
  },
  flakes: {
    n: 22, life: 2.2, size: 0.62, gravity: 0.05, drag: 1.3, terminal: 0.05, sway: 0.008, twinkle: 0,
    tints: [[1, 1, 1], [0.88, 0.94, 1], [1, 0.3, 0.25]], star: false, shape: 'flake',
  },
  // gold (red ball with the gold snowflake): small golden six-armed snowflakes spin off while the ball turns,
  // drift down slowly with a gentle twinkle and fade
  // crumbs (candy cane, candy.js): little red and white bits of candy fly off the bitten end and drop
  crumbs: {
    n: 18, life: 1.1, size: 0.55, gravity: 0.9, drag: 0.6, terminal: Infinity, sway: 0, twinkle: 0,
    tints: [[0.85, 0.12, 0.1], [1, 0.95, 0.88], [0.95, 0.3, 0.25]], star: false, normal: true,
  },
  rays: {
    n: 45, life: 1.5, size: 0.36, gravity: 0.12, drag: 2.4, terminal: Infinity, sway: 0, twinkle: 14,
    tints: [[1, 0.92, 0.6], [1, 0.62, 0.35], [1, 1, 0.85]], star: true, rays: 5,
  },
  petals: {
    n: 24, life: 2.8, size: 1.0, gravity: 0.1, drag: 1.7, terminal: 0.065, sway: 0.016, twinkle: 0, flip: 4.2,
    tints: [[0.78, 0.13, 0.08], [0.95, 0.62, 0.18], [1, 0.93, 0.78], [0.34, 0.48, 0.22], [0.85, 0.2, 0.12]],
    star: false, shape: 'petal', normal: true,
  },
  confetti: {
    n: 44, life: 2.6, delay: 0.22, hold: 0.55, size: 0.42, gravity: 0.75, drag: 1.2, terminal: 0.11, sway: 0.02, twinkle: 0, flip: 9,
    tints: [[0.9, 0.1, 0.1], [0.12, 0.55, 0.25], [1, 0.8, 0.28], [1, 0.95, 0.86], [0.28, 0.5, 0.95]],
    star: false, shape: 'confetti', normal: true,
  },
  // breeze (folk-painted bow at the treetop, a gust of wind blows it sideways): a stream of snow flies past the toy
  // from the left to the right on the wind, a little downwards, swaying, and melts away
  breeze: {
    n: 54, life: 1.7, size: 0.4, gravity: 0.05, drag: 0.35, terminal: 0.12, sway: 0.01, twinkle: 0,
    tints: [[0.95, 0.97, 1], [0.85, 0.9, 1], [1, 1, 1]], star: false,
  },
  // sweep (snowman on the bookcase sweeping with a broom): a puff of snow is kicked up from under the broom on every
  // stroke — the toy gives the stroke times (sparkle_waves, s after the click) and directions (sparkle_wave_dirs,
  // Blender world xyz per stroke); each grain belongs to one stroke, waits invisible until it, flies along the stroke
  // and up, then settles and melts
  sweep: {
    n: 72, life: 1.35, size: 0.42, gravity: 0.5, drag: 1.5, terminal: 0.09, sway: 0.01, twinkle: 0,
    tints: [[0.95, 0.97, 1], [0.86, 0.91, 1], [1, 1, 1]], star: false, waves: true,
  },
  gold: {
    n: 26, life: 2.4, size: 0.5, gravity: 0.06, drag: 1.4, terminal: 0.06, sway: 0.01, twinkle: 6,
    tints: [[1, 0.84, 0.42], [1, 0.74, 0.3], [1, 0.93, 0.68]], star: false, shape: 'flake',
  },
}

const textures = {}
function getTexture(star, shape) {
  const key = shape === 'flake' ? 'snowflake' : shape === 'petal' ? 'petal' : shape === 'confetti' ? 'confetti' : star ? 'star' : 'flake'
  if (textures[key]) return textures[key]
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (shape === 'confetti') {
    // a small paper rectangle, tilted, with a faint lighter fold line
    const h = size / 2
    g.translate(h, h)
    g.rotate(0.55)
    g.fillStyle = 'rgba(255,255,255,1)'
    g.fillRect(-h * 0.62, -h * 0.3, h * 1.24, h * 0.6)
    g.fillStyle = 'rgba(205,205,205,1)'
    g.fillRect(-h * 0.62, 0, h * 1.24, h * 0.3)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    textures[key] = tex
    return tex
  }
  if (shape === 'petal') {
    // a tulip petal: pointed teardrop, slightly tilted, solid with a lighter middle and a soft rim
    const h = size / 2
    g.translate(h, h)
    g.rotate(-0.5)
    g.beginPath()
    g.moveTo(0, -h * 0.86)
    g.bezierCurveTo(h * 0.62, -h * 0.35, h * 0.5, h * 0.62, 0, h * 0.8)
    g.bezierCurveTo(-h * 0.5, h * 0.62, -h * 0.62, -h * 0.35, 0, -h * 0.86)
    g.closePath()
    const gr = g.createRadialGradient(0, h * 0.15, 0, 0, 0, h * 0.85)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.75, 'rgba(225,225,225,1)')
    gr.addColorStop(1, 'rgba(190,190,190,0.9)')
    g.fillStyle = gr
    g.shadowColor = 'rgba(255,255,255,0.5)'
    g.shadowBlur = 3
    g.fill()
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    textures[key] = tex
    return tex
  }
  if (shape === 'flake') {
    // a six-armed snowflake with small side branches, like the ones painted on the ball, on a faint glow
    const h = size / 2
    const glow = g.createRadialGradient(h, h, 0, h, h, h)
    glow.addColorStop(0, 'rgba(255,255,255,0.35)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = glow
    g.fillRect(0, 0, size, size)
    g.strokeStyle = 'rgba(255,255,255,1)'
    g.lineCap = 'round'
    g.lineWidth = 3.2
    g.translate(h, h)
    for (let i = 0; i < 6; i++) {
      g.beginPath()
      g.moveTo(0, 0); g.lineTo(0, -h * 0.86)
      g.moveTo(0, -h * 0.5); g.lineTo(-h * 0.2, -h * 0.68)
      g.moveTo(0, -h * 0.5); g.lineTo(h * 0.2, -h * 0.68)
      g.stroke()
      g.rotate(Math.PI / 3)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    textures[key] = tex
    return tex
  }
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  if (star) {
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.15, 'rgba(255,255,255,0.9)')
    gr.addColorStop(0.4, 'rgba(255,255,255,0.2)')
  } else {
    // a soft round flake: solid-ish core, feathered edge
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.35, 'rgba(255,255,255,0.85)')
    gr.addColorStop(0.6, 'rgba(255,255,255,0.25)')
  }
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  if (star) {
    // a thin four-point star on top of the soft dot
    g.strokeStyle = 'rgba(255,255,255,0.9)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(size / 2, 4); g.lineTo(size / 2, size - 4)
    g.moveTo(4, size / 2); g.lineTo(size - 4, size / 2)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  textures[key] = tex
  return tex
}

export function setupSparkles(scene) {
  const bursts = []

  // opts (optional, used by candy.js): { style, at: world Vector3, radius }
  const burst = (toy, opts = {}) => {
    const d = toy.userData
    const st = STYLES[opts.style ?? d.sparkle_style] ?? STYLES.glitter
    const N = st.n
    const bc = d.sparkle_center ?? [0, 0, 0]
    const R = opts.radius ?? d.sparkle_radius ?? 0.06
    toy.updateWorldMatrix(true, false)
    const centre = opts.at ? opts.at.clone() : toy.localToWorld(new THREE.Vector3(bc[0], bc[2], -bc[1])) // Blender (x, y, z) -> glTF (x, z, -y)
    const pos = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    const vel = new Float32Array(N * 3)
    const seed = new Float32Array(N)
    const base = new Float32Array(N * 3)
    const waveT = st.waves ? new Float32Array(N) : null // sweep: per-grain start time (its stroke)
    for (let i = 0; i < N; i++) {
      let x, y, z, sp
      if (st.rays) {
        // along one of the star's arms, from the tip outwards; arms at 90° + k·72° (screen up first)
        const k = i % st.rays
        const a = Math.PI / 2 + (k * 2 * Math.PI) / st.rays + (Math.random() - 0.5) * 0.12
        const along = 0.85 + 0.25 * Math.random()
        x = Math.cos(a) * along
        y = Math.sin(a) * along
        z = 0.3
        sp = 0.1 + 0.16 * Math.random()
        vel.set([Math.cos(a) * sp, Math.sin(a) * sp, 0.01], i * 3)
      } else if (st === STYLES.confetti) {
        // out of the open box mouth (a square of half-width R): a fountain up, spreading out, a bit towards the camera
        x = (Math.random() * 2 - 1) * 0.8
        z = (Math.random() * 2 - 1) * 0.8
        y = 0
        const up = 0.5 + 0.3 * Math.random()
        sp = 0.1 + 0.14 * Math.random()
        vel.set([x * sp + (Math.random() - 0.5) * 0.08, up, z * sp * 0.6 + 0.05], i * 3)
      } else if (st === STYLES.flakes) {
        // evenly round the band at the ball's equator, the camera side first; they fly out sideways
        const a = (i / N) * Math.PI * 2 + Math.random() * 0.25
        x = Math.cos(a)
        y = (Math.random() - 0.5) * 0.35
        z = Math.max(0.15, Math.sin(a))
        sp = 0.06 + 0.05 * Math.random()
        vel.set([x * sp, 0.025 + y * sp + 0.02 * Math.random(), z * sp * 0.25], i * 3)
      } else if (st.waves) {
        // which stroke this grain belongs to, and that stroke's direction (Blender world -> three: x, z, -y)
        const times = d.sparkle_waves ?? [0]
        const dirs = d.sparkle_wave_dirs ?? []
        const w = i % times.length
        waveT[i] = times[w]
        const dx = dirs[w * 3] ?? 1, dz = -(dirs[w * 3 + 1] ?? 0)
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random())
        x = Math.cos(a) * r
        z = Math.sin(a) * r
        y = 0.1 * Math.random()
        sp = 0.1 + 0.16 * Math.random()
        const side = (Math.random() - 0.5) * 0.12
        vel.set([dx * sp - dz * side, 0.1 + 0.14 * Math.random(), dz * sp + dx * side], i * 3)
      } else if (st === STYLES.breeze) {
        // upwind (left of the toy, spread out along the wind so they arrive one after another), carried to the right
        x = -1.2 - Math.random() * 4.5
        y = (Math.random() * 2 - 1) * 1.6 + 0.3
        z = Math.random() * 1.2
        sp = 0.38 + 0.22 * Math.random()
        vel.set([sp, -0.02 - 0.04 * Math.random(), 0.02 * (Math.random() - 0.5)], i * 3)
      } else if (st === STYLES.snow) {
        // off the snowy top: upper part of the ball, mostly the half facing the camera
        const a = Math.random() * Math.PI * 2
        const pol = Math.acos(1 - Math.random() * 0.45) // 0..~56° from the top
        x = Math.sin(pol) * Math.cos(a)
        y = Math.cos(pol)
        z = Math.abs(Math.sin(pol) * Math.sin(a)) * 0.8 + 0.2
        sp = 0.04 + 0.07 * Math.random()
        vel.set([x * sp, 0.03 + 0.06 * Math.random(), z * sp * 0.4], i * 3)
      } else {
        // a point on the half of the ball that faces the camera (+Z in three), a bit denser around the rim
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(0.25 + 0.75 * Math.random())
        x = Math.cos(a) * r
        y = Math.sin(a) * r
        z = Math.sqrt(Math.max(0, 1 - r * r))
        sp = 0.05 + 0.1 * Math.random()
        vel.set([x * sp, y * sp + 0.05 + 0.06 * Math.random(), z * sp * 0.3], i * 3)
      }
      pos.set([centre.x + x * R, centre.y + y * R, centre.z + z * R], i * 3)
      base.set(st.tints[i % st.tints.length], i * 3)
      seed[i] = Math.random() * 10
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.PointsMaterial({
      size: R * st.size, map: getTexture(st.star, st.shape), vertexColors: true, transparent: true, blending: st.normal ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, toneMapped: false, sizeAttenuation: true,
    })
    const points = new THREE.Points(geo, mat)
    points.name = `${toy.name}_Sparkles`
    points.frustumCulled = false
    points.raycast = () => {} // never blocks clicks
    points.renderOrder = 13
    scene.add(points)
    // delay: the style's own (confetti) or per toy (Blender: sparkle_delay, s) — the burst waits invisible until then
    const delay = opts.delay ?? d.sparkle_delay ?? st.delay ?? 0
    const lastWave = waveT ? Math.max(...waveT) : 0
    bursts.push({ points, vel, base, seed, st, t: 0, delay, waveT, lastWave })
  }

  const update = (dt) => {
    for (let b = bursts.length - 1; b >= 0; b--) {
      const s = bursts[b]
      const st = s.st
      const N = st.n
      s.t += dt
      const delay = s.delay
      if (s.t >= st.life + delay + (s.lastWave ?? 0)) {
        scene.remove(s.points)
        s.points.geometry.dispose()
        s.points.material.dispose()
        bursts.splice(b, 1)
        continue
      }
      const pos = s.points.geometry.attributes.position
      const col = s.points.geometry.attributes.color
      const tt = s.t - delay // waits (invisible) until the style's delay is over (confetti: until the lid is off)
      if (tt < 0) {
        s.points.visible = false
        continue
      }
      s.points.visible = true
      // st.hold (confetti): stay fully visible for that share of the life, then fade out linearly
      const fade = st.hold
        ? Math.min(1, tt / 0.08) * Math.min(1, (1 - tt / st.life) / (1 - st.hold))
        : Math.min(1, tt / 0.08) * (1 - tt / st.life) ** 1.3
      const drag = Math.exp(-st.drag * dt)
      for (let i = 0; i < N; i++) {
        if (s.waveT) {
          // sweep: each grain lives on its own stroke's clock
          const ti = tt - s.waveT[i]
          if (ti < 0 || ti > st.life) {
            col.array[i * 3] = col.array[i * 3 + 1] = col.array[i * 3 + 2] = 0
            continue
          }
          s.vel[i * 3 + 1] = Math.max(s.vel[i * 3 + 1] - st.gravity * dt, -st.terminal * (0.75 + 0.5 * (s.seed[i] / 10)))
          s.vel[i * 3] *= drag
          s.vel[i * 3 + 2] *= drag
          const swayW = st.sway * 2.4 * Math.cos(ti * 2.4 + s.seed[i] * 2.1)
          pos.array[i * 3] += (s.vel[i * 3] + swayW) * dt
          pos.array[i * 3 + 1] += s.vel[i * 3 + 1] * dt
          pos.array[i * 3 + 2] += s.vel[i * 3 + 2] * dt
          const k = Math.min(1, ti / 0.06) * (1 - ti / st.life) ** 1.3 * 0.9
          col.array[i * 3] = s.base[i * 3] * k
          col.array[i * 3 + 1] = s.base[i * 3 + 1] * k
          col.array[i * 3 + 2] = s.base[i * 3 + 2] * k
          continue
        }
        s.vel[i * 3 + 1] = Math.max(s.vel[i * 3 + 1] - st.gravity * dt, -st.terminal * (0.75 + 0.5 * (s.seed[i] / 10)))
        s.vel[i * 3] *= drag
        s.vel[i * 3 + 2] *= drag
        // snow sways from side to side as it drifts down
        const sway = st.sway ? st.sway * 2.4 * Math.cos(tt * 2.4 + s.seed[i] * 2.1) : 0
        pos.array[i * 3] += (s.vel[i * 3] + sway) * dt
        pos.array[i * 3 + 1] += s.vel[i * 3 + 1] * dt
        pos.array[i * 3 + 2] += s.vel[i * 3 + 2] * dt
        const tw = st.twinkle ? 0.45 + 0.55 * Math.sin(tt * st.twinkle + s.seed[i] * 6.3) ** 2 : 0.8
        let k = st.normal ? 1 : fade * tw // normal-blended bits fade by opacity (below), not by going dark
        if (st.flip) k *= 0.55 + 0.45 * Math.abs(Math.sin(tt * st.flip + s.seed[i] * 3.1)) // a petal turning over
        col.array[i * 3] = s.base[i * 3] * k
        col.array[i * 3 + 1] = s.base[i * 3 + 1] * k
        col.array[i * 3 + 2] = s.base[i * 3 + 2] * k
      }
      if (st.normal) s.points.material.opacity = fade
      pos.needsUpdate = true
      col.needsUpdate = true
    }
  }
  return { burst, update }
}
