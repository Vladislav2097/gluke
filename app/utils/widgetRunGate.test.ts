import { beforeEach, describe, expect, it, vi } from 'vitest'
import constellationSource from './constellation.js?raw'
import energyFillSource from './gluke-energy-fill.js?raw'
import energyHeroSource from './gluke-energy-hero.js?raw'
import imageParticlesSource from './gluke-image-particles.js?raw'
import metaballsSource from './gluke-metaballs.js?raw'
import particlesSource from './gluke-particles.js?raw'
import pyramidSource from './gluke-pyramid.js?raw'
import waterSource from './gluke-water.js?raw'
import { attachRunSources, createRunGate } from './widgetRunGate'

/* Источники подменяются через опции: в node-окружении ни document, ни
   IntersectionObserver не существуют, а поведение снятого движка и возврата
   на вкладку нужно проверить именно здесь. */
function fakeDocument(hidden = false) {
  const listeners = new Set<() => void>()
  return {
    hidden,
    count: () => listeners.size,
    addEventListener(_type: string, listener: () => void) {
      listeners.add(listener)
    },
    removeEventListener(_type: string, listener: () => void) {
      listeners.delete(listener)
    },
    emit() {
      for (const listener of [...listeners]) listener()
    },
  }
}

class FakeObserver {
  static created: FakeObserver[] = []
  observed: unknown[] = []
  disconnected = false
  private readonly callback: (entries: { isIntersecting: boolean }[]) => void

  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    this.callback = callback
    FakeObserver.created.push(this)
  }

  observe(el: unknown) {
    this.observed.push(el)
  }

  disconnect() {
    this.disconnected = true
  }

  emit(isIntersecting: boolean) {
    this.callback([{ isIntersecting }])
  }
}

function attach(el: object, gate: ReturnType<typeof createRunGate>, doc: ReturnType<typeof fakeDocument>, options: { pauseOffscreen?: boolean } = {}) {
  return attachRunSources(el as Element, gate, {
    document: doc as unknown as Document,
    IntersectionObserver: FakeObserver as unknown as typeof IntersectionObserver,
    ...options,
  })
}

