/**
 * Проверка файлов `content/` против zod-схем из `content.config.ts`.
 *
 * Зачем это нужно. Nuxt Content 3 использует схему коллекции только для двух
 * вещей: генерации типов и вывода типов колонок SQLite. Содержимое файлов
 * против схемы он не валидирует — данные попадают в базу как есть. Поэтому
 * ошибка в контенте проходит сборку молча и всплывает уже на странице.
 *
 * Реальный случай: строка `answer: Да: продуктовые анимации…`. Плоский скаляр
 * YAML не может содержать `": "`, поэтому парсер превратил ответ во вложенный
 * объект, а страница отрендерила его как `{ "Да": "…" }`. Схема объявляет
 * `answer: z.string()`, но проверить это было некому.
 *
 * Скрипт закрывает именно эту дыру: грузит те же самые zod-схемы (через
 * jiti + scripts/content-config-stub.mjs), читает файлы коллекций и прогоняет
 * их через `safeParse`. Ошибка — ненулевой код возврата и путь до поля.
 *
 * Вторая проверка здесь — порядок подборки профиля (`categoryOrder`): он задан
 * в кейсах руками, а сетку `/projects?category=…` собирает код. Правка
 * `position` (он ведёт архив), вывод кейса из профиля или новая выгрузка
 * перетасуют подборку молча, поэтому состав и порядок сверяются с явным
 * списком. Правило — `app/utils/categoryOrder.ts`, оно же здесь и применяется,
 * чтобы проверка не завела свою копию.
 *
 * Использование: pnpm validate:content   (входит в pnpm check и в CI)
 */
