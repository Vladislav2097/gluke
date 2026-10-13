<script setup lang="ts">
/* Шапка кейса energy-fill (виджет `energy-hero`) — сцена «энергия → знак →
 * результаты → действие» на весь экран, а не карточкой в колонке.
 *
 * Тексты — самого кейса: надпись «клиент / отрасль», заголовок и описание.
 * Их читают поисковики и скринридеры, поэтому это разметка страницы, а не
 * текст на канвасе. Кнопка «Обсудить проект» — настоящая ссылка к блоку
 * контактов внизу страницы (`#contact`). Движок рисует поверх прозрачным
 * канвасом и только перекрашивает кнопку волной.
 *
 * Раскладка — макет сцены (1200×493, на узком экране 320×620), поставленный
 * в центр блока; масштаб считается в CSS по той же формуле, что и в движке
 * (`gluke-energy-hero.js`, режим страницы), поэтому текст стоит на месте ещё
 * до запуска скрипта. Колонка текста идёт потоком: кнопку движок меряет по
 * DOM, её точная координата ему не нужна.
 *
 * Без WebGL сцена не запускается, и блок показывает финальный кадр: жёлтая
 * кнопка и статичный знак.
 */
import type { ProjectsCollectionItem } from '@nuxt/content'

const props = defineProps<{
  project: ProjectsCollectionItem
}>()

const site = useSiteContent()

const demo = computed(() => props.project.demo)
const params = computed(() => (demo.value?.params ?? {}) as Record<string, unknown>)
const still = computed(() => String(params.value.staticLogo ?? ''))

interface EnergyHero {
  set: (patch: Record<string, unknown>) => void
  destroy: () => void
}

const frame = ref<HTMLElement | null>(null)
const failed = ref(false)
let widget: EnergyHero | null = null
let unmounted = false

onMounted(async () => {
  const el = frame.value
  if (!el || !demo.value?.logo) return
  try {
    const { default: factory } = await import('~/utils/gluke-energy-hero.js')
    if (unmounted || !el.isConnected) return
    const narrow = window.innerWidth < 1024
    widget = factory.create(el, {
      card: el,
      cta: el.querySelector('.project-energy__cta'),
      mark: demo.value.logo,
      staticLogo: still.value,
      copyWords: params.value.copyWords,
      ratioCap: narrow ? 1.5 : 2,
      pixelBudget: narrow ? 1.2e6 : 2.6e6,
      pauseOffscreen: true,
      respectReducedMotion: true,
    }) as EnergyHero
  }
  catch (error) {
    failed.value = true
    console.error('[project-energy-hero] не удалось запустить сцену', error)
  }
})

/* Смена языка: слова у знака — из параметров кейса своей локали. */
watch(() => params.value.copyWords, value => widget?.set({ copyWords: value }))

onBeforeUnmount(() => {
  unmounted = true
  widget?.destroy()
  widget = null
})
</script>

<template>
  <section
    class="project-energy"
    aria-labelledby="project-hero-title"
  >
    <div
      ref="frame"
      class="project-energy__frame"
      :class="{ 'project-energy--static': failed }"
    >
      <div class="project-energy__copy">
        <p class="project-energy__meta">
          <span>{{ props.project.client }}</span>
          <span aria-hidden="true">/</span>
          <span>{{ props.project.industry }}</span>
        </p>

        <h1
          id="project-hero-title"
          class="project-energy__title"
        >
          {{ props.project.title }}
        </h1>

        <p class="project-energy__text">
          {{ props.project.description }}
        </p>

        <!-- Цвет кнопки во время сцены ведёт движок (inline-стили): тёмная →
             жёлтая заливка волной. -->
        <NuxtLink
          to="#contact"
          class="project-energy__cta"
        >
          {{ site.hero.primaryCta.label }}
        </NuxtLink>
      </div>

      <!-- Финальный кадр без WebGL. Живая сцена ставит такой же знак сама. -->
      <img
        v-if="still"
        :src="still"
        alt=""
        aria-hidden="true"
        class="project-energy__still"
        draggable="false"
      >
    </div>
  </section>
</template>

<style scoped>
/* Блок всегда тёмный, в любой теме: свет сцены аддитивный и на светлом фоне
   теряется, а палитра сцены (тёмно-синие кнопка и «спящий» знак) рассчитана
   на тёмное. Цвет — фон тёмной темы сайта: в ней блок с фоном сливается. */
.project-energy {
  background: #070707;
  color: #fff;
}

