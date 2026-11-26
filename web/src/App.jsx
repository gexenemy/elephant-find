import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import FinderScene from './FinderScene.jsx'
import { params } from './sceneSetup.js'
import { buildReport } from './debugReport.js'
import { toggleFullscreen, useFrameLayout } from './frameLayout.js'
import WindowSnow, { snowEnabled } from './windowSnow.jsx'
import TreeLights from './treeLights.jsx'
import FireplaceFire, { fireEnabled } from './fireplaceFire.jsx'
import RewardCard from './rewardCard.jsx'
import FoundFx from './foundFx.jsx'
import Intro from './intro.jsx'
import FoundPanel from './foundPanel.jsx'
import './fontTest.js' // test: one font for all live text (?font=off = original fonts, Shift+F = next)
import './mittenCursor.js' // knitted-mitten cursor with stars (?cursor=0 = ordinary cursor)
import { CARDS, CardReveal, CardViewer } from './cards.jsx'

// With post-processing the tone mapping runs as the last effect (after bloom), not in the renderer.
const POST_TONE_MAPPINGS = {
  agx: ToneMappingMode.AGX,
  neutral: ToneMappingMode.NEUTRAL,
  aces: ToneMappingMode.ACES_FILMIC,
  none: ToneMappingMode.LINEAR,
}

const TONE_MAPPINGS = {
  agx: THREE.AgXToneMapping, // Blender's default view transform
  neutral: THREE.NeutralToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  none: THREE.NoToneMapping,
}