import { existsSync, readFileSync } from 'node:fs'
import { glob, readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { createJiti } from 'jiti'
import { parse as parseYaml } from 'yaml'
import { collectImageVersions } from './media-versions.mjs'
import { CACHE_MIRROR_HEADER, CACHE_ROUTE_RULES } from './cache-headers.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'content')

/* Поля, которые Nuxt Content добавляет сам при разборе файла (path/body и
   прочее). В самих файлах их нет, поэтому перед проверкой они дописываются
   заглушками — иначе обязательные поля страничных коллекций дадут ложную
   ошибку. Значения из файла всегда перекрывают заглушку. */
const GENERATED_PAGE_FIELDS = {
  path: '/generated',
  title: 'generated',
  description: 'generated',
  seo: {},
  body: { type: 'minimal', value: [] },
}

function firstLine(message) {
  return String(message).split(/\r?\n/)[0]
}

/**
 * Проверка картинок кейса: обложка (`cover.src`), её мобильная композиция
 * (`cover.mobile.src`) и отдельный `hero.src`.
 *
 * Первое — файл обязан лежать на диске: адрес уходит в карточку, в
 * `og:image` и в превью ссылки, а битая ссылка видна не в сборке, а в чате у
 * клиента. Второе — у share-картинки (обложка и hero) должна быть версия
 * (отпечаток содержимого, `scripts/media-versions.mjs`): без неё мессенджер
 * держит закэшированную картинку превью и после замены файла показывает старое
 * изображение. Мобильная композиция в соцсети не уходит, поэтому версии ей не
 * нужно — только файл на диске.
 */
function shareImageIssues(data, versions) {
  const issues = []

  for (const [field, image] of [
    ['cover', data.cover],
    ['cover.mobile', data.cover?.mobile],
    ['hero', data.hero],
  ]) {
    const src = image?.src

    if (!src) {
      continue
    }

    if (!existsSync(join(root, 'public', src))) {
      issues.push(`    ${field}.src: файла нет — public${src}`)
      continue
    }

    if (field !== 'cover.mobile' && !versions[src]) {
      issues.push(`    ${field}.src: нет отпечатка для превью ссылки — ${src}`)
    }
  }

  return issues
}

/**
 * Коды зон Vercel. Список короткий и меняется редко — зато ловит то, что
 * сборка пропускает: `fra1` и `fr1`, `iad1` и `iad` выглядят одинаково
 * правдоподобно, а деплой с несуществующей зоной падает уже в Vercel, то есть
 * после всего локального прогона.
 * Источник: vercel.com/docs/regions.
 */
const VERCEL_REGIONS = new Set([
  'arn1', 'bom1', 'cdg1', 'cle1', 'cpt1', 'dub1', 'dxb1', 'fra1', 'gru1', 'hnd1',
  'iad1', 'icn1', 'kix1', 'lhr1', 'pdx1', 'sfo1', 'sin1', 'syd1',
])

/**
 * Проверка конфигурации деплоя — того, что не видно ни в сборке, ни на странице.
 *
 * Кэшируют ответы не сборка и не Nuxt, а платформа: потерянный маршрут кэша
 * не даёт ошибки — страница или картинка просто возвращается к перепроверке на
 * каждом заходе, то есть к медленной загрузке на плохом канале. Поэтому
 * проверяется не «настройка где-то есть», а состав каждого маршрута.
 *
 * Политика лежит в `routeRules` (`scripts/cache-headers.mjs`), а не в
 * `vercel.json`. Это выяснилось на проде: роуты сборки
 * (`.vercel/output/config.json`) применяются раньше конфига деплоя, поэтому
 * правило `headers` для `/media/(.*)` молча проигрывало правилу `/**`, и
 * статика кэшировалась по страничному набору (`docs/changes-log.md` §76).
 * Оставшийся `headers` в `vercel.json` вернул бы второй, спорящий источник
 * правды — это тоже ошибка.
 *
 * Количество зон вычислений ограничено планом: на Hobby доступна одна, и лишняя
 * зона валит деплой ещё до сборки. Поэтому значение проверяется явно, а не
 * подразумевается (при смене плана это место и есть то, что правится вместе с ним,
 * см. docs/dev-guide.md §8).
 *
 * Зона задаётся **в двух местах**: `regions` здесь и поле проекта
 * `serverlessFunctionRegion` (Settings → Functions), где у нового проекта стоит
 * платформенное умолчание `iad1`. Сборка и ответ функции расходятся при этом
 * молча — у проекта `gluke` в дашборде стоял `iad1`, а функции исполнялись во
 * `fra1` (`docs/changes-log.md` §79). Из репозитория видно только свою сторону,
 * поэтому здесь проверяется она (одна зона и опечатка в коде), а совпадение с
 * живым деплоем — пробой `pnpm check:cache:prod`.
 *
 * Отдельно проверяется пропуск сборки (`ignoreCommand`). Потерянная строка не
 * ломает ни страницу, ни сборку: каждый пуш — включая правку одних доков —
 * просто снова создаёт деплой и тратит место в Deployment Storage
 * (`docs/run.md`, «Хранилище деплоев»).
 */
function deployConfigIssues() {
  const issues = []
  let config

  try {
    config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
  }
  catch (error) {
    return [`    vercel.json не читается: ${firstLine(error.message)}`]
  }

  if (config.headers?.length) {
    issues.push('    headers: кэш вернулся в vercel.json — роуты сборки применяются раньше, такое правило молча проиграет; политика живёт в scripts/cache-headers.mjs')
  }

  if (!Array.isArray(config.regions) || config.regions.length !== 1) {
    issues.push(`    regions: ожидается одна зона (Hobby), а не ${JSON.stringify(config.regions)}`)
  }
  else if (!VERCEL_REGIONS.has(config.regions[0])) {
    issues.push(`    regions: «${config.regions[0]}» не код зоны Vercel — опечатка в конфиге не даст ошибки сборки, а перенесёт функции или уронит деплой`)
  }

  /* Пропуск сборки: код 0 от этой команды означает «не собирать», поэтому
     важен и сам факт наличия команды, и то, что файл существует. Без неё
     правка одних доков порождает деплой с трёхсотмегабайтным выводом. */
  if (typeof config.ignoreCommand !== 'string' || !config.ignoreCommand.includes('scripts/ignore-build.mjs')) {
    issues.push('    ignoreCommand: нет пропуска сборки на коммитах без изменений исходников — каждый пуш только с доками создаёт деплой (scripts/ignore-build.mjs)')
  }
  else if (!existsSync(join(root, 'scripts', 'ignore-build.mjs'))) {
    issues.push(`    ignoreCommand: «${config.ignoreCommand}» ссылается на несуществующий файл`)
  }

  /* Каждый маршрут политики обязан нести срок и в браузерном заголовке, и в
     зеркале CDN: без зеркала директивы не доезжают до клиента совсем, а
     разошедшееся зеркало означает, что кэш живёт по другому набору, чем
     записано в политике. */
  for (const [route, rule] of Object.entries(CACHE_ROUTE_RULES)) {
    const headers = rule?.headers

    if (!headers?.['cache-control']?.includes('max-age=')) {
      issues.push(`    routeRules: маршрут ${route} без браузерного срока — ответ будет перепроверяться на каждом заходе`)
    }

    if (headers?.[CACHE_MIRROR_HEADER] !== headers?.['cache-control']) {
      issues.push(`    routeRules: у маршрута ${route} зеркало ${CACHE_MIRROR_HEADER} не совпадает с cache-control`)
    }
  }

  /* Картинки `/_vercel/image` собирает платформенный оптимизатор, но правило
     `/**` накрывает и их — маршрут обязан быть, иначе картинки получат
     страничные 60 секунд вместо недели. */
  if (!CACHE_ROUTE_RULES['/_vercel/image']) {
    issues.push('    routeRules: нет маршрута /_vercel/image — варианты картинок попадут под страничный набор')
  }

  return issues
}

/* Подборка профиля: состав и порядок заданы явно — то, что видно глазами
   и потому легко ломается молча. Список намеренно лежит здесь, а не в кейсах:
   проверка должна знать, что **должно** быть, иначе она подтвердит любую
   перестановку. */
const SHOWCASE = {
  category: 'webgl',
  order: [
    'getic',
    'softlogic',
    'rp-grand',
    'energy-fill',
    'pyramid',
    'constellation',
    'particles',
    'metaballs',
    'image-particles',
    'water',
  ],
}

function categoryOrderIssues(byLocale, orderCategoryProjects) {
  const issues = []
  const members = {}

  for (const [locale, projects] of Object.entries(byLocale)) {
    members[locale] = projects.filter(project => project.categories?.includes(SHOWCASE.category))

    /* Порядок подборки — только `categoryOrder`: кейс без него встаёт по
       номеру архива, то есть подборка незаметно поедет. */
    for (const project of members[locale]) {
      if (typeof project.categoryOrder?.[SHOWCASE.category] !== 'number') {
        issues.push(`    подборка «${SHOWCASE.category}» (${locale}): у кейса ${project.slug} не задан categoryOrder — его место решает номер архива`)
      }
    }

    const orders = members[locale]
      .map(project => project.categoryOrder?.[SHOWCASE.category])
      .filter(value => typeof value === 'number')
    if (new Set(orders).size !== orders.length) {
      issues.push(`    подборка «${SHOWCASE.category}» (${locale}): номера categoryOrder повторяются — порядок этих кейсов не определён`)
    }

    const actual = orderCategoryProjects(members[locale], SHOWCASE.category).map(project => project.slug)
    if (actual.join(', ') !== SHOWCASE.order.join(', ')) {
      issues.push(`    подборка «${SHOWCASE.category}» (${locale}) идёт: ${actual.join(', ')}`)
      issues.push(`    подборка «${SHOWCASE.category}» (${locale}) ожидается:  ${SHOWCASE.order.join(', ')}`)
    }
  }

  /* Подборка одна на два языка: разные составы означают, что один из них
     правили мимоходом. */
  const [first, ...rest] = Object.entries(members)
  if (first) {
    const expected = first[1].map(project => project.slug).sort()
    for (const [locale, projects] of rest) {
      const actual = projects.map(project => project.slug).sort()
      if (actual.join(', ') !== expected.join(', ')) {
        issues.push(`    подборка «${SHOWCASE.category}»: состав локалей разный — ${first[0]}: ${expected.join(', ')}; ${locale}: ${actual.join(', ')}`)
      }
    }
  }

  return issues
}

/* База знаний: связи статьи с остальным сайтом. Схема поля проверяет, а
   существование того, на что поле ссылается, — нет: опечатка в slug кейса
   дала бы молча пропавшую карточку, а в адресе схемы — пустую рамку.

   Правила:
   - статья лежит парой RU + EN с одним slug и одним статусом — sitemap и
     hreflang считают, что у адреса есть обе версии;
   - `cases` — опубликованные кейсы, `related` — опубликованные статьи той же
     локали;
   - у статьи есть `cover` или хотя бы один кейс: из них берётся картинка
     превью ссылки;
   - `::kb-figure{art}` — существующая схема в `app/components/knowledge/art/`,
     и у неё есть `alt`;
   - внутренние ссылки в тексте ведут на существующие кейсы и статьи своего
     языка, а ссылка на глоссарий с якорем — на существующий термин;
   - slug `glossary` занят страницей глоссария: статья с ним не открылась бы. */
const ART_DIR = join(root, 'app', 'components', 'knowledge', 'art')
const LOCALE_PREFIX = { en: '', ru: '/ru' }

function artFile(name) {
  return name.replace(/(^|-)([a-z0-9])/g, (_, __, char) => char.toUpperCase()) + '.vue'
}

function knowledgeIssues(knowledgeByLocale, projectsByLocale, glossaryByLocale) {
  const failures = []
  const locales = Object.keys(LOCALE_PREFIX)
  const published = (items = []) => new Set(items.filter(item => item.status === 'published').map(item => item.slug))

  for (const locale of locales) {
    const articles = knowledgeByLocale[locale] ?? []
    const cases = published(projectsByLocale[locale])
    const ownArticles = published(articles.map(article => article.data))
    const termIds = new Set((glossaryByLocale[locale]?.data.terms ?? []).map(term => term.id))
    const prefix = LOCALE_PREFIX[locale]

    for (const { data, raw, file } of articles) {
      const issues = []

      if (data.slug === GLOSSARY_SLUG) {
        issues.push(`    slug «${GLOSSARY_SLUG}» занят страницей глоссария — статья по этому адресу не откроется`)
      }

      for (const other of locales.filter(code => code !== locale)) {
        const pair = (knowledgeByLocale[other] ?? []).find(article => article.data.slug === data.slug)
        if (!pair) {
          issues.push(`    нет пары: статьи «${data.slug}» нет в локали ${other}`)
        }
        else if (pair.data.status !== data.status) {
          issues.push(`    статус «${data.status}», а у пары в ${other} — «${pair.data.status}»`)
        }
      }

      if (data.status !== 'published') {
        if (issues.length) failures.push({ file, collection: 'knowledge', issues })
        continue
      }

      for (const slug of data.cases ?? []) {
        if (!cases.has(slug)) issues.push(`    cases: опубликованного кейса «${slug}» нет`)
      }
      for (const slug of data.related ?? []) {
        if (!ownArticles.has(slug)) issues.push(`    related: опубликованной статьи «${slug}» нет`)
      }
      if (!data.cover && !(data.cases ?? []).length) {
        issues.push('    нужен cover или хотя бы один кейс в cases — без них нечем показать превью ссылки')
      }

      for (const match of raw.matchAll(/::kb-figure\{([^}]*)\}/g)) {
        const art = match[1].match(/art="([^"]+)"/)?.[1]
        if (!art) {
          issues.push(`    kb-figure без art: ${match[0]}`)
          continue
        }
        if (!existsSync(join(ART_DIR, artFile(art)))) {
          issues.push(`    kb-figure: схемы «${art}» нет (ждём app/components/knowledge/art/${artFile(art)})`)
        }
        if (!/alt="[^"]+"/.test(match[1])) {
          issues.push(`    kb-figure «${art}»: нет alt — без него схема пуста для скринридера и для markdown-версии`)
        }
      }

      for (const match of raw.matchAll(/\]\((\/[^)\s]*)/g)) {
        const href = match[1]
        const link = href.match(/^(\/ru)?\/(projects|knowledge)\/([a-z0-9-]+)(?:#([a-z0-9-]+))?$/)
        if (!link) continue
        const [, linkPrefix = '', kind, slug, hash] = link
        if (linkPrefix !== prefix) {
          issues.push(`    ссылка ${href} ведёт на другой язык`)
        }
        else if (kind === 'knowledge' && slug === GLOSSARY_SLUG) {
          if (hash && !termIds.has(hash)) issues.push(`    ссылка ${href}: термина «${hash}» в глоссарии нет`)
        }
        else if (!(kind === 'projects' ? cases : ownArticles).has(slug)) {
          issues.push(`    ссылка ${href}: такой опубликованной страницы нет`)
        }
      }

      if (issues.length) failures.push({ file, collection: 'knowledge', issues })
    }
  }

  return failures
}

