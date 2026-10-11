/* Раскладка фаз по времени. Фазы идут цепочкой: старт каждой — конец
   предыдущей плюс её offset. Отрицательный offset даёт перекрытие. */

import { clamp01 } from './easing.js'

export const PHASE_ORDER = [
  'intro', 'ignite', 'charge', 'pulse', 'form',
  'hold', 'collect', 'stream', 'ctaImpact', 'dissolve',
]

export const PHASE_LABELS = {
  intro: '0 Старт',
  ignite: '1 Зарождение',
  charge: '2 Заряд',
  pulse: '3 Импульс',
  form: '4 Волна → слова',
  hold: '6–7 Пауза',
  collect: '8 Сборка',
  stream: '9 Поток',
  ctaImpact: '10 CTA',
  dissolve: '11 Растворение',
  idle: '12 Финал',
}

export function layoutPhases(phases) {
  const out = {}
  let cursor = 0
  for (const name of PHASE_ORDER) {
    const p = phases[name] || { offset: 0, duration: 0 }
    const start = Math.max(0, cursor + (Number(p.offset) || 0))
    const duration = Math.max(0.001, Number(p.duration) || 0)
    out[name] = { start, duration, end: start + duration }
    cursor = start + duration
  }
  out.idle = { start: cursor, duration: Infinity, end: Infinity }
  out.total = cursor
  return out
}

/* Прогресс внутри фазы 0..1 (до старта 0, после конца 1). */
export function phaseT(ph, t) {
  return clamp01((t - ph.start) / ph.duration)
}

export function activePhase(layout, t) {
  let current = 'intro'
  for (const name of PHASE_ORDER) if (t >= layout[name].start) current = name
  if (t >= layout.total) current = 'idle'
  return current
}
