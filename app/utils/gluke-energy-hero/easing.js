/* Кривые времени. Имя кривой хранится в конфиге строкой, чтобы его можно было
   выбирать в лаборатории и сохранять в JSON. */

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a || 1e-6))
  return t * t * (3 - 2 * t)
}

export const EASINGS = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: t => t * t * t * t,
  outQuart: t => 1 - Math.pow(1 - t, 4),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
}

export const EASING_NAMES = Object.keys(EASINGS)

export function ease(name, t) {
  return (EASINGS[name] || EASINGS.linear)(clamp01(t))
}

/* Детерминированный хеш: у каждой частицы свои «случайные» числа, одинаковые
   в любом кадре. Поэтому сцену можно протягивать и прыгать по фазам — всё
   считается как функция времени, а не накапливается по кадрам. */
export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
}

export function bezier2(p0, p1, p2, t, out) {
  const u = 1 - t
  out[0] = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
  out[1] = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
  return out
}

export function bezier3(p0, p1, p2, p3, t, out) {
  const u = 1 - t
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  out[0] = a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0]
  out[1] = a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
  return out
}

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '')
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}
