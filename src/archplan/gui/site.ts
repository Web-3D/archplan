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
  BorderMaterialKey,
  FenceConfig,
  GroundLayer,
  GroundMaterialKey,
  TerrainConfig,
  TerrainMound,
  WaterConfig,
  WaterKind,
  WaterMaterialKey,
  WaterPoint,
} from 'threejs-modules/site/state'
import {
  defaultTerrain,
  GROUND_THICK_MAX,
  GROUND_THICK_MIN,
  makeFence,
  makeGroundLayer,
  makeWater,
} from 'threejs-modules/site/state'
import { type TabItem, Tabs } from 'threejs-modules/ui/Tabs'

// Chất liệu mặt hồ (floor/wall): None (màu phẳng) | Caro (tile) | texture đáy (cát/cỏ — PhotoGround world-XZ).
const MATERIAL_OPTS: [string, WaterMaterialKey][] = [
  ['None', 'none'],
  ['Caro (tile)', 'tile'],
  ['Thai beach sand 2K', 'thai-beach-sand-2k'],
  ['Thai beach sand 4K', 'thai-beach-sand-4k'],
  ['Uncut grass (O)', 'grass-o'],
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
  ['Artificial turf', 'artificial-turf'],
  ['Uncut grass (O)', 'grass-o'],
  ['Thai beach sand 2K', 'thai-beach-sand-2k'],
  ['Thai beach sand 4K', 'thai-beach-sand-4k'],
  ['Cobblestone', 'cobblestone'],
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
  onChange: (v: T) => void,
  onOpen?: () => void // ⏳ mousedown (user sắp mở dropdown) → prefetch (câu giờ chờ load)
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
  if (onOpen) sel.addEventListener('mousedown', onOpen)
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
    selectRow(
      'Surface',
      GROUND_OPTS,
      site.ground,
      (v) => {
        site.ground = v
        ctx.applySite(true)
      },
      () => ctx.prefetchGroundTextures?.()
    )
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
  buildTerrainControls(body, ctx, refresh)
}

// 🏔️ Section Terrain (nền gò sân vườn) trong tab Ground — bộ thông số noise ĐẦY ĐỦ. Mọi param STRUCTURAL →
// ctx.applySite(c) (kéo = live-rebuild, buông = commit) như slider Thickness. Data-driven 10 slider (rule-50).
function buildTerrainControls(body: HTMLElement, ctx: APGuiCtx, refresh: () => void): void {
  const site = ctx.site
  const t = site.terrain ?? defaultTerrain()
  site.terrain = t // đảm bảo state cũ (thiếu terrain) có field
  const hdr = document.createElement('div')
  hdr.textContent = '🏔️ Terrain (gò sân vườn)'
  hdr.style.cssText = 'margin:7px 0 3px;font-weight:600;opacity:.85'
  body.append(
    hdr,
    toggleRow('Enable terrain', t.enabled, (on) => ((t.enabled = on), ctx.applySite(true)))
  )
  // Kéo (c=false) → applyTerrainLive: SWAP geometry nền base (né water-RTT/recompile = tụt fps). Buông (c=true)
  // → applySite(true): full rebuild + autosave. Mọi param terrain đều structural-geometry → cùng đường này.
  for (const [label, min, max, step, mf, get, set] of terrainSliderSpecs(t))
    body.appendChild(
      sliderRow(
        label,
        min,
        max,
        step,
        get(),
        (v, c) => (set(v), c ? ctx.applySite(true) : ctx.applyTerrainLive()),
        mf
      )
    )
  // 🏔️ Detail (Phase 4): micro-relief normal — KHÁC slider trên (geometry): chỉ đổi UNIFORM PhotoGround → live
  // = applyTerrainDetail (KHÔNG rebuild geo/recompile), buông = applySite(true) persist. Chỉ ăn trên ground texture.
  body.appendChild(
    sliderRow(
      'Detail (sần)',
      0,
      1,
      0.05,
      t.detail,
      (v, c) => ((t.detail = v), c ? ctx.applySite(true) : ctx.applyTerrainDetail()),
      1
    )
  )
  buildMoundControls(body, ctx, t, refresh) // ⛰️ gò nặn tay (Phase 3)
}

