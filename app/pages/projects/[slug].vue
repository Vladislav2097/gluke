<script setup lang="ts">
import { isBleedDemoWidget } from '~/utils/demoWidgetCache'

/* Конфигуратор автомобиля грузится лениво: его чанк (three.js + draco) нужен
   только кейсу с `configurator` — на остальных страницах не качается. */
const LazyCarConfigurator = defineAsyncComponent(() => import('~/components/projects/ProjectCarConfigurator.vue'))

/* Плавный fade при переходе между кейсами: имя переходу задаёт CSS ниже,
   mode out-in не даёт страницам наползать друг на друга во время смены.

   Ключ страницы — только слаг кейса (не путь целиком): переключение языка
   меняет URL, но не кейс, и страница переиспользуется вместо полного
   перемонтирования. Иначе locale-свитч сносил бы DOM и заново поднимал
   WebGL-виджеты — с морганием и пересборкой поля. Смена кейса (другой слаг)
   по-прежнему даёт новый ключ и обычный fade. */
definePageMeta({
  key: route => String(('slug' in route.params ? route.params.slug : '') ?? ''),
  pageTransition: {
    name: 'page-fade',
    mode: 'out-in',
  },
})

const route = useRoute()
const site = useSiteContent()
const locale = useCurrentLocale()
const { t } = useI18n()
const { home, projects: projectsPath, project: projectPath } = useSiteRoutes()

/* Слаг берётся из параметра маршрута, а не из пути: публичный URL
   отвязан от внутреннего content-path (`/projects/en/getic`).
   Проверка ключа сужает объединение параметров локализованных маршрутов без приведения типов. */
const slug = computed(() => ('slug' in route.params ? route.params.slug : ''))

const { data } = await useAsyncData(
  computed(() => `project-detail-${locale.value}-${slug.value}`),
  async () => {
    const [project, orderedProjects] = await Promise.all([
      queryLocalizedProject(locale.value, slug.value).first(),
      queryLocalizedProjects(locale.value)
        .select('title', 'slug', 'position')
        .all()
        .then(items => items.sort((a, b) => a.position - b.position)),
    ])

    if (!project) {
      return null
    }

    const currentIndex = orderedProjects.findIndex(item => item.slug === slug.value)

    if (currentIndex === -1) {
      throw createError({
        statusCode: 500,
        statusMessage: t('errors.projectOrderFailed'),
        fatal: true,
      })
    }

    return {
      project,
      /* Круговой переход в обе стороны: навигация никогда не обрывается.
         С первого кейса «предыдущий» ведёт на последний, с последнего
         «следующий» — на первый. Цель берётся из краёв упорядоченного
         списка, поэтому при добавлении нового кейса кнопка сразу ведёт на него. */
      previous: currentIndex > 0
        ? orderedProjects[currentIndex - 1] ?? null
        : orderedProjects[orderedProjects.length - 1] ?? null,
      next: currentIndex < orderedProjects.length - 1
        ? orderedProjects[currentIndex + 1] ?? null
        : orderedProjects[0] ?? null,
    }
  },
)

function notFound() {
  return createError({
    statusCode: 404,
    statusMessage: t('errors.projectNotFound'),
    fatal: true,
  })
}

const initialData = data.value

if (!initialData) {
  throw notFound()
}

/* Компонент страницы переиспользуется при переходе между кейсами,
   поэтому 404 для несуществующего слага обрабатывается и после навигации. */
watch(data, (value) => {
  if (!value) {
    showError(notFound())
  }
})

/* Предыдущий кейс остаётся значением по умолчанию только на время
   переходного рендера, реальный 404 обрабатывается watch выше. */
const project = computed(() => data.value?.project ?? initialData.project)

/* Showcase (синематики/гейм-реди): компактная страница без метрик,
   «Услуг» и «О проекте» — акцент на видео/галерее по клику. */
const isShowcase = computed(() => project.value.type === 'showcase')

