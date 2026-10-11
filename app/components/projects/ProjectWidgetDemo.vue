<script setup lang="ts">
/* Общая оболочка WebGL-виджетов кейсов.
 *
 * Одна сцена, одна панель ползунков, один жизненный цикл на все пять
 * виджетов. Чем именно отличается конкретный виджет — описано в
 * `~/utils/widgetDemoSpecs.ts`: какой движок грузить, какие ползунки
 * показывать, что передать в `create`. Раньше эта обвязка была
 * скопирована пятикратно, и копии успели разойтись.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import type { ProjectsCollectionItem } from '@nuxt/content'
import { demoWidgetKey, getDemoWidget, setDemoWidget } from '~/utils/demoWidgetCache'
import { deferStart } from '~/utils/deferredStart'
import { ipxVersionModifier } from '~/utils/imageVersion'
import { applyTouchScrollPolicy, isCoarsePointer } from '~/utils/touchScroll'
import type { WidgetDemoInstance, WidgetParams } from '~/utils/widgetDemoSpecs'
import { widgetDemoSpec } from '~/utils/widgetDemoSpecs'

const props = defineProps<{
  demo: NonNullable<ProjectsCollectionItem['demo']>
  /** Обложка кейса: видна, пока виджет не запустился, и остаётся навсегда,
      если WebGL недоступен или включено «уменьшить движение». */
  poster: string
  posterAlt: string
  /** `hero` — виджет в шапке, `tunable` — лаборатория с ползунками,
      `bleed` — виджет на весь hero-блок. */
  variant?: 'hero' | 'tunable' | 'bleed'
}>()

const { t, te } = useI18n()

/* Постер идёт через `NuxtImg`, то есть вариантом `/_ipx/**`: версия в адресе не
   даёт кэшу залипнуть на прежней обложке после её замены. */
const imageVersions = useRuntimeConfig().public.imageVersions
const posterModifiers = computed(() => ipxVersionModifier(props.poster, imageVersions))

const spec = computed(() => widgetDemoSpec(props.demo.widget))

const host = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const stageArea = ref({ w: 0, h: 0 })
const widget = shallowRef<WidgetDemoInstance | null>(null)
const running = ref(false)
const failed = ref(false)
const copied = ref(false)

const isTuner = computed(() => props.variant === 'tunable')

const colorMode = useColorMode()
const isLight = computed(() => colorMode.value === 'light')

/* Ключ кэша: тип виджета + вариант размещения. При смене языка компонент
   перемонтируется, и виджет перецепляется из demoWidgetCache, а не
   создаётся заново — иначе перекомпилируются шейдеры, а поле «перемешается». */
const cacheKey = computed(() => demoWidgetKey(props.demo.widget, props.variant ?? 'hero'))

const tuned = reactive<Record<string, number>>({})

/* Часть виджетов помнит настройки лаборатории между визитами (`storageKey`),
   часть намеренно нет — тогда подкрутки живут только в текущей сессии.
   Ключ версионируется: при смене базовых параметров он бампается, чтобы
   старые сохранённые значения не подменяли новые дефолты. */
if (import.meta.client) {
  const key = spec.value?.storageKey
  if (key) {
    try {
      const saved = localStorage.getItem(key)
      if (saved) Object.assign(tuned, JSON.parse(saved))
    }
    catch {
      /* битые данные — просто дефолты */
    }
  }
}

/* Параметры без подкруток: дефолты движка, поверх — настройки кейса,
   поверх — вид под тему сайта. */
const themeParams = computed<WidgetParams>(() => ({
  ...(spec.value?.defaults ?? {}),
  ...(props.demo.params as WidgetParams),
  ...(spec.value?.themeLook?.(isLight.value) ?? {}),
}))

/* Подкрученные значения уходят только в лабораторию: hero и bleed всегда
   живут на дефолтах кейса, из панели в шапку ничего не переходит. */
function currentParams(): WidgetParams {
  const merged = { ...themeParams.value, ...(isTuner.value ? tuned : {}) }
  return spec.value?.mapParams?.(merged, tuned, props.demo as Record<string, unknown>) ?? merged
}

function readInitial(key: string): number {
  const custom = spec.value?.readInitial?.(key, themeParams.value)
  if (custom !== undefined) return custom
  return Number(themeParams.value[key] ?? spec.value?.defaults?.[key] ?? 0)
}

/* Знаков после запятой — сколько у шага, но не меньше двух: иначе ползунок
   с шагом 0.001 показывал бы «0.00» на всём своём ходе. */
