/**
 * VỊ TRÍ   — archplan/src/archplan/gui/site.ts
 * VAI TRÒ  — Panel "🌳 Ground" (drawer tab): sửa SiteState. CHIA BẬC TAB con: "Ground" (SURFACE vật liệu
 *            nền/lô + bảng coverage) · "Fence" (hàng rào) · "Garden" (THỰC VẬT 3D — lồng BẬC 2 Grass|Tree:
 *            Grass = on/off + chi tiết cỏ + preview gom từ tab Lab cũ; Tree sắp có) · "Water" (tông XANH
 *            curated --wt-*, tách tông nâu Ground). Nhãn TOÀN tiếng Anh.
 *            WATER LỒNG NHIỀU BẬC: Pool|Pond|Puddle (bậc2) ▸ Pl/Pd/Pe instance +＋ (bậc3) ▸ Pool edge|Surface|
 *            Bottom (bậc4) ▸ Bottom: Floor|Walls (bậc5). Slider input=live, change/select/toggle=commit.
 * LIÊN HỆ  — Dựng vào drawerBody bởi ArchPlanLab._buildLeftTools (con của drawer Tabs). Sub-tab = Tabs
 *            (ui/Tabs) → trả { panel, dispose } cho caller dispose (Water domain quản Tabs động + lồng).
 */

import type {
  FenceConfig,
  GroundLayer,
  GroundMaterialKey,
  WaterConfig,
  WaterKind,
  WaterMaterialKey,
} from 'threejs-modules/site/state'
import {
  GROUND_THICK_MAX,
  GROUND_THICK_MIN,
  makeFence,
  makeGroundLayer,
  makeWater,
} from 'threejs-modules/site/state'
import { type TabItem, Tabs } from 'threejs-modules/ui/Tabs'

// Chất liệu mặt hồ (floor/wall): None (màu phẳng) | Caro (tile — checker + grout hồ bơi). Thêm stone/concrete… sau.
const MATERIAL_OPTS: [string, WaterMaterialKey][] = [
  ['None', 'none'],
  ['Caro (tile)', 'tile'],
]
// Coping/edge chưa lát caro → chỉ 'None' (tách opts để dropdown Edge không hiện lựa chọn no-op).
const EDGE_MAT_OPTS: [string, WaterMaterialKey][] = [['None', 'none']]

// Bộ vật liệu bề mặt (dùng CHUNG base ground G0 + mọi TẦNG layer chồng G1+). Thứ tự = thứ tự dropdown.
const GROUND_OPTS: [string, GroundMaterialKey][] = [
  ['Grass (procedural)', 'grass'],
  ['Photo grass (Uncut)', 'grass-tex'],
  ['Soil', 'soil'],
  ['Gravel', 'gravel'],
  ['Rippled sand', 'rippled-sand'],
  ['Construction gravel', 'construction-gravel'],
  ['Beach gravel', 'beach-gravel'],
  ['Rough asphalt', 'rough-asphalt'],
  ['Worn pavement', 'worn-pavement'],
  ['Roman stone floor', 'roman-stone-floor'],
]

import type { APGuiCtx } from './ctx'
import { buildGrassTweak } from './tweak' // 🌿 slider chi tiết cỏ — DỜI vào Garden ▸ Grass (preview ở lại tab Lab)

// onChange(value, commit): commit=false khi kéo (live), true khi buông/đổi select/tick.
type RowChange = (value: number, commit: boolean) => void

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

// Hàng slider + ô nhập mm. Slider chạy theo ĐƠN VỊ HIỂN THỊ (cm/m); ô số bên phải = giá trị mm
// (= slider × mmFactor: cm→10, m→1000). Kéo slider ↔ gõ mm đồng bộ 2 chiều; gõ mm = commit.
function sliderRow(
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  onChange: RowChange,
  mmFactor: number
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
  const mm = document.createElement('input')
  mm.type = 'number'
  mm.className = 'ap-mm-input'
  mm.title = 'mm'
  mm.value = String(Math.round(initial * mmFactor))
  const syncMm = (): void => {
    mm.value = String(Math.round(parseFloat(sl.value) * mmFactor))
  }
  const onSlide = (commit: boolean): void => {
    syncMm()
    onChange(parseFloat(sl.value), commit)
  }
  sl.addEventListener('input', () => onSlide(false))
  sl.addEventListener('change', () => onSlide(true))
  mm.addEventListener('change', () => {
    const raw = parseFloat(mm.value)
    if (Number.isNaN(raw)) {
      syncMm() // gõ rỗng/sai → trả về giá trị slider hiện tại
      return
    }
    const u = clamp(raw / mmFactor, min, max)
    sl.value = String(u)
    mm.value = String(Math.round(u * mmFactor))
    onChange(u, true)
  })
  row.append(lbl, sl, mm)
  return row
}

function toggleRow(label: string, initial: boolean, onChange: (on: boolean) => void): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:5px;margin-bottom:4px'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = initial
  cb.style.cssText = 'width:11px;height:11px;flex-shrink:0;cursor:pointer'
  cb.addEventListener('change', () => onChange(cb.checked))
  const lbl = document.createElement('span')
  lbl.textContent = label
  lbl.style.cssText = 'cursor:pointer'
  lbl.addEventListener('click', () => {
    cb.checked = !cb.checked
    onChange(cb.checked)
  })
  row.appendChild(cb)
  row.appendChild(lbl)
  return row
}