/* Демо-кейсы с полноформатным hero-сплэшем (список общий для страницы
   и шаблона — BLEED_DEMO_WIDGETS): канвас заливает весь верх страницы
   (включая строку «Вернуться к проектам» и, через прозрачный frosted-хедер,
   самую верхушку экрана). Сейчас это звёздное поле, лава-лампа и наполнение
   знака энергией. */
const isBleedDemo = computed(() => isBleedDemoWidget(project.value.demo?.widget))

/* Первый экран с энергией: шапка кейса — сама сцена на весь экран, с текстами
   кейса и настоящей кнопкой к контактам внизу (ProjectEnergyHero). */
const isEnergyHero = computed(() => project.value.demo?.widget === 'energy-hero')

/* Сплэш приподнимается под липкий хедер на его высоту, а высота
   компенсируется паддингом: контент не прыгает, а канвас доходит до
   верхней кромки вьюпорта. Высота хедера меряется после монтирования
   (шрифты/брейкпоинты) и обновляется по ресайзу. */
const bleedTopRef = ref<HTMLElement | null>(null)
let removeBleedLift: (() => void) | undefined

function applyBleedLift() {
  const header = document.querySelector<HTMLElement>('.site-header')
  const top = bleedTopRef.value
  if (!header || !top || !isBleedDemo.value) return
  const h = header.offsetHeight
  if (h > 0) top.style.setProperty('--bleed-lift', `${h}px`)
}

onMounted(() => {
  if (!isBleedDemo.value) return
  applyBleedLift()
  window.addEventListener('resize', applyBleedLift)
  removeBleedLift = () => window.removeEventListener('resize', applyBleedLift)
})

onBeforeUnmount(() => {
  removeBleedLift?.()
  removeBleedLift = undefined
})

/* Первый абзац тела показывается рядом с услугами, остальное — в свёрнутом
   блоке. Разбор в одном месте, чтобы абзац не задвоился. */
const story = computed(() => splitProjectStory(project.value))

const pageTitle = computed(() => t('seo.projectTitle', {
  title: project.value.title,
  site: site.value.brand.name,
}))
const pageDescription = computed(() => project.value.description)

const { toAbsolute, toCanonical } = useSiteUrls()

const canonicalUrl = computed(() => toCanonical(projectPath(project.value.slug)))
const coverUrl = computed(() => toAbsolute(project.value.cover.src))
const organizationId = computed(() => toAbsolute('#identity'))

usePageSeo({
  title: pageTitle,
  description: pageDescription,
  path: () => projectPath(project.value.slug),
  type: 'article',
  image: () => project.value.cover,
})

/* Дата публикации видео для VideoObject: из первого года периода кейса
   («2023–2024» → 2023-01-01). Точной даты загрузки нет — год достаточно
   корректен для разметки. */
function uploadDateFor(period: string): string {
  const year = period.match(/(\d{4})/)?.[1]
  return year ? `${year}-01-01` : '2020-01-01'
}

/* Видео-материалы кейса как VideoObject: Google и ИИ индексируют ролики
   отдельно от страницы. Узел строится только если в кейсе есть видео. */
const videoSchema = computed(() => (project.value.media ?? [])
  .filter(item => item.kind === 'video')
  .map((item, index) => ({
    '@id': `${canonicalUrl.value}#video-${index}`,
    '@type': 'VideoObject',
    'name': item.caption || item.alt || project.value.title,
    'description': item.alt || pageDescription.value,
    'contentUrl': toAbsolute(item.src),
    'thumbnailUrl': toAbsolute(item.poster || project.value.cover.src),
    'uploadDate': uploadDateFor(project.value.period),
    'width': item.width,
    'height': item.height,
  })))