function stepDecimals(step: number): number {
  if (step >= 1) return 0
  return Math.max(2, Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)))
}

function controlValue(key: string): number {
  return tuned[key] ?? readInitial(key)
}

/* Подпись ползунка. Карта подписей общая на все виджеты, и одно имя
   параметра может значить в них разное — `drift` у пирамиды это скорость
   вращения, а у звёздного поля скорость полёта звёзд. Описание виджета
   может задать префикс, который разводит такие случаи. */
function controlLabel(key: string): string {
  const prefix = spec.value?.labelPrefix
  if (prefix) {
    const scoped = `project.demo.controls.${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`
    if (te(scoped)) return t(scoped)
  }
  return t(`project.demo.controls.${key}`)
}

/* Оценка под панелью: сколько объектов даст текущая настройка. Есть только
   у звёздного поля — число звёзд считается от площади сцены. */
const estimate = computed(() => {
  if (!isTuner.value || !spec.value?.estimate) return null
  return spec.value.estimate(stageArea.value, controlValue)
})

async function mount() {
  const el = host.value
  const current = spec.value
  if (!el || !current || !import.meta.client) return

  /* Уважаем системную настройку: на месте виджета остаётся обложка
     (в полноформатном bleed её нет — там фон темы). */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  /* Виджет уже создавался (смена языка, возврат на кейс) — перецепляем
     сохранённый канвас без пересоздания WebGL. */
  const cached = getDemoWidget<WidgetDemoInstance>(cacheKey.value)
  if (cached) {
    widget.value = cached
    cached.reattach(el)
    if (current.reapplyOnReattach !== false) cached.set(currentParams())
    current.applyTheme?.(cached, isLight.value)
    running.value = true
    applyScrollPolicy(el)
    return
  }

  try {
    const { default: factory } = await current.load()
    /* Пока грузился движок, компонент могли размонтировать (быстрая
       навигация): канвас создался бы в уже снятом узле и остался без
       владельца — вместе с WebGL-контекстом. */
    if (unmounted || !el.isConnected) return
    const options: WidgetParams = {
      ...currentParams(),
      ...(current.createTheme?.(isLight.value) ?? {}),
      ...(current.createOptions?.({
        demo: props.demo as Record<string, unknown>,
        narrow: window.innerWidth < 1024,
        variant: props.variant ?? 'hero',
      }) ?? {}),
    }

    const instance = factory.create(el, options) as WidgetDemoInstance
    if (current.needsStart) instance.start()

    widget.value = instance
    /* Кэшируем сразу: смена языка перемонтирует компонент, и следующий
       показ перецепит тот же виджет без перезагрузки. */
    setDemoWidget(cacheKey.value, instance)
    running.value = true
    applyScrollPolicy(el)
  }
  catch (error) {
    failed.value = true
    console.error(`[${props.demo.widget}] не удалось запустить виджет`, error)
  }
}

/* Канвас создаёт сам движок внутри контейнера — политику скролла вешаем
   после запуска, иначе на тач-экране он перехватит вертикальный свайп. */
function applyScrollPolicy(el: HTMLElement) {
  if (!isCoarsePointer()) return
  const canvas = el.querySelector('canvas')
  if (canvas) applyTouchScrollPolicy(canvas)
}

watch(tuned, () => {
  const key = spec.value?.storageKey
  if (isTuner.value && key && import.meta.client) {
    try {
      localStorage.setItem(key, JSON.stringify(tuned))
    }
    catch {
      /* приватный режим — молчим */
    }
  }
  /* Ползунки есть только у лаборатории: hero и bleed обновлять нечего,
     они живут на дефолтах и лежат в кэше отдельным ключом. */
  if (isTuner.value) widget.value?.set(currentParams())
}, { deep: true })

/* Смена темы сайта на лету. Большинство виджетов принимает вид через `set`,
   звёздное поле перекрашивается отдельно, не трогая позиции звёзд. */
watch(isLight, () => {
  const instance = widget.value
  if (!instance) return
  if (spec.value?.applyTheme) spec.value.applyTheme(instance, isLight.value)
  else instance.set(currentParams())
})

function reset() {
  /* Ключи чистим через Reflect, а не delete по вычисляемому ключу:
     значения по умолчанию всё равно подставляет currentParams(). */
  for (const key of Object.keys(tuned)) Reflect.deleteProperty(tuned, key)
  widget.value?.set(currentParams())
}