export default function App() {
  const [ready, setReady] = useState(null)
  const [found, setFound] = useState([])
  const [report, setReport] = useState(null)
  const [showRef, setShowRef] = useState(false)

  const onReady = useCallback((r) => {
    setReady(r)
    window.__finder = r // for poking around in the browser console
  }, [])
  // found an elephant: celebration at the click point + spark into the counter (foundFx.jsx)
  const fx = useRef(null)
  const totalRef = useRef(0)
  const foundCount = useRef(0) // finds so far (each elephant is found only once: FinderScene checks found)
  const [lastFound, setLastFound] = useState(null) // { id } of the latest find: the drawer comes up and lights it
  const [cardWait, setCardWait] = useState(0) // cards waiting for their elephant's animation
  const [reveal, setReveal] = useState(null) // { id, at }: card shown after a find (cards.jsx)
  const [viewCard, setViewCard] = useState(null) // id of the card opened from the drawer
  const onFound = useCallback((t, at, showTime = 0) => {
    const id = t.userData.target_id
    // the card comes only after the elephant's own animation has played to the end (+ a short pause)
    if (CARDS[id]) {
      setCardWait((n) => n + 1) // the reward for the last elephant waits for its card too
      setTimeout(() => { setCardWait((n) => n - 1); setReveal({ id, at }) }, Math.max(700, showTime * 1000 + 450))
    }
    else setLastFound({ id })
    // the burst is started outside the state updater: React StrictMode runs updaters twice (two bursts in dev)
    foundCount.current += 1
    const n = foundCount.current
    setFound((f) => [...f, t.userData.target_id])
    if (at) setTimeout(() => fx.current?.burst(at.x, at.y, n, totalRef.current, at.box), 0)
  }, [])
  // reward: the greeting card once every elephant is found (rewardCard.jsx); ?reward=1 previews it
  const [reward, setReward] = useState(false)
  const [started, setStarted] = useState(false) // start screen passed (intro.jsx)
  const [rewardSeen, setRewardSeen] = useState(false)
  const closeReward = useCallback(() => { setReward(false); setRewardSeen(true) }, [])

  useEffect(() => {
    if (!ready || !params.debug) return
    const id = setTimeout(() => setReport(buildReport(ready)), 500) // after a few frames, so gl.info is filled
    return () => clearTimeout(id)
  }, [ready])

  useEffect(() => {
    const key = (e) => {
      const k = e.key.toLowerCase()
      if (k === 'f' || k === 'а') toggleFullscreen() // F (or the same key in the Russian layout)
      if (params.debug && (k === 'r' || k === 'к')) setShowRef((v) => !v)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const [isFull, setIsFull] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const hybrid = params.mode === 'hybrid'
  const BG = 'bg_room_wide.jpg'
  // The frame is 16:9 (painting) or 3:2 (full-3D render); see frameLayout.js for how it fills the window.
  // Painting mode: full width, pinned to the top, only the bottom may be cut (computeTopFitLayout).
  const frame = useFrameLayout(hybrid ? 16 / 9 : 3 / 2, params.maxCrop, hybrid ? params.maxBottomCrop : null)
  const total = ready?.targets.length ?? (hybrid ? 1 : 11)
  totalRef.current = total
  const allFound = !!ready && total > 0 && found.length >= total
  useEffect(() => {
    if (!ready) return
    ready.showReward = () => setReward(true) // for testing from the console
    if (started && new URLSearchParams(window.location.search).get('reward') === '1') {
      const id = setTimeout(() => setReward(true), 1200)
      return () => clearTimeout(id)
    }
  }, [ready, started])
  useEffect(() => {
    if (!allFound || rewardSeen || reveal || cardWait) return
    const id = setTimeout(() => setReward(true), 1800) // let the last elephant finish its little show
    return () => clearTimeout(id)
  }, [allFound, rewardSeen, reveal, cardWait])
  return (
    <div className={hybrid ? 'viewport top' : 'viewport'}>
      {/* fills whatever the frame does not cover with a blurred, darkened copy of the room instead of black bars */}
      {hybrid && <div className="backdrop" style={{ backgroundImage: `url(${BG})` }} />}
      <div className="stage" style={{ width: frame.vw, height: frame.vh }}>
        <div className="frame" style={{ left: -frame.ox, top: -frame.oy, width: frame.fw, height: frame.fh }}>
          {hybrid && <img className="bg" src={BG} alt="" draggable={false} />}
          {/* light snow behind the window glass, glinting in the moonlight (painted moon is in the bg) */}
          {hybrid && snowEnabled && <WindowSnow frame={frame} />}
          {/* live multicoloured garland on the tree (painted bulbs removed from the bg by tools/garland_off.py) */}
          {hybrid && <TreeLights frame={frame} />}
          {/* live fire (on by default, ?fire=0 = off) in the painted fireplace - swaying flame, rising tongues, sparks, breathing light */}
          {hybrid && fireEnabled && <FireplaceFire frame={frame} />}
          {showRef && <img className="ref" src={hybrid ? '/__ref/renders/hybrid_composite_wide.png' : '/__ref/renders/render_main.png'} alt="" />}
        </div>
        <Canvas
          shadows={params.shadows && (hybrid ? 'percentage' : true)} // hybrid: PCF with a wide radius = soft shadows, closer to Cycles on the painting
          dpr={[1, 2]}
          gl={{ alpha: hybrid }} // hybrid: transparent canvas over the painted room
          onCreated={({ gl }) => {
            gl.toneMapping = TONE_MAPPINGS[params.toneMapping] ?? THREE.AgXToneMapping
            gl.toneMappingExposure = params.exposure
          }}
        >
          <Suspense fallback={null}>
            <FinderScene onReady={onReady} onFound={onFound} frame={frame} />
          </Suspense>
          {params.bloom && (
            <EffectComposer multisampling={4} ref={(c) => (window.__composer = c)}>
              <Bloom
                mipmapBlur
                intensity={params.bloomIntensity}
                luminanceThreshold={params.bloomThreshold}
                luminanceSmoothing={0.3}
                radius={params.bloomRadius}
              />
              <ToneMapping mode={POST_TONE_MAPPINGS[params.toneMapping] ?? ToneMappingMode.AGX} />
            </EffectComposer>
          )}
        </Canvas>
        {!ready && <div className="loading">Загрузка сцены…</div>}
        {ready && (
          <div className="hud hud-plaque" title={`Найдено слонов: ${found.length} из ${total}`}>
            <img src="ui/hud_counter.webp" alt="" draggable={false} />
            {/* 25.11: the whole line is live text in the main font (the painted «Найдено слонов:» was erased) */}
            <div className="hud-line">
              <span className="hud-label">Найдено слонов:</span>
              <span key={found.length} className={`hud-num${found.length ? ' pop' : ''}`}>
                {found.length}{'\u2009/\u2009'}{total}
              </span>
            </div>
          </div>
        )}
        {rewardSeen && !reward && (
          <button className="reward-again" onClick={() => setReward(true)}>🎁 Открытка</button>
        )}
        {!isFull && (
          <button className="fullscreen" onClick={toggleFullscreen} title="На весь экран (F)">⛶</button>
        )}
        {report && (
          <div className="debug">
            {(hybrid ? 'режим: рисунок + 3D\n' : '') + 'R — наложить рендер Blender, F — весь экран\n' + `кадр ${Math.round(frame.fw)}×${Math.round(frame.fh)}, видно ${Math.round(frame.vw)}×${Math.round(frame.vh)} (обрезано ${Math.round((1 - frame.vw / frame.fw) * 100)}% / ${Math.round((1 - frame.vh / frame.fh) * 100)}%)\n`}
            {report.map(([ok, text], i) => (
              <div key={i} className={ok ? 'ok' : 'bad'}>{(ok ? '✓ ' : '✗ ') + text}</div>
            ))}
          </div>
        )}
      </div>
      {ready && <FoundPanel found={found} total={total} last={lastFound} onOpenCard={setViewCard} pinned={!!viewCard} />}
      {reveal && (
        <CardReveal key={reveal.id} id={reveal.id} at={reveal.at}
          onFly={() => setLastFound({ id: reveal.id, delay: 1150 })} onDone={() => setReveal(null)} />
      )}
      {viewCard && <CardViewer key={viewCard} id={viewCard} onClose={() => setViewCard(null)} />}
      <FoundFx ref={fx} />
      <RewardCard open={reward} total={total} onClose={closeReward} />
      <Intro ready={!!ready} onStart={() => setStarted(true)} />
    </div>
  )
}