.project-energy__frame {
  container: project-energy / size;
  position: relative;
  /* Весь экран под липкой шапкой (65 px) и строкой «Вернуться к проектам». */
  height: calc(100svh - 65px - 60px);
  min-height: 520px;
  overflow: hidden;
  isolation: isolate;
  font-family: Manrope, "Segoe UI", Arial, sans-serif;

  /* 1 px макета 1200×493, вписанного в блок, и центр макета в блоке:
     X(x) = 50cqw + (x − 600)·u, Y(y) = 50cqh + (y − 246.5)·u. */
  --u: min(100cqw / 1200, 100cqh / 493);
  --cx: 600;
  --cy: 246.5;
}

.project-energy__copy {
  position: absolute;
  z-index: 1;
  left: calc(50cqw + (52 - var(--cx)) * var(--u));
  top: calc(50cqh + (56 - var(--cy)) * var(--u));
  width: calc(560 * var(--u));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(18 * var(--u));
}

.project-energy__meta {
  display: flex;
  gap: 0.5em;
  margin: 0;
  font-size: calc(14 * var(--u));
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #F4DE3C;
}

.project-energy__title {
  margin: 0;
  font-size: calc(42 * var(--u));
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: #fff;
  overflow-wrap: normal;
  word-break: normal;
  hyphens: none;
}

.project-energy__text {
  margin: 0;
  width: calc(520 * var(--u));
  font-size: calc(16 * var(--u));
  line-height: 1.6;
  color: rgb(255 255 255 / 0.82);
}

/* Стартовый тёмный цвет; дальше кнопку ведёт движок. */
.project-energy__cta {
  margin-top: calc(8 * var(--u));
  width: calc(210 * var(--u));
  height: calc(56 * var(--u));
  min-height: 44px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2C3658;
  color: #8A93B2;
  font-size: calc(16 * var(--u));
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  transition: filter 0.2s, transform 0.2s;
}

.project-energy__cta:hover { filter: brightness(1.08); }
.project-energy__cta:active { transform: translateY(1px); }

.project-energy__cta:focus-visible {
  outline: 2px solid #F4DE3C;
  outline-offset: 3px;
}

/* Знак с центром в (900, 240) и высотой 330, поля под тень — 6/39 высоты:
   те же числа, что у живого знака (PAGE_LAYOUT в обвязке). */
.project-energy__still {
  --h: calc(330 * (1 + 12 / 39));
  position: absolute;
  z-index: 1;
  left: calc(50cqw + (900 - var(--cx)) * var(--u) - var(--h) * 232.377 / 293.577 / 2 * var(--u));
  top: calc(50cqh + (240 - var(--cy)) * var(--u) - var(--h) / 2 * var(--u));
  height: calc(var(--h) * var(--u));
  width: auto;
  display: none;
  pointer-events: none;
}

/* Без WebGL — финальный кадр. Пока сцена грузится, знака нет: она
   начинается с тёмного знака, а не с жёлтого. */
.project-energy--static .project-energy__still {
  display: block;
}

.project-energy--static .project-energy__cta {
  background: #F4DE3C;
  color: #1B2339;
}

/* ---------- узкий блок: макет 320×620 ---------- */
@container project-energy (aspect-ratio < 1) {
  .project-energy__copy,
  .project-energy__still {
    --u: min(100cqw / 320, 100cqh / 620);
    --cx: 160;
    --cy: 310;
  }

  .project-energy__copy {
    left: calc(50cqw + (24 - var(--cx)) * var(--u));
    top: calc(50cqh + (20 - var(--cy)) * var(--u));
    width: calc(272 * var(--u));
    gap: calc(10 * var(--u));
  }

  .project-energy__meta { font-size: calc(10 * var(--u)); }
  .project-energy__title { font-size: calc(24 * var(--u)); }

  .project-energy__text {
    width: auto;
    font-size: calc(12.5 * var(--u));
    line-height: 1.5;
  }

  .project-energy__cta {
    width: calc(190 * var(--u));
    height: calc(44 * var(--u));
    font-size: calc(14 * var(--u));
  }

  /* Знак с центром в (160, 500) и высотой 140. */
  .project-energy__still {
    --h: calc(140 * (1 + 12 / 39));
    left: calc(50cqw + (160 - var(--cx)) * var(--u) - var(--h) * 232.377 / 293.577 / 2 * var(--u));
    top: calc(50cqh + (500 - var(--cy)) * var(--u) - var(--h) / 2 * var(--u));
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-energy__cta { transition: none; }
}
</style>
