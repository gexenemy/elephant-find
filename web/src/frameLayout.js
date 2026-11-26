import { useEffect, useState } from 'react'

/**
 * Where the fixed-aspect game frame (16:9 painting, 3:2 full-3D render) sits in the browser window.
 *
 * The browser window is almost never exactly 16:9 (address bar, tabs, taskbar), so a plain "contain" fit
 * leaves black bars. Here the frame is scaled up past "contain" until it covers the window, but at most
 * `maxCrop` of the frame may be cut off per axis (half on each side) so hidden objects near the edges stay
 * on screen. Whatever is still left over is filled by the blurred backdrop, not black.
 *
 * Returns (CSS px):
 *   fw, fh  size of the whole frame
 *   vw, vh  visible part of it = the stage / canvas size
 *   ox, oy  how much of the frame is cut off on the left / top
 */
export function computeFrameLayout(winW, winH, aspect, maxCrop) {
  const containW = Math.min(winW, winH * aspect)
  const coverW = Math.max(winW, winH * aspect)
  const fw = Math.min(coverW, containW / (1 - maxCrop))
  const fh = fw / aspect
  const vw = Math.min(winW, fw)
  const vh = Math.min(winH, fh)
  return { fw, fh, vw, vh, ox: (fw - vw) / 2, oy: (fh - vh) / 2 }
}

/**
 * Painting mode (decision of the author, 22.11): the frame is pinned to its top-left corner and always fills the
 * window width; when the window is wider than 16:9 (browser tabs, address bar, taskbar), only the BOTTOM of the
 * painting is cut off — the top (shelves, top of the bookcase) is never cut, nor are the sides. The bottom cut is
 * limited to `maxBottomCrop` of the frame height; for even wider windows the frame shrinks to that limit and the
 * blurred backdrop shows at the sides. A window taller than the frame shows the whole frame at the top, backdrop below.
 */
export function computeTopFitLayout(winW, winH, aspect, maxBottomCrop) {
  let fw = winW
  let fh = fw / aspect
  if (fh * (1 - maxBottomCrop) > winH) {
    fh = winH / (1 - maxBottomCrop)
    fw = fh * aspect
  }
  return { fw, fh, vw: fw, vh: Math.min(winH, fh), ox: 0, oy: 0 }
}

export function useFrameLayout(aspect, maxCrop, maxBottomCrop = null) {
  const get = () =>
    maxBottomCrop != null
      ? computeTopFitLayout(window.innerWidth, window.innerHeight, aspect, maxBottomCrop)
      : computeFrameLayout(window.innerWidth, window.innerHeight, aspect, maxCrop)
  const [layout, setLayout] = useState(get)
  useEffect(() => {
    const onResize = () => setLayout(get())
    window.addEventListener('resize', onResize)
    document.addEventListener('fullscreenchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onResize)
    }
  }, [aspect, maxCrop, maxBottomCrop]) // eslint-disable-line react-hooks/exhaustive-deps
  return layout
}

/** Fullscreen on a 16:9 monitor = the frame fits exactly, nothing cut, no bars. */
export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.()
  else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {})
}
