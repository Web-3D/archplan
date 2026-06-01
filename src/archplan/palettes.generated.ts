/**
 * ⚙ AUTO-GENERATED bởi Atelier — KHÔNG SỬA TAY (mọi sửa tay sẽ bị regen ghi đè).
 *
 * VỊ TRÍ  — file này nằm trong repo CONSUMER (đường ghi qua --out); NGUỒN gốc ở atelier/library/.
 * VAI TRÒ — Khay màu runtime: 13 palette atelier → mảng PALETTES[] cho "palette node"
 *           (vd ArchPlan brush) đọc → render swatch + cọ sơn 3D. Data THUẦN, không logic.
 * NGUỒN   — atelier library/[style]/*.json (hex canonical) → bake 1 CHIỀU qua export/to-palette-index.ts.
 *
 * CÁCH DÙNG (consumer):
 *   import { PALETTES, DEFAULT_PALETTE_ID, type Palette } from './palettes.generated'
 *   PALETTES[i].colors[j].hex → '#RRGGBB' canonical. Three.Color: parseInt(hex.slice(1), 16) = 0xRRGGBB.
 *   DEFAULT_PALETTE_ID = khay mặc định (atelier đánh dấu default:true) → load đầu tiên. PALETTES[0] cũng là nó.
 *
 * CẬP NHẬT — sửa màu Ở ATELIER library/ rồi regen (đừng sửa file này):
 *   • 1 lần:    (atelier) npm run export:index:doraemon
 *   • auto dev: (atelier) npm run watch:export   → watch library/ → tự regen → Vite HMR live
 *
 * Palette (13): basic-7, anime-bright, phi-thuy, doraemon-town, sky-ramp, ghibli-pastoral, brick, concrete, metal, stone, wood, grayscale-ramp, ui-base
 */

export interface PaletteColor {
  name: string
  role?: string
  hex: string
}
export interface Palette {
  id: string
  name: string
  style: string
  default?: boolean
  colors: PaletteColor[]
}