useSchemaOrg([
  /* Явные @id нужны, чтобы узлы обновлялись при клиентском переходе между кейсами. */
  defineWebPage({
    '@id': () => `${canonicalUrl.value}#webpage`,
    '@type': 'ItemPage',
    'url': () => canonicalUrl.value,
    'name': () => pageTitle.value,
    'description': () => pageDescription.value,
    'inLanguage': () => locale.value,
    /* Обложка кейса как главное изображение страницы: передаём URL строкой,
       модуль nuxt-schema-org сам создаст ImageObject и не подставит логотип студии. */
    'primaryImageOfPage': () => coverUrl.value,
  }),
  {
    '@id': () => `${canonicalUrl.value}#creativework`,
    '@type': 'CreativeWork',
    'name': () => project.value.title,
    'description': () => pageDescription.value,
    'url': () => canonicalUrl.value,
    'image': () => coverUrl.value,
    'inLanguage': () => locale.value,
    'creator': { '@id': () => organizationId.value },
    'provider': { '@id': () => organizationId.value },
  },
  defineBreadcrumb({
    '@id': () => `${canonicalUrl.value}#breadcrumb`,
    'itemListElement': [
      defineListItem({ name: () => t('breadcrumb.home'), item: () => toAbsolute(home()) }),
      defineListItem({ name: () => t('breadcrumb.projects'), item: () => toAbsolute(projectsPath()) }),
      defineListItem({ name: () => project.value.title }),
    ],
  }),
  ...videoSchema.value,
])
</script>

<template>
  <div
    v-if="data && project"
    class="project-page"
  >
    <!-- Полноэкранный сплэш WebGL-виджета (звёздное поле, лава, знак): одна
         обёртка для канваса, строки «Вернуться к проектам» и hero-текста —
         виджет идёт от верхней кромки экрана (под frosted-хедером) через всю
         шапку, без чёрной полосы между хедером и полем и без собственной
         рамки/фона. -->
    <div
      v-if="isBleedDemo"
      ref="bleedTopRef"
      class="project-page__bleed-top"
    >
      <!-- Bleed-канвас: кто умеет заливать hero целиком, перечислено в
           BLEED_DEMO_WIDGETS (demoWidgetCache.ts) — новый виджет добавляется
           туда одной строкой, ветка здесь не нужна. -->
      <ProjectsProjectWidgetDemo
        v-if="project.demo"
        :demo="project.demo"
        :poster="project.cover.src"
        :poster-alt="project.cover.alt"
        variant="bleed"
      />

      <div class="site-container project-page__back project-page__bleed-back">
        <NuxtLink
          :to="projectsPath()"
          class="project-page__back-link text-body--sm"
        >
          <span aria-hidden="true">←</span>
          <span>{{ t('project.back') }}</span>
        </NuxtLink>
      </div>

      <ProjectsProjectDetailHero
        :project="project"
        bleed-external
      />
    </div>

    <template v-else>
      <div class="site-container project-page__back">
        <NuxtLink
          :to="projectsPath()"
          class="project-page__back-link text-body--sm"
        >
          <span aria-hidden="true">←</span>
          <span>{{ t('project.back') }}</span>
        </NuxtLink>
      </div>

      <ProjectsProjectEnergyHero
        v-if="isEnergyHero"
        :project="project"
      />

      <ProjectsProjectShowcaseHero
        v-else-if="isShowcase"
        :project="project"
      />

      <ProjectsProjectDetailHero
        v-else
        :project="project"
      />
    </template>

    <!-- Полноценный кейс (в т.ч. звёздный сплэш Constellation): метрики
         и услуги идут сразу под шапкой. -->
    <template v-if="!isShowcase">
      <ProjectsProjectDetailOverview :metrics="project.metrics" />

      <!-- `about` намеренно не передаётся: это был сжатый пересказ «Задачи».
           Вместо него рядом с услугами стоит её первый абзац. -->
      <ProjectsProjectDetailScope
        :services="project.services"
        :deliverables="project.deliverables"
        :lead="story.lead"
      />
    </template>

    <!-- Showcase — это подборка работ, а не разбор одного проекта: там текст
         целиком уходит в шапку, и раскрывашка была бы пустой обёрткой. -->
    <!-- Панель параметров живёт отдельным блоком, а не в шапке: шапка должна
         оставаться чистой, а покрутить настройки приходит тот, кому интересно. -->
    <section
      v-if="project.demo?.tunable"
      class="project-page__demo"
    >
      <div class="site-container">
        <ProjectsProjectWidgetDemo
          :demo="project.demo"
          :poster="project.cover.src"
          :poster-alt="project.cover.alt"
          variant="tunable"
        />
      </div>
    </section>

    <!-- Гараж: конфигуратор на всю ширину и высоту экрана — сцена и игровой
         HUD поверх неё. Без site-container: это не блок страницы, а окно
         в зал; шапка кейса остаётся над ним, история проекта — под ним. -->
    <section
      v-if="project.configurator && project.model"
      class="project-page__garage"
    >
      <LazyCarConfigurator
        :model="project.model"
        :manifest="project.configurator.manifest"
        :vehicles="project.configurator.vehicles"
        :garage="project.configurator.garage"
        :audio="project.configurator.audio"
        :poster="project.cover.src"
      />
    </section>

    <ProjectsProjectDetailStory
      v-if="!isShowcase && story.hasRest"
      :project="story.rest"
    />

    <ProjectsProjectMediaGallery
      :media="project.media"
      :fallback-video-poster="project.cover.src"
      :grid="isShowcase"
    />

    <ProjectsProjectPager
      :previous="data.previous"
      :next="data.next"
    />

    <SiteContact
      :cta="site.hero.primaryCta"
      :pricing="site.pricing"
      :contacts="site.contacts"
      :spacing="'project'"
    />
  </div>