/* Глоссарий: файл на каждую локаль, одинаковый набор `id` (это якоря одной
   и той же страницы в двух языках), без повторов; `article` — опубликованная
   статья той же локали. */
const GLOSSARY_SLUG = 'glossary'

function glossaryIssues(glossaryByLocale, knowledgeByLocale) {
  const failures = []
  const locales = Object.keys(LOCALE_PREFIX)

  for (const locale of locales) {
    const entry = glossaryByLocale[locale]
    if (!entry) {
      if (locales.some(code => glossaryByLocale[code])) {
        failures.push({ file: `content/glossary/${locale}.yml`, collection: 'glossary', issues: ['    файла нет, а у другой локали глоссарий есть'] })
      }
      continue
    }

    const issues = []
    const ids = entry.data.terms.map(term => term.id)
    const articles = new Set((knowledgeByLocale[locale] ?? [])
      .filter(article => article.data.status === 'published')
      .map(article => article.data.slug))

    for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) {
      issues.push(`    id «${id}» повторяется`)
    }
    for (const other of locales.filter(code => code !== locale && glossaryByLocale[code])) {
      const otherIds = new Set(glossaryByLocale[other].data.terms.map(term => term.id))
      for (const id of ids.filter(id => !otherIds.has(id))) {
        issues.push(`    термина «${id}» нет в локали ${other}`)
      }
    }
    for (const term of entry.data.terms) {
      if (term.article && !articles.has(term.article)) {
        issues.push(`    ${term.id}: опубликованной статьи «${term.article}» нет`)
      }
    }

    if (issues.length) failures.push({ file: entry.file, collection: 'glossary', issues })
  }

  return failures
}

