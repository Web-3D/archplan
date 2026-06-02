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

function subHeader(text: string): HTMLElement {
  const h = document.createElement('div')
  h.textContent = text
  h.style.cssText = 'font-weight:600;margin:4px 0 2px;opacity:.85'
  return h
}

// Structural (dựng lại khi BUÔNG): mật độ / cao lá / rộng lá.
function buildGrassStructural(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  body.appendChild(
    sliderRow(
      'Mật độ /m²',
      20,
      300,
      10,
      g.density,
      (v, c) => {
        g.density = Math.round(v)
        if (c) ctx.applySite(true)
      },
      false
    )
  )
  body.appendChild(
    sliderRow(
      'Cao lá cm',
      10,
      55,
      1,
      g.height * 100,
      (v, c) => {
        g.height = v / 100
        if (c) ctx.applySite(true)
      },
      false
    )
  )
  body.appendChild(
    sliderRow(
      'Rộng lá mm',
      1,
      6,
      0.5,
      g.bladeWidth * 1000,
      (v, c) => {
        g.bladeWidth = v / 1000
        if (c) ctx.applySite(true)
      },
      false
    )
  )
}

// Uniform (LIVE, không dựng lại): gió / tốc độ gió / màu gốc / màu ngọn.
function buildGrassUniform(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  body.appendChild(
    sliderRow('Gió', 0, 1, 0.05, g.wind, (v, c) => {
      g.wind = v
      ctx.tuneGrass((b) => b.setWind(v), c)
    })
  )
  body.appendChild(
    sliderRow('Tốc độ gió', 0, 4, 0.1, g.windSpeed, (v, c) => {
      g.windSpeed = v
      ctx.tuneGrass((b) => b.setWindSpeed(v), c)
    })
  )
  const recolor = (commit: boolean): void =>
    ctx.tuneGrass((b) => b.setColors(g.baseColor, g.tipColor), commit)
  body.appendChild(
    colorRow('Màu gốc', g.baseColor, (hex, c) => {
      g.baseColor = hex
      recolor(c)
    })
  )
  body.appendChild(
    colorRow('Màu ngọn', g.tipColor, (hex, c) => {
      g.tipColor = hex
      recolor(c)
    })
  )
}

// Hình dáng (LIVE, không dựng lại): cong tĩnh / xoắn ribbon / nhọn ngọn.
function buildGrassShape(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  body.appendChild(
    sliderRow('Độ cong', 0, 1.5, 0.05, g.curve, (v, c) => {
      g.curve = v
      ctx.tuneGrass((b) => b.setCurve(v), c)
    })
  )
  body.appendChild(
    sliderRow('Độ xoắn', 0, 1.5, 0.05, g.twist, (v, c) => {
      g.twist = v
      ctx.tuneGrass((b) => b.setTwist(v), c)
    })
  )
  body.appendChild(
    sliderRow('Độ nhọn', 0, 1, 0.02, g.taper, (v, c) => {
      g.taper = v
      ctx.tuneGrass((b) => b.setTaper(v), c)
    })
  )
}

// Panel "🎛️ Tinh chỉnh" (collapsible) — section per-element. Thêm đá/effect sau = thêm subHeader + builder.
export function setupTweakPanel(ctx: APGuiCtx, container: Element | null): HTMLElement {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-tweak-panel'
  const ttl = document.createElement('button')
  ttl.className = 'ap-scan-title'
  const body = document.createElement('div')
  body.appendChild(subHeader('🌿 Cỏ 3D'))
  buildGrassStructural(body, ctx)
  buildGrassShape(body, ctx)
  buildGrassUniform(body, ctx)
  let open = true
  const render = (): void => {
    ttl.textContent = `${open ? '▾' : '▸'} 🎛️ Tinh chỉnh`
    body.style.display = open ? '' : 'none'
  }
  ttl.addEventListener('click', () => {
    open = !open
    render()
  })
  render()
  p.appendChild(ttl)
  p.appendChild(body)
  container?.appendChild(p)
  return p
}
