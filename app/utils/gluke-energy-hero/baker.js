/*!
 * Печь карт знака. Ядро перенесено из GlukeEnergyFill (GLUKE — gluke.ru,
 * @Gluke_art, Александр Глухов): знаковое поле контура, геодезическое поле
 * прихода волны и размытые расстояния для свечения. Считается в воркере,
 * собранном из исходника функций; без воркера — на месте.
 */

export const PAD = 0.18 // поля вокруг знака в карте: в них живёт ореол

/* Оптимальная пара весов 3×3 для чамфер-развёртки: ошибка ~2%, без граней. */
function chamfer(size, seed, allow) {
  var n = size * size
  var INF = 1e9
  var d = new Float32Array(n)
  for (var i = 0; i < n; i++) d[i] = seed[i] ? 0 : INF
  var A = 0.9619, B = 1.3604
  var passes = allow ? 48 : 1
  for (var pass = 0; pass < passes; pass++) {
    var moved = 0
    var x, y
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        var i1 = y * size + x
        if (allow && !allow[i1]) continue
        var v = d[i1]
        if (x > 0) v = Math.min(v, d[i1 - 1] + A)
        if (y > 0) {
          v = Math.min(v, d[i1 - size] + A)
          if (x > 0) v = Math.min(v, d[i1 - size - 1] + B)
          if (x < size - 1) v = Math.min(v, d[i1 - size + 1] + B)
        }
        if (v < d[i1]) { d[i1] = v; moved++ }
      }
    }
    for (y = size - 1; y >= 0; y--) {
      for (x = size - 1; x >= 0; x--) {
        var i2 = y * size + x
        if (allow && !allow[i2]) continue
        var u = d[i2]
        if (x < size - 1) u = Math.min(u, d[i2 + 1] + A)
        if (y < size - 1) {
          u = Math.min(u, d[i2 + size] + A)
          if (x < size - 1) u = Math.min(u, d[i2 + size + 1] + B)
          if (x > 0) u = Math.min(u, d[i2 + size - 1] + B)
        }
        if (u < d[i2]) { d[i2] = u; moved++ }
      }
    }
    if (!moved) break
  }
  return d
}

function blurField(field, size, radius) {
  if (radius < 1) return field
  var tmp = new Float32Array(size * size)
  var out = new Float32Array(size * size)
  var span = radius * 2 + 1
  var x, y, i, sum
  for (y = 0; y < size; y++) {
    var row = y * size
    sum = field[row] * (radius + 1)
    for (i = 1; i <= radius; i++) sum += field[row + Math.min(size - 1, i)]
    for (x = 0; x < size; x++) {
      tmp[row + x] = sum / span
      sum += field[row + Math.min(size - 1, x + radius + 1)] - field[row + Math.max(0, x - radius)]
    }
  }
  for (x = 0; x < size; x++) {
    sum = tmp[x] * (radius + 1)
    for (i = 1; i <= radius; i++) sum += tmp[Math.min(size - 1, i) * size + x]
    for (y = 0; y < size; y++) {
      out[y * size + x] = sum / span
      sum += tmp[Math.min(size - 1, y + radius + 1) * size + x] - tmp[Math.max(0, y - radius) * size + x]
    }
  }
  return out
}

function sampleField(field, size, u, v) {
  var fx = Math.min(size - 1.001, Math.max(0, u * (size - 1)))
  var fy = Math.min(size - 1.001, Math.max(0, v * (size - 1)))
  var x0 = fx | 0, y0 = fy | 0
  var tx = fx - x0, ty = fy - y0
  var a = field[y0 * size + x0], b = field[y0 * size + x0 + 1]
  var c = field[(y0 + 1) * size + x0], e = field[(y0 + 1) * size + x0 + 1]
  return (a + (b - a) * tx) * (1 - ty) + (c + (e - c) * tx) * ty
}

