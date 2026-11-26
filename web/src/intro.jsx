import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Start screen: «Новогодняя охота на слонов».
 * The game loads behind it (blurred and dimmed through backdrop-filter, the room "appears" as it loads),
 * snow falls, the logo floats and glows; a golden bar fills with the REAL loading progress of hybrid.glb
 * (FinderScene sends window event 'finder:progress'), the little steam train drives at its edge.
 * When everything is ready the bar flashes, the train puffs and the «Начать» button pops up;
 * a click (or Enter / Space) lifts the blur and lets the player in.
 *
 * Smoothness: while the GLB is unpacked the main thread is blocked for seconds, so nothing here is animated
 * from JS frames. The progress is only written as a CSS variable --p (with a transition time --dur) on the
 * bar; fill and train both move by `transform` with the same transition, which the compositor plays on its
 * own: they stay in step and keep gliding even while JS is frozen. Snow is DOM + CSS for the same reason.
 * Images: export/ui/intro_*.webp (sources in incoming/ui). URL ?intro=0 skips the screen.
 */
const Q = new URLSearchParams(window.location.search)
export const introEnabled = Q.get('intro') !== '0'
// ?introDemo=1: a slow fake download (8 s) + unpacking (3 s) instead of the real one - to look at the bar
const DEMO = Q.get('introDemo') === '1'

const TIPS = [
  ['Совет: присмотрись к деталям!', 'Слоны могут прятаться среди игрушек, подарков и украшений.'],
  ['Совет: кликай по игрушкам!', 'Многие игрушки оживают от прикосновения — а за некоторыми прячутся слоны.'],
  ['Совет: загляни повыше!', 'Полки, шкаф, камин и даже верхушка ёлки — проверь всё.'],
  ['Совет: не торопись!', 'Иногда от слона виден только кончик хобота или хвостик.'],
]
const DL = 0.85 // share of the bar for downloading the scene file
const UNPACK = 0.97 // where the bar glides to while the scene is unpacked (it gets there slowly, on the compositor)
const UNPACK_TIME = 7 // s

export default function Intro({ ready, onStart }) {
  const [shown, setShown] = useState(introEnabled)
  const [leaving, setLeaving] = useState(false)
  const [done, setDone] = useState(false)
  const [tip, setTip] = useState(0)
  const bar = useRef(null)
  const st = useRef({ p: 0, t0: performance.now(), dl: false, full: false })

  // writes the progress for CSS; dur = how long the compositor takes to glide there
  const setP = (p, dur, ease = 'linear') => {
    const el = bar.current
    const S = st.current
    if (!el || p <= S.p) return
    S.p = p
    el.style.setProperty('--dur', `${dur}s`)
    el.style.setProperty('--ease', ease)
    el.style.setProperty('--p', p.toFixed(4))
  }

  useEffect(() => {
    if (!shown) return
    const S = st.current
    const on = (e) => {
      if (e.detail.stage === 'warm') { // textures uploaded / shaders compiled in FinderScene
        const { k, n } = e.detail
        if (S.dl) setP(DL + (UNPACK - DL) * (k / n), 0.4)
        return
      }
      const { loaded, total } = e.detail
      if (!(total > 0) || S.dl) return
      if (loaded >= total) {
        S.dl = true
        setP(DL, 0.35)
        // unpacking: a slow glide towards 97 % on the compositor (covers the parse); the warm-up steps push it on
        setTimeout(() => setP(DL + (UNPACK - DL) * 0.35, UNPACK_TIME, 'cubic-bezier(.1,.6,.3,1)'), 380)
      } else setP((DL * loaded) / total, 0.45)
    }
    if (DEMO) {
      let k = 0
      const id = setInterval(() => {
        k++
        on({ detail: { loaded: Math.min(1, k / 32) * 100, total: 100 } })
        if (k >= 32) clearInterval(id)
      }, 250)
      return () => clearInterval(id)
    }
    window.addEventListener('finder:progress', on)
    return () => window.removeEventListener('finder:progress', on)
  }, [shown])

  // scene ready -> run to the end (at least 1.5 s after the screen appeared), then the button
  useEffect(() => {
    if (!shown || !ready) return
    const S = st.current
    const wait = Math.max(0, (DEMO ? 11000 : 1500) - (performance.now() - S.t0))
    const id = setTimeout(() => {
      if (!S.dl) setP(DL, 0.3)
      S.dl = true
      requestAnimationFrame(() => { S.p = Math.min(S.p, 0.999); setP(1, 0.6, 'ease-out') })
      setTimeout(() => setDone(true), 750)
    }, wait)
    return () => clearTimeout(id)
  }, [shown, ready])

  useEffect(() => {
    if (!shown) return
    const id = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 5200)
    return () => clearInterval(id)
  }, [shown])

  const start = () => {
    if (!done || leaving) return
    setLeaving(true)
    setTimeout(() => { setShown(false); onStart?.() }, 950)
  }
  useEffect(() => {
    if (!done) return
    const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  useEffect(() => { if (!introEnabled) onStart?.() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // snow: 110 flakes with their own size, speed, sway and start moment
  const flakes = useMemo(() => Array.from({ length: 110 }, (_, i) => {
    const d = Math.random()
    const r = 1.4 + d * 4.2
    return (
      <i key={i} style={{
        left: `${Math.random() * 100}%`, width: r, height: r, opacity: 0.3 + d * 0.6,
        '--t': `${(22 - d * 12).toFixed(1)}s`, '--d': `${(-Math.random() * 22).toFixed(1)}s`, '--sx': `${((Math.random() - 0.5) * 6).toFixed(1)}vw`,
      }} />
    )
  }), [])

  if (!shown) return null
  return (
    <div className={`intro${done ? ' done' : ''}${leaving ? ' leaving' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="intro-snow">{flakes}</div>
      <div className="intro-col">
        <div className="intro-logo-wrap">
          <img className="intro-logo" src="ui/intro_logo.webp" alt="Новогодняя охота на слонов" draggable={false} />
        </div>
        <div className="intro-status">{done ? 'Все слоны спрятались!' : <>Загружаем слонов<span className="intro-dots"><i>.</i><i>.</i><i>.</i></span></>}</div>
        <div className="intro-bar" ref={bar}>
          <img src="ui/intro_bar.webp" alt="" draggable={false} />
          <div className="intro-track">
            <div className="intro-fill">
              <div className="intro-flakes" />
              <div className="intro-edge" />
            </div>
            <div className="intro-flash" />
          </div>
          <div className="intro-rail">
            <div className="intro-train">
              <img src="ui/intro_train.webp" alt="" draggable={false} />
              <span className="puff p1" /><span className="puff p2" /><span className="puff p3" />
            </div>
          </div>
        </div>
        <div className="intro-start-slot">
          {done && <button className="intro-start" onClick={start}>Начать</button>}
        </div>
        <div className="intro-divider"><i /><img src="ui/intro_icon.webp" alt="" draggable={false} /><i /></div>
        <div className="intro-tip" key={tip}>
          <b>{TIPS[tip][0]}</b>
          <span>{TIPS[tip][1]}</span>
        </div>
      </div>
    </div>
  )
}
