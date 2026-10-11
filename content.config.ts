import {
  defineCollection,
  defineContentConfig,
  z,
} from '@nuxt/content'
import { LOCALE_CODES } from './shared/i18n'
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_SECTIONS } from './shared/knowledge'

const MEDIA_PREFIX = '/media/'

/* Локаль документа берётся из явного поля, а не из пути файла:
   генерируемый Nuxt Content `path` остаётся внутренним и не используется публично. */
const localeSchema = z.enum(LOCALE_CODES)

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

/* Дата последнего изменения файла (YYYY-MM-DD). Проставляется скриптом
   `pnpm lastmod` из git и уезжает в sitemap как `lastmod`. В buildCommand
   Vercel сначала докачивает полную историю (`git fetch --unshallow`) и затем
   пересчитывает даты по ней; без полной истории используются закоммиченные
   значения. */
const updatedSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const visualSchema = z.object({
  src: z.string().min(1).startsWith(MEDIA_PREFIX),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  caption: z.string().min(1).optional(),
})

/* Визуальные параметры вьювера: каждая модель переопределяет дефолты
   компонента (в скобках — значения по умолчанию). Один и тот же набор нужен
   и модели в шапке кейса (`model`), и модели внутри галереи (`kind: '3d'`),
   поэтому живёт отдельно. */
const modelSettingsShape = {
  autoRotate: z.boolean().optional(),
  /* Максимальная интенсивность пульсации свечения (эмишн) (5). */
  emissivePulse: z.number().min(0).max(20).optional(),
  /* Частота пульсации свечения, Гц (0.7). */
  emissivePulseHz: z.number().min(0).max(5).optional(),
  /* Множитель металличности: 1 = как в GLB, меньше = менее «зеркально» (0.88). */
  metalness: z.number().min(0).max(1).optional(),
  /* Подъём «чёрного» диффузной текстуры: тёмные участки становятся
     тёмно-серыми, светлые почти не меняются (30). */
  diffuseLift: z.number().min(0).max(120).optional(),
  /* Разворот модели вокруг Y в градусах: каждая GLB может быть
     экспортирована своей стороной к камере (0). */
  rotation: z.number().min(-360).max(360).optional(),
  /* Скорость автоповорота OrbitControls (1.2). */
  autoRotateSpeed: z.number().min(0).max(10).optional(),
  /* Интенсивность студийного окружения RoomEnvironment (0.5). */
  environmentIntensity: z.number().min(0).max(2).optional(),
  /* Ступор зума OrbitControls в долях от кадрирующей дистанции:
     zoomMin — как близко можно приблизить (0.9), zoomMax — как далеко
     отъехать (1.4). */
  zoomMin: z.number().min(0.1).max(5).optional(),
  zoomMax: z.number().min(0.1).max(5).optional(),
  /* Зазор вокруг модели при кадрировании (1.25): меньше — модель
     крупнее в кадре. Крупным объектам (дом) нужен зазор меньше. */
  fit: z.number().min(0.3).max(3).optional(),
  /* Интенсивности источников света: полусфера (0.5), ключевой (0.8),
     мягкая подсветка (0.4). */
  hemisphereLight: z.number().min(0).max(3).optional(),
  keyLight: z.number().min(0).max(3).optional(),
  fillLight: z.number().min(0).max(3).optional(),
  /* Масштаб канваса рендера относительно контейнера (1.8): больше — запас
     от обрезки модели при вращении, но прозрачная зона канваса перекрывает
     соседние блоки. 1 — канвас ровно по контейнеру, ничего не наезжает
     (нужно, когда модель стоит отдельно в галерее). */
  canvasScale: z.number().min(1).max(3).optional(),
}

const mediaSchema = visualSchema.extend({
  kind: z.enum(['image', 'video', '3d']),
  poster: z.string().min(1).startsWith(MEDIA_PREFIX).optional(),
  /* Фоновые зацикленные анимации: без контролов, autoplay + muted + loop. */
  loop: z.boolean().optional(),
  /* Видео с автозапуском: играет само, звук выключен, контролы видны сразу. */
  autoplay: z.boolean().optional(),
  /* Автоплей-видео без контролов вообще: чистая зацикленная анимация без UI
     (никаких значков звука/паузы), muted + loop + autoplay. */
  bare: z.boolean().optional(),
  /* Стартовая секунда: видео начинает играть не с 0:00, а с этой точки,
     чтобы соседние ролики в галерее не стартовали синхронно. */
  startAt: z.number().min(0).optional(),
  /* Явный полноширинный материал (например, финальная картинка галереи). */
  wide: z.boolean().optional(),
  /* Одиночный материал отдельной строкой (например, квадратный ролик в подборке,
     который не должен вставать в пару с горизонтальным и обрезаться). */
  solo: z.boolean().optional(),
  /* Компактный материал для ряда из четырёх (например, видео с тремя картинками рядом). */
  quad: z.boolean().optional(),
  /* Материал для ряда из трёх на всю ширину (квадратные картинки, не резать). */
  triple: z.boolean().optional(),
  /* 3D-вьювер: те же настройки, что и у модели в шапке кейса. */
  ...modelSettingsShape,
  /* 3D: программный взрыв-вид по иерархии деталей (для кейсов со сборкой). */
  explode: z.boolean().optional(),
  /* 3D: автопроигрывание запечённой анимации из GLB. */
  playAnimation: z.boolean().optional(),
})

const metricSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
})

const linkSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1).regex(/^(https:\/\/|mailto:|tel:|#)/),
})

const contactSchema = z.object({
  channel: z.enum(['telegram', 'email', 'phone']),
  label: z.string().min(1),
  value: z.string().min(1),
  href: z.string().min(1).regex(/^(https:\/\/|mailto:|tel:|#)/),
  primary: z.boolean(),
})

/* Компания из блока «Где применяли»: `slug` добавляется, если по клиенту
   есть кейс на сайте — тогда название становится ссылкой на кейс. */
const proofCompanySchema = z.object({
  label: z.string().min(1),
  slug: z.string().min(1).optional(),
})

const serviceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1),
  description: z.string().min(1),
  proof: z.array(proofCompanySchema).min(1),
})

/* Кейс, на который ссылается ответ в FAQ: `slug` обязателен, потому что
   название всегда становится ссылкой на страницу кейса. */
const faqCaseSchema = z.object({
  label: z.string().min(1),
  slug: slugSchema,
})

const processStepSchema = z.object({
  position: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
})

export default defineContentConfig({
  collections: {
    projects: defineCollection({
      type: 'page',
      source: 'projects/**/*.md',
      schema: z.object({
        locale: localeSchema,
        slug: slugSchema,
        /* Тип представления кейса: `case` — полноценная страница (B2B, услуги,
           метрики, «О проекте»), `showcase` — компактная (видео/галерея по клику,
           для синематиков и гейм-реди). По умолчанию `case`. */
        type: z.enum(['case', 'showcase']).optional(),
        client: z.string().min(1),
        industry: z.string().min(1),
        /* Профили, к которым относится кейс (массив — кейс может быть в двух сразу). */
        categories: z.array(z.enum(['orgtech', 'industrial', 'furniture', 'exteriors', 'cinematics', 'gameready', 'webgl'])).optional(),
        /* Явный порядок внутри профиля: `categoryOrder: { webgl: 1 }` — кейс
           идёт первым в сетке этого профиля. Общей нумерацией подборку
           профиля не расставить: `position` ведёт архив и главную (новый кейс
           уезжает в конец), а кейс может лежать в двух профилях сразу.
           Кейсы с явным порядком идут первыми по возрастанию, остальные —
           как раньше (профиль из `categories` раньше кросс-листинга, затем
           `position`). Правило — `app/utils/categoryOrder.ts`. */
        categoryOrder: z.record(z.number().int().positive()).optional(),
        position: z.number().int().positive(),
        featured: z.boolean(),
        status: z.enum(['draft', 'review', 'published']),
        period: z.string().min(1),
        updated: updatedSchema.optional(),
        engagement: z.enum(['active', 'completed']),
        year: z.number().int().min(2000).max(2100).optional(),
        duration: z.string().min(1).optional(),
        clientUrl: z.string().url().optional(),
        services: z.array(z.string().min(1)).min(1),
        deliverables: z.array(z.string().min(1)).optional(),
        /* Обложка карточки. `mobile` — необязательная вторая композиция для
           узких экранов: там карточка сжимает общий кадр так, что не читается
           ни объект, ни подписи на нём, и кейс может положить отдельный кроп
           (`docs/dev-guide.md` §5). На превью ссылки он не влияет: в соцсети
           уходит общий кадр (`cover.src`). */
        cover: visualSchema.extend({
          mobile: visualSchema.optional(),
        }),
        /* Картинка в шапке кейса: по умолчанию совпадает с `cover` (карточкой
           категории), но может быть отдельной — когда на хабе проектов стоит
           одна заставка, а в самом кейсе хочется показать другую. */
        hero: visualSchema.optional(),
        /* 3D-модель вместо обложки в hero кейса; постером вьювера служит сама обложка.
           Визуальные параметры вьювера — каждая модель может переопределять
           дефолты компонента (в скобках — значения по умолчанию). */
        model: visualSchema.extend(modelSettingsShape).optional(),
        /* Интерактивный конфигуратор вместо обычного вьювера в шапке кейса:
           GLB берётся из `model`, а манифест `<slug>.json` (копия рядом с GLB)
           описывает роли и варианты нод — панель вариантов и живой счётчик
           строятся по нему, поэтому вторая машина подключается копией файла. */
        configurator: z.object({
          manifest: z.string().min(1).startsWith(MEDIA_PREFIX),
          /* Машины гаража (раздел VEHICLES). Файлы уровней лежат рядом
             с `model.src`, имена — в манифесте. `rotation` — разворот именно
             этой машины (у части выгрузок длинная ось повёрнута), без него
             берётся `model.rotation`; `name` — подпись в HUD (по умолчанию из
             слага манифеста); `thumb` — миниатюра для списка. Машина
             с `manifest`, равным `configurator.manifest`, открывается первой;
             без списка в гараже одна эта машина. */
          vehicles: z.array(z.object({
            manifest: z.string().min(1).startsWith(MEDIA_PREFIX),
            name: z.string().min(1).optional(),
            rotation: z.number().min(-360).max(360).optional(),
            thumb: z.string().min(1).startsWith(MEDIA_PREFIX).optional(),
          })).min(1).optional(),
          /* Окружение вокруг машины: GLB «гараж» встаёт в ту же сцену, машина
             садится на его пол (пол ищется пробами под габаритом машины —
             низ габарита гаража задаёт плинтус, а не плита), а камера
             остаётся внутри стен. Окружение рисуется в своих единицах и с
             нулём на полу, поэтому масштаб задаётся здесь, а не подгоняется
             в GLB. Облёт по умолчанию полный круг; дуга (градусы) нужна
             только окружению с проёмом в стене — тогда камера в него не
             заходит. По высоте камера ограничена так же
             (`tiltFrom`/`tiltTo`, градусы над горизонтом машины): выше
             потолка окружения поднимать её незачем. */
          garage: z.object({
            src: z.string().min(1).startsWith(MEDIA_PREFIX),
            scale: z.number().min(0.05).max(10).optional(),
            rotation: z.number().min(-360).max(360).optional(),
            orbitFrom: z.number().min(-360).max(360).optional(),
            orbitTo: z.number().min(-360).max(360).optional(),
            tiltFrom: z.number().min(0).max(90).optional(),
            tiltTo: z.number().min(0).max(90).optional(),
            /* Кадрирование и предел отъезда камеры в гараже — отдельно от
               `model`: большой зал с реквизитом снимается ближе. */
            fit: z.number().min(0.1).max(4).optional(),
            zoomMax: z.number().min(0.2).max(6).optional(),
          }).optional(),
          /* Музыка зала. Трек не грузится вместе со страницей: адрес отдаётся
             элементу только когда сцена собрана (модель, уровни и текстуры
             уже на месте), поэтому канал музыка не занимает. Играет тихо,
             сам набирает громкость с нуля и выключается кнопкой со скрипичным
             ключом в углу сцены. */
          audio: z.object({
            /* Один трек (`src`) или очередь (`tracks`): музыкальный HUD
               в углу гаража листает очередь кнопками и идёт по ней сам. */
            src: z.string().min(1).startsWith(MEDIA_PREFIX).optional(),
            tracks: z.array(z.object({
              src: z.string().min(1).startsWith(MEDIA_PREFIX),
              title: z.string().min(1),
              artist: z.string().min(1).optional(),
            })).min(1).optional(),
            /* Громкость, до которой доходит появление (0…1). */
            volume: z.number().min(0).max(1).optional(),
            /* Сколько секунд трек набирает громкость. */
            fadeIn: z.number().min(0).max(30).optional(),
          }).refine(audio => !!audio.src || !!audio.tracks?.length, {
            message: 'configurator.audio: нужен src или tracks',
          }).optional(),
        }).optional(),
        /* Живой WebGL-виджет вместо обложки в шапке кейса — по тому же принципу,
           что и `model`, только считается шейдером, а не грузится файлом.
           `params` уходят в виджет как есть. Тема страницы на них не влияет:
           подложка блока тёмная всегда, иначе аддитивное свечение теряется. */
        demo: z.object({
          widget: z.enum(['pyramid', 'constellation', 'metaballs', 'particles', 'image-particles', 'energy-fill', 'water', 'energy-hero']),
          alt: z.string().min(1),
          logo: z.string().startsWith('/media/').optional(),
          /* Модель для виджетов, которые её сэмплируют (`particles`)
             или рисуют сцену из неё (`water`). */
          model: z.string().startsWith('/media/').optional(),
          /* Картинка-донор для виджетов, которые собирают частицы из
             изображения (`image-particles`). */
          src: z.string().startsWith('/media/').optional(),
          /* Подпись к модели: у лицензий вроде CC-BY атрибуция обязательна
             и должна стоять рядом с работой, а не в подвале страницы. */
          credit: z.object({
            text: z.string().min(1),
            url: z.string().url().optional(),
          }).optional(),
          tunable: z.boolean().optional(),
          params: z.record(z.union([z.number(), z.string(), z.boolean(), z.array(z.number())])),
        }).optional(),
        media: z.array(mediaSchema),
        metrics: z.array(metricSchema).min(1),
      }),
    }),
    /* База знаний: одна статья — один вопрос, который возникает при работе
       с 3D-специалистом. Как писать — `KB_TEMPLATE.md`, список тем —
       `docs/knowledge-topics.md`. Статья всегда лежит парой RU + EN с одним
       `slug` (как кейс): sitemap и hreflang считают, что у адреса есть обе
       версии, и `pnpm validate:content` это проверяет. */
    knowledge: defineCollection({
      type: 'page',
      source: 'knowledge/**/*.md',
      schema: z.object({
        locale: localeSchema,
        slug: slugSchema,
        /* Вопрос словами читателя: он же H1 и заголовок в поиске. */
        title: z.string().min(1).max(90),
        /* Сниппет в поиске и подпись в соцсетях. */
        description: z.string().min(1).max(200),
        /* Короткий ответ: выводится блоком «Коротко» под заголовком и уходит
           в llms.txt. Отвечает на вопрос целиком — без «в статье расскажем». */
        summary: z.string().min(40).max(520),
        section: z.enum(KNOWLEDGE_SECTIONS),
        audience: z.array(z.enum(KNOWLEDGE_AUDIENCES)).min(1),
        /* Порядок внутри раздела на хабе. Сортировка — в JS, как у кейсов. */
        position: z.number().int().positive(),
        status: z.enum(['draft', 'review', 'published']),
        updated: updatedSchema.optional(),
        /* Кейсы-доказательства (slug'и кейсов) и связанные статьи (slug'и
           статей). Существование проверяет `pnpm validate:content`. */
        cases: z.array(slugSchema).optional(),
        related: z.array(slugSchema).optional(),
        cover: visualSchema.optional(),
      }),
    }),
    /* Глоссарий базы знаний: один файл на локаль. Термины пишутся для
       заказчика, а не для 3D-специалиста; подробности — в статье `article`.
       `id` — якорь на странице и общий ключ с другой локалью (набор id
       одинаковый, это проверяет `pnpm validate:content`). */
    glossary: defineCollection({
      type: 'data',
      source: 'glossary/*.yml',
      schema: z.object({
        locale: localeSchema,
        updated: updatedSchema.optional(),
        /* Заголовок и вступление страницы — здесь, а не в i18n: их же берёт
           markdown-версия для ИИ (scripts/generate-llms.mjs). */
        title: z.string().min(1).max(60),
        intro: z.string().min(1).max(300),
        terms: z.array(z.object({
          id: slugSchema,
          term: z.string().min(1).max(40),
          /* Другие названия того же: «меш», «аниматик». Видны рядом с
             термином и попадают в разметку DefinedTerm как alternateName. */
          aka: z.array(z.string().min(1)).optional(),
          /* 1–2 предложения: определение цитируют поиск и ассистенты. */
          definition: z.string().min(40).max(280),
          article: slugSchema.optional(),
        })).min(1),
      }),
    }),
    site: defineCollection({
      type: 'data',
      source: 'site/*.yml',
      schema: z.object({
        locale: localeSchema,
        updated: updatedSchema.optional(),
        brand: z.object({
          name: z.string().min(1),
          descriptor: z.string().min(1),
          founder: z.string().min(1),
        }),
        hero: z.object({
          eyebrow: z.string().min(1),
          title: z.string().min(1),
          description: z.string().min(1),
          primaryCta: linkSchema,
        }),
        about: z.object({
          title: z.string().min(1),
          description: z.string().min(1),
          team: z.string().min(1),
        }),
        contacts: z.array(contactSchema).min(1),
        pricing: z.object({
          summary: z.string().min(1),
          note: z.string().min(1),
        }),
        /* У статистики главной может быть ссылка в подписи (например, «Kwork»). */
        stats: z.array(metricSchema.extend({ link: linkSchema.optional() })).min(1),
        services: z.array(serviceSchema).min(1),
        /* Вопросы-ответы на главной: попадают в разметку FAQPage и видны
           пользователям (блок «Вопросы и ответы»). */
        faq: z.array(z.object({
          question: z.string().min(1),
          answer: z.string().min(1),
          /* Кейсы, подтверждающие ответ: выводятся ссылками под текстом. */
          cases: z.array(faqCaseSchema).min(1).optional(),
        })).min(1),
        process: z.array(processStepSchema).min(1),
        audiences: z.array(z.string().min(1)).min(1),
        proofLinks: z.array(linkSchema).min(1),
      }),
    }),
  },
})