// ⛰️ Gò nặn-tay (Phase 3): list mounds + ＋thêm/✕xoá + slider mỗi gò. Mounds cộng vào heightAt (Σ gò, đã có từ
// Phase 1) → griddedGroundGeometry sample → live qua applyTerrainLive (kéo) / applySite (buông). Thêm/xoá đổi LIST
// → refresh() dựng lại GUI. ＋ tự bật terrain (heightAt early-return khi tắt → gò vô hình). Tách rule-50.
function buildMoundControls(
  body: HTMLElement,
  ctx: APGuiCtx,
  t: TerrainConfig,
  refresh: () => void
): void {
  const halfW = ctx.site.lotWidth / 2000
  const halfD = ctx.site.lotDepth / 2000
  const hdr = document.createElement('div')
  hdr.textContent = '⛰️ Gò nặn tay'
  hdr.style.cssText = 'margin:8px 0 2px;font-weight:600;opacity:.85'
  body.appendChild(hdr)
  t.mounds.forEach((m, i) => buildMoundRow(body, ctx, t, m, i, halfW, halfD, refresh))
  const addRow = document.createElement('div')
  addRow.style.cssText = 'margin-top:6px'
  const btn = document.createElement('button')
  btn.type = 'button'
  // inline style (né sửa archplan-lab.css = vùng Factory) — tông xanh "thêm", khớp form nút remove.
  btn.style.cssText =
    'font-size:9px;padding:2px 7px;border-radius:4px;cursor:pointer;color:#d0f0d8;' +
    'background:rgba(96,176,112,.22);border:1px solid rgba(96,176,112,.5)'
  btn.textContent = '＋ Thêm gò'
  btn.addEventListener('click', () => {
    t.enabled = true // gò vô hình nếu terrain tắt → bật luôn cho thấy ngay
    t.mounds.push({ x: 0, z: 0, radius: 2000, height: 400, falloff: 1 }) // gò mặc định: tâm lô, R2m cao 40cm
    ctx.applySite(true)
    refresh()
  })
  addRow.appendChild(btn)
  body.appendChild(addRow)
}

// 1 gò: nhãn "Gò #i" + 5 slider (Pos X/Z, Radius, Height, Falloff) + ✕ xoá. Slider STRUCTURAL → applyTerrainLive
// (kéo) / applySite (buông) như slider noise. height ÂM = lõm (bị grid-floor `Math.max(dy,0)` chặn: chỉ hạ vùng
// đã cao, KHÔNG thủng base trên nền phẳng). Xoá → splice + refresh.
function buildMoundRow(
  body: HTMLElement,
  ctx: APGuiCtx,
  t: TerrainConfig,
  m: TerrainMound,
  i: number,
  halfW: number,
  halfD: number,
  refresh: () => void
): void {
  const box = document.createElement('div')
  box.style.cssText = 'margin:4px 0;padding:3px 6px;border-left:2px solid #8a7a5a;background:#0001'
  const lbl = document.createElement('div')
  lbl.textContent = `Gò #${i + 1}`
  lbl.style.cssText = 'font-size:11px;opacity:.7;margin:2px 0'
  box.appendChild(lbl)
  for (const [label, min, max, step, mf, get, set] of moundSliderSpecs(m, halfW, halfD))
    box.appendChild(
      sliderRow(
        label,
        min,
        max,
        step,
        get(),
        (v, c) => (set(v), c ? ctx.applySite(true) : ctx.applyTerrainLive()),
        mf
      )
    )
  box.appendChild(
    removeRow('✕ Xoá gò', () => {
      t.mounds.splice(i, 1)
      ctx.applySite(true)
      refresh()
    })
  )
  body.appendChild(box)
}

// Spec 5 slider 1 gò [label, min, max, step, mmFactor, get, set] — reuse TerrainSlider. Pos/Radius/Height đơn vị m
// (mmFactor 1000); Falloff unitless. Radius max = nửa-cạnh-lô lớn nhất; Height [-1,2]m (âm = lõm, grid-floor chặn).
function moundSliderSpecs(m: TerrainMound, halfW: number, halfD: number): TerrainSlider[] {
  return [
    ['Pos X m', -halfW, halfW, 0.1, 1000, () => m.x / 1000, (v) => (m.x = Math.round(v * 1000))],
    ['Pos Z m', -halfD, halfD, 0.1, 1000, () => m.z / 1000, (v) => (m.z = Math.round(v * 1000))],
    [
      'Radius m',
      0.3,
      Math.max(halfW, halfD),
      0.1,
      1000,
      () => m.radius / 1000,
      (v) => (m.radius = Math.round(v * 1000)),
    ],
    [
      'Height m',
      -1,
      2,
      0.05,
      1000,
      () => m.height / 1000,
      (v) => (m.height = Math.round(v * 1000)),
    ],
    ['Falloff', 0, 1, 0.05, 1, () => m.falloff ?? 1, (v) => (m.falloff = v)],
  ]
}

