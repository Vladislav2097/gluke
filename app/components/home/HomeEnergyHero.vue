<script setup lang="ts">
/* Первый экран главной — сцена «энергия → знак → результаты → действие»
 * (виджет `energy-hero`, тот же, что в кейсе energy-fill) на весь экран.
 *
 * Заголовок, текст и кнопка — разметка этой страницы: их читают поисковики
 * и скринридеры, а кнопка — настоящая ссылка к блоку «Обсудить проект» внизу
 * (`#contact`). Движок рисует поверх них прозрачным канвасом и только
 * перекрашивает кнопку. Раскладка — макет сцены (1200×493, на узком экране
 * 320×620), поставленный в центр блока; масштаб считается в CSS по той же
 * формуле, что и в движке (`gluke-energy-hero.js`, режим страницы), поэтому
 * текст стоит на месте ещё до запуска скрипта.
 *
 * Без WebGL сцена не запускается, и блок показывает финальный кадр: жёлтая
 * кнопка и статичный знак.
 */
import type { SiteCollectionItem } from '@nuxt/content'

const props = defineProps<{
  hero: SiteCollectionItem['hero']
}>()

const { t } = useI18n()

const MARK = '/media/projects/pyramid/g-mark.svg'
const STILL = '/media/projects/energy-fill/g-static.svg'
/* Слова на канвасе — шрифтом сайта, как и текст рядом. */
const WORDS_FONT = 'Manrope, "Segoe UI", Arial, sans-serif'

interface EnergyHero {
  set: (patch: Record<string, unknown>) => void
  destroy: () => void
}

const frame = ref<HTMLElement | null>(null)
const live = ref(false)
const failed = ref(false)
let widget: EnergyHero | null = null
let unmounted = false

/* Слова по местам раскладки: верх слева, верх справа, середина слева,
   середина справа — в движок уходят одной строкой через `|`. */
const words = computed(() => ['topLeft', 'topRight', 'midLeft', 'midRight']
  .map(slot => t(`home.hero.energyWords.${slot}`))
  .join('|'))

onMounted(async () => {
  const el = frame.value
  if (!el) return
  try {
    const { default: factory } = await import('~/utils/gluke-energy-hero.js')
    if (unmounted || !el.isConnected) return
    const narrow = window.innerWidth < 1024
    widget = factory.create(el, {
      card: el,
      cta: el.querySelector('.home-energy__cta'),
      mark: MARK,
      staticLogo: STILL,
      copyWords: words.value,
      wordsFont: WORDS_FONT,
      ratioCap: narrow ? 1.5 : 2,
      pixelBudget: narrow ? 1.2e6 : 2.6e6,
      pauseOffscreen: true,
      respectReducedMotion: true,
    }) as EnergyHero
    live.value = true
  }
  catch (error) {
    failed.value = true
    console.error('[home-energy-hero] не удалось запустить сцену', error)
  }
})

watch(words, value => widget?.set({ copyWords: value }))

onBeforeUnmount(() => {
  unmounted = true
  widget?.destroy()
  widget = null
})
</script>

<template>
  <section
    class="home-energy"
    aria-labelledby="home-hero-title"
  >
    <div
      ref="frame"
      class="home-energy__frame"
      :class="{ 'home-energy--live': live, 'home-energy--static': failed }"
    >
      <p class="home-energy__eyebrow">
        {{ props.hero.eyebrow }}
      </p>

      <h1
        id="home-hero-title"
        class="home-energy__title"
      >
        {{ props.hero.title }}
      </h1>

      <p class="home-energy__text">
        {{ props.hero.description }}
      </p>

      <!-- Цвет кнопки во время сцены ведёт движок (inline-стили): тёмная →
           жёлтая заливка волной. -->
      <NuxtLink
        to="#contact"
        class="home-energy__cta"
      >
        {{ props.hero.primaryCta.label }}
      </NuxtLink>

      <!-- Финальный кадр без WebGL. Живая сцена ставит такой же знак сама. -->
      <img
        :src="STILL"
        alt=""
        aria-hidden="true"
        class="home-energy__still"
        draggable="false"
      >
    </div>
  </section>
</template>

<style scoped>
/* Блок всегда тёмный, в любой теме: свет сцены аддитивный и на светлом фоне
   теряется, а палитра сцены (тёмно-синие кнопка и «спящий» знак) рассчитана
   на тёмное. Цвет — фон тёмной темы сайта: в ней блок с фоном сливается. */
.home-energy {
  background: #070707;
  color: #fff;
}

.home-energy__frame {
  container: home-energy / size;
  position: relative;
  /* Весь первый экран под липкой шапкой (65 px). */
  height: calc(100svh - 65px);
  min-height: 480px;
  overflow: hidden;
  isolation: isolate;
  font-family: Manrope, "Segoe UI", Arial, sans-serif;

  /* 1 px макета 1200×493, вписанного в блок, и центр макета в блоке:
     X(x) = 50cqw + (x − 600)·u, Y(y) = 50cqh + (y − 246.5)·u. */
  --u: min(100cqw / 1200, 100cqh / 493);
  --cx: 600;
  --cy: 246.5;
}