describe('createRunGate', () => {
  it('гасит кадры, когда блок ушёл за экран, и возвращает при появлении', () => {
    const gate = createRunGate()
    const seen: boolean[] = []
    gate.subscribe(run => seen.push(run))

    gate.setIntersecting(false)
    expect(gate.shouldRun()).toBe(false)
    gate.setIntersecting(true)
    expect(gate.shouldRun()).toBe(true)
    expect(seen).toEqual([false, true])
  })

  it('возврат на вкладку не запускает блок, который стоит за экраном', () => {
    /* Это и был исходный дефект: один флаг писали оба источника, и
       visibilitychange перекрывал вердикт IntersectionObserver. */
    const gate = createRunGate()

    gate.setIntersecting(false)
    gate.setDocumentVisible(false)
    gate.setDocumentVisible(true)

    expect(gate.shouldRun()).toBe(false)
  })

  it('блок в кадре не считает кадры в скрытой вкладке', () => {
    const gate = createRunGate()

    gate.setDocumentVisible(false)
    expect(gate.shouldRun()).toBe(false)

    gate.setDocumentVisible(true)
    expect(gate.shouldRun()).toBe(true)
  })

  it('снятый движок не считает кадры даже в активной вкладке', () => {
    const gate = createRunGate()

    gate.setAttached(false)
    expect(gate.shouldRun()).toBe(false)

    gate.setDocumentVisible(false)
    gate.setDocumentVisible(true)
    expect(gate.shouldRun()).toBe(false)

    gate.setAttached(true)
    expect(gate.shouldRun()).toBe(true)
  })

  it('pauseOffscreen: false — пересечение с вьюпортом не учитывается', () => {
    const gate = createRunGate({ pauseOffscreen: false })

    gate.setIntersecting(false)
    expect(gate.shouldRun()).toBe(true)

    gate.setDocumentVisible(false)
    expect(gate.shouldRun()).toBe(false)
  })

  it('подписка не повторяет одно и то же решение', () => {
    const gate = createRunGate()
    const listener = vi.fn()
    gate.subscribe(listener)

    gate.setIntersecting(true)
    gate.setDocumentVisible(true)
    expect(listener).not.toHaveBeenCalled()

    gate.setIntersecting(false)
    gate.setIntersecting(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('отписка в обработчике не мешает остальным слушателям', () => {
    const gate = createRunGate()
    const second = vi.fn()
    const off = gate.subscribe(() => off())
    gate.subscribe(second)

    gate.setDocumentVisible(false)
    expect(second).toHaveBeenCalledWith(false)
  })

  it('отписанный слушатель больше не зовётся', () => {
    const gate = createRunGate()
    const listener = vi.fn()
    gate.subscribe(listener)()

    gate.setDocumentVisible(false)
    expect(listener).not.toHaveBeenCalled()
  })
})

/*
 * Движки — обычные модули на window/WebGL: импортировать их в node нельзя,
 * поэтому источник кадров проверяем по тексту. Сторож бессмысленен, если
 * движок к нему не подключён или зовёт свою старую паузу сам, — а именно так
 * и выглядела исходная ошибка. Снятый движок обязан отписать источники, иначе
 * слушатель вкладки переживёт свой канвас и снова запустит цикл.
 */
const ENGINES = [
  { file: 'gluke-metaballs.js', source: metaballsSource },
  { file: 'gluke-energy-fill.js', source: energyFillSource },
  { file: 'gluke-pyramid.js', source: pyramidSource },
  { file: 'constellation.js', source: constellationSource },
  { file: 'gluke-image-particles.js', source: imageParticlesSource },
  { file: 'gluke-particles.js', source: particlesSource },
  { file: 'gluke-water.js', source: waterSource },
  { file: 'gluke-energy-hero.js', source: energyHeroSource },
]

describe('подключение движков к сторожу', () => {
  for (const { file, source } of ENGINES) {
    describe(file, () => {
      it('берёт источник кадров из общего сторожа', () => {
        expect(source).toMatch(/from '\.\/widgetRunGate'/)
        expect(source).toMatch(/createRunGate\(\{ pauseOffscreen/)
        expect(source).toMatch(/attachRunSources\(/)
      })

      it('запускает и гасит цикл по решению сторожа, а не по своему флагу', () => {
        expect(source).toMatch(/\.subscribe\(/)
        expect(source).not.toMatch(/addEventListener\('visibilitychange'/)
        expect(source).not.toMatch(/new IntersectionObserver/)
        expect(source).not.toMatch(/document\.hidden/)
      })

      it('отписывает источники при снятии движка', () => {
        expect(source).toMatch(/this\._?sources\??\.disconnect\(\)/)
      })
    })
  }
})

describe('attachRunSources', () => {
  beforeEach(() => {
    FakeObserver.created = []
  })

  it('возврат на вкладку не запускает блок, который стоит за экраном', () => {
    const doc = fakeDocument()
    const gate = createRunGate()
    attach({}, gate, doc)
    const observer = FakeObserver.created[0]

    observer?.emit(false)
    expect(gate.shouldRun()).toBe(false)

    /* Скрыли и вернули вкладку — блок по-прежнему за экраном. */
    doc.hidden = true
    doc.emit()
    doc.hidden = false
    doc.emit()
    expect(gate.shouldRun()).toBe(false)

    observer?.emit(true)
    expect(gate.shouldRun()).toBe(true)
  })

  it('вкладка скрыта в момент подключения — кадры не идут', () => {
    const doc = fakeDocument(true)
    const gate = createRunGate()
    attach({}, gate, doc)

    expect(gate.shouldRun()).toBe(false)

    doc.hidden = false
    doc.emit()
    expect(gate.shouldRun()).toBe(true)
  })

  it('disconnect снимает оба источника и помечает движок отсоединённым', () => {
    const doc = fakeDocument()
    const gate = createRunGate()
    const sources = attach({}, gate, doc)
    const observer = FakeObserver.created[0]

    sources.disconnect()

    expect(observer?.disconnected).toBe(true)
    expect(doc.count()).toBe(0)
    expect(gate.shouldRun()).toBe(false)

    /* Слушатель не остался: событие вкладки больше не трогает гейт. */
    doc.emit()
    expect(gate.shouldRun()).toBe(false)
  })

  it('pauseOffscreen: false — наблюдатель не создаётся, вкладка всё решает', () => {
    const doc = fakeDocument()
    const gate = createRunGate({ pauseOffscreen: false })
    attach({}, gate, doc, { pauseOffscreen: false })

    expect(FakeObserver.created).toHaveLength(0)

    doc.hidden = true
    doc.emit()
    expect(gate.shouldRun()).toBe(false)

    doc.hidden = false
    doc.emit()
    expect(gate.shouldRun()).toBe(true)
  })
})
