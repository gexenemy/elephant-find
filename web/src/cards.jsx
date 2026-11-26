import { useEffect, useRef, useState } from 'react'

/**
 * Elephant cards (export/ui/cards/card_NN.webp + _thumb): shown when the elephant is found, then kept in its
 * slot of the bottom drawer; a click on the slot opens the card big (CardViewer).
 * Each card lists its painted stars and snowflakes (x, y in % of the card, r in % of its width) - they
 * twinkle softly on top of the picture (CSS only).
 */
const tw = (kind, x, y, r, W = 1051, H = 1409) => ({ kind, x: (x / W) * 100, y: (y / H) * 100, r: (r / W) * 100 })
// cards of another size (w, h in the entry): twinkles in their own pixels
const twIn = (W, H) => (kind, x, y, r) => tw(kind, x, y, r, W, H)
const tw5 = twIn(1063, 1414) // card 5 came 0.8 % wider; shown in the standard box, stars in its own pixels
export const CARDS = {
  1: {
    title: 'Слон со свечой',
    src: 'ui/cards/card_01.webp',
    thumb: 'ui/cards/card_01_thumb.webp',
    twinkles: [
      tw('flake', 185, 299, 47), tw('flake', 890, 463, 47), tw('flake', 152, 620, 40), tw('flake', 867, 785, 42),
      tw('flake', 215, 985, 45), tw('flake', 864, 1000, 41), tw('flake', 696, 284, 22),
      tw('star', 847, 287, 42), tw('star', 167, 472, 42), tw('star', 162, 833, 38), tw('star', 909, 641, 31),
      tw('star', 801, 885, 26), tw('star', 301, 245, 22), tw('star', 774, 390, 21), tw('star', 162, 1066, 21),
      tw('star', 213, 738, 16), tw('star', 796, 1067, 15), tw('star', 947, 929, 13), tw('star', 869, 568, 10),
      tw('star', 241, 385, 10), tw('star', 104, 925, 9), tw('star', 291, 443, 8), tw('star', 303, 805, 7),
      tw('star', 757, 234, 6), tw('star', 768, 1009, 6), tw('star', 715, 1085, 5), tw('star', 931, 307, 5),
      tw('star', 912, 392, 4), tw('star', 99, 361, 4), tw('star', 100, 419, 4), tw('star', 93, 552, 4),
      tw('star', 109, 739, 4), tw('star', 947, 716, 4), tw('star', 959, 831, 3), tw('star', 901, 862, 4),
      tw('star', 889, 910, 4), tw('star', 91, 1022, 4), tw('star', 311, 1088, 4), tw('star', 871, 1091, 4),
      tw('star', 730, 340, 5), tw('star', 309, 354, 4),
    ],
  },
  2: {
    title: 'Слон на лошадке-качалке',
    src: 'ui/cards/card_02.webp',
    thumb: 'ui/cards/card_02_thumb.webp',
    twinkles: [
      tw('flake', 183, 297, 46), tw('flake', 880, 503, 48),
      tw('star', 841, 285, 44), tw('star', 169, 812, 40), tw('star', 330, 248, 24), tw('star', 128, 466, 28),
      tw('star', 928, 647, 25), tw('star', 941, 915, 19), tw('star', 100, 917, 15), tw('star', 448, 980, 13),
      tw('star', 558, 1023, 14), tw('star', 803, 597, 14), tw('star', 213, 420, 14), tw('star', 958, 426, 12),
      tw('star', 223, 895, 10), tw('star', 932, 308, 8),
    ],
  },
  3: {
    title: 'Слон в кораблике',
    src: 'ui/cards/card_03.webp',
    thumb: 'ui/cards/card_03_thumb.webp',
    twinkles: [
      tw('flake', 183, 296, 46), tw('flake', 880, 503, 48),
      tw('star', 843, 298, 44), tw('star', 347, 308, 36), tw('star', 158, 487, 36), tw('star', 928, 649, 25),
      tw('star', 275, 415, 15), tw('star', 761, 424, 16), tw('star', 958, 426, 12), tw('star', 220, 604, 15),
      tw('star', 804, 601, 14), tw('star', 142, 658, 18), tw('star', 939, 916, 18), tw('star', 97, 924, 16),
      tw('star', 124, 1020, 11), tw('star', 932, 308, 7), tw('star', 94, 366, 6), tw('star', 914, 1032, 6),
    ],
  },
  4: {
    title: 'Слон в носке',
    src: 'ui/cards/card_04.webp',
    thumb: 'ui/cards/card_04_thumb.webp',
    twinkles: [
      tw('flake', 185, 296, 46), tw('flake', 897, 502, 48), tw('flake', 211, 604, 44), tw('flake', 836, 740, 54),
      tw('flake', 286, 844, 19), tw('flake', 145, 911, 29), tw('flake', 818, 969, 35),
      tw('star', 855, 282, 44), tw('star', 128, 463, 38), tw('star', 178, 759, 46), tw('star', 207, 999, 34),
      tw('star', 927, 397, 23), tw('star', 822, 597, 27), tw('star', 935, 665, 24), tw('star', 304, 706, 22),
      tw('star', 891, 848, 22), tw('star', 935, 925, 20), tw('star', 737, 1065, 28), tw('star', 301, 236, 15),
      tw('star', 209, 405, 18), tw('star', 253, 521, 16), tw('star', 793, 527, 13), tw('star', 737, 795, 17),
      tw('star', 905, 1062, 15), tw('star', 145, 1072, 16), tw('star', 95, 537, 10), tw('star', 96, 345, 8),
      tw('star', 136, 671, 8), tw('star', 794, 856, 9), tw('star', 856, 1096, 8), tw('star', 779, 237, 6),
      tw('star', 950, 591, 6),
    ],
  },
  5: {
    title: 'Слон в стеклянном шаре',
    src: 'ui/cards/card_05.webp',
    thumb: 'ui/cards/card_05_thumb.webp',
    twinkles: [
      tw5('flake', 206, 356, 62), tw5('flake', 866, 313, 60), tw5('flake', 343, 447, 32), tw5('flake', 146, 638, 36),
      tw5('flake', 891, 533, 37), tw5('flake', 126, 901, 33), tw5('flake', 940, 888, 32), tw5('flake', 160, 1069, 33),
      tw5('flake', 900, 1055, 39), tw5('star', 349, 284, 50), tw5('star', 765, 435, 62), tw5('star', 688, 308, 36),
      tw5('star', 758, 245, 26), tw5('star', 187, 232, 21), tw5('star', 402, 372, 24), tw5('star', 950, 404, 29),
      tw5('star', 112, 464, 32), tw5('star', 797, 572, 23), tw5('star', 919, 689, 45), tw5('star', 108, 738, 30),
      tw5('star', 951, 781, 22), tw5('star', 825, 1222, 33), tw5('star', 219, 1226, 28), tw5('star', 952, 608, 17),
      tw5('star', 883, 958, 18), tw5('star', 957, 985, 16), tw5('star', 100, 1010, 18), tw5('star', 184, 985, 16),
      tw5('star', 750, 1257, 16), tw5('star', 304, 1259, 17), tw5('star', 150, 804, 13), tw5('star', 846, 644, 13),
      tw5('star', 258, 260, 9), tw5('star', 245, 462, 9), tw5('star', 641, 376, 15), tw5('star', 692, 498, 12),
      tw5('star', 94, 380, 10), tw5('star', 130, 561, 8), tw5('star', 893, 804, 8), tw5('star', 89, 833, 6),
      tw5('star', 92, 1102, 8), tw5('star', 966, 1105, 8), tw5('star', 900, 1161, 7), tw5('star', 160, 1175, 6),
      tw5('star', 634, 251, 8),
    ],
  },
  6: {
    title: 'Слон в ветках ёлки',
    src: 'ui/cards/card_06.webp',
    thumb: 'ui/cards/card_06_thumb.webp',
    twinkles: [
      tw('flake', 186, 306, 48), tw('flake', 913, 433, 50),
      tw('star', 839, 292, 46), tw('star', 129, 509, 39), tw('star', 327, 268, 31), tw('star', 826, 824, 42),
      tw('star', 174, 890, 41), tw('star', 936, 952, 34), tw('star', 895, 603, 26), tw('star', 174, 616, 12),
      tw('star', 183, 776, 12), tw('star', 878, 1037, 12), tw('star', 99, 993, 11), tw('star', 800, 943, 10),
      tw('star', 940, 682, 10), tw('star', 99, 692, 9), tw('star', 691, 299, 9), tw('star', 251, 962, 8),
      tw('star', 181, 1032, 8), tw('star', 95, 364, 7), tw('star', 914, 770, 7), tw('star', 748, 233, 6),
      tw('star', 441, 246, 5), tw('star', 959, 370, 5), tw('star', 163, 420, 5), tw('star', 412, 310, 5),
      tw('star', 865, 712, 5), tw('star', 747, 850, 6), tw('star', 929, 317, 4), tw('star', 947, 1076, 4),
      tw('star', 90, 785, 4), tw('star', 236, 845, 4), tw('star', 743, 1008, 4), tw('star', 633, 260, 3),
    ],
  },
  7: {
    title: 'Слон в подарке',
    src: 'ui/cards/card_07.webp',
    thumb: 'ui/cards/card_07_thumb.webp',
    twinkles: [
      tw('flake', 181, 296, 48), tw('flake', 901, 499, 44), tw('flake', 150, 672, 44), tw('flake', 885, 847, 44),
      tw('flake', 176, 997, 38),
      tw('star', 858, 271, 36), tw('star', 123, 467, 34), tw('star', 897, 672, 39), tw('star', 150, 836, 36),
      tw('star', 939, 943, 20), tw('star', 842, 1003, 23), tw('star', 100, 930, 17), tw('star', 306, 241, 20),
      tw('star', 955, 410, 13), tw('star', 949, 594, 10), tw('star', 955, 755, 10), tw('star', 92, 361, 9),
      tw('star', 94, 771, 8), tw('star', 926, 1040, 8), tw('star', 202, 765, 7), tw('star', 930, 320, 7),
      tw('star', 899, 371, 7), tw('star', 160, 569, 6), tw('star', 841, 737, 6), tw('star', 212, 897, 6),
      tw('star', 154, 397, 4), tw('star', 794, 238, 4), tw('star', 835, 928, 4),
    ],
  },
  8: {
    title: 'Слон в вагончике поезда',
    src: 'ui/cards/card_08.webp',
    thumb: 'ui/cards/card_08_thumb.webp',
    twinkles: [
      tw('flake', 187, 304, 46), tw('flake', 904, 429, 46),
      tw('star', 749, 281, 46), tw('star', 865, 596, 42), tw('star', 930, 830, 42), tw('star', 161, 658, 42),
      tw('star', 312, 240, 26), tw('star', 147, 897, 22), tw('star', 126, 497, 14), tw('star', 99, 966, 12),
      tw('star', 951, 969, 11), tw('star', 954, 515, 10), tw('star', 928, 680, 10), tw('star', 94, 365, 9),
      tw('star', 91, 737, 9), tw('star', 124, 820, 9), tw('star', 839, 343, 8), tw('star', 823, 505, 8),
      tw('star', 164, 418, 7), tw('star', 898, 294, 7), tw('star', 651, 293, 7), tw('star', 858, 706, 7),
      tw('star', 182, 755, 6), tw('star', 825, 808, 6), tw('star', 843, 243, 6), tw('star', 958, 348, 5),
      tw('star', 957, 622, 5), tw('star', 908, 911, 5), tw('star', 915, 1039, 4),
    ],
  },
  9: {
    title: 'Слон-щелкунчик',
    src: 'ui/cards/card_09.webp',
    thumb: 'ui/cards/card_09_thumb.webp',
    twinkles: [
      tw('flake', 186, 308, 48), tw('flake', 893, 445, 48),
      tw('star', 840, 298, 46), tw('star', 133, 464, 38), tw('star', 317, 275, 35), tw('star', 791, 778, 37),
      tw('star', 180, 899, 39), tw('star', 935, 952, 35), tw('star', 873, 606, 25), tw('star', 165, 626, 24),
      tw('star', 948, 675, 23), tw('star', 245, 714, 11), tw('star', 884, 1040, 12), tw('star', 178, 1041, 9),
      tw('star', 255, 863, 8), tw('star', 100, 994, 8), tw('star', 736, 986, 8), tw('star', 761, 360, 7),
      tw('star', 268, 983, 6), tw('star', 820, 686, 6), tw('star', 864, 849, 6), tw('star', 808, 935, 6),
      tw('star', 266, 362, 5), tw('star', 243, 445, 5), tw('star', 93, 550, 5), tw('star', 94, 365, 4),
      tw('star', 959, 373, 4), tw('star', 929, 318, 4), tw('star', 757, 252, 4), tw('star', 923, 747, 4),
      tw('star', 125, 750, 4), tw('star', 193, 811, 4), tw('star', 763, 889, 4), tw('star', 947, 1085, 3),
    ],
  },
  10: {
    title: 'Слон в миске с конфетами',
    src: 'ui/cards/card_10.webp',
    thumb: 'ui/cards/card_10_thumb.webp',
    twinkles: [
      tw('flake', 188, 307, 49), tw('flake', 893, 445, 49),
      tw('star', 840, 299, 44), tw('star', 133, 465, 36), tw('star', 337, 249, 30), tw('star', 869, 582, 28),
      tw('star', 946, 644, 24), tw('star', 153, 609, 23), tw('star', 936, 952, 33), tw('star', 114, 975, 32),
      tw('star', 882, 1034, 16), tw('star', 167, 1034, 9), tw('star', 510, 259, 7), tw('star', 430, 288, 5),
      tw('star', 757, 252, 4), tw('star', 930, 319, 4), tw('star', 94, 366, 4), tw('star', 959, 373, 4),
      tw('star', 93, 551, 5), tw('star', 108, 1093, 4),
    ],
  },
  11: {
    title: 'Слон в кружке кофе',
    src: 'ui/cards/card_11.webp',
    thumb: 'ui/cards/card_11_thumb.webp',
    twinkles: [
      tw('flake', 183, 296, 46), tw('flake', 889, 349, 50),
      tw('star', 759, 281, 46), tw('star', 139, 489, 44), tw('star', 337, 259, 27), tw('star', 908, 514, 25),
      tw('star', 931, 651, 20), tw('star', 127, 664, 17), tw('star', 149, 847, 21), tw('star', 185, 985, 12),
      tw('star', 125, 1019, 11), tw('star', 946, 435, 6), tw('star', 94, 366, 5), tw('star', 207, 382, 4),
      tw('star', 649, 260, 5), tw('star', 857, 257, 4), tw('star', 859, 613, 5), tw('star', 798, 845, 5),
      tw('star', 953, 907, 4), tw('star', 915, 1014, 4), tw('star', 106, 965, 4), tw('star', 200, 1041, 5),
    ],
  },
  12: {
    title: 'Слон в санях с оленями',
    src: 'ui/cards/card_12.webp',
    thumb: 'ui/cards/card_12_thumb.webp',
    twinkles: [
      tw('flake', 193, 275, 48), tw('flake', 855, 317, 50),
      tw('star', 661, 318, 46), tw('star', 937, 479, 38), tw('star', 798, 1216, 38), tw('star', 414, 274, 32),
      tw('star', 270, 1214, 33), tw('star', 94, 847, 31), tw('star', 723, 446, 28), tw('star', 94, 482, 9),
      tw('star', 317, 240, 7), tw('star', 741, 249, 7), tw('star', 543, 284, 7), tw('star', 100, 372, 7),
      tw('star', 483, 351, 6), tw('star', 948, 377, 6), tw('star', 619, 426, 6), tw('star', 857, 440, 6),
      tw('star', 960, 628, 6), tw('star', 963, 944, 6), tw('star', 681, 1202, 6), tw('star', 753, 368, 5),
      tw('star', 87, 930, 5), tw('star', 185, 1173, 5), tw('star', 876, 1173, 5), tw('star', 352, 1196, 5),
      tw('star', 500, 1190, 4),
    ],
  },
}