.home-energy__eyebrow,
.home-energy__title,
.home-energy__text,
.home-energy__cta,
.home-energy__still {
  position: absolute;
  z-index: 1;
  margin: 0;
}

.home-energy__eyebrow {
  left: calc(50cqw + (52 - var(--cx)) * var(--u));
  top: calc(50cqh + (66 - var(--cy)) * var(--u));
  font-size: calc(15 * var(--u));
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #F4DE3C;
}

.home-energy__title {
  left: calc(50cqw + (52 - var(--cx)) * var(--u));
  top: calc(50cqh + (96 - var(--cy)) * var(--u));
  width: calc(560 * var(--u));
  font-size: calc(54 * var(--u));
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.01em;
  color: #fff;
  /* Только по пробелам: перенос внутри «3D-визуализация» недопустим. */
  overflow-wrap: normal;
  word-break: normal;
  hyphens: none;
}

.home-energy__text {
  left: calc(50cqw + (52 - var(--cx)) * var(--u));
  top: calc(50cqh + (236 - var(--cy)) * var(--u));
  width: calc(470 * var(--u));
  font-size: calc(17 * var(--u));
  line-height: 1.6;
  color: rgb(255 255 255 / 0.82);
}

/* Стартовый тёмный цвет; дальше кнопку ведёт движок. */
.home-energy__cta {
  left: calc(50cqw + (52 - var(--cx)) * var(--u));
  top: calc(50cqh + (372 - var(--cy)) * var(--u));
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

.home-energy__cta:hover { filter: brightness(1.08); }
.home-energy__cta:active { transform: translateY(1px); }

.home-energy__cta:focus-visible {
  outline: 2px solid #F4DE3C;
  outline-offset: 3px;
}

/* Знак с центром в (900, 240) и высотой 330, поля под тень — 6/39 высоты:
   те же числа, что у живого знака (PAGE_LAYOUT в обвязке). */
.home-energy__still {
  --h: calc(330 * (1 + 12 / 39));
  left: calc(50cqw + (900 - var(--cx)) * var(--u) - var(--h) * 232.377 / 293.577 / 2 * var(--u));
  top: calc(50cqh + (240 - var(--cy)) * var(--u) - var(--h) / 2 * var(--u));
  height: calc(var(--h) * var(--u));
  width: auto;
  display: none;
  pointer-events: none;
}

/* Без WebGL — финальный кадр. Пока сцена грузится, знака нет: она
   начинается с тёмного знака, а не с жёлтого. */
.home-energy--static .home-energy__still {
  display: block;
}

.home-energy--static .home-energy__cta {
  background: #F4DE3C;
  color: #1B2339;
}

/* ---------- узкий блок: макет 320×620 ---------- */
@container home-energy (aspect-ratio < 1) {
  .home-energy__eyebrow,
  .home-energy__title,
  .home-energy__text,
  .home-energy__cta,
  .home-energy__still {
    --u: min(100cqw / 320, 100cqh / 620);
    --cx: 160;
    --cy: 310;
  }

  .home-energy__eyebrow {
    left: calc(50cqw + (28 - var(--cx)) * var(--u));
    top: calc(50cqh + (26 - var(--cy)) * var(--u));
    font-size: calc(11 * var(--u));
  }

  .home-energy__title {
    left: calc(50cqw + (28 - var(--cx)) * var(--u));
    top: calc(50cqh + (46 - var(--cy)) * var(--u));
    width: calc(264 * var(--u));
    font-size: calc(32 * var(--u));
  }

  .home-energy__text {
    left: calc(50cqw + (28 - var(--cx)) * var(--u));
    top: calc(50cqh + (130 - var(--cy)) * var(--u));
    width: calc(264 * var(--u));
    font-size: calc(14 * var(--u));
  }

  .home-energy__cta {
    left: calc(50cqw + (28 - var(--cx)) * var(--u));
    top: calc(50cqh + (282 - var(--cy)) * var(--u));
    width: calc(190 * var(--u));
    height: calc(46 * var(--u));
    font-size: calc(15 * var(--u));
  }

  /* Знак с центром в (160, 500) и высотой 140. */
  .home-energy__still {
    --h: calc(140 * (1 + 12 / 39));
    left: calc(50cqw + (160 - var(--cx)) * var(--u) - var(--h) * 232.377 / 293.577 / 2 * var(--u));
    top: calc(50cqh + (500 - var(--cy)) * var(--u) - var(--h) / 2 * var(--u));
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-energy__cta { transition: none; }
}
</style>
