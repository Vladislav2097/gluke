/* Конфиг Mobile. Карточка 320×620 (ширина — по макету «Телефон.svg»).
   Знак стоит под кнопкой, слова — вокруг него, как на desktop: две над
   плечами знака, две по бокам. Поток слов идёт снизу вверх и входит
   в кнопку снизу; волна доходит до верха карточки.
   Всё, что не указано, берётся из Desktop. */

import { DESKTOP } from './desktop.js'

const clone = o => JSON.parse(JSON.stringify(o))

function merge(dst, src) {
  for (const k in src) {
    const v = src[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v)
    else dst[k] = v
  }
  return dst
}

export const MOBILE = merge(clone(DESKTOP), {
  ref: { width: 320, height: 620 },

  logo: {
    x: 148,
    y: 485,
    size: 130,
  },

  pulse: {
    waveWidth: 9,
    waveTrail: 55,
    particles: 260,
    particleLength: 22,
    waveEdgeReach: 1.08, // волна проходит всю карточку до верха
  },

  words: {
    fontSize: 14,
    textureScale: 3, // чёткость на экранах с плотностью 3×
    marker: {
      gap: 16,
      ring: 10,
      dot: 3.5,
    },
    reveal: {
      ragged: 16,
      glints: 500,
    },
    items: [
      { text: 'ЛИДЫ', x: 34, y: 430, scale: 1, rotation: 0, glow: 1, opacity: 1, amplitude: 1.5, speed: 0.9 },
      { text: 'ОКУПАЕМОСТЬ', x: 172, y: 406, scale: 1, rotation: 0, glow: 1, opacity: 1, amplitude: 1.5, speed: 0.8 },
      { text: 'РОСТ', x: 34, y: 492, scale: 1, rotation: 0, glow: 1, opacity: 1, amplitude: 1.5, speed: 1 },
      { text: 'ПРОДАЖИ', x: 206, y: 474, scale: 1, rotation: 0, glow: 1, opacity: 1, amplitude: 1.5, speed: 0.7 },
    ],
  },

  stream: {
    laneX: 150,
    laneY: 398,
    entrySide: 'below',
    entryOffset: 30,
    particles: 1000,
    streamWidth: 10,
  },

  cta: {
    haloWidth: 18,
    fillSoft: 10,
  },
})