export function Twinkles({ list }) {
  return (
    <div className="twinkles" aria-hidden="true">
      {list.map((t, i) => (
        <span key={i} className={`tw tw-${t.kind}`} style={{
          left: `${t.x}%`, top: `${t.y}%`, width: `${t.r * 2.6}%`,
          '--d': `${(-((i * 0.37) % 1) * 3).toFixed(2)}s`, '--t': `${(2.2 + ((i * 0.53) % 1) * 1.8).toFixed(2)}s`,
        }} />
      ))}
    </div>
  )
}

function CardFaces({ card, faceRef }) {
  return (
    <div className="cardx" ref={faceRef}>
      <div className="cardx-front">
        <img src={card.src} alt={card.title} draggable={false} />
        <Twinkles list={card.twinkles} />
        <div className="cardx-gleam" />
      </div>
      <div className="cardx-back"><img src="ui/intro_icon.webp" alt="" draggable={false} /></div>
    </div>
  )
}

// shows the side of the card that faces the player (backface-visibility is unreliable in the app's browser)
function useFaceSwitch(ref, on) {
  useEffect(() => {
    if (!on) return
    let raf = 0
    const tick = () => {
      const el = ref.current
      if (el) {
        const m = getComputedStyle(el).transform
        let front = true
        if (m.startsWith('matrix3d(')) front = parseFloat(m.slice(9).split(',')[10]) >= 0
        el.classList.toggle('show-back', !front)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ref, on])
}

/**
 * The reveal after a find: the card comes out of the click point spinning (golden back first), grows to the
 * middle of the screen with a burst of golden light, the stars on it start to twinkle; after a moment (or a
 * click) it flies down into its slot of the drawer. onFly(): the drawer should come up now; onDone(): finished.
 */
export function CardReveal({ id, at, onFly, onDone }) {
  const card = CARDS[id]
  const wrap = useRef(null)
  const face = useRef(null)
  const [phase, setPhase] = useState('in') // in -> hold -> fly
  const flying = useRef(false)
  useFaceSwitch(face, true)

  useEffect(() => {
    const el = wrap.current
    const r = el.getBoundingClientRect()
    const dx = (at?.x ?? innerWidth / 2) - (r.left + r.width / 2)
    const dy = (at?.y ?? innerHeight / 2) - (r.top + r.height / 2)
    const a = el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(.08) rotateY(-540deg) rotateZ(-20deg)`, opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { transform: 'translate(0, -2%) scale(1.06) rotateY(12deg) rotateZ(2deg)', offset: 0.72 },
      { transform: 'translate(0, .5%) scale(.985) rotateY(-4deg) rotateZ(-.6deg)', offset: 0.86 },
      { transform: 'none', opacity: 1 },
    ], { duration: 1500, easing: 'cubic-bezier(.22,.72,.26,1)', fill: 'both' })
    a.onfinish = () => setPhase('hold')
    const t = setTimeout(() => fly(), 1500 + 2600)
    return () => { clearTimeout(t); a.cancel() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fly = () => {
    if (flying.current) return
    flying.current = true
    setPhase('fly')
    onFly?.()
    // let the drawer come up first, then aim at the slot
    setTimeout(() => {
      const el = wrap.current
      if (!el) return onDone?.()
      const slot = document.querySelector(`.fslot[data-id="${id}"]`)?.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const cur = getComputedStyle(el).transform
      let k = 0.12, dx = 0, dy = innerHeight * 0.5
      if (slot) {
        k = Math.min(slot.width / r.width, slot.height / r.height)
        dx = slot.left + slot.width / 2 - (r.left + r.width / 2)
        dy = slot.top + slot.height / 2 - (r.top + r.height / 2)
      }
      const a = el.animate([
        { transform: cur === 'none' ? 'none' : cur, opacity: 1 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.15 - 30}px) scale(${0.55 + k * 0.45}) rotateZ(-4deg)`, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotateZ(0deg)`, opacity: 1, offset: 0.92 },
        { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0 },
      ], { duration: 850, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' })
      a.onfinish = () => onDone?.()
    }, 420)
  }

  if (!card) return null
  return (
    <div className={`card-reveal ${phase}`} onPointerDown={(e) => { e.stopPropagation(); if (phase === 'hold') fly() }}>
      <div className="card-rays" />
      <div className="card-stage" style={{ aspectRatio: `${card.w ?? 1051} / ${card.h ?? 1409}` }}>
        <div className="card-wrap" ref={wrap}>
          <CardFaces card={card} faceRef={face} />
        </div>
      </div>
      <div className="card-caption"><b>Новая карточка!</b><span>{card.title}</span></div>
    </div>
  )
}

/** A card looked at closely (click on a filled slot of the drawer); Esc / click closes it. */
export function CardViewer({ id, onClose }) {
  const card = CARDS[id]
  const tilt = useRef(null)
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  if (!card) return null
  const move = (e) => {
    const el = tilt.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`)
  }
  return (
    <div className="card-viewer" onPointerDown={(e) => { e.stopPropagation(); onClose() }}>
      <div className="card-stage" style={{ aspectRatio: `${card.w ?? 1051} / ${card.h ?? 1409}` }} onMouseMove={move} onMouseLeave={() => { tilt.current?.style.setProperty('--ry', '0deg'); tilt.current?.style.setProperty('--rx', '0deg') }}>
        <div className="card-wrap card-view-in">
          <div className="card-tilt" ref={tilt}>
            <div className="cardx">
              <div className="cardx-front">
                <img src={card.src} alt={card.title} draggable={false} />
                <Twinkles list={card.twinkles} />
                <div className="cardx-shine" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="card-caption view"><b>{card.title}</b><span>Нажми, чтобы закрыть</span></div>
    </div>
  )
}
