import { useEffect, useRef, useState } from 'react'
import { CARDS } from './cards.jsx'

/**
 * Bottom drawer «Найденные слоны» (export/ui/hud_panel.webp): 12 slots, numbered like the elephants'
 * target_id. Hidden below the screen with only the title tab and the bow peeking out; slides up while the
 * mouse is near the bottom edge (or over the drawer), a tap on the tab toggles it (touch screens).
 * When an elephant is found the drawer comes up by itself for a moment and its slot lights up
 * (golden glow + golden elephant instead of the «?»); later the slots will get real elephant cards.
 */
// slot boxes in the picture (2154×419 px): centres of the 12 cards, outer width and top/bottom of the painted frames.
// 25.11: the painted cells were of different widths (cards 1, 2, 12 showed the empty frame at the sides) - the
// picture now has 12 identical cells (copies of cell 5, rim to rim 142 px) evenly spaced, badges moved with them.
const CX = [191, 352.5, 514.1, 675.6, 837.2, 998.7, 1160.3, 1321.8, 1483.4, 1644.9, 1806.5, 1968]
const W = 2154, H = 419, SW = 147, TOP = 182, BOT = 369
const SHOW_ON_FIND = 3200 // ms the drawer stays up after a find
// the open drawer folds away once the mouse goes above this line (share of its height from the top: the garland line
// under the title plate) - the bow and the title stick out above the game and must not keep it open
const KEEP_BELOW = 0.33

// pinned: a card opened from the drawer is being looked at - the drawer stays up until that card is closed
// (only for re-viewing from the drawer; a fresh find still comes up by itself and folds away after SHOW_ON_FIND)
export default function FoundPanel({ found, total = 12, last, onOpenCard, pinned = false }) {
  const [hover, setHover] = useState(false)
  const [auto, setAuto] = useState(false)
  const [flash, setFlash] = useState(null)
  const [landed, setLanded] = useState(() => new Set()) // slots whose card has already arrived
  const closeT = useRef(0)

  // a new find: come up, light the slot a moment later (the spark is flying to the counter meanwhile)
  useEffect(() => {
    if (!last) return
    setAuto(true)
    const a = setTimeout(() => { setFlash(last.id); setLanded((L) => new Set(L).add(last.id)) }, last.delay ?? 650)
    const b = setTimeout(() => setAuto(false), SHOW_ON_FIND)
    const c = setTimeout(() => setFlash(null), (last.delay ?? 650) + 1950)
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c) }
  }, [last])

  const enter = () => { clearTimeout(closeT.current); setHover(true) }
  const leave = () => { clearTimeout(closeT.current); closeT.current = setTimeout(() => setHover(false), 220) }
  const open = hover || auto || pinned
  const n = Math.min(CX.length, total || CX.length)

  return (
    <>
      <div className="fpanel-hot" onMouseEnter={enter} onMouseLeave={leave}
        onClick={() => { clearTimeout(closeT.current); setHover(true) }} onPointerDown={(e) => e.stopPropagation()} />
      <div className={`fpanel${open ? ' open' : ''}${pinned ? ' pinned' : ''}`} onMouseLeave={leave}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          if ((e.clientY - r.top) / r.height < KEEP_BELOW) leave()
          else enter()
        }}
        onClick={() => { if (!hover) { clearTimeout(closeT.current); setHover(true) } }}
        onPointerDown={(e) => e.stopPropagation()}>
        <img src="ui/hud_panel.webp" alt="" draggable={false} />
        {/* the title is live text in the game's main font (25.11: erased from the picture, the plate is empty) */}
        <div className="fpanel-title">Найденные слоны</div>
        {/* 25.11: a click on the title plate (the part that peeks out of the hidden drawer) brings the drawer up;
            folding it away is unchanged (mouse above the garland line / out of the drawer) */}
        <div className="fpanel-tab" title="Найденные слоны"
          onClick={(e) => { e.stopPropagation(); clearTimeout(closeT.current); setHover(true) }} />
        {CX.slice(0, n).map((cx, i) => {
          const id = i + 1
          const isFound = found.includes(id)
          // the newest find stays empty until its card (or golden elephant) "lands" in the slot
          const pending = last && last.id === id && !landed.has(id)
          const card = isFound && !pending && CARDS[id] ? CARDS[id] : null
          return (
            <div key={id} data-id={id}
              onClick={card ? (e) => { e.stopPropagation(); onOpenCard?.(id) } : undefined}
              className={`fslot${isFound && !pending ? ' found' : ''}${card ? ' has-card' : ''}${flash === id ? ' flash' : ''}`}
              style={{ left: `${((cx - SW / 2) / W) * 100}%`, width: `${(SW / W) * 100}%`, top: `${(TOP / H) * 100}%`, height: `${((BOT - TOP) / H) * 100}%` }}
              title={isFound ? `Слон №${id} найден` : `Слон №${id} ещё прячется`}>
              {card ? <img className="fcard" src={card.thumb} alt={card.title} draggable={false} />
                : isFound && !pending && <img src="ui/intro_icon.webp" alt="" draggable={false} />}
            </div>
          )
        })}
        {/* the number plates cut out of the drawer picture, laid over the slots: always in front of the cards */}
        <img className="fpanel-badges" src="ui/hud_panel_badges.webp" alt="" draggable={false} />
      </div>
    </>
  )
}
