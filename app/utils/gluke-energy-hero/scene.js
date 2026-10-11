/* Хореография. Всё — функции времени t: любой кадр можно посчитать заново,
   поэтому работают протяжка, прыжок к фазе и стоп-кадр. */

import { bezier3, clamp01, ease, hash, lerp, smooth } from './easing.js'
import { phaseT } from './timeline.js'
import { __LAB__ } from './lab.js'

const TAU = Math.PI * 2

/* Смещение со спадом «сопротивления»: v·(1−e^(−k·age))/k. */
const dragged = (v, k, age) => v * (1 - Math.exp(-k * age)) / k

export function computeScene(E, t) {
  const C = E.cfg
  const P = E.layout
  const B = E.sprites
  const s = E.s
  const X = x => x * E.sx
  const Y = y => y * E.sy
  const L = C.logo
  const logo = E.logo

  /* ---------- знак ---------- */
  logo.place(X(L.x), Y(L.y), L.size * s, L.rotation)
  logo.bake(L.detail, null) // null — заливка из ядра внутри знака
  const core = logo.toPx(logo.entry[0], logo.entry[1], [0, 0])
  const wc = logo.toPx(logo.centre[0], logo.centre[1], [0, 0])

  B.begin()
  E.backSprites.begin()

  /* ---------- 1. зарождение: энергия появляется в ядре и заливает знак ---------- */
  const ig = P.ignite
  const fillDur = Math.max(0.05, ig.duration * L.fillShare)
  const progress = ease(L.fillEasing, (t - ig.start) / fillDur)
  /* Ядро: тлеет ещё в тёмном знаке, разгорается и отдаёт энергию заливке. */
  const emberOn = smooth(ig.start - 0.35, ig.start + 0.2, t)
  const emberFlick = 0.85 + 0.15 * Math.sin(t * 23.0) * Math.sin(t * 7.3)
  const ember = L.ember * emberOn * (1 - 0.65 * smooth(ig.start, ig.start + fillDur, t)) * emberFlick
  if (ember > 0.01 && t < P.pulse.start) {
    B.push(core[0], core[1], core[0], core[1], 7 * s * (0.6 + 0.4 * emberOn), 0.35 * ember, 0.8)
  }

  /* ---------- 2–3. зарядка и импульс ---------- */
  const charge = ease('inQuad', phaseT(P.charge, t)) * (1 - smooth(P.pulse.start, P.pulse.start + P.pulse.duration * 0.4, t))
  const PU = C.pulse
  const since = t - P.pulse.start
  let flash = 0
  /* Вспышка — короткий удар: flashDecay — постоянная спада, сек. */
  if (since >= 0) flash = PU.flash * PU.strength * Math.exp(-since / Math.max(0.02, PU.flashDecay ?? P.pulse.duration * 0.28))

  const I = C.idle
  const total = P.total
  let beat = 0
  if (__LAB__ && t > total) {
    const ph = ((t - total) % I.logoPulseInterval) / I.logoPulseInterval
    const w = 0.05 * Math.max(0.05, I.logoPulseWidth) * 2
    beat = (Math.exp(-Math.pow((ph - 0.2) / w, 2)) + 0.55 * Math.exp(-Math.pow((ph - 0.2 - w * 2.2) / w, 2)))
      * smooth(total, total + 0.8, t)
  }
  /* Свечение: растёт с заливкой и зарядкой, на импульсе — пик, дальше
     оседает к «после импульса» и к спокойному финалу. */
  const peak = (1 + L.chargeGlow) * PU.glow
  let glow
  if (since < 0) glow = progress * (1 + L.chargeGlow * charge)
  else {
    const calmTarget = lerp(PU.afterGlow, I.logoGlow, smooth(P.collect.start, total, t))
    glow = calmTarget + (peak - calmTarget) * Math.exp(-since / 0.9)
  }
  if (__LAB__) glow += beat * I.logoPulseIntensity
  const calm = smooth(P.collect.start, total, t)
  /* После потока живой знак уходит: его сменяет статичный знак из макета
     (SVG с мягкой тенью, см. HastraEnergy). Ни ореола, ни ядра, ни пульса —
     анимация остаётся только на кнопке. */
  const logoOff = smooth(P.stream.end, P.stream.end + Math.max(0.05, I.logoFadeOut), t) * (__LAB__ ? I.logoOff : 1)
  glow *= 1 - logoOff
  const logoU = {
    progress,
    idle: L.idle * (1 - smooth(0, 0.35, progress)),
    charge,
    flash,
    shock: 0, // кольцо внутри квадрата знака не нужно: волна одна, на весь блок
    shockR: 0,
    shockWidth: 0.1,
    glow,
    opacity: 1 - logoOff,
    body: lerp(lerp(1, 0.78, calm) + (__LAB__ ? beat * I.logoPulseIntensity * 0.35 : 0), I.logoStaticBody, logoOff),
    distort: L.distortion * charge + PU.distortion * Math.min(1, flash),
    entry: logo.entry,
    entryPulse: ember * (1 - smooth(P.pulse.start, P.pulse.end + 0.3, t)), // ядро гаснет после импульса
    entrySize: L.emberSize,
  }

  /* ---------- 4. волна: одна на весь блок, от знака к кнопке ---------- */
  const cr = E.ctaRect
  const wf = P.form
  let reach = Math.hypot(E.W, E.H)
  if (cr) {
    reach = Math.max(
      Math.hypot(cr.x - wc[0], cr.y - wc[1]), Math.hypot(cr.x - wc[0], cr.y + cr.h - wc[1]),
    ) * PU.waveReach
  }
  /* Волна до края карточки: фронт проходит дальний угол блока (mobile —
     знак внизу, кнопка близко, а волна должна дойти до верха). */
  if (PU.waveEdgeReach > 0) {
    const far = Math.max(Math.hypot(wc[0], wc[1]), Math.hypot(E.W - wc[0], wc[1]), Math.hypot(wc[0], E.H - wc[1]), Math.hypot(E.W - wc[0], E.H - wc[1]))
    reach = Math.max(reach, far * PU.waveEdgeReach)
  }
  const dec = Math.max(0.2, PU.waveDecel)
  const waveR = (time) => {
    const u = clamp01((time - wf.start) / wf.duration)
    return reach * (1 - Math.pow(1 - u, dec))
  }
  /* Момент, когда фронт проходит расстояние r от знака. */
  const waveTime = r => wf.start + (1 - Math.pow(1 - clamp01(r / reach), 1 / dec)) * wf.duration
  const wu = (t - wf.start) / wf.duration
  const rNow = t < wf.start ? -1e4 : t >= wf.end ? 1e5 : waveR(t)
  const waveAmp = u => PU.waveIntensity * PU.strength * (1 - PU.waveFade * u) * smooth(0, 0.03, u) * (1 - smooth(0.82, 1, u))
  const waveU = (wu >= 0 && wu <= 1)
    ? {
        cx: wc[0],
        cy: wc[1],
        r: waveR(t),
        w: PU.waveWidth * s,
        trail: PU.waveTrail * s,
        noise: __LAB__ ? PU.waveNoise : 0,
        amp: waveAmp(wu),
      }
    : null

  /* Искры на фронте — часть той же волны. */
  if (waveU) {
    const minR = L.size * 0.35 * s
    const k = waveAmp(wu) / Math.max(0.01, PU.waveIntensity)
    for (let i = 0; i < PU.particles; i++) {
      const h1 = hash(i * 0.917 + 11.1), h2 = hash(i * 1.37 + 4.4), h3 = hash(i * 2.91 + 6.6)
      const te = wf.start + h2 * wf.duration * 0.75
      const life = 0.25 + 0.35 * h3
      const age = t - te
      if (age < 0 || age > life) continue
      const q = age / life
      const r = waveU.r - h3 * waveU.w * 1.2 // только за фронтом: край круга остаётся чистым
      if (r < minR) continue
      const a = h1 * TAU
      const dx = Math.cos(a), dy = Math.sin(a)
      const len = PU.particleLength * s * (0.5 + h2)
      B.push(wc[0] + dx * r, wc[1] + dy * r, wc[0] + dx * (r - len), wc[1] + dy * (r - len),
        (0.8 + 0.8 * h3) * s, PU.particleIntensity * Math.sin(Math.PI * q) * k, 0.85 * (1 - q))
    }
  }

  /* ---------- 5–9. слова ---------- */
  const W = C.words
  const F = W.reveal
  const H = W.hold
  const S = C.stream
  const items = W.items
  const nWords = Math.min(items.length, E.words.words.length)
  const lane = [X(S.laneX), Y(S.laneY)]
  const M = W.marker
  const keep = __LAB__ && !!W.keep
  const wordStates = []
  const markerStates = []

  const xs = items.slice(0, nWords).map(it => it.x)
  const minX = Math.min(...xs), maxX = Math.max(...xs)

  /* Слово загорается, когда до него доходит волна. */
  const textOffset = j => (M.gap + E.words.words[j].tw / 2) * items[j].scale * F.textScale * s
  const wordDist = items.slice(0, nWords).map((it, j) => Math.hypot(X(it.x) + textOffset(j) - wc[0], Y(it.y) - wc[1]))
  const activeAt = j => waveTime(wordDist[j])

  /* Сборка и поток. Слово вместе с маркером трогается с места и летит по
     траектории потока к CTA: мимо дорожки lane, через точку входа справа от
     кнопки — в её центр. По дороге оно растворяется, а его пиксели уходят
     частицами вперёд по той же траектории, в поток и во вспышку кнопки.
     В режиме keep слово остаётся на месте, как в макете. x/y слова в
     конфиге — центр маркера; mx/my — маркер, x/y позы — центр текста. */
  const ctaC = cr ? [cr.x + cr.w / 2, cr.y + cr.h / 2] : lane
  /* Вход в кнопку: справа (desktop) или снизу (mobile — знак под кнопкой). */
  const entryPt = !cr ? lane
    : S.entrySide === 'below' ? [cr.x + cr.w / 2, cr.y + cr.h + (S.entryOffset ?? 70) * s]
      : [cr.x + cr.w + (S.entryOffset ?? 70) * s, cr.y + cr.h / 2]
  const travelStart = j => {
    const order = maxX > minX ? (items[j].x - minX) / (maxX - minX) : 0
    return P.collect.start + order * S.stagger
  }
  const travelEnd = P.ctaImpact.start
  /* x — доля пути по времени, u — по траектории. */
  const travelRaw = (j, time) => keep ? 0 : Math.max(0, (time - travelStart(j)) / Math.max(0.05, travelEnd - travelStart(j)))
  const travelX = (j, time) => Math.min(1, travelRaw(j, time))
  /* Доля пути. После прихода в кнопку (x > 1) продолжается с той же
     скоростью — отставшие частицы входят в кнопку без рывка. */
  const endSlope = (1 - ease(S.travelEasing, 0.999)) / 0.001
  const travelU = (j, time) => {
    const x = travelRaw(j, time)
    return x <= 1 ? ease(S.travelEasing, x) : 1 + endSlope * (x - 1)
  }
  const dissolveOf = x => keep ? 0 : clamp01((x - S.dissolveFrom) / Math.max(0.01, S.dissolveTo - S.dissolveFrom))

  /* Траектория центра слова j: из точки, где оно парило в момент старта. */
  function wordPath(j, out) {
    const it = items[j]
    const t0 = travelStart(j)
    const amp = it.amplitude * H.floating * s
    const w = it.speed * H.speed
    const p0 = [X(it.x) + textOffset(j) + amp * Math.sin(t0 * w * 1.3 + j * 1.7), Y(it.y) + amp * Math.cos(t0 * w + j * 2.3)]
    out.p0 = p0
    out.p1 = [lerp(p0[0], lane[0], S.convergence), lerp(p0[1], lane[1], S.convergence)]
    out.p2 = entryPt
    out.p3 = ctaC
    return out
  }
  const paths = []
  for (let j = 0; j < nWords; j++) paths.push(wordPath(j, {}))
  const pathAt = (j, u, out) => {
    const pa = paths[j]
    return bezier3(pa.p0, pa.p1, pa.p2, pa.p3, u, out)
  }

  const tmpP = [0, 0]
  const tailP = [0, 0]
  function wordPose(j, time, out) {
    const it = items[j]
    const amp = it.amplitude * H.floating * s
    const w = it.speed * H.speed
    const base = it.scale * F.textScale * s
    const u = Math.min(1, travelU(j, time))
    if (u <= 0) {
      out.mx = X(it.x) + amp * Math.sin(time * w * 1.3 + j * 1.7)
      out.my = Y(it.y) + amp * Math.cos(time * w + j * 2.3)
      out.x = out.mx + textOffset(j)
      out.y = out.my
      out.scale = base
    }
    else {
      pathAt(j, u, tmpP)
      const k = lerp(1, S.travelScale, u)
      out.x = tmpP[0]
      out.y = tmpP[1]
      out.scale = base * k
      out.mx = out.x - textOffset(j) * k
      out.my = out.y
    }
    out.u = u
    out.rot = it.rotation * Math.PI / 180
    return out
  }

  const poseA = {}
  const perWord = Math.floor(F.glints / Math.max(1, nWords))
  const perStream = Math.floor(S.particles / Math.max(1, nWords))
  const ragged = F.ragged * s
  const glintLife = Math.max(0.05, F.glintLife)

  for (let j = 0; j < nWords; j++) {
    const it = items[j]
    const word = E.words.words[j]
    const pose = wordPose(j, t, {})
    const half = word.w * pose.scale / 2
    const dC = Math.hypot(pose.x - wc[0], pose.y - wc[1])
    const reveal = clamp01((rNow - (dC - half - ragged)) / (2 * (half + ragged)))
    const dStart = travelStart(j)
    const dSpan = Math.max(0.05, travelEnd - dStart)
    const dissolve = dissolveOf(travelX(j, t))
    const pulse = 1 + H.pulse * Math.sin(t * 2.2 + j * 1.3)
    const holdGlow = keep ? lerp(H.glow, H.finalGlow, calm) : H.glow
    /* Маркер растворяется первым (он слева, ближе к кнопке): гаснет
       и сжимается в первой части растворения, осыпаясь искрами. */
    const markerGone = smooth(0, S.markerDissolve, dissolve)
    /* Тусклое слово с самого начала (dimStart > 0): волна его «проявляет». */
    const dimBase = __LAB__ ? (W.dimStart || 0) * smooth(0, 0.6, t) : 0
    const markerFade = 1 - markerGone
    /* Маркер загорается раньше текста: волна доходит до него первой. */
    const dM = Math.hypot(pose.mx - wc[0], pose.my - wc[1])
    const xm = rNow - dM
    const fwM = Math.max(1, F.frontWidth * s)
    const markerLit = clamp01(xm / (2 * fwM) + 0.5)
    markerStates.push({
      x: pose.mx,
      y: pose.my,
      lit: markerLit,
      shown: Math.max(markerLit, dimBase) * it.opacity * F.opacity * markerFade,
      size: lerp(1, 0.35, markerGone) * pose.scale / (it.scale * F.textScale * s),
      flare: Math.exp(-Math.pow((xm - fwM) / (fwM * 2.5), 2)) * F.flare + Math.sin(Math.PI * markerGone) * 0.8,
      glow: lerp(1, 0.6, calm) * pulse,
    })
    wordStates.push({
      x: pose.x,
      y: pose.y,
      scale: pose.scale,
      rot: pose.rot,
      reveal,
      dissolve,
      base: dimBase,
      dissolveSoft: S.dissolveSoft,
      glow: it.glow * F.glow * (reveal < 1 ? 1 : holdGlow) * pulse,
      opacity: it.opacity * F.opacity,
    })

    const pw = word.points
    const cos = Math.cos(pose.rot), sin = Math.sin(pose.rot)

    /* Искры в буквах в момент, когда их касается фронт волны. */
    if (reveal > 0 && t < activeAt(j) + 1.5) {
      const nPts = Math.min(perWord, word.count)
      for (let i = 0; i < nPts; i++) {
        const gx = pw[i * 3], gy = pw[i * 3 + 1], key = pw[i * 3 + 2]
        const h2 = hash(i * 2.39 + j * 17.3), h3 = hash(i * 0.61 + j * 5.9)
        const px = pose.x + (gx * cos - gy * sin) * pose.scale
        const py = pose.y + (gx * sin + gy * cos) * pose.scale
        const ex = px - wc[0], ey = py - wc[1]
        const el = Math.hypot(ex, ey) || 1
        const age = t - waveTime(el + (key - 0.5) * ragged)
        const life = glintLife * (0.6 + 0.4 * h3)
        if (age < 0 || age > life) continue
        const q = age / life
        const v = 85 * s * (0.4 + h2)
        const d = dragged(v, 6, age), d0 = dragged(v, 6, Math.max(0, age - 0.03))
        B.push(px + ex / el * d, py + ey / el * d, px + ex / el * d0, py + ey / el * d0,
          (0.9 + 0.8 * h3) * s, F.intensity * F.glintIntensity * Math.pow(1 - q, 2), 0.9 * (1 - q))
      }
    }

    /* Поток: пиксель отрывается от слова, когда до его ключа доходит
       растворение, и дальше плывёт облаком вместе со словом по той же
       траектории: часть отстаёт хвостом, часть уходит вперёд, облако
       понемногу расползается и сходится в кнопке. Скорость частицы
       непрерывна со скоростью слова — без рывков. */
    if (cr && !keep && t >= dStart) {
      const SB = !__LAB__ || S.behindLogo ? E.backSprites : B
      const nPts = Math.min(perStream, word.count)
      const nMk = S.markerParticles
      for (let i = 0; i < nPts + nMk; i++) {
        const isMk = i >= nPts
        const h1 = hash(i * 3.17 + j * 13.7), h2 = hash(i * 1.23 + j * 7.1), h3 = hash(i * 4.9 + j * 2.3)
        let gx, gy, key
        if (isMk) {
          /* Искры маркера: из его круга, пока он гаснет. */
          const a = h1 * TAU, r = Math.sqrt(h2) * M.ring
          gx = -(M.gap + word.tw / 2) + Math.cos(a) * r
          gy = Math.sin(a) * r
          key = h3 * S.markerDissolve
        }
        else {
          gx = pw[i * 3]; gy = pw[i * 3 + 1]; key = pw[i * 3 + 2]
        }
        const xRel = S.dissolveFrom + key * (S.dissolveTo - S.dissolveFrom)
        const td = dStart + xRel * dSpan
        if (t < td) continue
        const pk = wordPose(j, td, poseA).scale
        const ang = h2 * TAU
        /* Положение частицы в момент time (≥ td); возвращает долю пути. */
        const at = (time, out) => {
          const age = time - td
          const uP = travelU(j, time) + (h1 - S.cloudAhead) * S.cloudLength * smooth(0, 1.2, age)
          pathAt(j, clamp01(uP), out)
          const loose = 1 - Math.exp(-age * S.cloudLoosen)
          const land = smooth(0.82, 1, uP) // у кнопки облако собирается в неё
          const hold = Math.exp(-age * S.cloudLoosen * 0.9) * (1 - land)
          const spread = loose * (1 - land) * S.streamWidth * s * (0.3 + 0.7 * h3)
          const wob = Math.sin(uP * 9 + h1 * TAU + time * 2) * S.distortion * 5 * s * (1 - land)
          out[0] += (gx * cos - gy * sin) * pk * hold + Math.cos(ang) * spread + (h3 - 0.5) * cr.w * 0.8 * land
          out[1] += (gx * sin + gy * cos) * pk * hold + Math.sin(ang) * spread * 0.6 + wob + (h2 - 0.5) * cr.h * 0.6 * land
          return uP
        }
        const uP = at(t, tmpP)
        if (uP >= 1.04) continue
        /* Хвост — настоящая «размазка» движения: где частица была trail секунд назад. */
        at(Math.max(td, t - S.trail), tailP)
        const alpha = S.intensity * S.glow * (0.5 + 0.5 * h2) * (isMk ? 1.2 : 1)
          * smooth(0, 0.25, t - td) * (1 - smooth(0.97, 1.04, uP))
        SB.push(tmpP[0], tmpP[1], tailP[0], tailP[1], S.particleSize * s * (0.7 + 0.5 * h3) * (isMk ? 1.2 : 1),
          alpha, 0.15 + 0.4 * clamp01(uP))
      }
      /* Голова кометы: раскалённый штрих в центре слова. Разгорается, пока
         слово растворяется, и с ходу влетает в кнопку. */
      const cometK = (S.comet || 0) * smooth(0.05, 0.5, dissolve) * (1 - smooth(0.97, 1.03, travelU(j, t)))
      if (cometK > 0.01) {
        const tail = wordPose(j, Math.max(dStart, t - Math.max(0.01, S.cometTrail || 0.08)), poseA)
        SB.push(pose.x, pose.y, tail.x, tail.y, 3.2 * s, cometK, 1)
        SB.push(pose.x, pose.y, tail.x, tail.y, 9 * s, cometK * 0.35, 0.3)
      }
    }
  }

  /* ---------- 10. CTA ---------- */
  const CT = C.cta
  const ci = P.ctaImpact
  const act = ease(CT.activationEasing, phaseT(ci, t))
  const antic = smooth(ci.start - 0.45, ci.start, t) * CT.anticipation * (1 - act)
  const cSince = t - ci.start
  let ctaFlash = 0, ring = 0, ringR = 0
  if (cSince >= 0) {
    ctaFlash = CT.flash * CT.impact * Math.exp(-cSince / 0.1)
    ring = CT.ring * CT.impact * Math.exp(-cSince * 2.6)
    ringR = 4 + 190 * s * (1 - Math.exp(-cSince * 4.5))
  }
  const settled = lerp(CT.finalGlow, I.ctaGlow, smooth(total - 0.3, total + 0.7, t))
  const settle = smooth(ci.start + 0.1, ci.start + 1.0, t)
  /* Свет вспышки не гаснет, а остаётся мягким постоянным свечением кнопки
     и периодически «подмигивает» — точка притяжения. */
  let blink = 0
  const blinkFrom = ci.start + 0.9
  if (t > blinkFrom) {
    const period = Math.max(0.3, I.ctaBlinkInterval)
    const ph = ((t - blinkFrom) % period) / period
    blink = Math.exp(-Math.pow((ph - 0.5) / Math.max(0.02, I.ctaBlinkWidth), 2)) * I.ctaBlink
  }
  /* Заливка кнопки основной волной: доля пройденного фронтом пути по кнопке. */
  const byWave = !__LAB__ || CT.fillMode !== 'stream'
  let waveCover = 0, waveHit = 0
  if (cr) {
    const cx = cr.x + cr.w / 2, cy = cr.y + cr.h / 2
    const dNear = Math.hypot(Math.max(Math.abs(wc[0] - cx) - cr.w / 2, 0), Math.max(Math.abs(wc[1] - cy) - cr.h / 2, 0))
    const dFar = Math.hypot(Math.abs(wc[0] - cx) + cr.w / 2, Math.abs(wc[1] - cy) + cr.h / 2)
    waveCover = clamp01((rNow - dNear) / Math.max(1, dFar - dNear))
    waveHit = Math.sin(Math.PI * waveCover)
  }
  const fillOn = byWave ? waveCover : act
  const light = fillOn * settle * (I.ctaLight + blink)
  const ctaLevel = act * lerp(1.5, settled, settle) * (1 + blink * 0.6)
  const intro = smooth(0, 0.6, t)
  const ctaU = {
    halo: CT.glow * (antic + Math.max(0, ctaLevel) + (byWave ? waveHit * CT.fillHalo : 0)),
    haloW: CT.haloWidth * s * lerp(1, I.ctaHalo, settle),
    flash: ctaFlash + light,
    inner: ctaFlash + light * I.ctaInner,
    ring,
    ringR,
    ringW: 9 * s,
    waveC: wc,
    waveR: byWave ? rNow : -1e4,
    fillSoft: CT.fillSoft * s,
    fillGlow: byWave ? CT.fillGlow * waveHit : 0,
    energy: CT.energy * intro * (byWave ? 1 : 1 - act), // в режиме волны гасит сам фронт (маска в шейдере)
    energySpeed: CT.energySpeed,
    ...(__LAB__ && {
      energyRings: CT.energyRings,
      energyDir: CT.energyDir === 'out' ? -1 : 1,
      energyStyle: CT.energyStyle === 'rings' ? 0 : 1,
    }),
    energyScale: CT.energyScale * s,
  }
  if (cr && cSince >= 0 && cSince < 0.8) {
    const cx = cr.x + cr.w / 2, cy = cr.y + cr.h / 2
    for (let i = 0; i < 240; i++) {
      const h1 = hash(i * 8.1 + 2.2), h2 = hash(i * 3.9 + 7.7), h3 = hash(i * 6.1 + 5.5)
      const life = 0.3 + 0.45 * h3
      if (cSince > life) continue
      const a = h1 * TAU
      const ox = Math.cos(a) * cr.w / 2, oy = Math.sin(a) * cr.h / 2
      const v = (200 + 520 * h2) * s * CT.impact
      const d = dragged(v, 5, cSince), d0 = dragged(v, 5, Math.max(0, cSince - 0.03))
      const q = cSince / life
      B.push(cx + ox + Math.cos(a) * d, cy + oy + Math.sin(a) * d, cx + ox + Math.cos(a) * d0, cy + oy + Math.sin(a) * d0,
        (0.9 + h3) * s, Math.pow(1 - q, 2) * CT.impact, 0.9 * (1 - q))
    }
  }

  const base = clamp01(CT.initialBrightness)
  return {
    logoOff,
    logoU,
    ctaU,
    waveU,
    wordStates,
    markerStates,
    wordWave: { cx: wc[0], cy: wc[1], r: rNow, frontWidth: F.frontWidth * s, ragged, flare: F.flare },
    ctaState: byWave
      ? { mix: clamp01(Math.max(base, CT.yellow * waveCover)), act, fill: { cx: wc[0], cy: wc[1], r: rNow, soft: CT.fillSoft * s, yellow: CT.yellow } }
      : { mix: clamp01(Math.max(base, act * CT.yellow)), act },
  }
}
