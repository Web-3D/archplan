/**
 * VỊ TRÍ   — archplan/src/archplan/gui/tweak.ts
 * VAI TRÒ  — 2 export: buildGrassTweak (bộ slider chi tiết cỏ — Lá đơn|Bụi cỏ, KHÔNG preview) dựng vào panel
 *            PRODUCTION Garden ▸ Grass; setupLabBench (panel 🎛️ Lab = BÀN THÍ NGHIỆM, giữ 🔎 preview WebGPU).
 *            Quy trình: dựng vật thể mới bằng slider + soi preview ở Lab → xong thì control "tốt nghiệp" sang panel dùng.
 * LIÊN HỆ  — buildGrassTweak gọi từ gui/site.ts (Garden ▸ Grass); setupLabBench + GrassPreview từ ArchPlanLab. Đọc/ghi ctx.site.grass3d.
 *
 * 2 đường cập nhật (né recompile NodeMaterial):
 *   • Structural (mật độ/cao/rộng lá) → dựng lại KHI BUÔNG: ctx.applySite(true). liveDrag=false.
 *   • Uniform (gió/tốc độ/màu)        → LIVE trên instance đang sống: ctx.tuneGrass(...). Không dựng lại.
 */

import { Tabs } from 'threejs-modules/ui/Tabs'

import type { APGuiCtx } from './ctx'

// onChange(value, commit): commit=false khi kéo (live), true khi buông/đổi.
type RowChange = (value: number, commit: boolean) => void

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

// Ô số bên phải slider (đơn vị = nhãn slider: Cao=cm, Rộng=mm…). Gõ số → clamp + commit (true).
// Tách riêng để sliderRow giữ rule-50. Trả { box, sync } — sync() để slider cập nhật ngược ô.
function makeNumBox(
  sl: HTMLInputElement,
  min: number,
  max: number,
  step: number,
  onChange: RowChange
): { box: HTMLInputElement; sync: () => void } {
  const box = document.createElement('input')
  box.type = 'number'
  box.className = 'ap-num-input'
  box.min = String(min)
  box.max = String(max)
  box.step = String(step)
  box.value = sl.value
  const sync = (): void => {
    box.value = sl.value
  }
  box.addEventListener('change', () => {
    const raw = parseFloat(box.value)
    if (Number.isNaN(raw)) {
      sync() // gõ rỗng/sai → trả về giá trị slider
      return
    }
    const v = clamp(raw, min, max)
    sl.value = String(v)
    box.value = String(v)
    onChange(v, true)
  })
  return { box, sync }
}

