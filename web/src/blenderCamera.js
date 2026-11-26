import * as THREE from 'three'

/**
 * glTF stores only the vertical FOV, so the Blender lens shift and sensor fit are passed in extras
 * (CAM_Main.userData: cam_shift_x/y, cam_sensor_fit, cam_hfov_deg). Without the shift the whole
 * scene sits lower than in the Blender render.
 *
 * `frame` (from frameLayout.js) describes the whole Blender frame when only part of it is visible:
 * the canvas (width × height) shows the window (ox, oy, width, height) of a fw × fh frame — the same
 * crop the CSS applies to the painted background, so 3D and painting stay locked together.
 */
export function applyBlenderCamera(camera, width, height, frame) {
  const ex = camera.userData
  const fw = frame?.fw ?? width
  const fh = frame?.fh ?? height
  const ox = frame?.ox ?? 0
  const oy = frame?.oy ?? 0
  const aspect = fw / fh
  camera.aspect = aspect

  // Blender frames the shot with a horizontal sensor fit: keep the horizontal FOV constant.
  if (ex.cam_sensor_fit !== 'VERTICAL' && ex.cam_hfov_deg) {
    const halfH = THREE.MathUtils.degToRad(ex.cam_hfov_deg) / 2
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfH) / aspect))
  }

  // Blender shift is a fraction of the sensor-fit dimension (width for HORIZONTAL, larger side for AUTO).
  const ref = ex.cam_sensor_fit === 'VERTICAL' ? fh : ex.cam_sensor_fit === 'HORIZONTAL' ? fw : Math.max(fw, fh)
  const sx = (ex.cam_shift_x ?? 0) * ref
  const sy = -(ex.cam_shift_y ?? 0) * ref
  if (sx || sy || ox || oy || width !== fw || height !== fh) camera.setViewOffset(fw, fh, sx + ox, sy + oy, width, height)
  else camera.clearViewOffset()
  camera.updateProjectionMatrix()
}