// Spec 10 slider noise [label, min, max, step, mmFactor, get, set] — tách khỏi buildTerrainControls (rule-50).
// mmFactor 1000 = ô số hiện mm (amplitude/pad/edge); 1 = giá trị thô unitless (freq/octaves/gain…).
type TerrainSlider = [string, number, number, number, number, () => number, (v: number) => void]
function terrainSliderSpecs(t: TerrainConfig): TerrainSlider[] {
  return [
    [
      'Amplitude m',
      0,
      2,
      0.05,
      1000,
      () => t.amplitude / 1000,
      (v) => (t.amplitude = Math.round(v * 1000)),
    ],
    ['Frequency', 0.02, 1, 0.02, 1, () => t.frequency, (v) => (t.frequency = v)],
    ['Octaves', 1, 8, 1, 1, () => t.octaves, (v) => (t.octaves = Math.round(v))],
    ['Lacunarity', 1.5, 3, 0.1, 1, () => t.lacunarity, (v) => (t.lacunarity = v)],
    ['Gain', 0.2, 0.8, 0.05, 1, () => t.gain, (v) => (t.gain = v)],
    ['Warp', 0, 1, 0.05, 1, () => t.warp, (v) => (t.warp = v)],
    ['Seed', 0, 9999, 1, 1, () => t.seed, (v) => (t.seed = Math.round(v))],
    ['Resolution', 32, 128, 8, 1, () => t.resolution, (v) => (t.resolution = Math.round(v))],
    [
      'Pad margin m',
      0,
      3,
      0.1,
      1000,
      () => t.padMargin / 1000,
      (v) => (t.padMargin = Math.round(v * 1000)),
    ],
    [
      'Edge flat m',
      0,
      3,
      0.1,
      1000,
      () => t.edgeFlat / 1000,
      (v) => (t.edgeFlat = Math.round(v * 1000)),
    ],
  ]
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
// Class Tabs dùng chung MỌI cấp hệ Ground (reuse fence instance-tab style; tô XÁM qua ensureGroundGrayCss).
const GROUND_TAB_CLASSES = {
  bar: 'ap-tab-bar ap-fence-itabs',
  tab: 'ap-tab-btn',
  panel: 'ap-fence-isub',
  active: 'ap-tab-active',
}

// Tô XÁM CHỈ tab "Khoét cut" (nút .ap-cut-tabbtn) + nội dung của nó (.ap-cut-pane: instance C-tabs + zone panes).
// G0/G1/G2 tab + "Mảng add" GIỮ màu nâu fence. SCOPED .ap-ground-domain → không đụng Fence/Water. Inject 1 lần
// (id guard) — KHÔNG sửa archplan-lab.css (Factory-owned).
function ensureCutGrayCss(): void {
  if (document.getElementById('ap-cut-gray')) return
  const s = document.createElement('style')
  s.id = 'ap-cut-gray'
  const btn = 'background:rgba(78,78,78,.5);border-color:rgba(150,150,150,.35);color:#cfcfcf'
  const act =
    'background:#585858;border-color:rgba(170,170,170,.6);border-bottom-color:transparent;color:#f2f2f2'
  s.textContent =
    `.ap-ground-domain .ap-cut-tabbtn{${btn}}` + // nút tab "Khoét cut"
    `.ap-ground-domain .ap-cut-tabbtn.ap-tab-active{${act}}` +
    '.ap-ground-domain .ap-cut-pane{background:#585858}' + // nội dung cut (panel)
    `.ap-ground-domain .ap-cut-pane .ap-fence-itabs>.ap-tab-btn{${btn}}` + // instance C1|C2|＋
    `.ap-ground-domain .ap-cut-pane .ap-fence-itabs>.ap-tab-btn.ap-tab-active{${act}}` +
    '.ap-ground-domain .ap-cut-pane .ap-fence-isub{background:#585858}'
  document.head.appendChild(s)
}

// Registry Tabs hệ Ground: tabs[] (dispose) + mid (level→Tabs add/cut) + inst (`lv:op`→Tabs Z/C) cho navigate
// (code1 Focus: click 3D → chọn ĐÚNG G-level + add/cut + Z/C). Clear toàn bộ mỗi rebuild.
interface GReg {
  tabs: Tabs[]
  mid: Map<number, Tabs>
  inst: Map<string, Tabs>
}

// Dựng lại tab top (G0|G1|G2…|＋) vào host — dispose+clear reg rồi gom mọi Tabs cấp dưới vào reg. ＋G-level →
// push zone mới ở level kế + rebuild focus zone đó. Tách khỏi buildGroundDomain giữ Rule-50. Trả topTabs.
function rebuildGroundTabs(
  ctx: APGuiCtx,
  host: HTMLElement,
  refresh: () => void,
  reg: GReg,
  rebuild: (focusLayer?: number, focusLevel?: number) => void
): Tabs {
  for (const t of reg.tabs) t.dispose()
  reg.tabs.length = 0
  reg.mid.clear()
  reg.inst.clear()
  host.replaceChildren()
  const base = document.createElement('div')
  buildGroundControls(base, ctx, refresh)
  host.appendChild(base)
  const items: TabItem[] = [{ label: 'G0', panel: base, title: 'Base ground (nền lô, mặc định)' }]
  ctx.site.groundLayers ??= []
  const levels = groundEditorLevels(ctx.site.groundLevels ?? 0)
  levels.forEach((lv) => {
    const pane = buildLevelPane(ctx, lv, rebuild, reg)
    host.appendChild(pane)
    items.push({ label: `G${lv}`, panel: pane, title: `Ground level ${lv}` })
  })
  const addBtn = addInstanceButton('G-level', () => {
    const n = (ctx.site.groundLevels = (ctx.site.groundLevels ?? 0) + 1) // +1 G-level RỖNG (chưa zone/cut)
    rebuild(-1, n) // focus tab G-level mới (tab index = level, G0=0)
    ctx.applySite(true)
  })
  const tabs = new Tabs(host, items, {
    classes: GROUND_TAB_CLASSES,
    injectCss: false,
    addEl: addBtn,
  })
  reg.tabs.push(tabs)
  return tabs
}

// Hệ tab LỒNG: G0 (base) | G1 (chỉ zones) | G2+ ([Mảng add|Khoét cut] → Z/C instances +＋) | ＋(thêm G-level).
// navTo(flatIdx) = code1 Focus: chọn ĐÚNG G-level + add/cut + Z/C của layer đó (click 3D zone/cut overlay, hoặc
// focus sau khi ＋ thêm). groundLayers PHẲNG, nhóm theo level+op.
function buildGroundDomain(
  ctx: APGuiCtx,
  refresh: () => void
): { panel: HTMLElement; dispose: () => void; navigateToLayer: (idx: number) => void } {
  const host = document.createElement('div')
  host.classList.add('ap-ground-domain')
  ensureCutGrayCss() // tô xám CHỈ tab "Khoét cut" + nội dung của nó (scoped) — G/Mảng add giữ nâu
  const reg: GReg = { tabs: [], mid: new Map(), inst: new Map() }
  let topTabs: Tabs | null = null
  // Chọn tab add/cut (mid) + instance Z/C của layer (tách khỏi navTo giữ complexity ≤10).
  const selectMidInst = (
    layers: GroundLayer[],
    layer: GroundLayer,
    lv: number,
    op: 'add' | 'cut'
  ): void => {
    reg.mid.get(lv)?.select(Number(op === 'cut'), { trusted: false }) // G2+ add/cut (cut=1, add=0)
    const sibs = layers.filter((l) => (l.level ?? 1) === lv && (l.op ?? 'add') === op)
    reg.inst.get(`${lv}:${op}`)?.select(Math.max(0, sibs.indexOf(layer)), { trusted: false })
  }
  const navTo = (idx: number): void => {
    const layers = ctx.site.groundLayers ?? []
    const layer = layers[idx]
    if (!layer) return
    const lv = layer.level ?? 1
    const op = layer.op ?? 'add'
    const top = groundEditorLevels(ctx.site.groundLevels ?? 0).indexOf(lv)
    if (top < 0) return
    topTabs?.select(top + 1, { trusted: false }) // +1: G0 base = tab 0
    selectMidInst(layers, layer, lv, op)
    ctx.setActiveGroundLayer?.(idx) // 🟫 báo Lab layer active → cut hiện XÁM trên editor (add → ẩn cut)
  }
  const rebuild = (focusLayer = -1, focusLevel = -1): void => {
    topTabs = rebuildGroundTabs(ctx, host, refresh, reg, rebuild)
    if (focusLayer >= 0) navTo(focusLayer)
    else if (focusLevel >= 0) topTabs.select(focusLevel, { trusted: false }) // focusLevel = tab index (G0=0)
  }
  rebuild()
  return {
    panel: host,
    dispose: (): void => {
      for (const t of reg.tabs) t.dispose()
      reg.tabs.length = 0
    },
    navigateToLayer: navTo,
  }
}

// 1 pane tầng surface chồng: Surface (vật liệu) + Thickness 1–10cm + ✕ xoá. Xoá → splice + rebuild + applySite.
// 1 slider số-đo layer (length/width/thickness): hiển thị theo factor (m=1000, cm=10), ghi mm. Tách cho
// buildGroundLayerPane gọn (rule-50).
function layerSlider(
  ctx: APGuiCtx,
  layer: GroundLayer,
  key: 'length' | 'width' | 'thickness' | 'offsetX' | 'offsetZ',
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

// Blob mượt 8 ĐIỂM (4 góc + 4 trung-điểm cạnh) từ rect width×depth (mm, local tâm gốc) + tay-cầm bezier MIRROR
// (Catmull-Rom tangent = (P_next−P_prev)/6) → ra ngay form bo tròn, đỉnh+tay-cầm hiện sẵn để kéo nắn. DÙNG CHUNG
// seed hồ (seedWaterRectPoints) + ground layer (groundFormRow) khi đổi → Free — 2 nơi, 1 nguồn.
function rectBezierPoints(width: number, depth: number): WaterPoint[] {
  const hw = width / 2
  const hd = depth / 2
  const c = [
    { x: -hw, z: -hd },
    { x: 0, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: 0 },
    { x: hw, z: hd },
    { x: 0, z: hd },
    { x: -hw, z: hd },
    { x: -hw, z: 0 },
  ]
  const n = c.length
  return c.map((p, i) => {
    const prev = c[(i + n - 1) % n]
    const next = c[(i + 1) % n]
    const tx = Math.round((next.x - prev.x) / 6) // Catmull-Rom → bezier handle (mirror smooth)
    const tz = Math.round((next.z - prev.z) / 6)
    return { ...p, outX: tx, outZ: tz, inX: -tx, inZ: -tz }
  })
}

// Hàng Form hình mảng (rect/circle/ellipse/free-bezier). Op (add/cut) KHÔNG còn dropdown — xác định bởi tab
// "Mảng add"/"Khoét cut" chứa zone/cut. Đổi → Free: seed blob 8-điểm (rectBezierPoints) → kéo đỉnh/tay-cầm 3D.
function groundFormRow(ctx: APGuiCtx, layer: GroundLayer): HTMLElement {
  const opts: [string, 'rect' | 'circle' | 'ellipse' | 'free'][] = [
    ['Rect', 'rect'],
    ['Tròn', 'circle'],
    ['Ellipse', 'ellipse'],
    ['Free (bezier)', 'free'],
  ]
  const cur = (layer.shape ?? 'rect') as 'rect' | 'circle' | 'ellipse' | 'free'
  return selectRow('Form', opts, cur, (v) => {
    layer.shape = v
    if (v === 'free' && (layer.points?.length ?? 0) < 3)
      layer.points = rectBezierPoints(layer.length, layer.width) // length×width = trục rect → blob seed
    ctx.applySite(true)
  })
}

// Pane 1 ZONE (op='add': +Surface +Thickness) hoặc CUT (op='cut': chỉ hình+vị trí — khoét không có vật liệu/bề
// dày riêng). Form + Length/Width + Pos X/Z (cut định vị bằng slider vì không có mesh để Move-drag) + ✕ xoá.
function buildZonePane(
  ctx: APGuiCtx,
  layer: GroundLayer,
  flatIdx: number,
  op: 'add' | 'cut',
  rebuild: (focus?: number) => void
): HTMLElement {
  const pane = document.createElement('div')
  if (op === 'add') {
    pane.appendChild(
      selectRow(
        'Surface',
        GROUND_OPTS,
        layer.material,
        (v) => {
          layer.material = v
          ctx.applySite(true)
        },
        () => ctx.prefetchGroundTextures?.()
      )
    )
  }
  pane.appendChild(groundFormRow(ctx, layer)) // circle=đường kính, ellipse=trục X
  pane.appendChild(layerSlider(ctx, layer, 'length', 'Length m', 0.5, 40, 0.1, 1000))
  pane.appendChild(layerSlider(ctx, layer, 'width', 'Width m', 0.5, 40, 0.1, 1000))
  if (op === 'add') {
    pane.appendChild(layerSlider(ctx, layer, 'thickness', 'Thickness cm', 1, 10, 0.5, 10))
    // 🏔️ Drape: zone UỐN theo gò (lưới displaced) thay vì slab phẳng. Chỉ ăn khi Terrain bật. structural → rebuild.
    pane.appendChild(
      toggleRow('Drape (bám gò)', layer.drape ?? false, (on) => {
        layer.drape = on
        ctx.applySite(true)
      })
    )
  }
  pane.appendChild(layerSlider(ctx, layer, 'offsetX', 'Pos X m', -20, 20, 0.1, 1000))
  pane.appendChild(layerSlider(ctx, layer, 'offsetZ', 'Pos Z m', -20, 20, 0.1, 1000))
  pane.appendChild(
    removeRow(op === 'add' ? '✕ Remove zone' : '✕ Remove cut', () => {
      const layers = ctx.site.groundLayers
      layers?.splice(flatIdx, 1)
      const n = layers?.length ?? 0
      rebuild(n === 0 ? -1 : Math.min(Math.max(0, flatIdx - 1), n - 1)) // focus tab TRƯỚC (né nhảy về G0)
      ctx.applySite(true)
    })
  )
  return pane
}

// Kích thước zone/cut MỚI = 3000×3000mm (3×3m). Offset X cho cái mới: bên PHẢI sibling cuối + nửa-rộng nó +
// nửa-zone-mới (1.5m) + 0.5m gap → KHÔNG chồng lên (đẩy sang bên). Sibling đầu → 0.
const NEW_ZONE_SIZE = 3000
function nextZoneOffset(layers: GroundLayer[], lv: number, op: 'add' | 'cut'): number {
  const sibs = layers.filter((l) => (l.level ?? 1) === lv && (l.op ?? 'add') === op)
  const last = sibs[sibs.length - 1]
  return last ? last.offsetX + last.length / 2 + NEW_ZONE_SIZE / 2 + 500 : 0
}

// Tabs instance zone/cut của 1 (level, op): Z1|Z2|＋ (add) hoặc C1|C2|＋ (cut). flatIdx = vị trí trong
// site.groundLayers (splice/groundLayerIdx). ＋ → push layer mới (offset né chồng) + focus nó. reg.inst[lv:op]=Tabs.
function buildInstanceTabs(
  ctx: APGuiCtx,
  lv: number,
  op: 'add' | 'cut',
  rebuild: (focusLayer?: number) => void,
  reg: GReg
): HTMLElement {
  const host = document.createElement('div')
  const layers = ctx.site.groundLayers ?? []
  const items: TabItem[] = []
  const flatIdxs: number[] = [] // tab-index → flatIdx (site.groundLayers) cho onChange → setActiveGroundLayer
  layers.forEach((layer, idx) => {
    if ((layer.level ?? 1) !== lv || (layer.op ?? 'add') !== op) return
    const n = items.length + 1
    const pane = buildZonePane(ctx, layer, idx, op, rebuild)
    host.appendChild(pane)
    items.push({ label: `${op === 'add' ? 'Z' : 'C'}${n}`, panel: pane, title: `${op} ${n}` })
    flatIdxs.push(idx)
  })
  const addBtn = addInstanceButton(op === 'add' ? 'zone' : 'cut', () => {
    layers.push(
      makeGroundLayer({
        level: lv,
        op,
        offsetX: nextZoneOffset(layers, lv, op),
        length: NEW_ZONE_SIZE,
        width: NEW_ZONE_SIZE,
      })
    )
    rebuild(layers.length - 1) // focus zone/cut MỚI (né nhảy về G0)
    ctx.applySite(true)
  })
  const tabs = new Tabs(host, items, {
    classes: GROUND_TAB_CLASSES,
    injectCss: false,
    addEl: addBtn,
    // 🟫 USER click tab (trusted) → báo Lab layer active: cut → mảng xám hiện trên scene; add → ẩn cut. Bỏ qua
    // trusted=false (dựng ban đầu / navTo tự gọi setActiveGroundLayer) → tránh tự-bật xám lúc rebuild.
    onChange: (i, ev) => {
      if (ev.trusted) ctx.setActiveGroundLayer?.(flatIdxs[i])
    },
  })
  reg.tabs.push(tabs)
  reg.inst.set(`${lv}:${op}`, tabs) // navigate → instance
  return host
}

// Pane 1 G-level = [Mảng add | Khoét cut] (2 tab), mỗi tab = instance tabs zone/cut. MỌI level (kể cả G1) đều có
// cut (cut khoét zones CÙNG level → G1 cut lộ G0 base). reg.mid[lv]=Tabs add/cut cho navigate.
function buildLevelPane(
  ctx: APGuiCtx,
  lv: number,
  rebuild: (focusLayer?: number) => void,
  reg: GReg
): HTMLElement {
  const host = document.createElement('div')
  const addPane = buildInstanceTabs(ctx, lv, 'add', rebuild, reg)
  const cutPane = buildInstanceTabs(ctx, lv, 'cut', rebuild, reg)
  cutPane.classList.add('ap-cut-pane') // tô xám nội dung tab Khoét (C-tabs + zone panes)
  host.append(addPane, cutPane)
  const items: TabItem[] = [
    { label: 'Mảng add', panel: addPane, title: 'Mảng phủ material' },
    { label: 'Khoét cut', panel: cutPane, title: 'Khoét lộ level dưới' },
  ]
  const tabs = new Tabs(host, items, { classes: GROUND_TAB_CLASSES, injectCss: false })
  ;(tabs.getTablist().children[1] as HTMLElement | undefined)?.classList.add('ap-cut-tabbtn') // nút "Khoét cut" → xám
  reg.tabs.push(tabs)
  reg.mid.set(lv, tabs) // navigate → tab add/cut
  host.appendChild(removeGLevelRow(ctx, lv, rebuild)) // ✕ xoá CẢ G-level (dưới add/cut tabs)
  return host
}

// ✕ Xoá G-level lv: bỏ MỌI layer level đó + DỒN level cao hơn xuống 1 + groundLevels−−. Về G0 + clear active.
// (Model count tường minh → tầng RỖNG không tự co như cũ → cần nút này, kẻo G lỡ thêm bị kẹt.)
function removeGLevelRow(
  ctx: APGuiCtx,
  lv: number,
  rebuild: (focusLayer?: number) => void
): HTMLElement {
  return removeRow(`✕ Remove G${lv}`, () => {
    const site = ctx.site
    site.groundLayers = (site.groundLayers ?? []).filter((l) => (l.level ?? 1) !== lv)
    for (const l of site.groundLayers) if ((l.level ?? 1) > lv) l.level = (l.level ?? 1) - 1
    site.groundLevels = Math.max(0, (site.groundLevels ?? 0) - 1)
    ctx.setActiveGroundLayer?.(-1) // clear active (idx dồn → tránh stale handle)
    rebuild(-1) // về G0 (tầng đã xoá)
    ctx.applySite(true)
  })
}

// Danh sách G-level editor = 1..count (tường minh, GỒM tầng rỗng). count = site.groundLevels (≥ max level layers
// đã đảm bảo lúc parse + add-zone). Rỗng (count=0) → chỉ G0 base.
function groundEditorLevels(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1)
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

// Seed polygon free hồ từ chữ nhật width×depth khi chuyển → Free: blob 8-điểm + tay-cầm (rectBezierPoints chung).
function seedWaterRectPoints(w: WaterConfig): void {
  w.points = rectBezierPoints(w.width, w.depth)
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
  const formOpts: [string, 'rect' | 'circle' | 'ellipse' | 'free'][] = [
    ['Rect', 'rect'],
    ['Tròn', 'circle'],
    ['Ellipse', 'ellipse'],
    ['Free (bezier)', 'free'],
  ]
  host.appendChild(
    selectRow('Form', formOpts, w.shape, (v) => {
      w.shape = v
      if (v === 'free' && w.points.length < 3) seedWaterRectPoints(w)
      ctx.applySite(true)
    })
  )
  waterSlider(host, ctx, w, 'Width m', 1, 15, 'width') // circle = đường kính (min W,D); ellipse = trục X
  waterSlider(host, ctx, w, 'Depth m', 1, 15, 'depth') // ellipse = trục Z (circle bỏ qua)
  waterSlider(host, ctx, w, 'Pos X m', -10, 10, 'offsetX')
  waterSlider(host, ctx, w, 'Pos Z m', -10, 10, 'offsetZ')
  if (withEdge) {
    waterSlider(host, ctx, w, 'Edge width m', 0, 2, 'edgeWidth') // dải coping quanh hồ (0 = tắt)
    materialRow(host, ctx, w, 'Edge mat', 'edgeMaterial', EDGE_MAT_OPTS) // coping: chỉ None (chưa lát caro)
    buildBorderRows(host, ctx, w) // 🪨 rào gỗ (rect) / đá cuội (cong) quanh vành coping
  }
  const note = document.createElement('div')
  note.style.cssText = 'font-size:9px;opacity:.7;margin-top:4px;line-height:1.3'
  note.textContent = 'Free: bật Move (Z) → kéo chấm vàng ở góc. Border: rect=rào gỗ, cong=đá cuội.'
  host.appendChild(note)
}

// 🪨 Hàng controls RÀO/VIỀN quanh hồ: toggle + cao/đường-kính + màu. Auto theo shape (rect=rào gỗ cọc+ray;
// tròn/ellipse/free=đá cuội xếp liền). Slider/màu COMMIT-ONLY (chỉ áp khi buông) → né tái tạo reflector RTT mỗi
// frame lúc kéo (PERFORMANCE.md: applySite rebuild cả hồ). Tách giữ buildEdgeTab gọn.
const BORDER_MAT_OPTS: [string, BorderMaterialKey][] = [
  ['None (màu)', 'none'],
  ['Icelandic slate', 'icelandic-jagged'],
  ['Coal stone', 'coal-stone'],
  ['Rock rough', 'rock-rough'],
]
function buildBorderRows(host: HTMLElement, ctx: APGuiCtx, w: WaterConfig): void {
  host.appendChild(
    toggleRow('🪨 Border (rào/đá)', w.borderEnabled, (on) => {
      w.borderEnabled = on
      ctx.applySite(true)
    })
  )
  host.appendChild(
    selectRow('Border mat', BORDER_MAT_OPTS, w.borderMaterial, (v) => {
      w.borderMaterial = v // 'none' = màu phẳng; texture đá (triplanar) — áp cả đá cuội lẫn rào gỗ
      ctx.applySite(true)
    })
  )
  host.appendChild(
    sliderRow(
      'Border H m',
      0.1,
      1.2,
      0.05,
      w.borderHeight / 1000,
      (v, c) => {
        w.borderHeight = Math.round(v * 1000)
        if (c) ctx.applySite(true) // commit-only: né reflector thrash lúc kéo
      },
      1000
    )
  )
  host.appendChild(
    colorRow('Border màu', w.borderColor, (hex, c) => {
      w.borderColor = hex
      if (c) ctx.applySite(true) // commit-only
    })
  )
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
  const edgeLabel = w.kind === 'pond' ? 'Pond edge' : 'Pool edge' // nhãn theo kind (pond→Pond edge)
  const tabs = new Tabs(
    host,
    [
      { label: edgeLabel, panel: edge, title: `${edgeLabel} — outline / size / position` },
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
  navigateToGroundLayer: (idx: number) => void
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
    // Click tầng ground 3D → mở sub-tab "Ground" (index 0) + tab Gn của layer idx.
    navigateToGroundLayer: (idx: number): void => {
      tabs.select(0, { trusted: false })
      ground.navigateToLayer(idx)
    },
  }
}