function selectRow<T extends string>(
  label: string,
  opts: [string, T][],
  initial: T,
  onChange: (v: T) => void
): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px'
  const lbl = document.createElement('span')
  lbl.textContent = label
  lbl.style.cssText = 'width:64px;flex-shrink:0'
  const sel = document.createElement('select')
  sel.className = 'ap-ground-sel'
  sel.style.flex = '1'
  for (const [text, val] of opts) {
    const o = document.createElement('option')
    o.value = val
    o.textContent = text
    if (val === initial) o.selected = true
    sel.appendChild(o)
  }
  sel.addEventListener('change', () => onChange(sel.value as T))
  row.appendChild(lbl)
  row.appendChild(sel)
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
  lbl.style.cssText = 'width:60px;flex-shrink:0'
  const inp = document.createElement('input')
  inp.type = 'color'
  inp.value = hexStr(initial)
  inp.style.cssText =
    'flex:1;min-width:0;height:16px;padding:0;border:none;background:none;cursor:pointer'
  const read = (): number => parseInt(inp.value.slice(1), 16)
  inp.addEventListener('input', () => onChange(read(), false))
  inp.addEventListener('change', () => onChange(read(), true))
  row.append(lbl, inp)
  return row
}

// Bảng số liệu đối chiếu — refresh đọc ctx.siteStats() (cập nhật cả khi build nhà đổi footprint).
function readout(ctx: APGuiCtx): { el: HTMLElement; refresh: () => void } {
  const el = document.createElement('div')
  el.className = 'ap-site-readout'
  const refresh = (): void => {
    const s = ctx.siteStats()
    const warn = s.coveragePct > 60 ? ' ⚠️' : '' // >60% = phủ quá chuẩn Nhật (sân quá nhỏ)
    el.innerHTML =
      `<div><span>Lot</span><b>${s.lotArea.toFixed(1)} m²</b></div>` +
      `<div><span>House</span><b>${s.footprintArea.toFixed(1)} m²</b></div>` +
      `<div><span>Coverage</span><b>${s.coveragePct.toFixed(0)}%${warn}</b></div>` +
      `<div><span>Garden</span><b>${s.gardenArea.toFixed(1)} m²</b></div>`
  }
  refresh()
  return { el, refresh }
}

// Nền + lô (toggle hiện, loại đất, dày nền, kích thước lô). refresh = cập nhật bảng số liệu.
function buildGroundControls(body: HTMLElement, ctx: APGuiCtx, refresh: () => void): void {
  const site = ctx.site
  const T = GROUND_THICK_MIN / 10
  const Tmax = GROUND_THICK_MAX / 10
  body.appendChild(
    toggleRow('Show ground', site.show, (on) => {
      site.show = on
      ctx.applySite(true)
      refresh()
    })
  )
  body.appendChild(
    selectRow('Surface', GROUND_OPTS, site.ground, (v) => {
      site.ground = v
      ctx.applySite(true)
    })
  )
  body.appendChild(
    sliderRow(
      'Thickness cm',
      T,
      Tmax,
      0.5,
      site.groundThick / 10,
      (v, c) => {
        site.groundThick = Math.round(v * 10)
        ctx.applySite(c)
      },
      10
    )
  )
  buildLotSliders(body, ctx, refresh)
}

// 2 slider kích thước lô (ngang/sâu) + ô mm — tách riêng cho buildGroundControls gọn (rule-50).
function buildLotSliders(body: HTMLElement, ctx: APGuiCtx, refresh: () => void): void {
  const site = ctx.site
  for (const [lbl, key] of [
    ['Lot width m', 'lotWidth'],
    ['Lot depth m', 'lotDepth'],
  ] as [string, 'lotWidth' | 'lotDepth'][]) {
    body.appendChild(
      sliderRow(
        lbl,
        3,
        30,
        0.1,
        site[key] / 1000,
        (v, c) => {
          site[key] = Math.round(v * 1000)
          ctx.applySite(c)
          refresh()
        },
        1000
      )
    )
  }
}

// Sub-tab "Ground" → hàng tab INSTANCE tầng surface (G0 base | G1/G2… layer chồng + ＋). G0 = nền lô gốc
// (Show/Surface/Thickness/Lot). G1+ = tầng phủ lên (Surface + Thickness 1–10cm + ✕), stack chồng Y → top che
// dưới (khoét lộ lớp dưới = phase sau). Tabs động → rebuild mỗi thêm/xoá + applySite. Trả { panel, dispose }.
function buildGroundDomain(
  ctx: APGuiCtx,
  refresh: () => void
): { panel: HTMLElement; dispose: () => void } {
  const host = document.createElement('div')
  host.classList.add('ap-ground-domain')
  let tabs: Tabs | null = null
  const rebuild = (focus = 0): void => {
    tabs?.dispose()
    host.replaceChildren()
    const base = document.createElement('div')
    buildGroundControls(base, ctx, refresh)
    host.appendChild(base)
    const items: TabItem[] = [{ label: 'G0', panel: base, title: 'Base ground (nền lô)' }]
    const layers = (ctx.site.groundLayers ??= [])
    layers.forEach((layer, i) => {
      const pane = buildGroundLayerPane(ctx, layer, i, rebuild)
      host.appendChild(pane)
      items.push({ label: `G${i + 1}`, panel: pane, title: `Surface layer ${i + 1}` })
    })
    const addBtn = addInstanceButton('layer', () => {
      layers.push(makeGroundLayer())
      rebuild(layers.length) // focus tầng mới
      ctx.applySite(true)
    })
    tabs = new Tabs(host, items, {
      classes: {
        bar: 'ap-tab-bar ap-fence-itabs',
        tab: 'ap-tab-btn',
        panel: 'ap-fence-isub',
        active: 'ap-tab-active',
      },
      injectCss: false,
      addEl: addBtn,
      initial: focus,
    })
  }
  rebuild()
  return { panel: host, dispose: (): void => tabs?.dispose() }
}

