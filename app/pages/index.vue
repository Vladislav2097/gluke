<script setup lang="ts">
import type { HomeService } from '~/utils/home-services'

const site = useSiteContent()
const locale = useCurrentLocale()
const { t } = useI18n()
const { home } = useSiteRoutes()

/* Граница между сгенерированными типами контента и явным типом услуги:
   приведение через unknown гарантирует сборку даже если сгенерированные типы
   (production-сборка, Vercel) отстают от схемы и описывают proof как string[].
   Данные на рантайме при этом всегда объекты { label, slug? }. */
const services = computed(() => site.value.services as unknown as HomeService[])

const { data: projects } = await useAsyncData(
  computed(() => `home-featured-projects-${locale.value}`),
  () => queryLocalizedProjects(locale.value)
    .where('featured', '=', true)
    .all()
    .then(items => items.sort((a, b) => a.position - b.position)),
)

/* На главной показываем только первые 4 проекта, остальные — в архиве /projects. */
const featuredProjects = computed(() => (projects.value ?? []).slice(0, 4))
const initialHeroProject = featuredProjects.value[0]

if (!initialHeroProject) {
  throw createError({
    statusCode: 500,
    statusMessage: t('errors.featuredProjectsMissing'),
    fatal: true,
  })
}

/* Обложка героя остаётся непустой и во время переключения языка. */
const heroProject = computed(() => featuredProjects.value[0] ?? initialHeroProject)

const pageTitle = computed(() => t('seo.homeTitle', {
  site: site.value.brand.name,
  tagline: site.value.hero.title,
}))

const { toAbsolute } = useSiteUrls()
const heroCoverUrl = computed(() => toAbsolute(heroProject.value.cover.src))

/* Явный ImageObject обложки первого проекта: module nuxt-schema-org иначе
   подставляет логотип студии как primaryImageOfPage. */
/* Обложка первого проекта как главное изображение страницы: передаём URL строкой,
   module nuxt-schema-org сам создаст ImageObject и не подставит логотип студии. */

usePageSeo({
  title: pageTitle,
  description: () => site.value.hero.description,
  path: () => home(),
  type: 'website',
  image: () => heroProject.value.cover,
})

/* Услуги — отдельные узлы Service, привязанные к организации: ИИ-ассистенты
   и поиск читают их как «что умеет эта студия». */
const organizationId = computed(() => toAbsolute('/#identity'))

const serviceSchema = computed(() => services.value.map(service => ({
  '@type': 'Service',
  'name': service.title,
  'description': service.description,
  'provider': { '@id': organizationId.value },
})))

/* FAQPage соответствует видимому блоку «Вопросы и ответы» на этой странице:
   ссылки на кейсы дописываются в текст ответа, чтобы разметка совпадала
   с тем, что видит пользователь. */
const faqSchema = computed(() => ({
  '@type': 'FAQPage',
  'mainEntity': site.value.faq.map((item) => {
    const cases = item.cases?.map(caseLink => caseLink.label).join(', ')

    return {
      '@type': 'Question',
      'name': item.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': cases ? `${item.answer} ${t('home.faq.casesLabel')} ${cases}` : item.answer,
      },
    }
  }),
}))

useSchemaOrg([
  defineWebPage({
    '@type': 'WebPage',
    'name': () => pageTitle.value,
    'description': () => site.value.hero.description,
    'inLanguage': () => locale.value,
    'primaryImageOfPage': () => heroCoverUrl.value,
  }),
  ...serviceSchema.value,
  faqSchema.value,
])
</script>

<template>
  <div>
    <HomeHero :hero="site.hero" />

    <HomeStats :stats="site.stats" />

    <HomeProjects :projects="featuredProjects" />

    <HomeServices :services="services" />

    <HomeProcess :steps="site.process" />

    <HomeFaq :faq="site.faq" />

    <HomeAbout
      :about="site.about"
      :audiences="site.audiences"
      :pricing="site.pricing"
    />

    <SiteContact
      :cta="site.hero.primaryCta"
      :pricing="site.pricing"
      :contacts="site.contacts"
    />
  </div>
</template>