// liveDrag=false → chỉ bắn khi BUÔNG (change), bỏ qua input (dùng cho param phải dựng lại).
// Export: roof-lab.ts tái dùng cho slider thông số mái.
export function sliderRow(
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
  lbl.style.cssText = 'width:60px;flex-shrink:0'
  const sl = document.createElement('input')
  sl.type = 'range'
  sl.min = String(min)
  sl.max = String(max)
  sl.step = String(step)
  sl.value = String(initial)
  sl.style.cssText = 'flex:1;min-width:0;cursor:pointer'
  const { box, sync } = makeNumBox(sl, min, max, step, onChange)
  if (liveDrag)
    sl.addEventListener('input', () => {
      sync()
      onChange(parseFloat(sl.value), false)
    })
  sl.addEventListener('change', () => {
    sync()
    onChange(parseFloat(sl.value), true)
  })
  row.append(lbl, sl, box)
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

type StructRow = [string, number, number, number, number, (v: number) => void]

// Structural (đổi geometry) — LIVE khi kéo: input → applySiteLive (throttle rAF), buông → applySite(true) commit.
function appendStructRows(body: HTMLElement, ctx: APGuiCtx, rows: StructRow[]): void {
  for (const [label, min, max, step, init, set] of rows) {
    body.appendChild(
      sliderRow(label, min, max, step, init, (v, c) => {
        set(v)
        if (c) ctx.applySite(true)
        else ctx.applySiteLive()
      })
    )
  }
}

// Tab con "Số đo" — kích thước lá (mật độ, cao, rộng gốc/thân, số đốt) + thon ngọn (dời từ Độ cong).
function buildGrassMeasure(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  appendStructRows(body, ctx, [
    ['Mật độ /m²', 20, 300, 10, g.density, (v) => (g.density = Math.round(v))],
    ['Cao lá cm', 5, 55, 1, g.height * 100, (v) => (g.height = v / 100)],
    ['Thon ngọn %', 0, 100, 5, g.taper * 100, (v) => (g.taper = v / 100)],
    ['Rộng thân mm', 1, 30, 0.5, g.midWidth * 1000, (v) => (g.midWidth = v / 1000)],
    ['Rộng gốc mm', 1, 30, 0.5, g.bladeWidth * 1000, (v) => (g.bladeWidth = v / 1000)],
    ['Số đốt', 1, 12, 1, g.segments, (v) => (g.segments = Math.round(v))],
  ])
}

// Tab con "Độ cong" — các % cong dáng lá (T→P, dọc, cụp) + fold hình học. (Thon ngọn đã dời sang Số đo.)
function buildGrassCurve(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  appendStructRows(body, ctx, [
    ['Cong T→P %', -100, 100, 5, g.curveLR * 100, (v) => (g.curveLR = v / 100)],
    ['Cong dọc %', 0, 100, 5, g.bend * 100, (v) => (g.bend = v / 100)],
    ['Cụp mép %', 0, 100, 5, g.cup * 100, (v) => (g.cup = v / 100)],
    ['Normal cụp', 0, 10, 0.5, g.cupNormalGain, (v) => (g.cupNormalGain = v)],
  ])
  appendFoldToggle(body, ctx)
}

// Checkbox "Fold hình học" — BẬT geometry cụp (trục giữa, ×3 tris, cận cảnh) thay vì shader normal (rẻ).
// Mặc định tắt (ẩn/nhẹ). Đổi → dựng lại geometry (commit).
function appendFoldToggle(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  const row = document.createElement('label')
  row.style.cssText =
    'display:flex;align-items:center;gap:6px;margin:5px 0 2px;font-size:11px;opacity:.85;cursor:pointer'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = g.cupGeo
  cb.addEventListener('change', () => {
    g.cupGeo = cb.checked
    ctx.applySite(true)
  })
  row.append(cb, document.createTextNode('Fold hình học (cận cảnh, nặng tris)'))
  body.appendChild(row)
}

// Màu lá 2 MẶT (LIVE qua tuneGrass): mặt ngoài (+Z) + mặt trong (-Z) — two-tone như lá thật.
function buildGrassColor(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  body.appendChild(
    colorRow('Màu ngoài', g.color, (hex, c) => {
      g.color = hex
      ctx.tuneGrass((b) => b.setColor(hex), c)
    })
  )
  body.appendChild(
    colorRow('Màu trong', g.innerColor, (hex, c) => {
      g.innerColor = hex
      ctx.tuneGrass((b) => b.setInnerColor(hex), c)
    })
  )
}

// Tab con "Bóng đổ" — bóng GỐC mặt trong (uniform LIVE qua tuneGrass, KHÔNG dựng lại): đậm + cao (uv.y).
// "Đậm bóng %" = (1 − shadowDark)·100 (cao = đen hơn); "Cao bóng %" = shadowSpan·100 (vươn tới đâu).
function buildGrassShadow(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  body.appendChild(
    sliderRow('Đậm bóng %', 0, 100, 5, (1 - g.shadowDark) * 100, (v, c) => {
      g.shadowDark = 1 - v / 100
      ctx.tuneGrass((b) => b.setShadowDark(g.shadowDark), c)
    })
  )
  body.appendChild(
    sliderRow('Cao bóng %', 0, 50, 1, g.shadowSpan * 100, (v, c) => {
      g.shadowSpan = v / 100
      ctx.tuneGrass((b) => b.setShadowSpan(g.shadowSpan), c)
    })
  )
}

// Vệt TIẾP ĐẤT dưới gốc cụm (đĩa tối tỏa mềm) — "cắm" cỏ xuống đất. Bật/tắt (uniform 0 khi tắt) + Đậm + Rộng.
function buildGrassContact(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  const row = document.createElement('label')
  row.style.cssText =
    'display:flex;align-items:center;gap:6px;margin:5px 0 2px;font-size:11px;cursor:pointer'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = g.contactOn
  cb.addEventListener('change', () => {
    g.contactOn = cb.checked
    ctx.tuneGrass((b) => b.setContactDark(g.contactOn ? g.contactDark : 0), true) // 0 khi tắt
  })
  row.append(cb, document.createTextNode('Vệt tiếp đất'))
  body.appendChild(row)
  body.appendChild(
    sliderRow('Đậm', 0, 100, 5, g.contactDark * 100, (v, c) => {
      g.contactDark = v / 100
      ctx.tuneGrass((b) => b.setContactDark(g.contactOn ? g.contactDark : 0), c)
    })
  )
  body.appendChild(
    sliderRow('Rộng', 1, 20, 0.5, g.contactRadius * 100, (v, c) => {
      g.contactRadius = v / 100
      ctx.tuneGrass((b) => b.setContactRadius(g.contactRadius), c)
    })
  )
}

// Bụi cỏ (tab riêng) — gộp nhiều lá thành cụm; tách khỏi hình dáng lá đơn để không trộn 2 nhóm.
// Structural (dựng lại): live khi kéo, commit khi buông. Rải cụm = mật độ/K → tổng tris ~giữ (budget-neutral).
function buildClumpControls(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  const rows: [string, number, number, number, number, (v: number) => void][] = [
    ['Lá/bụi', 1, 12, 1, g.bladesPerClump, (v) => (g.bladesPerClump = Math.round(v))],
    ['Xòe cm', 0.5, 20, 0.5, g.clumpRadius * 100, (v) => (g.clumpRadius = v / 100)],
    [
      'Nghiêng °',
      0,
      60,
      5,
      (g.clumpSplay * 180) / Math.PI,
      (v) => (g.clumpSplay = (v * Math.PI) / 180),
    ],
  ]
  for (const [label, min, max, step, init, set] of rows) {
    body.appendChild(
      sliderRow(label, min, max, step, init, (v, c) => {
        set(v)
        if (c) ctx.applySite(true)
        else ctx.applySiteLive()
      })
    )
  }
  const note = document.createElement('div')
  note.style.cssText = 'font-size:10px;opacity:.7;margin-top:5px;line-height:1.35'
  note.textContent = 'Gộp K lá/cụm, rải cụm = mật độ ÷ K → tổng tris ~giữ nguyên (budget-neutral).'
  body.appendChild(note)
}

const L1_CLASSES = {
  bar: 'ap-tab-bar ap-tweak-tabs',
  tab: 'ap-tab-btn',
  panel: 'ap-tweak-sub',
  active: 'ap-tab-active',
}
const L2_CLASSES = {
  bar: 'ap-tab-bar ap-tweak-tabs2',
  tab: 'ap-tab-btn',
  panel: 'ap-tweak-sub2',
  active: 'ap-tab-active',
}

// Dựng bộ slider chi tiết cỏ vào `host`: TAB cấp1 "Lá đơn" | "Bụi cỏ"; "Lá đơn" có TAB cấp2 (bg sáng hơn =
// lồng cấp) "Số đo" | "Độ cong" | "Bóng đổ". KHÔNG kèm preview (preview ở tab Lab). Trả Tabs[] (cả 2 cấp)
// cho caller dispose. Dùng ở panel PRODUCTION Garden ▸ Grass — sau khi cỏ đã "tốt nghiệp" khỏi bàn Lab.
export function buildGrassTweak(ctx: APGuiCtx, host: HTMLElement): Tabs[] {
  // "Lá đơn" = 3 tab cấp 2 (Số đo | Độ cong | Bóng đổ).
  const bladeSub = document.createElement('div')
  const measureSub = document.createElement('div')
  buildGrassMeasure(measureSub, ctx)
  const curveSub = document.createElement('div')
  buildGrassCurve(curveSub, ctx)
  const shadowSub = document.createElement('div')
  buildGrassShadow(shadowSub, ctx) // Đậm bóng, Cao bóng
  buildGrassColor(shadowSub, ctx) // Màu ngoài, Màu trong
  buildGrassContact(shadowSub, ctx) // Vệt: bật/tắt + Đậm + Rộng
  bladeSub.append(measureSub, curveSub, shadowSub)

  const clumpSub = document.createElement('div') // tab "Bụi cỏ"
  buildClumpControls(clumpSub, ctx)

  host.append(bladeSub, clumpSub)

  const innerTabs = new Tabs(
    bladeSub,
    [
      { label: 'Số đo', panel: measureSub, title: 'Kích thước lá' },
      { label: 'Độ cong', panel: curveSub, title: 'Các % cong dáng lá' },
      { label: 'Bóng đổ', panel: shadowSub, title: 'Màu + bóng gốc mặt trong' },
    ],
    { classes: L2_CLASSES, injectCss: false }
  )
  const outerTabs = new Tabs(
    host,
    [
      { label: 'Lá đơn', panel: bladeSub, title: 'Hình dáng 1 lá' },
      { label: 'Bụi cỏ', panel: clumpSub, title: 'Gộp lá thành cụm' },
    ],
    { classes: L1_CLASSES, injectCss: false }
  )
  return [innerTabs, outerTabs]
}

// 1 khung Lab = header (nhãn) + body (chỗ gắn nội dung). 2 khung flex:1 → CAO BẰNG NHAU. Tách module-level
// để setupLabBench gọn (room cho header). Trả { frame, body }.
function mkLabFrame(
  cls: string,
  label: string,
  hint: string
): { frame: HTMLElement; body: HTMLElement } {
  const frame = document.createElement('div')
  frame.className = `ap-lab-frame ${cls}`
  const head = document.createElement('div')
  head.className = 'ap-lab-frame-head'
  head.textContent = label
  const body = document.createElement('div')
  body.className = 'ap-lab-frame-body'
  const ph = document.createElement('div')
  ph.className = 'ap-lab-placeholder' // gợi ý tạm — thay bằng nội dung thật ở bước sau
  ph.textContent = hint
  body.appendChild(ph)
  frame.append(head, body)
  return { frame, body }
}

// Panel Lab — BÀN THÍ NGHIỆM. Cột TRÁI: header (tiêu đề "Lab" kéo-được + nút ⚙ settings) · note · 2 khung BẰNG
// NHAU (`paramHost`: slider · `docHost`: tọa độ/tài liệu) · `settingsHost` (popover ⚙, ẩn). Cột PHẢI: 🔎 preview.
// Trả handle 2 khung + settings + previewHost cho ArchPlanLab/setupRoofLab gắn nội dung.
// Header Lab: CHỈ nút ⚙ → toggle settings popover. (Bỏ tiêu đề "Lab" + kéo panel — full màn nên vô nghĩa.)
function buildLabHead(): { head: HTMLElement; settings: HTMLElement } {
  const head = document.createElement('div')
  head.className = 'ap-lab-head'
  const gear = document.createElement('button')
  gear.className = 'ap-lab-settings-btn'
  gear.textContent = '⚙'
  gear.title = 'Cài đặt preview — lưới, độ sáng, đèn'
  head.append(gear)
  const settings = document.createElement('div')
  settings.className = 'ap-lab-settings ap-lab-settings-hidden'
  gear.addEventListener('click', () => settings.classList.toggle('ap-lab-settings-hidden'))
  return { head, settings }
}

export function setupLabBench(container: Element | null): {
  panel: HTMLElement
  experimentHost: HTMLElement // 🔀 selector thí nghiệm (Mái | Particles) — persistent
  previewHost: HTMLElement
  paramHost: HTMLElement // khung TRÊN — slider thông số
  docHost: HTMLElement // khung DƯỚI — tọa độ / tài liệu
  settingsHost: HTMLElement // popover ⚙ — cài đặt preview (lưới/sáng/đèn)
} {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-tweak-panel ap-lab-panel'

  const left = document.createElement('div')
  left.className = 'ap-lab-left'

  const { head, settings } = buildLabHead() // ⚙ settings popover

  // 🔀 Selector thí nghiệm (Mái | Particles…) — sống NGOÀI 2 khung → KHÔNG bị xóa khi đổi experiment.
  const exp = document.createElement('div')
  exp.className = 'ap-lab-exp'

  const params = mkLabFrame('ap-lab-frame-params', '🎛️ Thông số', 'Slider thông số sẽ thêm ở đây.')
  const docs = mkLabFrame(
    'ap-lab-frame-docs',
    '📁 Thư mục · tài liệu',
    'Danh sách thư mục / tài liệu để chọn.'
  )
  left.append(head, exp, params.frame, docs.frame, settings)

  const previewHost = document.createElement('div')
  previewHost.className = 'ap-preview-host' // 🔎 preview — luôn hiện trong Lab
  p.append(left, previewHost)
  container?.appendChild(p)
  return {
    panel: p,
    experimentHost: exp,
    previewHost,
    paramHost: params.body,
    docHost: docs.body,
    settingsHost: settings,
  }
}