// 1 pane tầng surface chồng: Surface (vật liệu) + Thickness 1–10cm + ✕ xoá. Xoá → splice + rebuild + applySite.
// 1 slider số-đo layer (length/width/thickness): hiển thị theo factor (m=1000, cm=10), ghi mm. Tách cho
// buildGroundLayerPane gọn (rule-50).
function layerSlider(
  ctx: APGuiCtx,
  layer: GroundLayer,
  key: 'length' | 'width' | 'thickness',
  label: string,
  min: number,
  max: number,
  step: number,
  factor: number
): HTMLElement {
  return sliderRow(
    label,
    min,
    max,
    step,
    layer[key] / factor,
    (v, c) => {
      layer[key] = Math.round(v * factor)
      ctx.applySite(c)
    },
    factor
  )
}

function buildGroundLayerPane(
  ctx: APGuiCtx,
  layer: GroundLayer,
  i: number,
  rebuild: (focus?: number) => void
): HTMLElement {
  const pane = document.createElement('div')
  pane.appendChild(
    selectRow('Surface', GROUND_OPTS, layer.material, (v) => {
      layer.material = v
      ctx.applySite(true)
    })
  )
  pane.appendChild(layerSlider(ctx, layer, 'length', 'Length m', 0.5, 40, 0.1, 1000))
  pane.appendChild(layerSlider(ctx, layer, 'width', 'Width m', 0.5, 40, 0.1, 1000))
  pane.appendChild(layerSlider(ctx, layer, 'thickness', 'Thickness cm', 1, 10, 0.5, 10))
  pane.appendChild(
    removeRow('✕ Remove layer', () => {
      ctx.site.groundLayers?.splice(i, 1)
      rebuild(Math.max(0, i))
      ctx.applySite(true)
    })
  )
  return pane
}

// Cỏ 3D nhú lên (tier B — GrassBlades): LỚP THỰC VẬT độc lập surface — mọc trên nền BẤT KỲ (grass/soil/
// gravel). Ô stick on/off; thông số chi tiết ngay dưới (setupTweakPanel). Nằm ở tab Garden ▸ Grass.
function buildGrass3dControls(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  body.appendChild(
    toggleRow('🌿 3D grass (any surface)', g.enabled, (on) => {
      g.enabled = on
      ctx.applySite(true)
    })
  )
}

// Sub-tab "Garden" → BẬC 2 nested tab "Grass" | "Tree" (folder-style). Grass = ô stick bật/tắt 3D grass +
// bộ slider chi tiết cỏ (Lá đơn|Bụi cỏ — CHUYỂN từ Lab; preview Ở LẠI Lab). Tree = placeholder cây. Trả
// { panel, dispose }: dispose gỡ nested Tabs + grass Tabs.
function buildGardenDomain(ctx: APGuiCtx): {
  panel: HTMLElement
  dispose: () => void
} {
  const gardenSub = document.createElement('div')
  gardenSub.classList.add('ap-garden-domain')

  // "Grass": ô stick bật/tắt + bộ slider chi tiết cỏ (Số đo/Độ cong/Bóng đổ/Bụi cỏ). KHÔNG preview (ở Lab).
  const grassPanel = document.createElement('div')
  buildGrass3dControls(grassPanel, ctx) // 🌿 ô stick bật/tắt 3D grass (DỜI từ tab Tree cũ)
  const grassTabs = buildGrassTweak(ctx, grassPanel) // slider chi tiết cỏ (CHUYỂN từ tab Lab)

  // "Tree": placeholder cây 3D (sắp có).
  const treePanel = document.createElement('div')
  const treeNote = document.createElement('div')
  treeNote.className = 'ap-site-empty'
  treeNote.textContent = '🌲 Trees — coming soon'
  treePanel.appendChild(treeNote)

  gardenSub.append(grassPanel, treePanel)
  const tabs = new Tabs(
    gardenSub,
    [
      { label: 'Grass', panel: grassPanel, title: '3D grass — bật/tắt + chi tiết lá/bụi' },
      { label: 'Tree', panel: treePanel, title: 'Cây 3D (sắp có)' },
    ],
    {
      classes: {
        bar: 'ap-tab-bar ap-garden-tabs',
        tab: 'ap-tab-btn',
        panel: 'ap-garden-sub',
        active: 'ap-tab-active',
      },
      injectCss: false,
    }
  )
  return {
    panel: gardenSub,
    dispose: (): void => {
      tabs.dispose()
      for (const t of grassTabs) t.dispose() // gỡ tab cỏ (Lá đơn|Bụi cỏ + Số đo|Độ cong|Bóng đổ)
    },
  }
}

// Seed 4 góc polygon từ chữ nhật width×depth (mm, local) khi chuyển Rect → Free (để kéo đỉnh tiếp).
function seedWaterRectPoints(w: WaterConfig): void {
  const hw = w.width / 2
  const hd = w.depth / 2
  w.points = [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ]
}

// Slider structural hồ (field mm) — áp khi BUÔNG (KHÔNG live: né tạo lại reflector/RTT mỗi frame).
type ShapeKey = 'width' | 'depth' | 'offsetX' | 'offsetZ' | 'depthY' | 'edgeWidth'
function waterSlider(
  host: HTMLElement,
  ctx: APGuiCtx,
  w: WaterConfig,
  label: string,
  min: number,
  max: number,
  key: ShapeKey
): void {
  host.appendChild(
    sliderRow(
      label,
      min,
      max,
      0.1,
      w[key] / 1000,
      (v, c) => {
        w[key] = Math.round(v * 1000)
        // Kéo (live): chỉ hiện VIỀN form định vị (rẻ, không rebuild → không leak) → thấy trước vị trí+kích
        // thước. Buông = commit rebuild đặt nước vào + ẩn viền. (applySiteLive tái tạo reflector/frame = leak.)
        if (c) ctx.applySite(true)
        else ctx.previewWater(w)
      },
      1000
    )
  )
}