</template>

<style scoped>
/* Единый вертикальный ритм страницы кейса: соседние секции дают по половине
   разрыва (`--project-space`), а границы блока секций — полный разрыв
   (`--project-space-edge`) там, где сосед своего отступа не добавляет. */
.project-page {
  --project-space: clamp(28px, 3.2vw, 56px);
  --project-space-edge: clamp(56px, 6.4vw, 104px);
}

.project-page__demo {
  padding-block: var(--project-space, clamp(28px, 3.2vw, 56px));
}

/* Гараж во всю ширину окна: полоса между соседними секциями без отступов по
   бокам — зал начинается от края экрана, а не от колонки контента. */
.project-page__garage {
  margin-block: var(--project-space, clamp(28px, 3.2vw, 56px));
  scroll-margin-top: 64px;
}

.project-page__back {
  padding-block: clamp(16px, 2vw, 24px) 0;
}

/* Сплэш WebGL-виджета: канвас-фон + «Вернуться к проектам» + hero.
   Сплэш приподнят под липкий хедер ровно на его высоту (меряется в JS
   и приходит в `--bleed-lift`), компенсированную паддингом: контент не
   двигается, а поле доходит до верхней кромки экрана и просвечивает
   сквозь frosted-хедер — пустой полосы над ним нет. Фон и текст следуют
   теме сайта (виджет перекрашивается через recolor), токены не трогаем. */
.project-page__bleed-top {
  position: relative;
  isolation: isolate;
  margin-top: calc(-1 * var(--bleed-lift, 0px));
  padding-top: var(--bleed-lift, 0px);
}

/* Строка «Вернуться к проектам» прозрачна для указателя: звёздная карта под
   ней должна оставаться интерактивной (курсор-«планета» ходит по всему полю).
   Кликабельной остаётся только сама ссылка. */
.project-page__bleed-back {
  position: relative;
  z-index: 2;
  pointer-events: none;
}

.project-page__bleed-back .project-page__back-link {
  pointer-events: auto;
}

.project-page__back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  color: var(--site-text-secondary);
  transition: color 150ms ease;
}

.project-page__back-link:hover {
  color: var(--site-accent-text);
}
</style>
