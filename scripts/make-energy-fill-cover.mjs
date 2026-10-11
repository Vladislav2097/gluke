/**
 * Обложка кейса `energy-fill` (виджет `energy-hero`).
 *
 * Обложка лежит под виджетом и видна, пока WebGL не запустился, — значит она
 * должна показывать финальный кадр сцены: карточку с заголовком, жёлтой
 * кнопкой, статичным знаком «g» с тенью и надписью GLUKE. Снять её
 * скриншотом нельзя (канвас рисуется без preserveDrawingBuffer, а текст
 * и кнопка — HTML поверх него), поэтому она собирается здесь из тех же
 * SVG и размеров макета, что у карточки (`app/utils/gluke-energy-hero/card.css`).
 *
 *   node scripts/make-energy-fill-cover.mjs [--width=1680] [--height=945]
 *
 * Карточка во всю ширину, поля сверху и снизу — фон тёмной темы сайта: в сцене
 * кейса (пропорции карточки) они уходят за обрез, и обложка совпадает с живой
 * карточкой. Текст рисует librsvg системным шрифтом — Inter, если он стоит.
 */
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const STILL = 'public/media/projects/energy-fill/g-static.svg'
const WORDMARK = 'public/media/brand/gluke-logo-white.svg'
const OUT = 'public/media/projects/energy-fill/energy-fill-cover.jpg'

/* Фон тёмной темы сайта — как на обложках соседних виджетов. */
const BG = { r: 8, g: 7, b: 11, alpha: 1 }

const flags = new Map(
  process.argv.slice(2).filter(a => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=')
    return [k, v]
  }),
)
const W = Number(flags.get('width') ?? 1680)
const H = Number(flags.get('height') ?? 945)

/* 1 px макета 1200×493 в пикселях обложки. */
const U = W / 1200
const CARD_H = Math.round(493 * U)
const TOP = Math.round((H - CARD_H) / 2)
const px = v => (v * U).toFixed(2)

/* Знак: высота 321 с центром в (870, 224), поля под тень — 6/39 высоты. */
const MARK_H = 321
const PAD = 6 / 39
const stillH = MARK_H * (1 + 2 * PAD)
const stillW = stillH * 232.377 / 293.577

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const FONT = `font-family="Inter, 'Segoe UI', Arial, sans-serif"`

const card = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CARD_H}" viewBox="0 0 ${W} ${CARD_H}">
  <rect width="${W}" height="${CARD_H}" rx="${px(40)}" fill="#1B2339"/>
  <text ${FONT} fill="#F4DE3C" font-size="${px(48)}" letter-spacing="${px(0.48)}" x="${px(52)}" y="${px(81 + 38)}">${esc('DIGITAL-МАРКЕТИНГ,')}</text>
  <text ${FONT} fill="#fff" font-size="${px(30)}" x="${px(52)}" y="${px(81 + 50 + 27)}">${esc('который приносит бизнесу')}</text>
  <text ${FONT} fill="#fff" font-size="${px(30)}" x="${px(52)}" y="${px(81 + 50 + 36 + 27)}">${esc('измеримый результат')}</text>
  <g ${FONT} fill="#fff" font-size="${px(15)}">
    <text x="${px(52)}" y="${px(236 + 17)}">${esc('Делаем интернет маркетинг двигателем вашего бизнеса.')}</text>
    <text x="${px(52)}" y="${px(236 + 24 + 17)}">${esc('Превращаем рекламный бюджет в инструмент роста')}</text>
    <text x="${px(52)}" y="${px(236 + 48 + 17)}">${esc('и масштабирования бизнеса, а не статью расходов')}</text>
  </g>
  <rect x="${px(52)}" y="${px(349)}" width="${px(190)}" height="${px(56)}" rx="${px(28)}" fill="#F4DE3C"/>
  <text ${FONT} fill="#1B2339" font-size="${px(16)}" font-weight="500" text-anchor="middle" x="${px(52 + 95)}" y="${px(349 + 28 + 6)}">${esc('Обсудить проект')}</text>
</svg>`

const still = await sharp(readFileSync(STILL), { density: 600 })
  .resize({ width: Math.round(stillW * U), height: Math.round(stillH * U), fit: 'fill' })
  .png()
  .toBuffer()
const wordmark = await sharp(readFileSync(WORDMARK), { density: 600 })
  .resize({ width: Math.round(87.8 * U), height: Math.round(28 * U), fit: 'fill' })
  .png()
  .toBuffer()

/* Мягкое зарево вокруг знака — как в финале сцены, где знак ещё светится. */
const glow = await sharp(still).blur(28).png().toBuffer()

await sharp({ create: { width: W, height: H, channels: 3, background: BG } })
  .composite([
    { input: Buffer.from(card), left: 0, top: TOP },
    { input: glow, left: Math.round((870 - stillW / 2) * U), top: TOP + Math.round((224 - stillH / 2) * U), blend: 'screen' },
    { input: still, left: Math.round((870 - stillW / 2) * U), top: TOP + Math.round((224 - stillH / 2) * U) },
    { input: wordmark, left: Math.round(826.1 * U), top: TOP + Math.round(395 * U) },
  ])
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(OUT)

const out = await sharp(OUT).metadata()
console.log(`${OUT} — ${out.width}×${out.height}`)
