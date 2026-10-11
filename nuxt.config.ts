import { DEFAULT_LOCALE, SITE_LOCALES } from './shared/i18n'
import { collectImageVersions } from './scripts/media-versions.mjs'
import { CACHE_ROUTE_RULES } from './scripts/cache-headers.mjs'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/image',
    '@nuxt/content',
    '@nuxt/fonts',
    '@nuxtjs/i18n',
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-schema-org',
  ],
  $development: {
    devtools: { enabled: true },
    /* vue-tsc-вотчер в dev (typeCheck: true) держит полную TS-программу в
       воркер-потоке: замедляет холодный старт на ~15–20 с и копит память
       при каждой правке (см. docs/run.md «Dev server memory bloat»). Проверка
       типов в dev не теряется: изолированный `pnpm typecheck` и CI-джоб
       гоняют vue-tsc отдельно; для build typeCheck остаётся включённым. */
    typescript: { typeCheck: false },
  },
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  /* Единственное место конфигурации сайта.
     url и env приходят из NUXT_SITE_URL и NUXT_SITE_ENV и намеренно не дублируются здесь. */
  site: {
    name: 'GLUKE',
    defaultLocale: DEFAULT_LOCALE,
  },
  /* Интеграция Nuxt UI с Nuxt Color Mode: тёмная тема при первом визите,
     класс `.dark`/`.light` ставит штатный ранний скрипт до гидратации,
     сохранённый выбор пользователя читается из стандартного хранилища. */
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    /* Nuxt UI по умолчанию глушит transition на время смены темы; здесь переход
       разрешён, потому что он ограничен цветовыми свойствами и длится 180 ms. */
    disableTransition: false,
  },
  content: {
    experimental: {
      /* better-sqlite3 (дефолтный коннектор) вместо node:sqlite: у native
         на Windows dev-сервер терял таблицу _content_site при инкрементальной
         пересборке (no such table), страницы отдавали 500. */
      sqliteConnector: 'better-sqlite3',
    },
  },
  /* Яндекс.Метрика подключается только если задан публичный ID счётчика
     (NUXT_PUBLIC_YM_ID) — см. app/plugins/yandex-metrika.client.ts.
     Без переменной скрипт Метрики на сайт не грузится вообще. */
  runtimeConfig: {
    public: {
      yandexMetrikaId: '',
      /* Отпечатки картинок контента: «адрес → версия содержимого».

         Мессенджер держит картинку превью по её URL и страницу не
         переспрашивает, поэтому адрес share-картинки получает отпечаток: иначе
         клиенту уходит закэшированная старая картинка, даже если файл заменён.
         Тот же отпечаток уходит в адрес варианта `/_ipx/**` модификатором
         (см. app/utils/imageVersion.ts) — иначе кэш браузера и CDN не заметил
         бы замену картинки: адрес варианта от содержимого не зависит.

         Карта считается один раз при сборке или старте dev-сервера
         (scripts/media-versions.mjs), в рантайме файлы не читаются. */
      imageVersions: collectImageVersions(),
    },
  },
  /* Production-сборка (scripts/nuxt-run.mjs) идёт в отдельный каталог `.nuxt-build`:
     dev-сервер держит свои шаблоны в `.nuxt`, и общий каталог приводил к тому,
     что dev-шаблоны (createRequire из @nuxt/icon) протекали в прод-бандл и
     ломали prerender на Windows. Dev и typecheck (`.nuxt-typecheck`) не меняются. */
  buildDir: import.meta.env.NUXT_BUILD_DIR || '.nuxt',
  /* Кэш ответов.

     Политика — наборы директив и их разбивка по маршрутам — лежит в
     scripts/cache-headers.mjs: её же читают проверка заголовков на собранном
     сервере и валидатор конфигурации деплоя, поэтому значение в конфиге и в
     проверке разъехаться не могут. Почему директивам нужно зеркало
     `cdn-cache-control` — там же.

     Почему CDN, а не «вторая зона»: серверные функции на Vercel исполняются в
     одной зоне (на Hobby — только в одной, мультирегион доступен с Pro), а
     кэш CDN работает на любом плане. Так зависимость от зоны снимается не
     переездом вычислений, а тем, что до зоны дело доходит только на промахе
     кэша. Почему `regions` остаётся `["fra1"]` — docs/dev-guide.md §8.

     Единственный персонализированный маршрут — корень: его закрывает `private,
     no-store` из server/middleware/locale-redirect.ts, и закрывает в обоих
     заголовках — иначе кэшируемый набор из CACHE_ROUTE_RULES остался бы для
     Vercel старшим и общий кэш отдал бы русскому гостю английскую страницу. */
  routeRules: CACHE_ROUTE_RULES,
  experimental: {
    /* Типизированные маршруты нужны локализованным ссылкам: имя маршрута и его
       параметры проверяются компилятором вместо ручной сборки путей строками. */
    typedPages: true,
  },
  compatibilityDate: '2026-07-29',
  /* Nitro генерирует tsconfig.server.json со своим дефолтом forceConsistentCasingInFileNames=true;
     Nuxt не пробрасывает туда typescript.tsConfig, поэтому дублируем опцию. */
  nitro: {
    typescript: {
      tsConfig: {
        compilerOptions: {
          forceConsistentCasingInFileNames: false,
        },
      },
    },
  },
  vite: {
    /* Тяжёлые lazy-зависимости (three и его загрузчики) пребандлим при старте
       dev-сервера: без include первый заход на страницу с 3D-моделью триггерил
       on-demand-оптимизацию и перезагрузку страницы. optimizeDeps — только
       для dev, на production-сборку не влияет. */
    optimizeDeps: {
      include: [
        'three',
        'three/examples/jsm/controls/OrbitControls.js',
        'three/examples/jsm/environments/RoomEnvironment.js',
        'three/examples/jsm/loaders/DRACOLoader.js',
        'three/examples/jsm/loaders/GLTFLoader.js',
      ],
    },
  },
  typescript: {
    typeCheck: true,
    /* На Windows пути к пакетам pnpm в node_modules/.pnpm записываются с регистром,
       отличающимся от реальных папок на диске (D:/WORK/... vs D:/Work/...), из-за чего
       vue-tsc падал с TS1149 (имя файла отличается только регистром). Проверка
       бессмысленна на case-insensitive NTFS — отключаем. */
    tsConfig: {
      compilerOptions: {
        forceConsistentCasingInFileNames: false,
      },
    },
  },
  eslint: {
    config: {
      stylistic: {
        indent: 2,
        quotes: 'single',
        semi: false,
        commaDangle: 'always-multiline',
      },
    },
  },
  fonts: {
    families: [
      {
        name: 'Manrope',
        provider: 'google',
        weights: [400, 500, 600, 700],
        styles: ['normal'],
        subsets: ['latin', 'latin-ext', 'cyrillic'],
      },
      /* Узкий технический шрифт игрового HUD гаража (RP Grand), с кириллицей:
         файлы качаются только на странице, где шрифт реально используется. */
      {
        name: 'Roboto Condensed',
        provider: 'google',
        weights: [400, 500, 600, 700],
        styles: ['normal'],
        subsets: ['latin', 'cyrillic'],
      },
      /* Шрифт карточки первого экрана с энергией (кейс energy-hero) — по
         макету сцены. Файлы качаются только там, где он используется. */
      {
        name: 'Inter',
        provider: 'google',
        weights: [400, 500],
        styles: ['normal'],
        subsets: ['latin', 'cyrillic'],
      },
    ],
  },
  i18n: {
    /* Английский — локаль по умолчанию без префикса, русский — под /ru.
       Публичных дублей /en при этой стратегии не существует. */
    strategy: 'prefix_except_default',
    defaultLocale: DEFAULT_LOCALE,
    locales: SITE_LOCALES.map(({ code, language, name, file }) => ({ code, language, name, file })),
    /* Встроенное определение языка браузера отключено:
       первичный выбор делает собственное server middleware по стране и cookie. */
    detectBrowserLanguage: false,
    /* Абсолютные hreflang и canonical берут домен из той же переменной, что и Site Config:
       второго источника production-URL в проекте нет. */
    baseUrl: import.meta.env.NUXT_SITE_URL ?? '',
    experimental: {
      typedOptionsAndMessages: 'default',
    },
  },
  robots: {
    disallow: ['/api/'],
    sitemap: '/sitemap.xml',
    credits: false,
  },
  sitemap: {
    /* Все URL — из одного типизированного серверного источника: и статические
       маршруты, и кейсы. Авто-обход nuxt:pages отключён, иначе главная попадает
       в карту дважды — один раз от него (без `lastmod`) и один раз отсюда. */
    sources: ['/api/__sitemap__/urls'],
    excludeAppSources: ['nuxt:pages'],
    exclude: ['/api/**'],
    credits: false,
  },
})
