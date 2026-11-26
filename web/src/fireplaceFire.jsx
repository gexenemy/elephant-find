import { useEffect, useRef } from 'react'
import { IMG_W, IMG_H, FIRE_BOX, GLOW_BOX, loadFireAssets, drawFire, drawGlow } from './fireCore.js'

/**
 * Live fire in the painted fireplace (on by default; ?fire=0 switches it off).
 *
 * The painted flames are cut out of the painting into sprites (tools/fire_assets.py -> export/fire/);
 * this layer covers them with a clean firebox patch and draws them back alive: the big flame sways,
 * the small tongues rise and dissolve in a loop, sparks fly up into the chimney, and a second canvas
 * (mix-blend-mode: screen) makes the painted warm light around the fireplace breathe.
 * The drawing itself is in fireCore.js (shared with tools/fire_preview.html).
 */
export const fireEnabled = new URLSearchParams(window.location.search).get('fire') !== '0' // on by default; ?fire=0 = the painted still fire

export default function FireplaceFire({ frame }) {
  const glowRef = useRef(null)
  const fireRef = useRef(null)

  const s = Math.max(frame.fw / IMG_W, frame.fh / IMG_H)
  const offX = (frame.fw - IMG_W * s) / 2
  const offY = (frame.fh - IMG_H * s) / 2
  const rect = (B) => ({
    position: 'absolute', pointerEvents: 'none',
    left: offX + B.x0 * s, top: offY + B.y0 * s, width: (B.x1 - B.x0) * s, height: (B.y1 - B.y0) * s,
  })

  useEffect(() => {
    const gcv = glowRef.current
    const fcv = fireRef.current
    if (!gcv || !fcv) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const size = (cv, B) => {
      cv.width = Math.round((B.x1 - B.x0) * s * dpr)
      cv.height = Math.round((B.y1 - B.y0) * s * dpr)
    }
    size(fcv, FIRE_BOX)
    size(gcv, GLOW_BOX)
    const fc = fcv.getContext('2d')
    const gc = gcv.getContext('2d')
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let dead = false
    loadFireAssets('fire/').then((A) => {
      if (dead) return
      const draw = (now) => {
        const t = now / 1000
        drawFire(fc, A, t, s * dpr)
        drawGlow(gc, A, t, s * dpr)
        if (!reduce) raf = requestAnimationFrame(draw)
      }
      raf = requestAnimationFrame(draw)
    }).catch(() => {}) // no assets -> the painted fire simply stays as it is
    return () => { dead = true; cancelAnimationFrame(raf) }
  }, [s])

  return (
    <>
      <canvas ref={glowRef} className="fire-glow" style={{ ...rect(GLOW_BOX), mixBlendMode: 'screen' }} />
      <canvas ref={fireRef} className="fire-flames" style={rect(FIRE_BOX)} />
    </>
  )
}