// Hàng chọn chất liệu. Đổi → applySite (rebuild để áp material). opts: floor/wall = None+Caro; edge = None.
type MatKey = 'floorMaterial' | 'wallMaterial' | 'edgeMaterial'
function materialRow(
  host: HTMLElement,
  ctx: APGuiCtx,
  w: WaterConfig,
  label: string,
  key: MatKey,
  opts: [string, WaterMaterialKey][] = MATERIAL_OPTS
): void {
  host.appendChild(
    selectRow(label, opts, w[key], (v) => {
      w[key] = v
      ctx.applySite(true)
    })
  )
}

// BẬC 4 "Pool edge"/"Shape": đường bao (Form) + kích thước + vị trí, (+ với hồ lõm) DẢI COPING (edgeWidth +
// chất liệu) = ĐỊNH NGHĨA MÉP hồ. withEdge=false (PUDDLE: vũng phẳng, không mép/coping) → bỏ 2 hàng edge.
function buildEdgeTab(host: HTMLElement, ctx: APGuiCtx, w: WaterConfig, withEdge = true): void {
  const formOpts: [string, 'rect' | 'free'][] = [
    ['Rect', 'rect'],
    ['Free (drag)', 'free'],
  ]
  host.appendChild(
    selectRow('Form', formOpts, w.shape, (v) => {
      w.shape = v
      if (v === 'free' && w.points.length < 3) seedWaterRectPoints(w)
      ctx.applySite(true)
    })
  )
  waterSlider(host, ctx, w, 'Width m', 1, 15, 'width')
  waterSlider(host, ctx, w, 'Depth m', 1, 15, 'depth')
  waterSlider(host, ctx, w, 'Pos X m', -10, 10, 'offsetX')
  waterSlider(host, ctx, w, 'Pos Z m', -10, 10, 'offsetZ')
  if (withEdge) {
    waterSlider(host, ctx, w, 'Edge width m', 0, 2, 'edgeWidth') // dải coping quanh hồ (0 = tắt)
    materialRow(host, ctx, w, 'Edge mat', 'edgeMaterial', EDGE_MAT_OPTS) // coping: chỉ None (chưa lát caro)
  }
  const note = document.createElement('div')
  note.style.cssText = 'font-size:9px;opacity:.7;margin-top:4px;line-height:1.3'
  note.textContent = 'Free: bật Move (Z) → kéo chấm vàng ở góc.'
  host.appendChild(note)
}

// Slider % Surface: [label, min%, max%, step, field-key 0–1]. Field = value/100. (rippleScale tách riêng — raw.)
const SURF_ROWS: [string, number, number, number, SurfKey][] = [
  ['Mirror %', 0, 100, 5, 'reflectivity'],
  ['Wave spd %', 0, 300, 10, 'flow'],
  ['Ripple %', 0, 200, 5, 'distortion'],
  ['Turbulence %', 0, 150, 5, 'detail'], // độ nhiễu chi tiết (octave-2 FBM)
  ['Refraction %', 0, 200, 5, 'refract'], // độ méo ảnh đáy nhìn-xuyên-nước (rõ với caro)
  ['Murk %', 0, 100, 5, 'tint'],
]

// BẬC 4 "Surface" (mặt hồ): màu nước + gương/sóng/rung/đục — uniform LIVE qua tuneWater(w,…), KHÔNG dựng lại.
function buildSurfaceTab(host: HTMLElement, ctx: APGuiCtx, w: WaterConfig): void {
  host.appendChild(
    colorRow('Water color', w.color, (hex, c) => {
      w.color = hex
      ctx.tuneWater(w, (s) => s.setWaterColor(hex), c)
    })
  )
  for (const [label, min, max, step, key] of SURF_ROWS) {
    host.appendChild(
      sliderRow(
        label,
        min,
        max,
        step,
        w[key] * 100,
        (v, c) => {
          w[key] = v / 100
          ctx.tuneWater(
            w,
            (s) => {
              if (key === 'reflectivity') s.setReflectivity(w.reflectivity)
              else if (key === 'flow') s.setFlow(w.flow)
              else if (key === 'distortion') s.setDistortion(w.distortion)
              else if (key === 'detail') s.setDetail(w.detail)
              else if (key === 'refract') s.setRefract(w.refract)
              else s.setTint(w.tint)
            },
            c
          )
        },
        1
      )
    )
  }
  // Wave size — RAW (không phải %). ĐẢO rippleScale (13−v) → kéo PHẢI = sóng TO (rippleScale thấp). Slider riêng.
  host.appendChild(
    sliderRow(
      'Wave size',
      1,
      12,
      0.5,
      13 - w.rippleScale,
      (v, c) => {
        const rs = 13 - v // size→rippleScale (cao=to → freq thấp)
        w.rippleScale = rs
        ctx.tuneWater(w, (s) => s.setRippleScale(rs), c)
      },
      1
    )
  )
}
type SurfKey = 'reflectivity' | 'flow' | 'distortion' | 'detail' | 'refract' | 'tint'