function bakerCore(h) {
  var sd = null
  var mask = null
  var grid = 0
  var fg = 0

  function edge(cov, g, scale) {
    var n = g * g
    var on = new Uint8Array(n)
    var off = new Uint8Array(n)
    for (var i = 0; i < n; i++) {
      var hit = cov[i] > 0.5 ? 1 : 0
      on[i] = hit
      off[i] = hit ? 0 : 1
    }
    var inside = h.chamfer(g, off, null)
    var outside = h.chamfer(g, on, null)
    var out = new Float32Array(n)
    for (i = 0; i < n; i++) {
      var a = cov[i]
      if (a > 0.02 && a < 0.98) out[i] = (a - 0.5) / scale
      else out[i] = (on[i] ? inside[i] - 0.5 : -(outside[i] - 0.5)) / scale
    }
    return out
  }

  /* angle — направление полёта энергии в пространстве карты (y вверх). */
  function fields(angle) {
    var n = fg * fg
    var i, x, y
    var inv = new Uint8Array(n)
    for (i = 0; i < n; i++) inv[i] = mask[i] ? 0 : 1

    var blur = Math.max(1, Math.round(fg * 0.02))
    var softOut = h.blurField(h.chamfer(fg, mask, null), fg, blur)
    var softIn = h.blurField(h.chamfer(fg, inv, null), fg, blur)

    var sx = 0, sy = 0, cnt = 0
    for (y = 0; y < fg; y++) {
      for (x = 0; x < fg; x++) {
        if (!mask[y * fg + x]) continue
        sx += x; sy += y; cnt++
      }
    }
    var centre = cnt ? [sx / cnt / (fg - 1), sy / cnt / (fg - 1)] : [0.5, 0.5]

    var best = -1e9, bx = 0, by = 0
    if (angle == null) {
      /* Энергия зарождается внутри: самая «глубокая» точка тела знака,
         при равенстве — ближе к его центру. */
      var cx = centre[0] * (fg - 1), cy = centre[1] * (fg - 1)
      for (y = 0; y < fg; y++) {
        for (x = 0; x < fg; x++) {
          var k0 = y * fg + x
          if (!mask[k0]) continue
          var score = softIn[k0] - Math.hypot(x - cx, y - cy) * 0.3
          if (score > best) { best = score; bx = x; by = y }
        }
      }
    }
    else {
      var rad = angle * Math.PI / 180
      var dx = Math.cos(rad), dy = Math.sin(rad)
      for (y = 0; y < fg; y++) {
        for (x = 0; x < fg; x++) {
          if (!mask[y * fg + x]) continue
          var proj = -(x * dx + y * dy)
          if (proj > best) { best = proj; bx = x; by = y }
        }
      }
    }

    var seed = new Uint8Array(n)
    var r = Math.max(2, Math.round(fg * 0.025))
    var r2 = r * r
    for (y = Math.max(0, by - r); y < Math.min(fg, by + r + 1); y++) {
      for (x = Math.max(0, bx - r); x < Math.min(fg, bx + r + 1); x++) {
        var j = y * fg + x
        if (mask[j] && (x - bx) * (x - bx) + (y - by) * (y - by) <= r2) seed[j] = 1
      }
    }
    var arrival = h.chamfer(fg, seed, mask)

    var maxArr = 0
    for (i = 0; i < n; i++) {
      if (mask[i] && arrival[i] < 1e8 && arrival[i] > maxArr) maxArr = arrival[i]
    }
    if (maxArr <= 0) maxArr = 1
    for (i = 0; i < n; i++) if (mask[i] && arrival[i] > 1e8) arrival[i] = maxArr

    /* Приход волны за контуром = приход у ближайших клеток знака. Без этого
       билинейный сэмпл у края смешивает залитое с «ещё не дошло», и кромка
       загорается позже середины — рваным пиксельным краем. */
    var known = new Uint8Array(n)
    for (i = 0; i < n; i++) known[i] = mask[i]
    var grow = Math.max(4, Math.round(fg * 0.05))
    for (var it = 0; it < grow; it++) {
      var next = known.slice()
      for (y = 0; y < fg; y++) {
        for (x = 0; x < fg; x++) {
          var k = y * fg + x
          if (known[k]) continue
          var sum = 0, cn = 0
          if (x > 0 && known[k - 1]) { sum += arrival[k - 1]; cn++ }
          if (x < fg - 1 && known[k + 1]) { sum += arrival[k + 1]; cn++ }
          if (y > 0 && known[k - fg]) { sum += arrival[k - fg]; cn++ }
          if (y < fg - 1 && known[k + fg]) { sum += arrival[k + fg]; cn++ }
          if (cn) { arrival[k] = sum / cn; next[k] = 1 }
        }
      }
      known = next
    }
    for (i = 0; i < n; i++) if (!known[i]) arrival[i] = maxArr

    var softScale = fg * 0.22
    var g = grid
    var px = new Uint8Array(g * g * 4)
    for (y = 0; y < g; y++) {
      var v = y / (g - 1)
      for (x = 0; x < g; x++) {
        var uu = x / (g - 1)
        var o4 = (y * g + x) * 4
        px[o4] = Math.round(Math.min(1, Math.max(0, sd[y * g + x] * 0.5 + 0.5)) * 255)
        px[o4 + 1] = Math.round(Math.min(1, Math.max(0, h.sampleField(arrival, fg, uu, v) / maxArr)) * 255)
        px[o4 + 2] = Math.round(Math.min(1, Math.max(0, h.sampleField(softIn, fg, uu, v) / softScale)) * 255)
        px[o4 + 3] = Math.round(Math.min(1, Math.max(0, h.sampleField(softOut, fg, uu, v) / softScale)) * 255)
      }
    }
    return { px: px, grid: g, centre: centre, entry: [bx / (fg - 1), by / (fg - 1)], angle: angle }
  }

  return {
    bake: function (job) {
      grid = job.grid
      fg = job.fieldGrid
      sd = edge(job.cov, grid, job.sdScale)
      mask = new Uint8Array(fg * fg)
      for (var i = 0; i < mask.length; i++) mask[i] = job.soft[i] > 0.5 ? 1 : 0
      return fields(job.angle)
    },
    fields: function (job) {
      return sd ? fields(job.angle) : null
    },
  }
}