const jsonOut = computed(() => JSON.stringify(currentParams(), null, 2))

async function copyJson() {
  try {
    await navigator.clipboard.writeText(jsonOut.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  }
  catch {
    /* clipboard недоступен — текст лежит в блоке под панелью */
    copied.value = false
  }
}

let stageObserver: ResizeObserver | null = null
/* Снят ли компонент. Загрузка движка асинхронная: за это время страницу
   успевают покинуть, и создавать виджет тогда уже некому. */
let unmounted = false
/* Ждёт приближения сцены к окну. Hero и лаборатория стоят на одной странице,
   и раньше обе создавались при монтировании: движок, шейдеры и подготовка
   карт (у energy-fill — сетка 2048²) шли для лаборатории, до которой ещё
   нужно прокрутить. Кэшированный виджет цепляется сразу — он уже готов. */
let cancelStart: (() => void) | undefined
const START_MARGIN = '300px 0px'

/* Блок уже в окне или в пределах отступа старта. Hero стоит на первом экране
   всегда — ждать для него обратного вызова наблюдателя незачем. */
function nearViewport(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.top < window.innerHeight + 300 && r.bottom > -300
}

onMounted(() => {
  const el = host.value
  if (!el || getDemoWidget(cacheKey.value) || nearViewport(el)) void mount()
  else cancelStart = deferStart(el, () => void mount(), { nearMargin: START_MARGIN })

  /* Площадь сцены нужна только оценке под панелью. */
  if (isTuner.value && spec.value?.estimate && stageEl.value && typeof ResizeObserver !== 'undefined') {
    stageObserver = new ResizeObserver(() => {
      const r = stageEl.value?.getBoundingClientRect()
      stageArea.value = r ? { w: r.width, h: r.height } : { w: 0, h: 0 }
    })
    stageObserver.observe(stageEl.value)
    const r = stageEl.value.getBoundingClientRect()
    stageArea.value = { w: r.width, h: r.height }
  }
})

onBeforeUnmount(() => {
  unmounted = true
  cancelStart?.()
  stageObserver?.disconnect()
  stageObserver = null
  /* Виджет не уничтожаем — отцепляем и оставляем в кэше (demoWidgetCache):
     смена языка перемонтирует компонент, и следующий показ перецепит тот
     же канвас без пересоздания WebGL. */
  widget.value?.detach()
  widget.value = null
})

defineExpose({ failed })
</script>

<template>
  <div
    class="widget-demo"
    :class="[
      `widget-demo--${props.variant ?? 'hero'}`,
      { 'widget-demo--live': running, 'widget-demo--scrim': spec?.bleedScrim },
      /* Объектные виджеты (портрет) в обычном hero растягиваются на всю
         высоту своей половины вместо 16:9-карточки. */
      { 'widget-demo--hero-fill': props.variant === 'hero' && spec?.heroFill },
      { 'widget-demo--tall': props.variant === 'tunable' && spec?.tallStage },
      /* Карточка со своими пропорциями (первый экран с энергией): сцена
         повторяет их и в шапке, и в лаборатории. */
      { 'widget-demo--aspect': props.variant !== 'bleed' && spec?.stageAspect },
    ]"
    :style="props.variant !== 'bleed' && spec?.stageAspect
      ? { '--stage-aspect-wide': spec.stageAspect.wide, '--stage-aspect-narrow': spec.stageAspect.narrow }
      : undefined"
  >
    <div
      ref="stageEl"
      class="widget-demo__stage"
    >
      <!-- Обложка лежит под виджетом и видна, пока он не запустился: блок не
           мигает пустотой и остаётся осмысленным без WebGL. В полноэкранном
           bleed-режиме её нет намеренно — там фоном служит сама страница. -->
      <NuxtImg
        v-if="props.variant !== 'bleed'"
        :src="props.poster"
        :alt="props.posterAlt"
        :modifiers="posterModifiers"
        sizes="100vw lg:58vw xl:1000px"
        format="avif,webp"
        loading="eager"
        decoding="async"
        class="widget-demo__poster"
      />
      <div
        ref="host"
        class="widget-demo__canvas"
        :aria-label="props.demo.alt"
        role="img"
      />
    </div>

    <div
      v-if="isTuner && running"
      class="widget-demo__controls"
    >
      <div class="widget-demo__controls-head">
        <h3 class="text-heading text-heading--sm">
          {{ t('project.demo.title') }}
        </h3>
        <button
          type="button"
          class="text-body--sm widget-demo__reset"
          @click="reset"
        >
          {{ t('project.demo.reset') }}
        </button>
      </div>

      <p class="text-body--sm widget-demo__hint">
        {{ t('project.demo.hint') }}
      </p>

      <p
        v-if="estimate !== null"
        class="text-body--sm widget-demo__estimate"
      >
        {{ t('project.demo.estimate', { n: String(estimate) }) }}
      </p>

      <div class="widget-demo__groups">
        <div
          v-for="group in spec?.groups ?? []"
          :key="group.id"
          class="widget-demo__group"
        >
          <h4 class="text-label widget-demo__group-name">
            {{ t(`project.demo.groups.${group.id}`) }}
          </h4>

          <label
            v-for="control in group.controls"
            :key="control.key"
            class="widget-demo__slider"
          >
            <span class="text-body--sm widget-demo__slider-name">
              {{ controlLabel(control.key) }}
            </span>
            <input
              :value="controlValue(control.key)"
              type="range"
              :min="control.min"
              :max="control.max"
              :step="control.step"
              class="widget-demo__range"
              @input="tuned[control.key] = Number(($event.target as HTMLInputElement).value)"
            >
            <span class="text-body--sm widget-demo__slider-value">
              {{ controlValue(control.key).toFixed(stepDecimals(control.step)) }}
            </span>
          </label>
        </div>
      </div>

      <div class="widget-demo__actions">
        <button
          type="button"
          class="text-body--sm widget-demo__copy"
          @click="copyJson"
        >
          {{ copied ? t('project.demo.copied') : t('project.demo.copy') }}
        </button>
      </div>

      <details class="widget-demo__json">
        <summary class="text-body--sm">
          JSON
        </summary>
        <pre class="widget-demo__json-pre">{{ jsonOut }}</pre>
      </details>
    </div>
  </div>