// BẬC 4 "Bottom" (đáy hồ) → BẬC 5: Floor (đáy: màu + chất liệu) | Walls (tường: độ sâu + chất liệu). Trả
// Tabs (Floor|Walls) cho caller dispose. Floor/wall = 2 mesh RIÊNG → material độc lập (None | Caro tile).
// "Floor color" = màu nền (mat None) ĐỒNG THỜI màu GỐC dẫn xuất caro (mat tile) → đổi màu áp cả 2.
function buildBottomTab(host: HTMLElement, ctx: APGuiCtx, w: WaterConfig): Tabs {
  const floor = document.createElement('div')
  floor.appendChild(
    colorRow('Floor color', w.bottomColor, (hex, c) => {
      w.bottomColor = hex
      if (c) ctx.applySite(true) // material basin → dựng lại khi buông (không live; tile dẫn xuất màu này)
    })
  )
  materialRow(floor, ctx, w, 'Floor mat', 'floorMaterial')
  // 2 màu caro còn lại (ô chính = Floor color ở trên) — áp cho CẢ floor+wall khi mat='tile'. Đổi = rebuild.
  floor.appendChild(
    colorRow('Tile 2 color', w.tileColor2, (hex, c) => {
      w.tileColor2 = hex
      if (c) ctx.applySite(true)
    })
  )
  floor.appendChild(
    colorRow('Grout color', w.groutColor, (hex, c) => {
      w.groutColor = hex
      if (c) ctx.applySite(true)
    })
  )
  const walls = document.createElement('div')
  waterSlider(walls, ctx, w, 'Wall depth m', 0.1, 3, 'depthY') // depthY = độ sâu lòng hồ = chiều cao tường
  materialRow(walls, ctx, w, 'Wall mat', 'wallMaterial')
  host.append(floor, walls)
  return new Tabs(
    host,
    [
      { label: 'Floor', panel: floor, title: 'Pool floor (color)' },
      { label: 'Walls', panel: walls, title: 'Pool walls (depth)' },
    ],
    {
      classes: {
        bar: 'ap-tab-bar ap-water-l5tabs',
        tab: 'ap-tab-btn',
        panel: 'ap-water-l5sub',
        active: 'ap-tab-active',
      },
      injectCss: false,
    }
  )
}

// 💧 Nội dung 1 instance Pool: toggle Show (master) + BẬC 4 tab Pool edge|Surface|Bottom. Trả dispose gỡ
// các Tabs lồng (l4 + l5 Floor/Walls). w = config instance (đa-instance trong site.waters).
function buildPoolInstance(
  host: HTMLElement,
  ctx: APGuiCtx,
  w: WaterConfig
): { dispose: () => void } {
  host.appendChild(
    toggleRow('💧 Show (render)', w.enabled, (on) => {
      w.enabled = on
      ctx.applySite(true)
    })
  )
  const edge = document.createElement('div')
  buildEdgeTab(edge, ctx, w)
  const surface = document.createElement('div')
  buildSurfaceTab(surface, ctx, w)
  const bottom = document.createElement('div')
  const bottomTabs = buildBottomTab(bottom, ctx, w)
  host.append(edge, surface, bottom)
  const tabs = new Tabs(
    host,
    [
      { label: 'Pool edge', panel: edge, title: 'Pool edge — outline / size / position' },
      { label: 'Surface', panel: surface, title: 'Water surface look' },
      { label: 'Bottom', panel: bottom, title: 'Floor + walls' },
    ],
    {
      classes: {
        bar: 'ap-tab-bar ap-water-l4tabs',
        tab: 'ap-tab-btn',
        panel: 'ap-water-l4sub',
        active: 'ap-tab-active',
      },
      injectCss: false,
    }
  )
  return {
    dispose: (): void => {
      tabs.dispose()
      bottomTabs.dispose()
    },
  }
}

// 💧 Nội dung 1 instance PUDDLE (vũng nước): mặt phẳng trên nền → CHỈ Show + BẬC 4 tab Shape|Surface (KHÔNG
// Bottom/đáy-vách, KHÔNG coping). Trả dispose gỡ Tabs l4. Khác buildPoolInstance ở chỗ giản lược đó.
function buildPuddleInstance(
  host: HTMLElement,
  ctx: APGuiCtx,
  w: WaterConfig
): { dispose: () => void } {
  host.appendChild(
    toggleRow('💧 Show (render)', w.enabled, (on) => {
      w.enabled = on
      ctx.applySite(true)
    })
  )
  const shape = document.createElement('div')
  buildEdgeTab(shape, ctx, w, false) // withEdge=false → không coping/edge-mat
  const surface = document.createElement('div')
  buildSurfaceTab(surface, ctx, w)
  host.append(shape, surface)
  const tabs = new Tabs(
    host,
    [
      { label: 'Shape', panel: shape, title: 'Puddle outline / size / position' },
      { label: 'Surface', panel: surface, title: 'Water surface look' },
    ],
    {
      classes: {
        bar: 'ap-tab-bar ap-water-l4tabs',
        tab: 'ap-tab-btn',
        panel: 'ap-water-l4sub',
        active: 'ap-tab-active',
      },
      injectCss: false,
    }
  )
  return { dispose: (): void => tabs.dispose() }
}

// Hàng rào 1 LỚP (bật, kiểu gỗ/tường, vật liệu, chiều cao, cổng). f = FenceConfig của lớp (đa-lớp site.fences).
function buildFenceControls(body: HTMLElement, ctx: APGuiCtx, f: FenceConfig): void {
  body.appendChild(
    toggleRow('Fence', f.enabled, (on) => {
      f.enabled = on
      ctx.applySite(true)
    })
  )
  const typeOpts: [string, 'wood' | 'wall'][] = [
    ['Wood', 'wood'],
    ['Wall', 'wall'],
  ]
  body.appendChild(
    selectRow('Type', typeOpts, f.type, (v) => {
      f.type = v
      ctx.applySite(true)
    })
  )
  // Vật liệu MẶT tường rào (chỉ hiệu lực khi Type=Wall): phẳng / cinder-blocks / stone (texture PBR triplanar).
  const wallTexOpts: [string, 'plain' | 'cinder' | 'stone'][] = [
    ['Plain', 'plain'],
    ['Cinder', 'cinder'],
    ['Stone', 'stone'],
  ]
  body.appendChild(
    selectRow('Wall mat', wallTexOpts, f.wallTex ?? 'plain', (v) => {
      f.wallTex = v
      ctx.applySite(true)
    })
  )
  buildFenceSliders(body, ctx, f)
  buildGateControls(body, ctx, f)
}

