import * as THREE from 'three'

/**
 * Snow globe (Blender object with the custom property interactive = "snow_globe").
 * Click -> the globe wobbles on its base and the snow inside flies up, swirls around the house and slowly settles.
 *
 * Extras from Blender (object-local units, Blender axes: z up):
 *   globe_center [x, y, z]  centre of the glass ball      globe_radius  free radius inside the glass
 *   globe_floor             height of the top of the snow mound (it falls off towards the glass)
 * The snow is a THREE.Points child of the globe, so it tilts together with it. Flakes twinkle all the time
 * (each has its own rhythm; some catch the warm light of the fire), also while they lie on the ground.
 */
const N_FLAKES = 300
const FLAKE_SIZE = 0.0125 // PointsMaterial size; ~3 px on a 1080p frame at the globe's distance
const FALL = 0.075 // settling speed, local units / s (the ball is ~0.72 units across)
const SWIRL = 3.0 // rad / s right after a shake
const CALM = 2.4 // s, how fast the water calms down
const WOBBLE = { amp: 0.15, freq: 4.6, decay: 0.38, time: 1.6 } // rad, Hz, s, s

let flakeTexture = null
function getFlakeTexture() {
  if (flakeTexture) return flakeTexture
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.35, 'rgba(255,255,255,0.9)')
  gr.addColorStop(0.7, 'rgba(255,255,255,0.25)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  flakeTexture = new THREE.CanvasTexture(c)
  flakeTexture.colorSpace = THREE.SRGBColorSpace
  return flakeTexture
}

