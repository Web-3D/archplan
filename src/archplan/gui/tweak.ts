/**
 * VỊ TRÍ   — archplan/src/archplan/gui/tweak.ts
 * VAI TRÒ  — Panel "🎛️ Tinh chỉnh": nơi chỉnh THÔNG SỐ CHI TIẾT của decor/effect (cỏ 3D giờ; đá/effect sau).
 *            Mỗi element = 1 section. Tách riêng panel 🌳 Sân vườn (chỉ giữ on/off + nền/rào/lô).
 * LIÊN HỆ  — Dựng vào leftTools bởi ArchPlanLab._buildLeftTools. Đọc/ghi ctx.site.grass3d.
 *
 * 2 đường cập nhật (né recompile NodeMaterial):
 *   • Structural (mật độ/cao/rộng lá) → dựng lại KHI BUÔNG: ctx.applySite(true). liveDrag=false.
 *   • Uniform (gió/tốc độ/màu)        → LIVE trên instance đang sống: ctx.tuneGrass(...). Không dựng lại.
 */

import type { APGuiCtx } from './ctx'

// onChange(value, commit): commit=false khi kéo (live), true khi buông/đổi.
type RowChange = (value: number, commit: boolean) => void

// liveDrag=false → chỉ bắn khi BUÔNG (change), bỏ qua input (dùng cho param phải dựng lại).
function sliderRow(
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  onChange: RowChange,
  liveDrag = true
): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px'
  const lbl = document.createElement('span')
  lbl.textContent = label
  lbl.style.cssText = 'width:66px;flex-shrink:0'
  const sl = document.createElement('input')
  sl.type = 'range'
  sl.min = String(min)
  sl.max = String(max)
  sl.step = String(step)
  sl.value = String(initial)
  sl.style.cssText = 'flex:1;min-width:0;cursor:pointer'
  if (liveDrag) sl.addEventListener('input', () => onChange(parseFloat(sl.value), false))
  sl.addEventListener('change', () => onChange(parseFloat(sl.value), true))
  row.appendChild(lbl)
  row.appendChild(sl)
  return row
}

const hexStr = (n: number): string => '#' + (n & 0xffffff).toString(16).padStart(6, '0')

// Hàng chọn màu (<input type=color>): input = live (commit=false), change = commit (true).
function colorRow(
  label: string,
  initial: number,
  onChange: (hex: number, commit: boolean) => void
): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px'
  const lbl = document.createElement('span')
  lbl.textContent = label
  lbl.style.cssText = 'width:66px;flex-shrink:0'
  const inp = document.createElement('input')
  inp.type = 'color'
  inp.value = hexStr(initial)
  inp.style.cssText =
    'flex:1;min-width:0;height:16px;padding:0;border:none;background:none;cursor:pointer'
  const read = (): number => parseInt(inp.value.slice(1), 16)
  inp.addEventListener('input', () => onChange(read(), false))
  inp.addEventListener('change', () => onChange(read(), true))
  row.appendChild(lbl)
  row.appendChild(inp)
  return row
}

// B0 — Structural (dựng lại khi BUÔNG): mật độ / cao lá / rộng lá / số đốt.
function buildGrassStructural(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  const structural: [string, number, number, number, number, (v: number) => void][] = [
    ['Mật độ /m²', 20, 300, 10, g.density, (v) => (g.density = Math.round(v))],
    ['Cao lá cm', 5, 55, 1, g.height * 100, (v) => (g.height = v / 100)],
    ['Rộng lá mm', 1, 30, 0.5, g.bladeWidth * 1000, (v) => (g.bladeWidth = v / 1000)],
    ['Số đốt', 1, 12, 1, g.segments, (v) => (g.segments = Math.round(v))],
  ]
  for (const [label, min, max, step, init, set] of structural) {
    body.appendChild(
      sliderRow(
        label,
        min,
        max,
        step,
        init,
        (v, c) => {
          set(v)
          if (c) ctx.applySite(true)
        },
        false
      )
    )
  }
}

// B0 — Màu lá (LIVE, 1 màu phẳng). Gradient gốc/ngọn/mép = bước sau.
function buildGrassColor(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  body.appendChild(
    colorRow('Màu lá', g.color, (hex, c) => {
      g.color = hex
      ctx.tuneGrass((b) => b.setColor(hex), c)
    })
  )
}

// Panel "🎛️ Tinh chỉnh" — section per-element. Thêm đá/effect sau = thêm subHeader + builder.
// Trả { panel, previewHost }: panel cho Tabs drawer quản lý; previewHost để caller gắn GrassPreview vào.
// (Trong drawer-tabs: Tabs lo ẩn/hiện cả panel → bỏ nút thu/mở ▾ riêng, tiêu đề chỉ còn nhãn.)
export function setupTweakPanel(
  ctx: APGuiCtx,
  container: Element | null
): { panel: HTMLElement; previewHost: HTMLElement } {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-tweak-panel'
  const ttl = document.createElement('div')
  ttl.className = 'ap-scan-title'
  ttl.textContent = '🌿 Cỏ 3D'
  const body = document.createElement('div')
  buildGrassStructural(body, ctx)
  buildGrassColor(body, ctx)
  const previewHost = document.createElement('div')
  previewHost.className = 'ap-preview-host' // 🔎 chỗ neo preview 1 lá, ngay dưới slider+màu
  body.appendChild(previewHost)
  p.appendChild(ttl)
  p.appendChild(body)
  container?.appendChild(p)
  return { panel: p, previewHost }
}