// Slider inset (lùi mép lô — đa-lớp đồng tâm phân biệt bằng inset) + chiều cao. Kéo = path tinh gọn (chỉ rào).
function buildFenceSliders(body: HTMLElement, ctx: APGuiCtx, f: FenceConfig): void {
  const live = (v: number, c: boolean, set: (mmv: number) => void): void => {
    set(Math.round(v * 1000))
    if (c) ctx.applySite(true)
    else ctx.applyFenceLive()
  }
  body.appendChild(
    sliderRow(
      'Inset m',
      0,
      6,
      0.05,
      f.inset / 1000,
      (v, c) => live(v, c, (m) => (f.inset = m)),
      1000
    )
  )
  body.appendChild(
    sliderRow(
      'Height m',
      0.3,
      3,
      0.1,
      f.height / 1000,
      (v, c) => live(v, c, (m) => (f.height = m)),
      1000
    )
  )
}

// CỔNG ra vào (chỉ hiệu lực Type=Wall): bật + cạnh; slider tách buildGateSliders (giữ Rule-50).
function buildGateControls(body: HTMLElement, ctx: APGuiCtx, f: FenceConfig): void {
  body.appendChild(
    toggleRow('Gate (cổng)', f.gate ?? false, (on) => {
      f.gate = on
      ctx.applySite(true)
    })
  )
  const gateSideOpts: [string, string][] = [
    ['Trước', '0'],
    ['Sau', '1'],
    ['Phải', '2'],
    ['Trái', '3'],
  ]
  body.appendChild(
    selectRow('Gate side', gateSideOpts, String(f.gateSide ?? 0), (v) => {
      f.gateSide = Number(v)
      ctx.applySite(true)
    })
  )
  buildGateSliders(body, ctx, f)
}

// Slider cổng: bề rộng + vị trí dọc cạnh + chiều cao 2 cột (mm). Đều applySite(commit) kiểu live.
function buildGateSliders(body: HTMLElement, ctx: APGuiCtx, f: FenceConfig): void {
  const mm = (
    label: string,
    min: number,
    max: number,
    val: number,
    set: (mmv: number) => void
  ): void => {
    body.appendChild(
      sliderRow(
        label,
        min,
        max,
        0.1,
        val / 1000,
        (v, c) => {
          set(Math.round(v * 1000))
          if (c) ctx.applySite(true)
          else ctx.applyFenceLive() // kéo = path TINH GỌN (chỉ rào, LOD box) — i chang windows, hết tụt fps
        },
        1000
      )
    )
  }
  mm('Gate W m', 0.6, 6, f.gateWidth ?? 1400, (v) => (f.gateWidth = v))
  mm('Gate pos m', -12, 12, f.gatePos ?? 0, (v) => (f.gatePos = v))
  mm('Gate cột H m', 0.6, 3.5, f.gatePostH ?? 1600, (v) => (f.gatePostH = v))
}

// Sub-tab "Fence" → hàng tab INSTANCE lớp rào (F1/F2… + ＋). Mỗi lớp = 1 FenceConfig trong site.fences (vòng
// đồng tâm ở inset riêng). ＋ thêm lớp (inset +500mm né chồng lớp ngoài); ✕ xoá lớp. Tabs động → rebuild
// (dispose + tạo lại) mỗi thêm/xoá + applySite. Trả { panel, dispose, navigateToFence(idx) } (click rào 3D).
// 1 pane lớp rào i: controls + nút ✕ xoá lớp. remove → splice + rebuild (focus lớp trước) + applySite.
function buildFencePane(
  ctx: APGuiCtx,
  fence: FenceConfig,
  i: number,
  rebuild: (focus?: number) => void
): HTMLElement {
  const pane = document.createElement('div')
  buildFenceControls(pane, ctx, fence)
  pane.appendChild(
    removeRow('✕ Remove layer', () => {
      ctx.site.fences.splice(ctx.site.fences.indexOf(fence), 1)
      rebuild(Math.max(0, i - 1))
      ctx.applySite(true)
    })
  )
  return pane
}

function buildFenceDomain(ctx: APGuiCtx): {
  panel: HTMLElement
  dispose: () => void
  navigateToFence: (idx: number) => void
} {
  const host = document.createElement('div')
  host.classList.add('ap-fence-domain')
  let tabs: Tabs | null = null
  const rebuild = (focus = 0): void => {
    tabs?.dispose()
    host.replaceChildren()
    const items: TabItem[] = ctx.site.fences.map((fence, i) => {
      const pane = buildFencePane(ctx, fence, i, rebuild)
      host.appendChild(pane)
      return { label: `F${i + 1}`, panel: pane, title: `Fence layer ${i + 1}` }
    })
    const addBtn = addInstanceButton('Fence', () => {
      const last = ctx.site.fences[ctx.site.fences.length - 1]
      ctx.site.fences.push(makeFence({ inset: (last?.inset ?? 100) + 500 })) // lớp trong: inset lớn hơn
      rebuild(ctx.site.fences.length - 1)
      ctx.applySite(true)
    })
    tabs = new Tabs(host, items, {
      classes: {
        bar: 'ap-tab-bar ap-fence-itabs',
        tab: 'ap-tab-btn',
        panel: 'ap-fence-isub',
        active: 'ap-tab-active',
      },
      injectCss: false,
      addEl: addBtn,
      initial: focus,
    })
  }
  rebuild()
  return {
    panel: host,
    dispose: (): void => tabs?.dispose(),
    navigateToFence: (idx: number): void => {
      const clamped = Math.max(0, Math.min(idx, ctx.site.fences.length - 1))
      tabs?.select(clamped, { trusted: false })
    },
  }
}

// Nút ✕ xoá 1 instance hồ (hàng riêng, canh phải).
function removeRow(label: string, onRemove: () => void): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'margin-top:6px;text-align:right'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'ap-water-remove'
  btn.textContent = label
  btn.addEventListener('click', onRemove)
  row.appendChild(btn)
  return row
}

