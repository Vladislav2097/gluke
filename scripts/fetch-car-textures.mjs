/*
 * Тайловые PBR-наборы для конфигуратора RP Grand.
 *
 * У машины тайл ложится только на зону base color (красный квадрант маски) и
 * по UV1: цвет берётся из тайловой карты, характер поверхности — из normal и
 * roughness той же карты. Поэтому из архивов ambientCG (CC0) нужны ровно три
 * карты, а не весь набор: Color / NormalGL / Roughness. Displacement, AO,
 * Metalness, .blend/.usdc/.mtlx не тащим — metalness задаётся покрытием.
 *
 * Запуск: node scripts/fetch-car-textures.mjs [--force]
 * Идемпотентно: уже разложенные карты не перекачиваются (кроме --force).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const OUT_DIR = 'public/media/projects/rp-grand/textures'
/* 1K достаточно: тайл повторяется 8–20 раз по кузову, деталь плетения
   читается за счёт повтора, а не за счёт разрешения карты. */
const SIZE = 1024
const WEBP = { quality: 82, effort: 5 }

/* Карты ищем по суффиксу имени файла внутри архива. NormalGL, а не NormalDX:
   three.js ждёт OpenGL-конвенцию зелёного канала. */
const MAPS = [
  { key: 'color', needle: '_Color' },
  { key: 'normal', needle: '_NormalGL' },
  { key: 'roughness', needle: '_Roughness' },
]

/*
 * Набор под машину. `id` — имя файлов на выходе и ключ в данных покрытий,
 * `asset` — материал в каталоге ambientCG (для ссылки и атрибуции в sources.json).
 */
/* Тайлы нужны только покрытиям, у которых есть detail-карта (CAR_COVERAGES):
   «Карбон» и «Шлифованный металл». Салон, чёрные элементы и остальные поверхности
   шейдер рисует цветом и roughness без карты, поэтому наборы под них не качаем:
   девять лишних PBR-наборов — это ~3,8 МБ в деплое, которые никто не читает. */
const TEXTURES = [
  { id: 'carbon', asset: 'Fabric004', url: 'https://ambientcg.com/get?file=Fabric004_1K-JPG.zip', use: 'Покрытие «Карбон», твил' },
  { id: 'brushed', asset: 'Metal009', url: 'https://ambientcg.com/get?file=Metal009_1K-JPG.zip', use: 'Покрытие «Шлифованный металл», царапины' },
]

/*
 * Локальные карты — исходники от художника, а не каталог: файлы лежат вне
 * репозитория, в рабочие материалы уходит только готовый WebP. Пропущенный
 * исходник (другая машина, другой путь) не ошибка: шаг просто не выполняется,
 * уже собранный WebP остаётся на месте.
 */
/*
 * Печати (узоры) — набор заказчика: у каждой карты только base color, рельеф и
 * шероховатость задаёт покрытие. Файлы лежат вне репозитория, в деплой уходит
 * только готовый WebP.
 *
 * Две карты на печать: `color` (768 px) уезжает в шейдер, `thumb` (96 px) —
 * плитка в панели выбора. Превью обязательно маленькое: панель показывает все
 * печати сразу, и без превью браузер тянул бы шесть сотен килобайт ради
 * квадратиков 38 px. Печать — тайл, который ложится 2–3 раза по кузову, так что
 * 768 px в WebP — это десятки килобайт, а не сотни (апскейла нет: 800×800
 * остаётся как есть).
 *
 * `pattern` (t_PatternCheck1) — прежняя заглушка «чтобы понять, как работает»,
 * удалена вместе с файлом: узоры теперь настоящие.
 */
const PATTERN_DIR = process.env.CAR_PATTERN_DIR ?? 'D:/Work/Clients/GAME_ART/RP Grand/Новая папка'

/* Плитка в панели — 38 CSS px (до 76 на retina): 96 px хватает с запасом. */
const PATTERN_MAPS = [
  { key: 'color', size: 768, webp: { quality: 78, effort: 6 } },
  { key: 'thumb', size: 96, webp: { quality: 72, effort: 5 } },
]

const LOCAL = [
  { id: 'camouflage', source: '1K-camouflage_3-diffuse.jpg', use: 'Печать «Камуфляж»' },
  { id: 'memphis', source: 'abstract-memphis-multi-seamless-pattern.webp', use: 'Печать «Мемфис»' },
  { id: 'cherry', source: 'botanical-cherry-blossom-pink-seamless-pattern.webp', use: 'Печать «Сакура»' },
  { id: 'cow', source: 'cow-print-black-white-seamless-pattern.webp', use: 'Печать «Корова»' },
  { id: 'giraffe', source: 'giraffe-print-amber-brown-seamless-pattern.webp', use: 'Печать «Жираф»' },
  { id: 'tie-dye', source: 'tie-dye-spiral-rainbow-seamless-pattern.webp', use: 'Печать «Тай-дай»' },
  { id: 'tiger', source: 'tiger-stripe-orange-black-seamless-pattern.webp', use: 'Печать «Тигр»' },
  { id: 'tropical', source: 'tropical-floral-bright-seamless-pattern.webp', use: 'Печать «Тропика»' },
  { id: 'morris', source: 'william-morris-sage-gold-seamless-pattern.webp', use: 'Печать «Моррис»' },
  { id: 'chrysanthemum', source: '3.jpg', use: 'Печать «Хризантемы»' },
  { id: 'uv-checker', source: 'uv-checker.jpg', use: 'Печать «UV-сетка» — проверка развёртки' },
].map(pattern => ({
  ...pattern,
  asset: 'seamless tile',
  license: '© RP Grand — материал заказчика',
  source: `${PATTERN_DIR}/${pattern.source}`,
  maps: PATTERN_MAPS,
}))