</template>

<style scoped>
/* Сцена живёт на фоне темы сайта: своего экрана у виджетов нет. Канвас
   прозрачный, и пока движок не ожил — на его месте обложка кейса. */
.widget-demo__stage {
  position: relative;
  background: transparent;
  aspect-ratio: 16 / 9;
}

/* Hero-режим объектных виджетов: виджет заполняет свою половину шапки
   целиком (картинка вписывается по пропорциям внутри канваса), а не
   сидит 16:9-карточкой. Высоту задаёт родительская колонка. */
.widget-demo--hero-fill {
  height: 100%;
}

.widget-demo--hero-fill .widget-demo__stage {
  aspect-ratio: auto;
  height: 100%;
}

/* Высокая сцена лаборатории: квадрат, срезанный по высоте экрана, — чтобы
   вытянутая вверх модель не терялась узкой полосой в 16:9. Ширину держим
   явно: иначе упор в max-height сужал бы квадрат и оставлял пустоту сбоку. */
.widget-demo--tall .widget-demo__stage {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: calc(100svh - 128px);
}

/* Обложка 16:9 в высокой сцене — целиком, а не с обрезкой по бокам: иначе
   пока движок грузится, модель на заглушке крупнее и обрезана, а потом
   «отпрыгивает» к своей посадке в живой сцене. Фон у обложек — фон сайта. */
.widget-demo--tall .widget-demo__poster {
  object-fit: contain;
}

/* Сцена в пропорциях карточки виджета. Обложка снята с широкой карточки
   с полями сверху и снизу (16:9 для списков и превью ссылок), в широкой
   сцене поля уходят за обрез — и карточка на обложке совпадает с живой.
   В узкой сцене обложка вписывается целиком, пока не ожила mobile-карточка. */
.widget-demo--aspect .widget-demo__stage {
  width: 100%;
  aspect-ratio: var(--stage-aspect-wide);
}

@media (max-width: 767.98px) {
  .widget-demo--aspect .widget-demo__stage {
    aspect-ratio: var(--stage-aspect-narrow);
    max-height: calc(100svh - 128px);
  }

  .widget-demo--aspect .widget-demo__poster {
    object-fit: contain;
  }
}

/* Полноэкранный bleed-режим: виджет заполняет весь верх страницы фоном,
   без собственной рамки и подложки. */
.widget-demo--bleed {
  position: absolute;
  inset: 0;
}

.widget-demo--bleed .widget-demo__stage {
  position: absolute;
  inset: 0;
  aspect-ratio: auto;
  border-radius: 0;
}