function collectIssues(error) {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(корень)'
    return `    ${path}: ${issue.message}`
  })
}

/* Frontmatter из .md: только блок между первой парой `---`. Тело документа
   схемой не описывается — его разбирает сам Nuxt Content. */
function readFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  return match ? parseYaml(match[1]) : {}
}

function createProjectJiti() {
  return createJiti(import.meta.url, {
    alias: { '@nuxt/content': join(root, 'scripts', 'content-config-stub.mjs') },
    interopDefault: true,
  })
}

/* content.config.ts грузится через jiti с подменой `@nuxt/content`: настоящий
   `defineCollection()` конвертирует zod в JSON Schema и исходную схему теряет,
   а нам нужна именно она. См. scripts/content-config-stub.mjs. */
async function loadCollections(jiti) {
  const configUrl = pathToFileURL(join(root, 'content.config.ts')).href
  const config = await jiti.import(configUrl, { default: true })

  return config.collections ?? {}
}

/* Правило порядка подборки берётся из самого модуля приложения: своя копия
   здесь подтверждала бы любую перестановку. jiti умеет и TypeScript. */
async function loadCategoryOrder(jiti) {
  const moduleUrl = pathToFileURL(join(root, 'app', 'utils', 'categoryOrder.ts')).href
  return await jiti.import(moduleUrl)
}