// 1 pane instance: pool/pond → tab Pool edge/Surface/Bottom; puddle → Shape/Surface (phẳng). + nút ✕ xoá.
// Trả { pane, dispose }: dispose gỡ Tabs lồng bên trong.
function buildInstancePane(
  ctx: APGuiCtx,
  kind: WaterKind,
  cfg: WaterConfig,
  onRemove: () => void
): { pane: HTMLElement; dispose: () => void } {
  const pane = document.createElement('div')
  const dispose =
    kind === 'puddle'
      ? buildPuddleInstance(pane, ctx, cfg).dispose // vũng phẳng: Show + Shape|Surface (no Bottom/edge)
      : buildPoolInstance(pane, ctx, cfg).dispose // pool/pond "y như nhau" (Pool edge|Surface|Bottom)
  pane.appendChild(removeRow('✕ Remove', onRemove))
  return { pane, dispose }
}

// 1 item instance trong hàng tab (tách khỏi rebuild cho gọn rule-50). Trả {item, dispose} — dispose gỡ
// Tabs lồng của pane đó. remove → splice + rebuild + applySite.
function buildInstanceItem(
  host: HTMLElement,
  ctx: APGuiCtx,
  kind: WaterKind,
  prefix: string,
  cfg: WaterConfig,
  i: number,
  rebuild: (focus?: number) => void
): { item: TabItem; dispose: () => void } {
  const label = `${prefix}${i + 1}`
  const remove = (): void => {
    ctx.site.waters.splice(ctx.site.waters.indexOf(cfg), 1)
    rebuild(Math.max(0, i - 1))
    ctx.applySite(true)
  }
  const built = buildInstancePane(ctx, kind, cfg, remove)
  host.appendChild(built.pane)
  return { item: { label, panel: built.pane, title: label }, dispose: built.dispose }
}

// Nút ＋ thêm instance hồ (cuối hàng tab instance).
function addInstanceButton(prefix: string, onAdd: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = '＋'
  btn.className = 'ap-tab-btn ap-tab-add'
  btn.title = `Thêm ${prefix}`
  btn.addEventListener('click', onAdd)
  return btn
}

// Tạo hàng Tabs instance (tách khỏi instanceTabs cho rule-50). onChange đọc cfgs() LIVE (closure reassign
// mỗi rebuild) → setActiveWater đúng instance cho 3D drag/handle.
function makeInstanceTabBar(
  host: HTMLElement,
  items: TabItem[],
  addBtn: HTMLElement,
  focus: number,
  cfgs: () => WaterConfig[],
  ctx: APGuiCtx
): Tabs {
  return new Tabs(host, items, {
    classes: {
      bar: 'ap-tab-bar ap-water-itabs',
      tab: 'ap-tab-btn',
      panel: 'ap-water-isub',
      active: 'ap-tab-active',
    },
    injectCss: false,
    addEl: addBtn,
    initial: focus,
    onChange: (idx) => {
      const c = cfgs()[idx]
      if (c) ctx.setActiveWater(c) // pool/pond/puddle đều có surface → drag/handle nhắm đúng
    },
  })
}

// BẬC 3 — hàng tab INSTANCE 1 loại nước (Pl/Pd/Pe + nút ＋) trong host (= type panel). Mỗi instance = 1
// config site.waters lọc theo kind. ＋ thêm (enabled=false, stagger), ✕ xoá; Tabs động → rebuild (dispose
// + tạo lại) mỗi lần thêm/xoá + applySite. Đổi tab Pool → setActiveWater(cfg) cho 3D drag/handle nhắm đúng.
function instanceTabs(
  host: HTMLElement,
  ctx: APGuiCtx,
  kind: WaterKind,
  prefix: string
): { dispose: () => void; selectCfg: (cfg: WaterConfig) => boolean } {
  let tabs: Tabs | null = null
  let paneDisposers: (() => void)[] = []
  let cfgs: WaterConfig[] = [] // instance hiện tại của kind này — refresh mỗi rebuild (cho selectCfg dùng)
  const teardown = (): void => {
    tabs?.dispose() // hàng tab instance
    for (const d of paneDisposers) d() // Tabs lồng (Pool edge/Surface/Bottom + Floor/Walls) mỗi pane
    paneDisposers = []
  }
  const rebuild = (focus = 0): void => {
    teardown()
    host.replaceChildren()
    cfgs = ctx.site.waters.filter((w) => w.kind === kind)
    const items: TabItem[] = []
    cfgs.forEach((cfg, i) => {
      const b = buildInstanceItem(host, ctx, kind, prefix, cfg, i, rebuild)
      items.push(b.item)
      paneDisposers.push(b.dispose)
    })
    const addBtn = addInstanceButton(prefix, () => {
      const w = makeWater(kind) // enabled=false (perf): bật thủ công ở tab mới
      w.offsetX = cfgs.length * 2000 // stagger né chồng hồ cũ khi bật
      ctx.site.waters.push(w)
      rebuild(cfgs.length)
      ctx.applySite(true)
    })
    tabs = makeInstanceTabBar(host, items, addBtn, focus, () => cfgs, ctx)
  }
  rebuild()
  return {
    dispose: teardown,
    // Chọn tab instance ứng với cfg (click hồ 3D → GUI nhảy tới). trusted:false = do code → onChange vẫn
    // chạy (setActiveWater idempotent). Trả false nếu cfg không thuộc kind này (caller thử kind khác).
    selectCfg: (cfg: WaterConfig): boolean => {
      const idx = cfgs.indexOf(cfg)
      if (idx < 0) return false
      tabs?.select(idx, { trusted: false })
      return true
    },
  }
}

