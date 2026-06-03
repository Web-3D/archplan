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

// Structural (đổi geometry) — LIVE khi kéo: input → applySiteLive (throttle rAF), buông → applySite(true) commit.
function buildGrassStructural(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  const structural: [string, number, number, number, number, (v: number) => void][] = [
    ['Mật độ /m²', 20, 300, 10, g.density, (v) => (g.density = Math.round(v))],
    ['Cao lá cm', 5, 55, 1, g.height * 100, (v) => (g.height = v / 100)],
    ['Rộng gốc mm', 1, 30, 0.5, g.bladeWidth * 1000, (v) => (g.bladeWidth = v / 1000)],
    ['Rộng thân mm', 1, 30, 0.5, g.midWidth * 1000, (v) => (g.midWidth = v / 1000)],
    ['Thon ngọn %', 0, 100, 5, g.taper * 100, (v) => (g.taper = v / 100)],
    ['Cong T→P %', -100, 100, 5, g.curveLR * 100, (v) => (g.curveLR = v / 100)],
    ['Cong dọc %', 0, 100, 5, g.bend * 100, (v) => (g.bend = v / 100)],
    ['Cụp mép %', 0, 100, 5, g.cup * 100, (v) => (g.cup = v / 100)],
    ['Số đốt', 1, 12, 1, g.segments, (v) => (g.segments = Math.round(v))],
  ]
  for (const [label, min, max, step, init, set] of structural) {
    body.appendChild(
      sliderRow(label, min, max, step, init, (v, c) => {
        set(v)
        if (c) ctx.applySite(true)
        else ctx.applySiteLive()
      })
    )
  }
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

// Panel "🎛️ Tinh chỉnh" — chia BẬC TAB con: "Lá đơn" (hình dáng 1 lá + màu + fold) | "Bụi cỏ" (gộp cụm).
// Trả { panel, previewHost, tabs }: panel cho drawer Tabs; previewHost gắn GrassPreview; tabs để caller dispose.
export function setupTweakPanel(
  ctx: APGuiCtx,
  container: Element | null
): { panel: HTMLElement; previewHost: HTMLElement; tabs: Tabs } {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-tweak-panel'
  const ttl = document.createElement('div')
  ttl.className = 'ap-scan-title'
  ttl.textContent = '🌿 Cỏ 3D'
  const body = document.createElement('div')
  body.className = 'ap-tweak-body' // flex column → đẩy preview xuống đáy panel (margin-top:auto)

  const bladeSub = document.createElement('div') // tab "Lá đơn"
  buildGrassStructural(bladeSub, ctx)
  buildGrassColor(bladeSub, ctx)
  const clumpSub = document.createElement('div') // tab "Bụi cỏ"
  buildClumpControls(clumpSub, ctx)

  const previewHost = document.createElement('div')
  previewHost.className = 'ap-preview-host' // 🔎 preview — đáy body, NGOÀI tab (luôn hiện)
  body.append(bladeSub, clumpSub, previewHost)
  p.append(ttl, body)
  container?.appendChild(p)

  const tabs = new Tabs(
    body,
    [
      { label: 'Lá đơn', panel: bladeSub, title: 'Hình dáng 1 lá' },
      { label: 'Bụi cỏ', panel: clumpSub, title: 'Gộp lá thành cụm' },
    ],
    {
      classes: {
        bar: 'ap-tab-bar ap-tweak-tabs',
        tab: 'ap-tab-btn',
        panel: 'ap-tweak-sub',
        active: 'ap-tab-active',
      },
      injectCss: false,
    }
  )
  return { panel: p, previewHost, tabs }
}