export const PALETTES: Palette[] = [
  {
    id: 'basic-7',
    name: 'Basic 7',
    style: 'neutral',
    default: true,
    colors: [
      { name: 'red', role: 'primary', hex: '#E74C3C' },
      { name: 'orange', role: 'secondary', hex: '#E67E22' },
      { name: 'yellow', role: 'accent', hex: '#F1C40F' },
      { name: 'green', role: 'accent', hex: '#2ECC71' },
      { name: 'blue', role: 'accent', hex: '#3498DB' },
      { name: 'indigo', role: 'neutral', hex: '#5B4B8A' },
      { name: 'violet', role: 'accent', hex: '#9B59B6' },
    ],
  },
  {
    id: 'anime-bright',
    name: 'Anime Bright',
    style: 'anime',
    colors: [
      { name: 'coral', role: 'primary', hex: '#FF5E5B' },
      { name: 'teal', role: 'secondary', hex: '#00CECB' },
      { name: 'sunny', role: 'accent', hex: '#FFED66' },
      { name: 'ocean', role: 'support', hex: '#247BA0' },
      { name: 'ink', role: 'neutral', hex: '#1B1B3A' },
      { name: 'paper', role: 'background', hex: '#F7FFF7' },
    ],
  },
  {
    id: 'phi-thuy',
    name: 'Phi Thúy',
    style: 'background',
    colors: [
      { name: 'bg-1', role: 'background', hex: '#0E2E26' },
      { name: 'bg-2', role: 'surface', hex: '#14443A' },
      { name: 'bg-3', role: 'surface', hex: '#1C5C4C' },
      { name: 'bg-4', role: 'surface', hex: '#2A7862' },
      { name: 'bg-5', role: 'highlight', hex: '#459A80' },
      { name: 'accent', role: 'accent', hex: '#C9A24E' },
      { name: 'text', role: 'text', hex: '#DCEFE7' },
      { name: 'text-on-light', role: 'text-inverse', hex: '#0E2E26' },
    ],
  },
  {
    id: 'doraemon-town',
    name: 'Doraemon Town',
    style: 'doraemon',
    colors: [
      { name: 'sky', role: 'background', hex: '#8FD3F4' },
      { name: 'grass', role: 'surface', hex: '#9DFB51' },
      { name: 'wall-cream', role: 'primary', hex: '#F5E9D0' },
      { name: 'roof-terracotta', role: 'secondary', hex: '#C45B3C' },
      { name: 'wood-brown', role: 'neutral', hex: '#8B5E3C' },
      { name: 'accent-red', role: 'accent', hex: '#E84C3D' },
    ],
  },
  {
    id: 'sky-ramp',
    name: 'Sky Ramp',
    style: 'doraemon',
    colors: [
      { name: 'tone-1', role: 'neutral', hex: '#4C6C7C' },
      { name: 'tone-2', role: 'neutral', hex: '#5791AC' },
      { name: 'tone-3', role: 'primary', hex: '#72B5D6' },
      { name: 'tone-4', role: 'neutral', hex: '#9ED9F7' },
      { name: 'tone-5', role: 'neutral', hex: '#EAF8FF' },
    ],
  },
  {
    id: 'ghibli-pastoral',
    name: 'Ghibli Pastoral',
    style: 'ghibli',
    colors: [
      { name: 'sky-soft', role: 'background', hex: '#A8C8D8' },
      { name: 'meadow', role: 'surface', hex: '#7BA05B' },
      { name: 'wheat', role: 'primary', hex: '#D4B483' },
      { name: 'foliage-deep', role: 'secondary', hex: '#4A6741' },
      { name: 'earth', role: 'neutral', hex: '#6B4F3A' },
      { name: 'warm-white', role: 'highlight', hex: '#F0E6D2' },
    ],
  },
  {
    id: 'brick',
    name: 'Brick',
    style: 'material',
    colors: [
      { name: 'clay-pale', role: 'surface', hex: '#D9A07E' },
      { name: 'terracotta', role: 'primary', hex: '#C9714B' },
      { name: 'red-brick', role: 'secondary', hex: '#A8472B' },
      { name: 'fired-deep', role: 'accent', hex: '#82331F' },
      { name: 'umber', role: 'neutral', hex: '#5E2D1E' },
      { name: 'mortar', role: 'highlight', hex: '#C9BFB0' },
    ],
  },
  {
    id: 'concrete',
    name: 'Concrete',
    style: 'material',
    colors: [
      { name: 'fresh-pour', role: 'surface', hex: '#C8C4BC' },
      { name: 'raw-grey', role: 'primary', hex: '#A8A49B' },
      { name: 'weathered', role: 'secondary', hex: '#8B8881' },
      { name: 'wet-cement', role: 'accent', hex: '#6B6964' },
      { name: 'shadow', role: 'neutral', hex: '#4A4946' },
      { name: 'form-line', role: 'highlight', hex: '#D6D2C9' },
    ],
  },
  {
    id: 'metal',
    name: 'Metal',
    style: 'material',
    colors: [
      { name: 'steel-light', role: 'surface', hex: '#B9C0C6' },
      { name: 'brushed', role: 'primary', hex: '#8E979E' },
      { name: 'gunmetal', role: 'secondary', hex: '#5C656C' },
      { name: 'iron', role: 'neutral', hex: '#3E454B' },
      { name: 'copper', role: 'accent', hex: '#B06A43' },
      { name: 'highlight', role: 'highlight', hex: '#E3E8EC' },
    ],
  },
  {
    id: 'stone',
    name: 'Stone',
    style: 'material',
    colors: [
      { name: 'limestone', role: 'surface', hex: '#CFC6B3' },
      { name: 'sandstone', role: 'primary', hex: '#B7A079' },
      { name: 'granite', role: 'secondary', hex: '#8C8579' },
      { name: 'slate', role: 'accent', hex: '#5E5F5C' },
      { name: 'basalt', role: 'neutral', hex: '#3A3A38' },
      { name: 'marble-white', role: 'highlight', hex: '#E5E0D5' },
    ],
  },
  {
    id: 'wood',
    name: 'Wood',
    style: 'material',
    colors: [
      { name: 'pine-pale', role: 'surface', hex: '#D8B58A' },
      { name: 'oak', role: 'primary', hex: '#BE8A56' },
      { name: 'walnut', role: 'secondary', hex: '#8B5E3C' },
      { name: 'teak', role: 'accent', hex: '#6E4327' },
      { name: 'ebony', role: 'neutral', hex: '#3F2A1B' },
      { name: 'ash-grey', role: 'highlight', hex: '#A99B86' },
    ],
  },
  {
    id: 'grayscale-ramp',
    name: 'Grayscale Ramp',
    style: 'neutral',
    colors: [
      { name: 'ink', role: 'text', hex: '#18181B' },
      { name: 'gray-1', role: 'neutral', hex: '#3F3F46' },
      { name: 'gray-2', role: 'neutral', hex: '#71717A' },
      { name: 'gray-3', role: 'neutral', hex: '#A1A1AA' },
      { name: 'gray-4', role: 'surface', hex: '#D4D4D8' },
      { name: 'paper', role: 'background', hex: '#FAFAFA' },
      { name: 'accent', role: 'accent', hex: '#3B82F6' },
    ],
  },
  {
    id: 'ui-base',
    name: 'UI Base',
    style: 'neutral',
    colors: [
      { name: 'primary', role: 'primary', hex: '#3B82F6' },
      { name: 'secondary', role: 'secondary', hex: '#64748B' },
      { name: 'accent', role: 'accent', hex: '#F59E0B' },
      { name: 'neutral', role: 'neutral', hex: '#9CA3AF' },
      { name: 'background', role: 'background', hex: '#0F172A' },
      { name: 'surface', role: 'surface', hex: '#1E293B' },
      { name: 'text', role: 'text', hex: '#F8FAFC' },
    ],
  },
]

/** ID khay mặc định (palette có default:true ở atelier; consumer nên load khay này đầu tiên). */
export const DEFAULT_PALETTE_ID = 'basic-7'
