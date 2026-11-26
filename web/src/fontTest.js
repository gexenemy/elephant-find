/**
 * Font test mode: one font for every piece of live text in the game (counter number, captions, start screen,
 * cards, reward, buttons). Text baked into pictures (logo) is not touched; «Найденные слоны» and «Найдено слонов:» are live text since 25.11.
 * Fonts live in export/ui/fonts. Pick one with ?font=<key>, ?font=off = the original fonts.
 * Keyboard (test only): Shift+F cycles through the list.
 */
export const FONTS = {
  // scale: size of the counter line «Найдено слонов: N / 12» (must fit the plaque); hudDy: vertical nudge of that line (em)
  // titleScale: size correction for the drawer title «Найденные слоны» (it must fit the painted plate)
  ethna: { family: 'Ethna Demo', url: 'ui/fonts/Ethna_Demo.ttf', scale: 1.17, hudDy: 0.01, titleScale: 0.9 },
}
const DEFAULT = 'ethna'

const keys = Object.keys(FONTS)
let current = new URLSearchParams(window.location.search).get('font') ?? DEFAULT

async function apply(key) {
  const root = document.documentElement
  const f = FONTS[key]
  if (!f) { root.classList.remove('font-test'); current = 'off'; return }
  if (![...document.fonts].some((x) => x.family === f.family)) {
    const face = new FontFace(f.family, `url(${f.url})`)
    document.fonts.add(face)
    try { await face.load() } catch (e) { console.warn('font load failed', key, e) }
  }
  root.style.setProperty('--test-font', `'${f.family}'`)
  root.style.setProperty('--test-scale', f.scale ?? 1)
  root.style.setProperty('--test-title-scale', f.titleScale ?? 1)
  root.style.setProperty('--test-hud-dy', `${f.hudDy ?? 0}em`)
  root.classList.add('font-test')
  current = key
}

apply(current)
window.addEventListener('keydown', (e) => {
  if (!(e.shiftKey && (e.key === 'F' || e.key === 'А'))) return
  const all = [...keys, 'off']
  apply(all[(all.indexOf(current) + 1) % all.length])
  console.info('font:', current)
})