export function createSnowGlobe(root) {
  const d = root.userData
  const c = d.globe_center ?? [0, 0, 0.585]
  const C = new THREE.Vector3(c[0], c[2], -c[1]) // Blender (x, y, z) -> three (x, z, -y)
  const R = d.globe_radius ?? 0.36
  const floorTop = d.globe_floor ?? 0.405
  const floorY = (rho) => floorTop - 0.9 * rho * rho + 0.006 // surface of the snow mound

  const pos = new Float32Array(N_FLAKES * 3)
  const vel = new Float32Array(N_FLAKES * 3)
  const col = new Float32Array(N_FLAKES * 3)
  const rest = new Uint8Array(N_FLAKES)
  const seed = new Float32Array(N_FLAKES)
  for (let i = 0; i < N_FLAKES; i++) {
    const rho = 0.25 * Math.sqrt(Math.random())
    const a = Math.random() * Math.PI * 2
    pos[i * 3] = C.x + rho * Math.cos(a)
    pos[i * 3 + 2] = C.z + rho * Math.sin(a)
    pos[i * 3 + 1] = floorY(rho)
    rest[i] = 1
    seed[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.boundingSphere = new THREE.Sphere(C.clone(), R * 1.2)
  // FLAKE_SIZE was tuned for the globe on the floor at scale 0.2043; point size is in world units and does not follow
  // the object's scale, so scale it with the globe (22.11: moved onto the table at 0.0941)
  root.updateWorldMatrix(true, false)
  const sizeK = root.getWorldScale(new THREE.Vector3()).x / 0.2043
  const mat = new THREE.PointsMaterial({
    size: FLAKE_SIZE * sizeK, sizeAttenuation: true, map: getFlakeTexture(), vertexColors: true,
    transparent: true, depthWrite: false, toneMapped: false,
  })
  const points = new THREE.Points(geo, mat)
  points.name = `${root.name}_Snow`
  points.raycast = () => {} // never blocks clicks
  points.renderOrder = 4 // before the glass (6), so the glints stay on top of the snow
  root.add(points)

  const baseRot = root.rotation.clone()
  let energy = 0 // 1 right after a shake -> 0 calm water
  let shakeT = Infinity // seconds since the last shake
  let moving = 0

  function shake() {
    energy = 1
    shakeT = 0
    for (let i = 0; i < N_FLAKES; i++) {
      rest[i] = 0
      const a = Math.random() * Math.PI * 2
      const s = 0.25 + 0.55 * Math.random()
      vel[i * 3] = Math.cos(a) * s * 0.6
      vel[i * 3 + 1] = 0.5 + 0.9 * Math.random()
      vel[i * 3 + 2] = Math.sin(a) * s * 0.6
    }
    moving = N_FLAKES
  }

  function update(dtRaw, t) {
    const dt = Math.min(dtRaw, 0.05)
    // the globe rocks on its base and comes to rest
    if (shakeT < WOBBLE.time) {
      shakeT += dt
      const k = Math.exp(-shakeT / WOBBLE.decay) * (shakeT < WOBBLE.time ? 1 : 0)
      root.rotation.z = baseRot.z + WOBBLE.amp * k * Math.sin(2 * Math.PI * WOBBLE.freq * shakeT)
      root.rotation.x = baseRot.x + 0.35 * WOBBLE.amp * k * Math.sin(2 * Math.PI * WOBBLE.freq * 0.8 * shakeT + 1)
      if (shakeT >= WOBBLE.time) root.rotation.copy(baseRot)
    }
    if (moving > 0) {
      energy *= Math.exp(-dt / CALM)
      moving = 0
      for (let i = 0; i < N_FLAKES; i++) {
        if (rest[i]) continue
        moving++
        const j = i * 3
        const rx = pos[j] - C.x
        const ry = pos[j + 1] - C.y
        const rz = pos[j + 2] - C.z
        const rho = Math.hypot(rx, rz)
        // water: whirl around the vertical axis + turbulence that carries the flakes all over the ball + a rising gust
        const sd = seed[i]
        const w = SWIRL * energy * (0.6 + 0.8 * sd)
        const tu = 0.1 + 0.42 * energy
        const pull = rho > 0.8 * R ? -0.5 * (rho / R - 0.8) : 0 // keeps the flakes off the glass
        const inv = rho > 1e-4 ? 1 / rho : 0
        const ux = w * rz + pull * rx * inv + tu * (Math.sin(t * 2.3 + sd * 40 + ry * 9) + 0.6 * Math.sin(t * 4.1 + sd * 91))
        const uz = -w * rx + pull * rz * inv + tu * (Math.cos(t * 1.9 + sd * 31 + ry * 7) + 0.6 * Math.sin(t * 3.7 + sd * 67))
        const uy = 0.5 * energy * energy + tu * 0.8 * Math.sin(t * 2.7 + sd * 17 + rx * 8) - FALL * (0.7 + 0.6 * sd) * (1 - 0.6 * energy)
        const k = Math.min(1, 3.2 * dt)
        vel[j] += (ux - vel[j]) * k
        vel[j + 1] += (uy - vel[j + 1]) * k
        vel[j + 2] += (uz - vel[j + 2]) * k
        let x = rx + vel[j] * dt
        let y = ry + vel[j + 1] * dt
        let z = rz + vel[j + 2] * dt
        // glass
        const r = Math.hypot(x, y, z)
        const lim = R * 0.96
        if (r > lim) {
          const nx = x / r, ny = y / r, nz = z / r
          x = nx * lim; y = ny * lim; z = nz * lim
          const vn = vel[j] * nx + vel[j + 1] * ny + vel[j + 2] * nz
          if (vn > 0) { vel[j] -= vn * nx; vel[j + 1] -= vn * ny; vel[j + 2] -= vn * nz }
        }
        // snow mound: flakes land once the water is calm enough
        const fy = floorY(Math.hypot(x, z)) - C.y
        if (y < fy) {
          y = fy
          if (energy < 0.35 && vel[j + 1] <= 0) { rest[i] = 1; vel[j] = vel[j + 1] = vel[j + 2] = 0 } else vel[j + 1] = 0.1 + 0.3 * energy * seed[i] // swept up again
        }
        pos[j] = C.x + x
        pos[j + 1] = C.y + y
        pos[j + 2] = C.z + z
      }
      geo.attributes.position.needsUpdate = true
    }
    // twinkle: every flake glints now and then; every 4th one catches the warm firelight
    for (let i = 0; i < N_FLAKES; i++) {
      const s = seed[i]
      const g = Math.max(0, Math.sin(t * (1.6 + 2.6 * s) + s * 50)) ** 10
      const b = (rest[i] ? 0.5 : 0.62) + 0.5 * g
      const warm = i % 4 === 0 ? g : 0
      col[i * 3] = Math.min(1, b * (0.9 + 0.1 * warm))
      col[i * 3 + 1] = Math.min(1, b * (0.94 - 0.14 * warm))
      col[i * 3 + 2] = Math.min(1, b * (1.0 - 0.45 * warm))
    }
    geo.attributes.color.needsUpdate = true
  }

  return { root, points, shake, update }
}

/** Finds every snow globe in the loaded scene (once) and returns their controllers. */
export function setupSnowGlobes(scene) {
  if (scene.userData.__globes) return scene.userData.__globes
  const globes = []
  scene.traverse((o) => {
    if (o.userData?.interactive === 'snow_globe') globes.push(o)
  })
  scene.userData.__globes = globes.map(createSnowGlobe)
  return scene.userData.__globes
}

/** Walks up to the interactive object a clicked mesh belongs to. */
export function interactiveRoot(obj) {
  for (let o = obj; o; o = o.parent) if (o.userData?.interactive) return o
  return null
}