async function main() {
  const jiti = createProjectJiti()
  const collections = await loadCollections(jiti)
  const { orderCategoryProjects } = await loadCategoryOrder(jiti)
  const imageVersions = collectImageVersions({ rootDir: root })
  const failures = []
  const projectsByLocale = {}
  const knowledgeByLocale = {}
  const glossaryByLocale = {}
  let checked = 0

  for (const [name, collection] of Object.entries(collections)) {
    const source = typeof collection.source === 'string' ? collection.source : collection.source?.include
    if (!source || !collection.schema) {
      continue
    }

    for await (const entry of glob(source, { cwd: contentDir })) {
      const file = join(contentDir, entry)
      const shortPath = relative(root, file).split(sep).join('/')
      const raw = await readFile(file, 'utf8')
      checked += 1

      /* Сам YAML тоже может оказаться невалидным — например, плоский скаляр
         с `": "` внутри. Это ошибка того же класса, поэтому сообщение должно
         быть таким же понятным, как у нарушения схемы, а не стектрейсом. */
      let data
      try {
        data = entry.endsWith('.md') ? readFrontmatter(raw) : parseYaml(raw)
      }
      catch (error) {
        failures.push({
          file: shortPath,
          collection: name,
          issues: [`    YAML не разобран: ${firstLine(error.message)}`],
        })
        continue
      }

      const payload = collection.type === 'page' ? { ...GENERATED_PAGE_FIELDS, ...data } : data
      const result = collection.schema.safeParse(payload)
      if (!result.success) {
        failures.push({
          file: shortPath,
          collection: name,
          issues: collectIssues(result.error),
        })
        continue
      }

      /* Проверка схемы выше уже гарантирует, что `cover.src` — строка со
         `/media/`: дальше проверяем уже медиа, а не поля. */
      if (name === 'projects') {
        const issues = shareImageIssues(result.data, imageVersions)

        if (issues.length) {
          failures.push({ file: shortPath, collection: name, issues })
        }

        /* Собираются все кейсы локали: порядок подборки — свойство набора,
           а не отдельного файла, поэтому проверяется после обхода. */
        const locale = result.data.locale
        projectsByLocale[locale] ??= []
        projectsByLocale[locale].push(result.data)
      }

      if (name === 'knowledge') {
        knowledgeByLocale[result.data.locale] ??= []
        knowledgeByLocale[result.data.locale].push({ data: result.data, raw, file: shortPath })
      }

      if (name === 'glossary') {
        glossaryByLocale[result.data.locale] = { data: result.data, file: shortPath }
      }
    }
  }

  const configIssues = deployConfigIssues()
  const orderIssues = categoryOrderIssues(projectsByLocale, orderCategoryProjects)
  failures.push(...knowledgeIssues(knowledgeByLocale, projectsByLocale, glossaryByLocale))
  failures.push(...glossaryIssues(glossaryByLocale, knowledgeByLocale))

  if (orderIssues.length) {
    console.error('\n[validate:content] подборки профилей нарушены:\n')
    console.error(orderIssues.join('\n'))
    console.error('')
  }

  if (configIssues.length) {
    console.error('\n[validate:content] конфигурация деплоя нарушена:\n')
    console.error('  vercel.json  (деплой)')
    console.error(configIssues.join('\n'))
    console.error('')
  }

  if (failures.length) {
    console.error(`\n[validate:content] схема нарушена в ${failures.length} из ${checked} файлов:\n`)
    for (const failure of failures) {
      console.error(`  ${failure.file}  (коллекция «${failure.collection}»)`)
      console.error(failure.issues.join('\n'))
      console.error('')
    }
  }

  if (failures.length || configIssues.length || orderIssues.length) {
    process.exit(1)
  }

  console.log(`[validate:content] ${checked} файлов — схема соблюдена`)
}

await main()