function bakerSource() {
  return 'var core=(' + bakerCore + ')({chamfer:' + chamfer
    + ',blurField:' + blurField + ',sampleField:' + sampleField + '});'
    + 'onmessage=function(e){var m=e.data;'
    + 'var r=m.type==="bake"?core.bake(m):core.fields(m);'
    + 'if(!r){postMessage({empty:true});return}'
    + 'postMessage(r,[r.px.buffer])}'
}

/* Альфа знака в квадрате size с полями; ряды перевёрнуты (ось Y вверх). */
export function rasterize(img, size, padFrac) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')
  const box = size * (1 - padFrac * 2)
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  const k = Math.min(box / iw, box / ih)
  ctx.drawImage(img, (size - iw * k) / 2, (size - ih * k) / 2, iw * k, ih * k)
  const src = ctx.getImageData(0, 0, size, size).data
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const from = (size - 1 - y) * size
    const to = y * size
    for (let x = 0; x < size; x++) out[to + x] = src[(from + x) * 4 + 3] / 255
  }
  return out
}

/* SVG-строка → картинка нужного размера (без width/height браузер даёт 150×150). */
export function loadSvgImage(svgText, target = 2048) {
  const m = svgText.match(/viewBox\s*=\s*"([^"]+)"/i)
  const vb = m ? m[1].trim().split(/[\s,]+/).map(parseFloat) : [0, 0, 512, 512]
  const k = target / Math.max(vb[2], vb[3])
  const out = svgText
    .replace(/\swidth\s*=\s*"[^"]*"/i, '')
    .replace(/\sheight\s*=\s*"[^"]*"/i, '')
    .replace(/<svg/i, '<svg width="' + Math.round(vb[2] * k) + '" height="' + Math.round(vb[3] * k) + '"')
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out)
  })
}

/* Ручка печи: один воркер на движок, задания по одному, устаревшие ответы
   выбрасываются. */
export function createBaker(onResult) {
  let worker
  let core = null
  let busy = false
  let pending = null
  let url = null

  function spawn() {
    try {
      url = URL.createObjectURL(new Blob([bakerSource()], { type: 'text/javascript' }))
      return new Worker(url)
    }
    catch {
      return null
    }
  }

  function run(job) {
    if (worker === undefined) worker = spawn()
    if (!worker) {
      if (!core) core = bakerCore({ chamfer, blurField, sampleField })
      const r = job.type === 'bake' ? core.bake(job) : core.fields(job)
      if (r) onResult(r)
      return
    }
    if (busy) {
      /* Полная перепечь важнее пересчёта полей. */
      if (!pending || job.type === 'bake') pending = job
      return
    }
    busy = true
    /* Воркер запретила политика CSP — считаем в основном потоке. */
    worker.onerror = () => {
      worker.terminate()
      worker = null
      busy = false
      pending = null
      run(job)
    }
    worker.onmessage = (e) => {
      busy = false
      if (!e.data.empty && !pending) onResult(e.data)
      if (pending) {
        const next = pending
        pending = null
        run(next)
      }
    }
    worker.postMessage(job, job.cov ? [job.cov.buffer, job.soft.buffer] : [])
  }

  return {
    run,
    destroy() {
      if (worker) worker.terminate()
      if (url) URL.revokeObjectURL(url)
      worker = null
    },
  }
}
