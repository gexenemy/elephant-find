import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Project layout:  FinderGame/finder_room_blockout.blend, FinderGame/export/finder_room.glb, FinderGame/web (this app)
const projectRoot = path.resolve(__dirname, '..')

// Dev-only: serve ../renders and ../refs under /__ref/ for the reference overlay (key R in ?debug mode).
function serveReferences() {
  return {
    name: 'serve-references',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__ref', (req, res, next) => {
        const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '')
        const file = path.resolve(projectRoot, rel)
        const allowed = ['renders', 'refs'].some((d) => file.startsWith(path.join(projectRoot, d) + path.sep))
        if (!allowed || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : 'image/jpeg')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  // Relative base: the built site works from any sub-folder (GitHub Pages serves it at /elephant-find/).
  base: './',
  plugins: [react(), serveReferences()],
  // The GLB is read straight from Blender's export folder: re-export in Blender, reload the page.
  publicDir: path.join(projectRoot, 'export'),
})