// Sub-tab "Water" → BẬC 2 folder-style Pool|Pond|Puddle (tông xanh curated --wt-*, tách tông nâu Ground);
// MỖI loại có BẬC 3 hàng tab instance (Pl/Pd/Pe + ＋). Trả { panel, dispose } — dispose gỡ type-Tabs + 3 controller.
function buildWaterDomain(ctx: APGuiCtx): {
  panel: HTMLElement
  dispose: () => void
  navigateToWater: (cfg: WaterConfig) => boolean
} {
  const waterSub = document.createElement('div')
  waterSub.classList.add('ap-water-domain')
  const poolSub = document.createElement('div')
  const pondSub = document.createElement('div')
  const puddleSub = document.createElement('div')
  waterSub.append(poolSub, pondSub, puddleSub)

  const typeTabs = new Tabs(
    waterSub,
    [
      { label: 'Pool', panel: poolSub, title: 'Reflective pools (tier C)' },
      { label: 'Pond', panel: pondSub, title: 'Ponds (như Pool)' },
      { label: 'Puddle', panel: puddleSub, title: 'Puddles — mặt nước phẳng (no depth/edge)' },
    ],
    {
      classes: {
        bar: 'ap-tab-bar ap-water-tabs',
        tab: 'ap-tab-btn',
        panel: 'ap-water-sub',
        active: 'ap-tab-active',
      },
      injectCss: false,
    }
  )
  const kindIdx: Record<WaterKind, number> = { pool: 0, pond: 1, puddle: 2 }
  const ctls = [
    instanceTabs(poolSub, ctx, 'pool', 'Pl'),
    instanceTabs(pondSub, ctx, 'pond', 'Pd'),
    instanceTabs(puddleSub, ctx, 'puddle', 'Pe'),
  ]
  return {
    panel: waterSub,
    dispose: (): void => {
      typeTabs.dispose()
      for (const c of ctls) c.dispose()
    },
    // Click hồ 3D → mở type-tab theo kind + tab instance của cfg. Trả false nếu cfg không khớp instance nào.
    navigateToWater: (cfg: WaterConfig): boolean => {
      const ki = kindIdx[cfg.kind]
      typeTabs.select(ki, { trusted: false })
      return ctls[ki].selectCfg(cfg)
    },
  }
}

// Hàng tab con SITE (Ground|Fence|Garden|Water) — tách khỏi setupSitePanel cho rule-50.
function makeSiteTabs(
  host: HTMLElement,
  ground: HTMLElement,
  fence: HTMLElement,
  garden: HTMLElement,
  water: HTMLElement
): Tabs {
  return new Tabs(
    host,
    [
      { label: 'Ground', panel: ground, title: 'Surface material / lot' },
      { label: 'Fence', panel: fence, title: 'Fence' },
      { label: 'Garden', panel: garden, title: 'Grass (3D, any surface) + trees' },
      { label: 'Water', panel: water, title: 'Water: Pool / Pond / Puddle' },
    ],
    {
      classes: {
        bar: 'ap-tab-bar ap-site-tabs',
        tab: 'ap-tab-btn',
        panel: 'ap-site-sub',
        active: 'ap-tab-active',
      },
      injectCss: false,
    }
  )
}

// Panel "🌳 Ground" (drawer tab) — chia BẬC TAB con "Ground" | "Fence" | "Garden" | "Water" (folder-style).
// "Garden" lồng BẬC 2 (Grass|Tree) — Grass = on/off + slider chi tiết cỏ (chuyển từ Lab; preview ở lại Lab).
// Trả { panel, dispose, navigateToWater }: panel cho drawer Tabs; navigateToWater = click hồ 3D → mở tab hồ.
export function setupSitePanel(
  ctx: APGuiCtx,
  container: Element | null
): {
  panel: HTMLElement
  dispose: () => void
  navigateToWater: (cfg: WaterConfig) => boolean
  navigateToFence: (idx: number) => void
} {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-site-panel'

  // Sub-tab "Ground": hàng INSTANCE-tab tầng surface (G0 base + G1/G2… layer chồng + ＋) — xếp lớp 3D. Bảng
  // coverage (roEl) NẰM NGOÀI tabs (số liệu cả lô). KHÔNG còn cỏ-3D (đã tách sang Garden).
  const groundSub = document.createElement('div')
  const { el: roEl, refresh } = readout(ctx)
  ctx.registerSiteReadout(refresh)
  const ground = buildGroundDomain(ctx, refresh)
  groundSub.appendChild(ground.panel)
  groundSub.appendChild(roEl)

  // Sub-tab "Fence": hàng rào ĐA-LỚP (instance-tab F1/F2… + ＋).
  const fence = buildFenceDomain(ctx)
  const fenceSub = fence.panel

  // Sub-tab "Garden": BẬC 2 (Grass|Tree) — Grass = ô stick + chi tiết cỏ + preview (gom từ tab Lab cũ).
  const garden = buildGardenDomain(ctx)
  const gardenSub = garden.panel

  // Sub-tab "Water": BẬC 2 (Pool|Pond|Puddle) — tông xanh nước curated, tách khỏi tông nâu Ground.
  const water = buildWaterDomain(ctx)
  const waterSub = water.panel

  p.append(groundSub, fenceSub, gardenSub, waterSub)
  container?.appendChild(p)

  const tabs = makeSiteTabs(p, groundSub, fenceSub, gardenSub, waterSub)
  return {
    panel: p,
    dispose: (): void => {
      tabs.dispose()
      ground.dispose()
      fence.dispose()
      garden.dispose()
      water.dispose()
    },
    // Click hồ 3D → mở sub-tab "Water" (index 3) rồi ủy quyền water domain mở type+instance tab của cfg.
    navigateToWater: (cfg: WaterConfig): boolean => {
      tabs.select(3, { trusted: false })
      return water.navigateToWater(cfg)
    },
    // Click rào 3D → mở sub-tab "Fence" (index 1) + tab lớp idx.
    navigateToFence: (idx: number): void => {
      tabs.select(1, { trusted: false })
      fence.navigateToFence(idx)
    },
  }
}