const force = process.argv.includes('--force')

/* Уже разложенные карты тоже попадают в sources.json — иначе повторный прогон
   скрипта (без --force) потерял бы из перечня всё, что лежит на диске. */
function existingEntry(texture, mapKeys, outFiles, license, source) {
  const bytes = {}
  for (const [index, key] of mapKeys.entries()) bytes[key] = statSync(outFiles[index]).size
  return { id: texture.id, asset: texture.asset, use: texture.use, source, license, maps: mapKeys, bytes }
}

const AMBIENTCG_LICENSE = 'CC0 1.0'
const AMBIENTCG_PAGE = url => url
  .replace('https://ambientcg.com/get?file=', 'https://ambientcg.com/a/')
  .replace('_1K-JPG.zip', '')

function log(message) {
  process.stdout.write(`${message}\n`)
}

async function download(url, file) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} на ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  writeFileSync(file, bytes)
  return bytes.length
}

/* unzip есть и в Git Bash, и в CI-образах; держим его вместо zip-зависимости. */
function extract(zipFile, dir) {
  execFileSync('unzip', ['-o', '-q', zipFile, '-d', dir], { stdio: 'pipe' })
  const listing = execFileSync('unzip', ['-Z1', zipFile], { encoding: 'utf8' })
  return listing.split('\n').map(line => line.trim()).filter(Boolean)
}

async function writeMap(sourceFile, outFile, options = {}) {
  const size = options.size ?? SIZE
  const info = await sharp(sourceFile)
    /* `inside` без увеличения: карта, которая уже меньше предела, остаётся
       своей — растягивать её значит весить больше без единой новой детали. */
    .resize(size, size, { fit: options.fit ?? 'fill', withoutEnlargement: true })
    .webp(options.webp ?? WEBP)
    .toFile(outFile)
  return info.size
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const sources = []
  const tmp = mkdtempSync(path.join(tmpdir(), 'car-tex-'))
  let total = 0
  const missing = []

  try {
    for (const texture of TEXTURES) {
      const outFiles = MAPS.map(map => path.join(OUT_DIR, `${texture.id}-${map.key}.webp`))
      if (!force && outFiles.every(file => existsSync(file))) {
        log(`= ${texture.id.padEnd(14)} уже на месте`)
        sources.push(existingEntry(
          texture,
          MAPS.map(map => map.key),
          outFiles,
          AMBIENTCG_LICENSE,
          AMBIENTCG_PAGE(texture.url),
        ))
        continue
      }

      const zipFile = path.join(tmp, `${texture.id}.zip`)
      const dir = path.join(tmp, texture.id)
      mkdirSync(dir, { recursive: true })

      const bytes = await download(texture.url, zipFile)
      const entries = extract(zipFile, dir)

      const written = {}
      for (const map of MAPS) {
        const entry = entries.find(name => name.includes(map.needle))
        if (!entry) {
          missing.push(`${texture.asset}${map.needle}`)
          continue
        }
        written[map.key] = await writeMap(
          path.join(dir, entry),
          path.join(OUT_DIR, `${texture.id}-${map.key}.webp`),
        )
      }

      total += Object.values(written).reduce((sum, size) => sum + size, 0)
      const sizes = Object.entries(written)
        .map(([key, size]) => `${key} ${Math.round(size / 1024)}КБ`)
        .join(', ')
      log(`+ ${texture.id.padEnd(14)} ${String(Math.round(bytes / 1024)).padStart(4)}КБ zip → ${sizes}`)

      sources.push({
        id: texture.id,
        asset: texture.asset,
        use: texture.use,
        source: AMBIENTCG_PAGE(texture.url),
        license: AMBIENTCG_LICENSE,
        maps: Object.keys(written),
        bytes: written,
      })
    }

    /* Локальные карты: тот же выходной формат, другой источник. */
    for (const texture of LOCAL) {
      const keys = texture.maps.map(map => map.key)
      const outFiles = keys.map(key => path.join(OUT_DIR, `${texture.id}-${key}.webp`))
      if (!force && outFiles.every(file => existsSync(file))) {
        log(`= ${texture.id.padEnd(14)} уже на месте`)
        sources.push(existingEntry(texture, keys, outFiles, texture.license, texture.source))
        continue
      }
      if (!existsSync(texture.source)) {
        log(`! ${texture.id.padEnd(14)} нет исходника: ${texture.source}`)
        continue
      }

      const written = {}
      for (const map of texture.maps) {
        written[map.key] = await writeMap(
          texture.source,
          path.join(OUT_DIR, `${texture.id}-${map.key}.webp`),
          { size: map.size, webp: map.webp },
        )
      }

      total += Object.values(written).reduce((sum, size) => sum + size, 0)
      log(`+ ${texture.id.padEnd(14)} локальный исходник → ${Object.entries(written).map(([key, size]) => `${key} ${Math.round(size / 1024)}КБ`).join(', ')}`)

      sources.push({
        id: texture.id,
        asset: texture.asset,
        use: texture.use,
        source: texture.source,
        license: texture.license,
        maps: Object.keys(written),
        bytes: written,
      })
    }
  }
  finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  writeFileSync(
    path.join(OUT_DIR, 'sources.json'),
    `${JSON.stringify({ license: 'CC0 1.0 — без атрибуции для ambientCG; узор — материал заказчика', note: 'Сгенерировано scripts/fetch-car-textures.mjs', textures: sources }, null, 2)}\n`,
  )

  log(`\nИтого: ${(total / 1024 / 1024).toFixed(2)} МБ в ${OUT_DIR}`)
  if (missing.length > 0) log(`Не найдены карты: ${missing.join(', ')}`)
}

await main()