.widget-demo--bleed .widget-demo__controls {
  display: none;
}

/* Подложка под текстом сплэша: гасит поле там, где по нему идёт текст
   страницы, и отпускает дальше. Лежит поверх канваса, но раньше по разметке,
   чем сам текст, — он остаётся поверх. Звёздному полю не нужна: оно
   разреженное, буквы читаются прямо по нему. */
.widget-demo--bleed.widget-demo--scrim .widget-demo__stage::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    var(--site-bg) 0%,
    color-mix(in srgb, var(--site-bg) 72%, transparent) 45%,
    transparent 100%
  );
}

/* На широком экране текст занимает левую колонку, поле должно остаться
   открытым справа — гасим по горизонтали, а не по вертикали. */
@media (min-width: 1024px) {
  .widget-demo--bleed.widget-demo--scrim .widget-demo__stage::after {
    background: linear-gradient(
      to right,
      var(--site-bg) 0%,
      color-mix(in srgb, var(--site-bg) 70%, transparent) 42%,
      transparent 70%
    );
  }
}

.widget-demo__poster,
.widget-demo__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.widget-demo__poster {
  object-fit: cover;
  transition: opacity 400ms ease;
}

/* Когда виджет ожил, обложка уходит — но остаётся в разметке как фон на
   случай потери контекста WebGL. */
.widget-demo--live .widget-demo__poster {
  opacity: 0;
}

.widget-demo__controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-block-start: clamp(16px, 2vw, 24px);
  min-width: 0;
}

.widget-demo__controls-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.widget-demo__reset,
.widget-demo__copy {
  color: var(--site-accent-text);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.widget-demo__reset:hover,
.widget-demo__copy:hover {
  color: var(--site-accent-text-hover);
}

.widget-demo__hint,
.widget-demo__estimate {
  max-width: 62ch;
  color: var(--site-text-secondary);
}

.widget-demo__groups {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(20px, 2.4vw, 32px);
}

.widget-demo__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.widget-demo__group-name {
  padding-block-end: 6px;
  border-bottom: var(--site-border);
  color: var(--site-text-secondary);
}

.widget-demo__slider {
  display: grid;
  grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) 2.75rem;
  align-items: center;
  gap: 10px;
}

.widget-demo__slider-name {
  color: var(--site-text-secondary);
  font-size: 0.8125rem;
  line-height: 1.25;
}

.widget-demo__slider-value {
  color: var(--site-text);
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.widget-demo__range {
  width: 100%;
  min-height: 44px;
  accent-color: var(--site-accent-text);
  cursor: pointer;
}

.widget-demo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-block-start: 4px;
}

.widget-demo__json {
  border-top: var(--site-border);
  padding-block-start: 10px;
}

.widget-demo__json summary {
  cursor: pointer;
  color: var(--site-text-secondary);
}

.widget-demo__json-pre {
  margin-block-start: 10px;
  padding: 14px;
  border-radius: var(--site-radius-sm);
  background: var(--site-surface);
  border: var(--site-border);
  font-size: 0.75rem;
  line-height: 1.5;
  overflow: auto;
  max-height: 320px;
}

/* Мышь целится точнее пальца — ползунку хватает меньшей высоты. */
@media (pointer: fine) {
  .widget-demo__range {
    min-height: 22px;
  }
}

@media (min-width: 768px) {
  .widget-demo__groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* На десктопе панель уходит вправо от виджета. Сцена «прилипает» к верху
   вьюпорта под хедером и остаётся видимой, пока прокручивается длинная
   панель ползунков — листаются настройки, а не экран с виджетом. */
@media (min-width: 1024px) {
  .widget-demo--tunable {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(19rem, 22rem);
    align-items: start;
    gap: clamp(24px, 2.6vw, 40px);
  }

  .widget-demo--tunable .widget-demo__stage {
    position: sticky;
    top: clamp(72px, 9vh, 96px);
    /* Не даём сцене вырасти выше вьюпорта — иначе sticky не сработает,
       и она снова уедет за край при прокрутке ползунков. */
    max-height: calc(100svh - 128px);
  }

  .widget-demo--tunable .widget-demo__controls {
    margin-block-start: 0;
  }

  .widget-demo--tunable .widget-demo__groups {
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }

  .widget-demo--tunable .widget-demo__slider {
    grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) 2.5rem;
    gap: 8px;
  }

  .widget-demo--tunable .widget-demo__hint {
    max-width: none;
  }
}
</style>
