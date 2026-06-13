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

import type { PondFish } from 'threejs-modules/components/PondFish'
import type {
  BorderMaterialKey,
  BridgeConfig,
  FenceConfig,
  FishSchool,
  GroundLayer,
  GroundMaterialKey,
  GroundMixParams,
  PavingParams,
  StonePathParams,
  TerrainConfig,
  TerrainMound,
  WallCurveParams,
  WaterConfig,
  WaterKind,
  WaterMaterialKey,
  WaterPoint,
} from 'threejs-modules/site/state'
import {
  defaultTerrain,
  fishTierPreset,
  GROUND_THICK_MAX,
  GROUND_THICK_MIN,
  isGroundTexKey,
  makeBridge,
  makeFence,
  makeFishSchool,
  makeGroundLayer,
  makePavingParams,
  makeStonePathParams,
  makeWallCurveParams,
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
  ['Cinder blocks (wall)', 'cinder-blocks-wall'], // 🧱 bộ tường nhóm chung kho — mix fence/vách hồ + nền lát
  ['Stone wall', 'stone-wall'],
]

import type { APGuiCtx, MixPaintTarget } from './ctx'
import { sameMixTarget } from './ctx' // so target mix (wrapper water/fence tạo mới mỗi build pane — KHÔNG ===)
import { confirmPopup } from './roof-lab' // ↺ reset nét cọ mix — tái dùng popup confirm (ap-roof-confirm)
import { GROUND_TEX_GROUPS, texPaletteRow } from './tex-palette' // 🎨 palette swatch thumb thay <select> 17 mục
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
  mmFactor: number,
  markers: number[] = [], // 🔖 mốc đỏ trên track (giá trị thật) — vd ngưỡng chết cá ở mức 6. Rỗng = không mốc.
  bands: SliderBand[] = [] // 🎨 tô NỀN track theo vùng [from,to] màu (vd Đói: đỏ 0-6, vàng 6-10). Rỗng = không tô.
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
  const { mm, syncMm } = mmBox(sl, min, max, mmFactor, onChange)
  const onSlide = (commit: boolean): void => {
    syncMm()
    onChange(parseFloat(sl.value), commit)
  }
  sl.addEventListener('input', () => onSlide(false))
  sl.addEventListener('change', () => onSlide(true))
  const decorate = markers.length > 0 || bands.length > 0
  row.append(lbl, decorate ? markerWrap(sl, min, max, markers, bands) : sl, mm)
  return row
}

// Ô nhập mm bên phải slider (giá trị = slider × mmFactor). Gõ mm = commit (clamp + đồng bộ slider). Tách giữ rule-50.
function mmBox(
  sl: HTMLInputElement,
  min: number,
  max: number,
  mmFactor: number,
  onChange: RowChange
): { mm: HTMLInputElement; syncMm: () => void } {
  const mm = document.createElement('input')
  mm.type = 'number'
  mm.className = 'ap-mm-input'
  mm.title = 'mm'
  const syncMm = (): void => {
    mm.value = String(Math.round(parseFloat(sl.value) * mmFactor))
  }
  syncMm()
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
  return { mm, syncMm }
}

// 🎨 1 vùng tô nền track slider: [from,to] (giá trị thật) màu CSS. Vd Đói: đỏ 0-6 (vùng chết), vàng 6-10.
interface SliderBand {
  from: number
  to: number
  color: string
}

// CSS track TRONG SUỐT cho slider có band (id-guard, KHÔNG sửa archplan-lab.css) → nền band (gradient trên wrap)
// hiện xuyên qua track. Thumb giữ mặc định (vẫn kéo được).
function ensureBandSliderCss(): void {
  if (document.getElementById('ap-band-slider')) return
  const s = document.createElement('style')
  s.id = 'ap-band-slider'
  s.textContent =
    '.ap-band-slider{-webkit-appearance:none;appearance:none;background:transparent;height:14px}' +
    '.ap-band-slider::-webkit-slider-runnable-track{background:transparent}' +
    '.ap-band-slider::-moz-range-track{background:transparent}'
  document.head.appendChild(s)
}

// 🔖🎨 Bọc slider trong khung relative: tô NỀN band (gradient cứng cạnh, transparent ngoài vùng) + vạch mốc đỏ.
// pointer-events:none cho lớp trang trí để không chắn kéo. Track slider làm trong suốt (ensureBandSliderCss).
function markerWrap(
  sl: HTMLElement,
  min: number,
  max: number,
  markers: number[],
  bands: SliderBand[]
): HTMLElement {
  const pct = (v: number): number => ((v - min) / (max - min)) * 100
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:relative;flex:1;min-width:0;display:flex'
  if (bands.length) {
    ensureBandSliderCss()
    sl.classList.add('ap-band-slider')
    const stops = bands.flatMap((b) => {
      const f = pct(b.from)
      const t = pct(b.to)
      return [`transparent ${f}%`, `${b.color} ${f}%`, `${b.color} ${t}%`, `transparent ${t}%`]
    })
    wrap.style.background = `linear-gradient(to right, ${stops.join(',')})`
    wrap.style.borderRadius = '3px'
  }
  sl.style.flex = '1'
  sl.style.minWidth = '0'
  sl.style.cursor = 'pointer'
  wrap.appendChild(sl)
  for (const m of markers) {
    const tick = document.createElement('div')
    tick.style.cssText = `position:absolute;left:${pct(m)}%;top:0;bottom:0;width:2px;margin-left:-1px;background:#ff5a5a;pointer-events:none`
    wrap.appendChild(tick)
  }
  return wrap
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

// (readout Lot/House/Coverage/Garden ĐÃ GỠ — NgQuan 2026-06-11. ctx.siteStats/registerSiteReadout giữ trong
// interface + Lab plumbing optional-chain — vô hại, không gọi nữa.)

// 🎨 Dòng trạng thái mix — UI inline (toggle + board) ĐÃ THÁO khỏi MỌI panel (NgQuan 2026-06-11
// "đã có bảng mix di động, tháo tất cả"): áp = 🪣, gỡ = 🧽, chỉnh/cọ vẽ = 🎯 ở khay 🧪.
// EXPORT cho gui/sections.ts (tường building/móng/sàn) dùng cùng dòng báo.
export function mixStatusRow(): HTMLElement {
  const d = document.createElement('div')
  d.textContent = '🎨 đang phủ MIX — chỉnh 🎯 / gỡ 🧽 ở khay 🧪'
  d.style.cssText = 'opacity:.75;font-size:9px;margin:2px 0 4px'
  return d
}

// 🎨 Section surface G0: select texture đơn + (mix đang phủ → dòng trạng thái — mix THẮNG select khi render).
// Board/toggle inline đã tháo — xem mixStatusRow.
function mkBaseMixSection(ctx: APGuiCtx): HTMLElement {
  const site = ctx.site
  const wrap = document.createElement('div')
  if (site.groundMix) wrap.appendChild(mixStatusRow())
  wrap.appendChild(
    texPaletteRow(
      'Surface',
      GROUND_OPTS,
      site.ground,
      (v) => {
        site.ground = v
        ctx.applySite(true)
      },
      { groups: GROUND_TEX_GROUPS, onOpen: () => ctx.prefetchGroundTextures?.() }
    )
  )
  return wrap
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
  body.appendChild(mkBaseMixSection(ctx)) // 🎨 Surface đơn ↔ bảng trộn mix G0 (NgQuan: "G0 chưa có mix")
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
  site.terrain ??= defaultTerrain() // đảm bảo G0 có terrain field
  buildTerrainControls(body, ctx, site.terrain, () => ctx.applyTerrainLive(), refresh, true)
}

// 🏔️ Section Terrain (nền gò sân vườn) trong tab Ground — bộ thông số noise ĐẦY ĐỦ. Mọi param STRUCTURAL →
// ctx.applySite(c) (kéo = live-rebuild, buông = commit) như slider Thickness. Data-driven 10 slider (rule-50).
// Section Terrain DÙNG CHUNG: G0 nền (t=site.terrain, applyLive=applyTerrainLive geo-swap, showDetail=true) HOẶC
// zone riêng (t=layer.terrain, applyLive=applySiteLive, showDetail=false — detail per-zone = Feature sau). Caller
// đảm bảo `t` tồn tại (ensure ??= defaultTerrain). Mọi param structural → applySite(true) khi buông.
function buildTerrainControls(
  body: HTMLElement,
  ctx: APGuiCtx,
  t: TerrainConfig,
  applyLive: () => void,
  refresh: () => void,
  showDetail: boolean
): void {
  const hdr = document.createElement('div')
  hdr.className = 'ap-terrain-hdr' // divider tách khu mix nền ↔ khu terrain gò (ensureMixCss border-top)
  hdr.textContent = '🏔️ Terrain (gò sân vườn)'
  hdr.style.cssText = 'margin:7px 0 3px;font-weight:600;opacity:.85'
  body.append(
    hdr,
    toggleRow('Enable terrain', t.enabled, (on) => ((t.enabled = on), ctx.applySite(true)))
  )
  for (const [label, min, max, step, mf, get, set] of terrainSliderSpecs(t))
    body.appendChild(
      sliderRow(
        label,
        min,
        max,
        step,
        get(),
        (v, c) => (set(v), c ? ctx.applySite(true) : applyLive()),
        mf
      )
    )
  // 🏔️ Detail (Phase 4): micro-relief normal (UNIFORM PhotoGround, KHÔNG geo) — chỉ G0 (showDetail). Per-zone = sau.
  if (showDetail)
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
  buildMoundControls(body, ctx, t, applyLive, refresh) // ⛰️ gò nặn tay (Phase 3)
}

// ⛰️ Gò nặn-tay (Phase 3): list mounds + ＋thêm/✕xoá + slider mỗi gò. Mounds cộng vào heightAt (Σ gò, đã có từ
// Phase 1) → griddedGroundGeometry sample → live qua applyTerrainLive (kéo) / applySite (buông). Thêm/xoá đổi LIST
// → refresh() dựng lại GUI. ＋ tự bật terrain (heightAt early-return khi tắt → gò vô hình). Tách rule-50.
function buildMoundControls(
  body: HTMLElement,
  ctx: APGuiCtx,
  t: TerrainConfig,
  applyLive: () => void,
  refresh: () => void
): void {
  const halfW = ctx.site.lotWidth / 2000
  const halfD = ctx.site.lotDepth / 2000
  const hdr = document.createElement('div')
  hdr.textContent = '⛰️ Gò nặn tay'
  hdr.style.cssText = 'margin:8px 0 2px;font-weight:600;opacity:.85'
  body.appendChild(hdr)
  t.mounds.forEach((m, i) => buildMoundRow(body, ctx, t, m, i, halfW, halfD, applyLive, refresh))
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
  applyLive: () => void,
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
        (v, c) => (set(v), c ? ctx.applySite(true) : applyLive()),
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

// 🎨 CSS bảng trộn MIX trong panel 🌳 (NgQuan 2026-06-11 "select gọn lại, bỏ button cọ/✕, tách khối").
// Pattern = inject <style> id-guard (như ensureCutGrayCss) — KHÔNG sửa archplan-lab.css (Factory-owned).
// SCOPE .ap-scan-panel.ap-site-panel (stage 4: board mix sống cả trong pane Water Floor/Walls + Fence — ngoài
// .ap-ground-domain); palette nâu --gr-* cascade từ chính root đó. Riêng bậc màu tab Z giữ .ap-ground-domain.
// Gồm: select gọn · block slot tách slider · slot active (viền trái accent) · nút ↺ vuông · khu tab Z (instance
// add) TỐI hơn 1 nấc · divider terrain.
function ensureMixCss(): void {
  if (document.getElementById('ap-mix-css')) return
  const s = document.createElement('style')
  s.id = 'ap-mix-css'
  // Scope theo HOST board (.ap-mix-host — buildMixBoard tự gắn): board sống ở site panel LẪN lil-gui
  // building (khu Wall). Vars --gr-* khai báo ngay trên host (đè = cùng giá trị trong site panel, có giá trị
  // trong lil-gui) → look nâu Lab đồng nhất mọi nơi.
  const D = '.ap-mix-host '
  s.textContent =
    `.ap-mix-host{--gr-bg-1:#3e2f1c;--gr-bg-2:#5c4423;--gr-bg-3:#8a6a2f;--gr-bg-4:#b58a3c;` +
    `--gr-bg-5:#e0b860;--gr-accent:#b5532a;--gr-text:#f5ead2}` +
    // Đè style input của lil-gui core + theme building (board sống trong .lil-gui → input trắng to vỡ hàng).
    // Inject SAU css lib → cùng/hơn specificity là thắng. Track mảnh + thumb nhỏ + ô số gọn = look site panel.
    `${D}input[type='range']{-webkit-appearance:none;appearance:none;flex:1;min-width:0;width:auto;` +
    `height:3px;background:var(--gr-bg-3);border-radius:2px;border:none;padding:0;margin:0}` +
    `${D}input[type='range']::-webkit-slider-thumb{-webkit-appearance:none;width:9px;height:9px;` +
    `border-radius:50%;background:var(--gr-bg-5);border:none;cursor:pointer}` +
    `${D}.ap-mm-input{width:46px;flex:0 0 auto;box-sizing:border-box;height:auto;padding:1px 3px;` +
    `font:9px/1.3 'Segoe UI',system-ui,sans-serif;background:var(--gr-bg-1);color:var(--gr-text);` +
    `border:1px solid var(--gr-bg-4);border-radius:3px;text-align:right}` +
    `${D}input[type='checkbox']{width:11px;height:11px;margin:0;accent-color:var(--gr-accent)}` +
    `${D}.ap-tab-add{width:100%;height:auto;min-width:0;padding:2px 0;font-size:9px;` +
    `background:var(--gr-bg-2);color:var(--gr-text);border:1px solid var(--gr-bg-4);border-radius:3px;cursor:pointer}` +
    `${D}span{font:9px/1.4 'Segoe UI',system-ui,sans-serif}` + // label hàng (slider/toggle/select) đồng cỡ board
    `${D}.ap-ground-sel{width:100%;box-sizing:border-box;font:9px/1.4 'Segoe UI',system-ui,sans-serif;` +
    `color:var(--gr-text);background:var(--gr-bg-2);border:1px solid var(--gr-bg-4);border-radius:3px;padding:2px 4px;cursor:pointer}` +
    `${D}.ap-mix-row{display:flex;align-items:center;gap:5px;margin:0}` +
    `${D}.ap-mix-tag{flex:0 0 auto;width:15px;height:15px;display:flex;align-items:center;justify-content:center;` +
    `font-size:8px;border-radius:3px;background:var(--gr-bg-1);border:1px solid var(--gr-bg-4);color:var(--gr-bg-5);cursor:pointer}` +
    // khu slot = block tách bạch với 6 slider chung bên dưới (viền + nền nhẹ + bo)
    `${D}.ap-mix-slots{margin:4px 0 6px;padding:4px;border:1px solid var(--gr-bg-3);border-radius:4px;background:rgba(62,47,28,.35)}` +
    `${D}.ap-mix-layer{margin:3px 0;padding:3px 4px;border-left:2px solid transparent;border-radius:2px;cursor:pointer}` +
    `${D}.ap-mix-layer.ap-mix-active{border-left-color:var(--gr-accent);background:rgba(181,138,60,.16)}` +
    // hàng cọ + nút 🖌 chung + ↺ reset (vuông, đẩy cuối hàng Tẩy)
    `${D}.ap-mix-brushrow{margin:2px 0 4px}` +
    `${D}.ap-mix-brushtoggle{width:100%;padding:2px 0;font-size:9px;border:1px solid var(--gr-bg-4);` +
    `border-radius:3px;background:var(--gr-bg-2);color:var(--gr-text);cursor:pointer}` +
    `${D}.ap-mix-reset{flex:0 0 auto;margin-left:auto;width:18px;height:16px;padding:0;font-size:11px;line-height:1;` +
    `border:1px solid var(--gr-bg-4);border-radius:3px;background:var(--gr-bg-2);color:var(--gr-text);cursor:pointer}` +
    // divider tách khu mix nền ↔ khu terrain gò sân vườn (margin-top do inline style hdr lo)
    `${D}.ap-terrain-hdr{border-top:1px solid var(--gr-bg-3);padding-top:6px}` +
    // 🎨 khu tab Z (instance add: Z/P/B/W) TỐI hơn 1 nấc — lồng cấp như Garden (cut giữ xám riêng).
    // Scope HẸP .ap-ground-domain: chỉ hệ Ground (đừng lây Fence/Water itabs).
    '.ap-ground-domain .ap-zone-itabs>.ap-fence-itabs>.ap-tab-btn{background:rgba(62,47,28,.55);border-color:rgba(181,138,60,.3);color:#c9a877}' +
    '.ap-ground-domain .ap-zone-itabs>.ap-fence-itabs>.ap-tab-btn.ap-tab-active{background:var(--gr-bg-2);border-color:rgba(181,138,60,.55);border-bottom-color:transparent;color:var(--gr-text)}' +
    '.ap-ground-domain .ap-zone-itabs>.ap-fence-isub{background:var(--gr-bg-2)}' +
    mixEditorCss(D)
  document.head.appendChild(s)
}

// 🎨 CSS EDITOR PRESET RỘNG (buildMixPresetEditor) — tách khỏi ensureMixCss giữ rule-50. D = scope host.
function mixEditorCss(D: string): string {
  return (
    // Khung lớp = grid 2×2 chiếm HẾT chiều ngang (mockup NgQuan 16:23): mỗi Ô = BLOCK chỉnh ĐẦY ĐỦ
    // 1 lớp ("Lớp N" + ✕ · texture · Ngưỡng · Quy luật); ô trống = + to.
    `${D}.ap-mixL-frame{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;` +
    `padding:4px;border:1px solid var(--gr-bg-3);border-radius:4px;background:rgba(62,47,28,.35);margin:0 0 6px}` +
    `${D}.ap-mixL-cell{display:flex;flex-direction:column;gap:2px;min-width:0;padding:3px 4px;` +
    `border:1px solid var(--gr-bg-4);border-radius:4px;background:var(--gr-bg-2)}` +
    `${D}.ap-mixL-cellhd{display:flex;align-items:center;justify-content:space-between}` +
    `${D}.ap-mixL-add{min-height:86px;display:flex;align-items:center;justify-content:center;cursor:pointer;` +
    `font-size:20px;color:var(--gr-bg-5);background:rgba(0,0,0,.12);border-style:dashed}` +
    `${D}.ap-mixL-del{background:none;border:none;padding:0;font-size:9px;color:var(--gr-text);cursor:pointer}` +
    `${D}.ap-mixL-del:hover{color:#ff9a9a}` +
    // dưới khung lớp: hàng NGANG — cột slider (trái, co giãn) | ô preview (phải, cố định)
    `${D}.ap-mixE-bottom{display:flex;gap:6px;align-items:flex-start}` +
    `${D}.ap-mixE-left{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}` +
    `${D}.ap-mixE-prev{flex:0 0 auto}` +
    `${D}.ap-mixE-detail{margin:2px 0;padding:3px 4px;border:1px solid var(--gr-bg-3);border-radius:4px;background:rgba(0,0,0,.12)}` +
    `${D}.ap-mixE-dlbl{font-size:9px;font-weight:600;color:var(--gr-bg-5);margin-bottom:2px}`
  )
}

// 🎨 EDITOR PRESET dạng RỘNG (NgQuan 2026-06-11 redesign khay mix): KHUNG LỚP 2×2 lấy HẾT chiều ngang GUI
// (trên) → hàng NGANG [cột SLIDER (Nền chính + lớp đang chọn + 6-7 slider chung) | ô PREVIEW] (caller mount
// MixPreview vào element trả về — preview nằm NGANG cạnh khung slider). target = {wallMix} (preset = mặt đứng
// → có Quy luật/Trọng lực). commit = save preset (KHÔNG đụng scene — CLONE).
export function buildMixPresetEditor(
  host: HTMLElement,
  ctx: APGuiCtx,
  mix: GroundMixParams,
  commit: () => void,
  previewHost: HTMLElement
): void {
  ensureMixCss()
  host.classList.add('ap-mix-host')
  const target: MixPaintTarget = { wallMix: mix } // mặt đứng generic — board có Quy luật/Trọng lực
  const frame = document.createElement('div')
  frame.className = 'ap-mixL-frame'
  const left = document.createElement('div')
  left.className = 'ap-mixE-left'
  const redraw = (): void => _renderLayerFrame(frame, ctx, target, mix, { redraw, commit })
  redraw()
  left.appendChild(mkMixBaseRow(mix, commit))
  for (const sl of mkMixSliders(ctx, target, mix, commit)) left.appendChild(sl)
  const bottom = document.createElement('div')
  bottom.className = 'ap-mixE-bottom' // hàng ngang: slider chung (trái) | preview (phải)
  previewHost.className = 'ap-mixE-prev'
  bottom.append(left, previewHost)
  host.append(frame, bottom) // khung lớp 2×2 full width (trên) → [slider | preview] ngang (dưới)
}

// Khung lớp 2×2: 4 ô cố định — ô có lớp = BLOCK chỉnh đầy đủ, ô trống = + (bấm thêm lớp). Tách (rule-50).
function _renderLayerFrame(
  frame: HTMLElement,
  ctx: APGuiCtx,
  target: MixPaintTarget,
  mix: GroundMixParams,
  cb: { redraw: () => void; commit: () => void }
): void {
  frame.replaceChildren()
  for (let i = 0; i < 4; i++) {
    frame.appendChild(
      i < mix.slots.length ? _mixLayerCell(ctx, target, mix, i, cb) : _mixAddLayerCell(mix, cb)
    )
  }
}

// 1 Ô lớp = block chỉnh ĐẦY ĐỦ (mockup NgQuan 16:23): hàng "Lớp N" + ✕ · texture (palette) · Ngưỡng ·
// Quy luật (mặt đứng). Mỗi ô tự chỉnh lớp của nó — không còn khái niệm "lớp đang chọn".
function _mixLayerCell(
  ctx: APGuiCtx,
  target: MixPaintTarget,
  mix: GroundMixParams,
  i: number,
  cb: { redraw: () => void; commit: () => void }
): HTMLElement {
  const cell = document.createElement('div')
  cell.className = 'ap-mixL-cell'
  const hd = document.createElement('div')
  hd.className = 'ap-mixL-cellhd'
  const lbl = document.createElement('span')
  lbl.className = 'ap-mixE-dlbl'
  lbl.textContent = `Lớp ${i + 1}`
  const del = document.createElement('button')
  del.type = 'button'
  del.className = 'ap-mixL-del'
  del.textContent = '✕'
  del.title = 'Xóa lớp'
  del.addEventListener('click', () => {
    mix.slots.splice(i, 1)
    cb.redraw()
    cb.commit()
  })
  hd.append(lbl, del)
  const bias = sliderRow(
    'Ngưỡng',
    0,
    1,
    0.05,
    mix.slots[i].bias,
    (v, c) => {
      mix.slots[i].bias = v
      ctx.tuneMixLive?.(target) // uniform live — kéo không recompile
      if (c) cb.commit()
    },
    1
  )
  cell.append(hd, mkSlotTexSel(mix, i, cb), bias)
  if (isVerticalMixTarget(target)) cell.appendChild(mkSlotRuleRow(mix.slots[i], cb.commit))
  return cell
}

// Ô trống = + to (bấm = thêm lớp mới, tối đa 4). Tách (rule-50).
function _mixAddLayerCell(
  mix: GroundMixParams,
  cb: { redraw: () => void; commit: () => void }
): HTMLElement {
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'ap-mixL-cell ap-mixL-add'
  card.textContent = '+'
  card.title = 'Thêm lớp mix'
  card.addEventListener('click', () => {
    if (mix.slots.length >= 4) return
    mix.slots.push({ key: 'construction-gravel', bias: 0.55, seed: 13.7 + mix.slots.length * 18 })
    cb.redraw()
    cb.commit()
  })
  return card
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
  ensureMixCss() // 🎨 bảng trộn mix gọn (select/slot/cọ/↺) + khu tab Z tối 1 nấc (scoped .ap-ground-domain)
  const reg: GReg = { tabs: [], mid: new Map(), inst: new Map() }
  let topTabs: Tabs | null = null
  // Chọn tab giữa (add=0 · path=1 · paving=2 · wall=3 · cut=4) + instance Z/P/B/W/C của layer (tách khỏi navTo).
  const MID_TAB = { add: 0, path: 1, paving: 2, wall: 3, cut: 4 } as const
  const selectMidInst = (
    layers: GroundLayer[],
    layer: GroundLayer,
    lv: number,
    op: 'add' | 'cut'
  ): void => {
    const kind = layer.zoneKind ?? 'surface'
    const part = zonePart(op, kind)
    reg.mid.get(lv)?.select(MID_TAB[part.key as keyof typeof MID_TAB] ?? 0, { trusted: false })
    const sibs = layers.filter((l) => (l.level ?? 1) === lv && part.match(l))
    reg.inst.get(`${lv}:${part.key}`)?.select(Math.max(0, sibs.indexOf(layer)), { trusted: false })
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
// Phần riêng ADD-zone (sau Length/Width): Thickness + Drape + section Terrain GÒ-RIÊNG zone. Tách giữ buildZonePane
// ≤50 dòng. Drape structural→rebuild; Terrain reuse buildTerrainControls (live=applySiteLive, refresh=focus zone).
function buildAddZoneExtras(
  pane: HTMLElement,
  ctx: APGuiCtx,
  layer: GroundLayer,
  flatIdx: number,
  rebuild: (focus?: number) => void
): void {
  pane.appendChild(layerSlider(ctx, layer, 'thickness', 'Thickness cm', 1, 10, 0.5, 10))
  // (Drape bám gò ĐÃ DỜI lên hàng đôi cạnh "Mix nền" — buildSurfaceZoneBody, NgQuan 2026-06-11)
  layer.terrain ??= defaultTerrain() // 🏔️ gò riêng zone (đảm bảo field)
  // live = applyTerrainLive (rebuild zone-only geo cell-drop, né water-RTT = tụt fps); buông = applySite clip sạch.
  buildTerrainControls(
    pane,
    ctx,
    layer.terrain,
    () => ctx.applyTerrainLive(),
    () => rebuild(flatIdx),
    false
  )
}

// (zoneKindRow/ZONE_KIND_OPTS đã GỠ — NgQuan 2026-06-10 "path và surface không để select trong zone nữa":
// loại zone chốt LÚC TẠO theo tab giữa [Mảng add | Path đá | Khoét cut], pane hết dropdown Type.)

// 🪨 Form khung path: Chữ nhật | Tròn (= ellipse nội tiếp). DÙNG CHUNG GroundLayer.shape (chỉ rect|circle cho path).
const PATH_FORM_OPTS: [string, 'rect' | 'circle'][] = [
  ['Chữ nhật', 'rect'],
  ['Tròn', 'circle'],
]
function pathFormRow(ctx: APGuiCtx, layer: GroundLayer): HTMLElement {
  const cur = layer.shape === 'circle' ? 'circle' : 'rect'
  return selectRow('Form', PATH_FORM_OPTS, cur, (v) => ((layer.shape = v), ctx.applySite(true)))
}

// 🪨 Slider STRUCTURAL rải đá path-zone (tuple [label,min,max,step,mmFactor,get,set]) — KÉO = applyZonesLive
// (rebuild zone-only, NÉ water-RTT = tụt fps) / buông = applySite. KHÔNG gồm Rotate (live transform riêng). Data-driven.
type PathSlider = [string, number, number, number, number, () => number, (v: number) => void]
function pathSliderSpecs(p: StonePathParams): PathSlider[] {
  return [
    ['R min', 0.05, 2, 0.01, 1000, () => p.rMin / 1000, (v) => (p.rMin = Math.round(v * 1000))],
    ['R max', 0.05, 2, 0.01, 1000, () => p.rMax / 1000, (v) => (p.rMax = Math.round(v * 1000))],
    ['Ellipse', 0.1, 1, 0.05, 100, () => p.ellipseMin, (v) => (p.ellipseMin = v)],
    ['Gap', 0, 1, 0.01, 1000, () => p.gap / 1000, (v) => (p.gap = Math.round(v * 1000))],
    [
      'Thick',
      0.01,
      0.3,
      0.01,
      1000,
      () => p.thickness / 1000,
      (v) => (p.thickness = Math.round(v * 1000)),
    ],
    ['Seed', 0, 999, 1, 1, () => p.seed, (v) => (p.seed = Math.round(v))],
  ]
}

// 🪨🧱 Hàng XOAY khung (path + paving dùng chung — chỉ cần field rot): kéo = tunePathRotLive (CHỈ set
// mesh.rotation.y — 0 rebuild, né water-RTT) / buông = applySite.
function pathRotRow(ctx: APGuiCtx, p: { rot: number }, flatIdx: number): HTMLElement {
  return sliderRow(
    'Rotate°',
    -180,
    180,
    1,
    p.rot,
    (v, c) => (
      (p.rot = Math.round(v)),
      c ? ctx.applySite(true) : ctx.tunePathRotLive(flatIdx, p.rot)
    ),
    1
  )
}

// 🪨 Thân pane PATH-zone: Form (rect/tròn) + Frame W/D + slider đá + Rotate (live) + Material + Color. Slider
// structural KÉO = applyZonesLive (né water-RTT); buông = applySite. flatIdx cho xoay live nhắm đúng mesh.
function buildPathZoneBody(
  pane: HTMLElement,
  ctx: APGuiCtx,
  layer: GroundLayer,
  flatIdx: number
): void {
  const p = (layer.path ??= makeStonePathParams())
  pane.appendChild(pathFormRow(ctx, layer)) // Chữ nhật | Tròn
  pane.appendChild(layerSlider(ctx, layer, 'length', 'Frame W m', 0.5, 40, 0.1, 1000))
  pane.appendChild(layerSlider(ctx, layer, 'width', 'Frame D m', 0.5, 40, 0.1, 1000))
  // 🏔️ Bám gò: dùng chung layer.drape — drape zone ngoài zoneRects → gò giữ nhấp nhô → đá theo cao-độ (heightAt).
  pane.appendChild(
    toggleRow('Bám gò', layer.drape ?? false, (on) => ((layer.drape = on), ctx.applySite(true)))
  )
  for (const [label, min, max, step, mf, get, set] of pathSliderSpecs(p))
    pane.appendChild(
      sliderRow(
        label,
        min,
        max,
        step,
        get(),
        (v, c) => (set(v), c ? ctx.applySite(true) : ctx.applyZonesLive()),
        mf
      )
    )
  pane.appendChild(pathRotRow(ctx, p, flatIdx)) // 🪨 xoay LIVE (transform, né rebuild)
  pane.appendChild(
    selectRow(
      'Material',
      STONE_MAT_OPTS,
      p.material,
      (v) => ((p.material = v), ctx.applySite(true))
    )
  )
  pane.appendChild(
    colorRow(
      'Color',
      p.color,
      (hex, c) => ((p.color = hex), c ? ctx.applySite(true) : ctx.applyZonesLive())
    )
  )
}

// 🧱 Slider STRUCTURAL sân gạch paving-zone (cùng tuple PathSlider) — KÉO = applyZonesLive / buông = applySite.
// Viên mm; Bond/Decay 0..1. KHÔNG gồm Rotate (live transform riêng — pathRotRow dùng chung).
function pavingSliderSpecs(p: PavingParams): PathSlider[] {
  return [
    [
      'Viên L',
      0.05,
      0.5,
      0.005,
      1000,
      () => p.brickL / 1000,
      (v) => (p.brickL = Math.round(v * 1000)),
    ],
    [
      'Viên W',
      0.05,
      0.5,
      0.005,
      1000,
      () => p.brickW / 1000,
      (v) => (p.brickW = Math.round(v * 1000)),
    ],
    [
      'Dày',
      0.02,
      0.15,
      0.005,
      1000,
      () => p.brickH / 1000,
      (v) => (p.brickH = Math.round(v * 1000)),
    ],
    [
      'Khe',
      0.002,
      0.05,
      0.001,
      1000,
      () => p.joint / 1000,
      (v) => (p.joint = Math.round(v * 1000)),
    ],
    ['Bond (so le)', 0, 0.5, 0.05, 100, () => p.bond, (v) => (p.bond = v)],
    ['Decay (cũ)', 0, 1, 0.05, 100, () => p.decay, (v) => (p.decay = v)],
    ['Seed', 0, 999, 1, 1, () => p.seed, (v) => (p.seed = Math.round(v))],
  ]
}

// 🧱 Thân pane PAVING-zone (Sân gạch — consumer op #3 BrickPaving): Frame W/D + viên/khe/bond/decay/seed +
// Rotate live + Material + Color. Sân PHẲNG v1 (không Bám gò — khác path). Mirror buildPathZoneBody.
function buildPavingZoneBody(
  pane: HTMLElement,
  ctx: APGuiCtx,
  layer: GroundLayer,
  flatIdx: number
): void {
  const p = (layer.paving ??= makePavingParams())
  pane.appendChild(layerSlider(ctx, layer, 'length', 'Frame W m', 0.5, 40, 0.1, 1000))
  pane.appendChild(layerSlider(ctx, layer, 'width', 'Frame D m', 0.5, 40, 0.1, 1000))
  for (const [label, min, max, step, mf, get, set] of pavingSliderSpecs(p))
    pane.appendChild(
      sliderRow(
        label,
        min,
        max,
        step,
        get(),
        (v, c) => (set(v), c ? ctx.applySite(true) : ctx.applyZonesLive()),
        mf
      )
    )
  pane.appendChild(pathRotRow(ctx, p, flatIdx)) // 🧱 xoay LIVE (transform, né rebuild — dùng chung path)
  pane.appendChild(
    selectRow(
      'Material',
      STONE_MAT_OPTS,
      p.material,
      (v) => ((p.material = v), ctx.applySite(true))
    )
  )
  pane.appendChild(
    colorRow(
      'Color',
      p.color,
      (hex, c) => ((p.color = hex), c ? ctx.applySite(true) : ctx.applyZonesLive())
    )
  )
}

// 🧱 Slider STRUCTURAL tường cong wall-zone (cùng tuple PathSlider) — KÉO = applyZonesLive / buông = applySite.
// R/Cao/Dày/Viên theo m hiển thị (state mm); Góc quét độ; Decay 0..1. Rotate riêng (pathRotRow dùng chung).
function wallSliderSpecs(p: WallCurveParams): PathSlider[] {
  return [
    ['R cung', 0.3, 20, 0.1, 1000, () => p.radius / 1000, (v) => (p.radius = Math.round(v * 1000))],
    ['Góc quét°', 10, 360, 5, 1, () => p.sweep, (v) => (p.sweep = Math.round(v))],
    ['Cao', 0.1, 3, 0.05, 1000, () => p.height / 1000, (v) => (p.height = Math.round(v * 1000))],
    [
      'Dày',
      0.04,
      0.4,
      0.01,
      1000,
      () => p.thickness / 1000,
      (v) => (p.thickness = Math.round(v * 1000)),
    ],
    [
      'Viên L',
      0.05,
      0.5,
      0.005,
      1000,
      () => p.brickL / 1000,
      (v) => (p.brickL = Math.round(v * 1000)),
    ],
    [
      'Viên H',
      0.02,
      0.2,
      0.005,
      1000,
      () => p.brickH / 1000,
      (v) => (p.brickH = Math.round(v * 1000)),
    ],
    [
      'Khe',
      0.002,
      0.05,
      0.001,
      1000,
      () => p.joint / 1000,
      (v) => (p.joint = Math.round(v * 1000)),
    ],
    ['Decay (cũ)', 0, 1, 0.05, 100, () => p.decay, (v) => (p.decay = v)],
    ['Seed', 0, 999, 1, 1, () => p.seed, (v) => (p.seed = Math.round(v))],
  ]
}

// 🧱 Thân pane WALL-zone (Tường cong — CurvedBrickWall, op #1+#2+#3+#5): R/Góc quét/Cao/Dày + viên/khe/
// decay/seed + Rotate live + Material + Color. TÂM cung = Pos X/Z (phần chung buildZonePane); KHÔNG có
// Frame W/D (length/width zone không dùng cho cung). Mirror buildPathZoneBody.
function buildWallZoneBody(
  pane: HTMLElement,
  ctx: APGuiCtx,
  layer: GroundLayer,
  flatIdx: number
): void {
  const p = (layer.wall ??= makeWallCurveParams())
  for (const [label, min, max, step, mf, get, set] of wallSliderSpecs(p))
    pane.appendChild(
      sliderRow(
        label,
        min,
        max,
        step,
        get(),
        (v, c) => (set(v), c ? ctx.applySite(true) : ctx.applyZonesLive()),
        mf
      )
    )
  pane.appendChild(pathRotRow(ctx, p, flatIdx)) // 🧱 xoay cung LIVE (transform — dùng chung path/paving)
  pane.appendChild(
    selectRow(
      'Material',
      STONE_MAT_OPTS,
      p.material,
      (v) => ((p.material = v), ctx.applySite(true))
    )
  )
  pane.appendChild(
    colorRow(
      'Color',
      p.color,
      (hex, c) => ((p.color = hex), c ? ctx.applySite(true) : ctx.applyZonesLive())
    )
  )
}

// 🎨 Danh mục texture cho MIX (chỉ key TEXTURE — màu phẳng soil/gravel không mix được).
const MIX_TEX_OPTS = GROUND_OPTS.filter(([, k]) => isGroundTexKey(k))

const DEL_SLOT = '__del' // option sentinel: chọn = xóa lớp (gộp nút ✕ cũ vào dropdown cho hàng gọn)

// 🧱 Target mix nằm trên MẶT ĐỨNG (vách hồ / tường rào)? → slot có select Quy luật trọng lực + slider Trọng lực.
function isVerticalMixTarget(t: MixPaintTarget): boolean {
  if (typeof t === 'string') return false
  return 'fence' in t || 'wallMix' in t || ('water' in t && t.face === 'wall') // wallMix = tường building…
}

// 🧱 Quy luật trọng lực per-slot (tường rêu phong — kiểu Substance generators). '' = none.
const MIX_RULE_OPTS: [string, '' | 'foot' | 'streak' | 'moss'][] = [
  ['— (loang đều)', ''],
  ['Chân bùn (bám thấp)', 'foot'],
  ['Vệt chảy dọc', 'streak'],
  ['Rêu ẩm (chân)', 'moss'],
]

// 🎨 pick đổi key slot HOẶC xóa lớp (sentinel '__del' — hàng danger cuối palette thay nút ✕ cũ).
// commit = applySite (site) HOẶC ctx.build (tường building) — board dùng được cả 2 hệ.
function onSlotSel(
  mix: GroundMixParams,
  i: number,
  v: string,
  redraw: () => void,
  commit: () => void
): void {
  if (v === DEL_SLOT) {
    mix.slots.splice(i, 1)
    redraw()
    commit()
    return
  }
  mix.slots[i].key = v as GroundMaterialKey
  commit() // _groundMixFor tự load lazy ĐÚNG key thiếu — không prefetch cả kho (lag palette)
}

// 🎨 1 SLOT lớp mix (NgQuan 2026-06-11 "bỏ button cọ + ✕"): tag số (click → chọn slot vẽ) + select texture
// (kèm option ✕ Xóa lớp) + Ngưỡng. KHÔNG còn 🖌/✕ riêng. active=slot đang chọn (viền trái accent). Click cả
// box = chọn slot (vẽ qua 🖌 chung hàng cọ); click select/slider stopPropagation (không nhảy chọn lại).
function mkMixSlotRow(
  ctx: APGuiCtx,
  target: MixPaintTarget,
  mix: GroundMixParams,
  i: number,
  active: boolean,
  cb: { redraw: () => void; onPick: () => void; commit: () => void }
): HTMLElement {
  const slot = mix.slots[i]
  const box = document.createElement('div')
  box.className = active ? 'ap-mix-layer ap-mix-active' : 'ap-mix-layer'
  box.addEventListener('click', cb.onPick)
  const head = document.createElement('div')
  head.className = 'ap-mix-row'
  const tag = document.createElement('span')
  tag.className = 'ap-mix-tag'
  tag.textContent = String(i + 1)
  tag.title = 'Chọn lớp này để vẽ mask (🖌 ở dưới)'
  const paint = ctx.getMixPaint?.()
  if (paint && sameMixTarget(paint.target, target) && paint.slot === i)
    tag.classList.add('ap-mix-brush-on')
  head.append(tag, mkSlotTexSel(mix, i, cb))
  const sl = sliderRow(
    'Ngưỡng',
    0,
    1,
    0.05,
    slot.bias,
    (v, c) => {
      slot.bias = v
      ctx.tuneMixLive?.(target) // 🖌 stage 3: bias = uniform → kéo LIVE không recompile
      if (c) cb.commit()
    },
    1
  )
  sl.addEventListener('click', (e) => e.stopPropagation())
  box.append(head, sl)
  if (isVerticalMixTarget(target)) box.appendChild(mkSlotRuleRow(mix.slots[i], cb.commit))
  return box
}

// 🎨 Control chọn texture 1 slot: palette swatch (nhóm kho) + hàng danger '✕ Xóa lớp' (sentinel).
// stopPropagation — click palette không nhảy chọn slot. Tách khỏi mkMixSlotRow (rule-50).
function mkSlotTexSel(
  mix: GroundMixParams,
  i: number,
  cb: { redraw: () => void; commit: () => void }
): HTMLElement {
  const sel = texPaletteRow<GroundMaterialKey | typeof DEL_SLOT>(
    '',
    MIX_TEX_OPTS,
    mix.slots[i].key,
    (v) => onSlotSel(mix, i, v, cb.redraw, cb.commit),
    { groups: GROUND_TEX_GROUPS, danger: ['✕ Xóa lớp', DEL_SLOT] }
  )
  sel.style.flex = '1'
  sel.style.minWidth = '0'
  sel.style.marginBottom = '0'
  sel.addEventListener('click', (e) => e.stopPropagation())
  return sel
}

// 🧱 Hàng "Quy luật" 1 slot (CHỈ mặt đứng — vách hồ/tường rào/tường building): rule bake vào graph →
// đổi = commit (structural như đổi texture). Cường độ chỉnh ở slider "Trọng lực" của board.
function mkSlotRuleRow(slot: GroundMixParams['slots'][number], commit: () => void): HTMLElement {
  const rr = selectRow('Quy luật', MIX_RULE_OPTS, slot.rule ?? '', (v) => {
    slot.rule = v === '' ? undefined : v
    commit()
  })
  rr.addEventListener('click', (e) => e.stopPropagation())
  return rr
}

// 🖌 Hàng cọ chung: nút 🖌 BẬT/TẮT vẽ (lớp đang chọn) + Cỡ cọ + (Tẩy ‖ ↺ reset confirm cùng hàng). Trả
// { rows, sync } — sync = cập nhật on-state nút 🖌 khi mode tắt từ ngoài (Move/Pick) hoặc redraw slot list.
function mkMixBrushRows(
  ctx: APGuiCtx,
  target: MixPaintTarget,
  getSlot: () => number
): { rows: HTMLElement[]; sync: () => void } {
  const br = ctx.getMixBrush?.() ?? { size: 0.6, erase: false } // mở lại board hiện đúng số đang dùng
  const brushRow = document.createElement('div')
  brushRow.className = 'ap-mix-brushrow'
  const brush = document.createElement('button')
  brush.className = 'ap-mix-brushtoggle'
  brush.textContent = '🖌 Vẽ lớp đang chọn'
  brush.title = 'Bật/tắt vẽ mask cho lớp đang chọn (kéo chuột trên mặt 3D — orbit tạm khóa)'
  const sync = (): void => {
    brush.classList.toggle('ap-mix-brush-on', sameMixTarget(ctx.getMixPaint?.()?.target, target))
  }
  brush.addEventListener('click', () => {
    const on = sameMixTarget(ctx.getMixPaint?.()?.target, target)
    ctx.setMixPaint?.(on ? null : target, getSlot())
    sync()
  })
  brushRow.appendChild(brush)
  const size = sliderRow(
    'Cỡ cọ m',
    0.1,
    3,
    0.05,
    br.size,
    (v) => {
      br.size = v
      ctx.setMixBrush?.(br.size, br.erase)
    },
    1
  )
  const erase = toggleRow('Tẩy', br.erase, (on) => {
    br.erase = on
    ctx.setMixBrush?.(br.size, br.erase)
  })
  const reset = document.createElement('button')
  reset.className = 'ap-mix-reset'
  reset.textContent = '↺'
  reset.title = 'Xóa toàn bộ nét cọ của lớp đang chọn (mask fbm giữ nguyên)'
  reset.addEventListener('click', () =>
    confirmPopup(reset, 'Xóa nét cọ lớp đang chọn?', () => ctx.clearMixPaint?.(target, getSlot()))
  )
  erase.appendChild(reset) // ↺ ngang hàng ô Tẩy (margin-left:auto đẩy cuối)
  return { rows: [brushRow, size, erase], sync }
}

// 6 slider chung của board (height-lerp/biên/scale/macro/úa/xa) — uniform LIVE (tuneMixLive). Tách hàm giữ
// buildMixBoard gọn (rule-50). Mỗi slider kéo = live, buông = applySite commit autosave.
// 🧱 Mặt đứng: +slider "Trọng lực" (cường độ rule foot/streak/moss per-slot — cũng uniform live).
function mkMixSliders(
  ctx: APGuiCtx,
  target: MixPaintTarget,
  mix: GroundMixParams,
  commit: () => void
): HTMLElement[] {
  const us: [string, number, number, number, keyof GroundMixParams][] = [
    ['Theo cao độ', 0, 0.8, 0.05, 'heightK'], // height-lerp proxy — 0 = fade đều
    ['Mềm biên', 0.01, 0.5, 0.01, 'maskSoft'],
    ['Scale mask', 0.05, 3, 0.05, 'maskScale'], // 1/m world
    ['Macro', 0, 1, 0.05, 'macro'],
    ['Loang úa', 0, 1, 0.05, 'tint'],
    ['Trộn xa', 0, 1, 0.05, 'farOn'],
  ]
  if (isVerticalMixTarget(target)) us.push(['Trọng lực', 0, 1, 0.05, 'gravity'])
  return us.map(([label, min, mx, step, key]) =>
    sliderRow(
      label,
      min,
      mx,
      step,
      mix[key] as number,
      (v, c) => {
        ;(mix[key] as number) = v
        ctx.tuneMixLive?.(target) // 🖌 stage 3: uniform live — kéo mượt không rebuild
        if (c) commit()
      },
      1
    )
  )
}

// 🎨 BẢNG TRỘN MIX per-target (PhotoGroundMix — zone Z1+ · 'base' · đáy/vách hồ · tường rào · tường building):
// Nền chính + ≤4 slot (block tách) + hàng cọ (🖌 chung) + 6 slider chung. activeSlot = slot đang chọn (GUI-only,
// closure sống qua redraw); 🖌 vẽ slot đó. Stage 3: mọi slider = uniform LIVE (tuneMixLive), buông commit.
// paintable=false (mapping 'wall' không cọ vẽ) → ẨN hàng cọ. commit default = applySite (site-kit);
// tường BUILDING bơm ctx.build (history+persist hệ nhà). Gắn class ap-mix-host (CSS theo board, mọi panel).
// EXPORT cho mix/PresetPanel (editor preset — commit = save localStorage, KHÔNG đụng scene).
export function buildMixBoard(
  pane: HTMLElement,
  ctx: APGuiCtx,
  target: MixPaintTarget,
  mix: GroundMixParams,
  paintable = true,
  commit: () => void = () => ctx.applySite(true)
): void {
  ensureMixCss() // board sống được NGOÀI site panel (lil-gui building / khay preset) — tự đảm bảo style
  pane.classList.add('ap-mix-host') // CSS mix scoped theo host (board sống cả ngoài site panel)
  let active = 0
  let syncBrush = (): void => {}
  const list = document.createElement('div')
  list.className = 'ap-mix-slots' // block tách bạch với 6 slider chung bên dưới
  const pick = (i: number): void => {
    active = i
    if (sameMixTarget(ctx.getMixPaint?.()?.target, target)) ctx.setMixPaint?.(target, i) // đang vẽ → chuyển slot
    redraw()
  }
  const addBtn = addInstanceButton('lớp mix', () => {
    mix.slots.push({ key: 'construction-gravel', bias: 0.55, seed: 13.7 + mix.slots.length * 18 })
    redraw()
    commit()
  })
  function redraw(): void {
    if (active >= mix.slots.length) active = Math.max(0, mix.slots.length - 1)
    list.replaceChildren(
      ...mix.slots.map((_, i) =>
        mkMixSlotRow(ctx, target, mix, i, i === active, { redraw, onPick: () => pick(i), commit })
      )
    )
    addBtn.disabled = mix.slots.length >= 4
    syncBrush()
  }
  ctx.registerMixPaintSync?.(redraw) // 🖌 mode vẽ tắt từ ngoài (Move/Pick) → bỏ highlight tag + nút 🖌
  pane.appendChild(mkMixBaseRow(mix, commit))
  redraw()
  const brushRows: HTMLElement[] = []
  if (paintable) {
    const brush = mkMixBrushRows(ctx, target, () => active)
    syncBrush = brush.sync
    brushRows.push(...brush.rows)
  }
  pane.append(list, addBtn, ...brushRows, ...mkMixSliders(ctx, target, mix, commit))
}

// 🎨 Hàng "Nền chính" board mix (palette swatch theo nhóm kho). KHÔNG prefetch cả kho khi mở palette
// (9 bộ × 4 map 2K decode = đứng hình) — _groundMixFor load lazy đúng key. Tách khỏi buildMixBoard (rule-50).
function mkMixBaseRow(mix: GroundMixParams, commit: () => void): HTMLElement {
  return texPaletteRow(
    'Nền chính',
    MIX_TEX_OPTS,
    mix.base,
    (v) => {
      mix.base = v
      commit()
    },
    { groups: GROUND_TEX_GROUPS }
  )
}

// (mkMixSection — toggle + board inline per-panel — ĐÃ XÓA 2026-06-11: mọi thao tác mix per-đối-tượng
// chuyển về khay 🧪: 🪣 áp · 🧽 gỡ · 🎯 chỉnh/cọ vẽ. buildMixBoard GIỮ — khay tái dùng làm editor.)

// 🟫 Thân pane SURFACE-zone: status mix (nếu phủ) + Drape + select texture đơn,
// + form + Length/Width + Thickness/Terrain (buildAddZoneExtras).
function buildSurfaceZoneBody(
  pane: HTMLElement,
  ctx: APGuiCtx,
  layer: GroundLayer,
  flatIdx: number,
  rebuild: (focus?: number) => void
): void {
  // 🎨 Mix board inline ĐÃ THÁO (mixStatusRow) — áp/gỡ/chỉnh qua khay 🧪. Drape giữ tại chỗ.
  if (layer.mix) pane.appendChild(mixStatusRow())
  pane.appendChild(
    toggleRow('Drape (bám gò)', layer.drape ?? false, (on) => {
      layer.drape = on
      ctx.applySite(true)
    })
  )
  pane.appendChild(
    texPaletteRow(
      'Surface',
      GROUND_OPTS,
      layer.material,
      (v) => {
        layer.material = v
        ctx.applySite(true)
      },
      { groups: GROUND_TEX_GROUPS, onOpen: () => ctx.prefetchGroundTextures?.() }
    )
  )
  pane.appendChild(groundFormRow(ctx, layer)) // circle=đường kính, ellipse=trục X
  pane.appendChild(layerSlider(ctx, layer, 'length', 'Length m', 0.5, 40, 0.1, 1000))
  pane.appendChild(layerSlider(ctx, layer, 'width', 'Width m', 0.5, 40, 0.1, 1000))
  buildAddZoneExtras(pane, ctx, layer, flatIdx, rebuild)
}

function buildZonePane(
  ctx: APGuiCtx,
  layer: GroundLayer,
  flatIdx: number,
  op: 'add' | 'cut',
  rebuild: (focus?: number) => void
): HTMLElement {
  const pane = document.createElement('div')
  if (op === 'add') {
    // loại zone CỐ ĐỊNH theo tab giữa (Mảng add=surface · Path đá · Sân gạch · Tường cong) — hết dropdown
    if (layer.zoneKind === 'path') buildPathZoneBody(pane, ctx, layer, flatIdx)
    else if (layer.zoneKind === 'paving') buildPavingZoneBody(pane, ctx, layer, flatIdx)
    else if (layer.zoneKind === 'wall') buildWallZoneBody(pane, ctx, layer, flatIdx)
    else buildSurfaceZoneBody(pane, ctx, layer, flatIdx, rebuild)
  } else {
    pane.appendChild(groundFormRow(ctx, layer)) // cut: chỉ hình + vị trí (không vật liệu/dày)
    pane.appendChild(layerSlider(ctx, layer, 'length', 'Length m', 0.5, 40, 0.1, 1000))
    pane.appendChild(layerSlider(ctx, layer, 'width', 'Width m', 0.5, 40, 0.1, 1000))
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

// Phân hoạch instance theo tab giữa (NgQuan 2026-06-10 — Path RỜI zone): cut → C/`lv:cut` ·
// add-surface → Z/`lv:add` · add-path → P/`lv:path` · add-paving → B/`lv:paving` (🧱 sân gạch) ·
// add-wall → W/`lv:wall` (🧱 tường cong). match KHÔNG xét level (caller lọc level riêng).
type ZoneKindUI = 'surface' | 'path' | 'paving' | 'wall'
const ZONE_PRE: Record<ZoneKindUI, string> = { surface: 'Z', path: 'P', paving: 'B', wall: 'W' }
function zonePart(
  op: 'add' | 'cut',
  kind: ZoneKindUI
): { pre: string; key: string; match: (l: GroundLayer) => boolean } {
  if (op === 'cut') return { pre: 'C', key: 'cut', match: (l) => (l.op ?? 'add') === 'cut' }
  return {
    pre: ZONE_PRE[kind],
    key: kind === 'surface' ? 'add' : kind,
    match: (l) => (l.op ?? 'add') === 'add' && (l.zoneKind ?? 'surface') === kind,
  }
}

// Tabs instance 1 ngăn (level, op, kind): Z1|Z2|＋ (surface) · P1|＋ (path) · C1|＋ (cut). flatIdx = vị trí
// trong site.groundLayers (splice/groundLayerIdx). ＋ → push layer mới ĐÚNG LOẠI (kind chốt lúc tạo — pane
// hết dropdown Type) + focus nó. reg.inst[lv:key]=Tabs.
function buildInstanceTabs(
  ctx: APGuiCtx,
  lv: number,
  op: 'add' | 'cut',
  kind: ZoneKindUI,
  rebuild: (focusLayer?: number) => void,
  reg: GReg
): HTMLElement {
  const part = zonePart(op, kind)
  const host = document.createElement('div')
  if (op === 'add') host.classList.add('ap-zone-itabs') // 🎨 khu tab Z/P/B/W tối 1 nấc (cut giữ xám ap-cut-pane)
  const layers = ctx.site.groundLayers ?? []
  const items: TabItem[] = []
  const flatIdxs: number[] = [] // tab-index → flatIdx (site.groundLayers) cho onChange → setActiveGroundLayer
  layers.forEach((layer, idx) => {
    if ((layer.level ?? 1) !== lv || !part.match(layer)) return
    const n = items.length + 1
    const pane = buildZonePane(ctx, layer, idx, op, rebuild)
    host.appendChild(pane)
    items.push({ label: `${part.pre}${n}`, panel: pane, title: `${part.key} ${n}` })
    flatIdxs.push(idx)
  })
  const addBtn = addInstanceButton(part.key === 'add' ? 'zone' : part.key, () => {
    const nl = makeGroundLayer({
      level: lv,
      op,
      offsetX: nextZoneOffset(layers, lv, op),
      length: NEW_ZONE_SIZE,
      width: NEW_ZONE_SIZE,
    })
    if (op === 'add') nl.zoneKind = kind // loại chốt LÚC TẠO theo ngăn
    if (op === 'add' && kind === 'path') nl.path = makeStonePathParams()
    if (op === 'add' && kind === 'paving') nl.paving = makePavingParams() // 🧱 sân gạch
    if (op === 'add' && kind === 'wall') nl.wall = makeWallCurveParams() // 🧱 tường cong
    layers.push(nl)
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
  reg.inst.set(`${lv}:${part.key}`, tabs) // navigate → instance (key: add | path | cut)
  return host
}

// Pane 1 G-level = [Mảng add | Path đá | Sân gạch | Tường cong | Khoét cut] (5 tab — Path RỜI zone
// 2026-06-10, 🧱 Sân gạch + Tường cong consumer mạch tường gạch cùng ngày), mỗi tab = instance tabs riêng
// (Z/P/B/W/C). MỌI level (kể cả G1) đều có cut (cut khoét zones CÙNG level → G1 cut lộ G0).
// reg.mid[lv]=Tabs giữa cho navigate (add=0·path=1·paving=2·wall=3·cut=4).
function buildLevelPane(
  ctx: APGuiCtx,
  lv: number,
  rebuild: (focusLayer?: number) => void,
  reg: GReg
): HTMLElement {
  const host = document.createElement('div')
  const addPane = buildInstanceTabs(ctx, lv, 'add', 'surface', rebuild, reg)
  const pathPane = buildInstanceTabs(ctx, lv, 'add', 'path', rebuild, reg)
  const pavingPane = buildInstanceTabs(ctx, lv, 'add', 'paving', rebuild, reg) // 🧱
  const wallPane = buildInstanceTabs(ctx, lv, 'add', 'wall', rebuild, reg) // 🧱 tường cong
  const cutPane = buildInstanceTabs(ctx, lv, 'cut', 'surface', rebuild, reg)
  cutPane.classList.add('ap-cut-pane') // tô xám nội dung tab Khoét (C-tabs + zone panes)
  host.append(addPane, pathPane, pavingPane, wallPane, cutPane)
  const items: TabItem[] = [
    { label: 'Mảng add', panel: addPane, title: 'Mảng phủ material' },
    { label: 'Path đá', panel: pathPane, title: 'Đường đá rải StoneScatter' },
    {
      label: 'Sân gạch',
      panel: pavingPane,
      title: 'Sân gạch bond đều BrickPaving (op #3) + decay',
    },
    {
      label: 'Tường cong',
      panel: wallPane,
      title: 'Tường gạch cong CurvedBrickWall (op #1+#2+#3) + decay',
    },
    { label: 'Khoét cut', panel: cutPane, title: 'Khoét lộ level dưới' },
  ]
  const tabs = new Tabs(host, items, { classes: GROUND_TAB_CLASSES, injectCss: false })
  ;(tabs.getTablist().children[4] as HTMLElement | undefined)?.classList.add('ap-cut-tabbtn') // nút "Khoét cut" → xám
  reg.tabs.push(tabs)
  reg.mid.set(lv, tabs) // navigate → tab giữa
  host.appendChild(removeGLevelRow(ctx, lv, rebuild)) // ✕ xoá CẢ G-level (dưới hàng tab giữa)
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
// ≥2 lựa chọn → palette swatch (2 cát Thái gần màu — thumb phân biệt bằng mắt); 1 mục (edge) → select cũ.
type MatKey = 'floorMaterial' | 'wallMaterial' | 'edgeMaterial'
function materialRow(
  host: HTMLElement,
  ctx: APGuiCtx,
  w: WaterConfig,
  label: string,
  key: MatKey,
  opts: [string, WaterMaterialKey][] = MATERIAL_OPTS
): void {
  const set = (v: WaterMaterialKey): void => {
    w[key] = v
    ctx.applySite(true)
  }
  host.appendChild(
    opts.length > 1 ? texPaletteRow(label, opts, w[key], set) : selectRow(label, opts, w[key], set)
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
  // 🪨 2 slider riêng ĐÁ CUỘI (shape cong; rect = rào gỗ không áp): to-nhỏ xen kẽ + góc cạnh
  if (w.shape !== 'rect') for (const el of stoneJitterRows(ctx, w)) host.appendChild(el)
}

// Đá cuội viền hồ: Đá to-nhỏ (bán kính lệch ±45%×v, bước xếp tự giãn theo viên) + Đá góc cạnh (đỉnh lệch
// bán kính từ tâm — hết "tròn quá"). Commit-only như Border H — né reflector thrash lúc kéo.
function stoneJitterRows(ctx: APGuiCtx, w: WaterConfig): HTMLElement[] {
  return [
    sliderRow(
      'Đá to-nhỏ %',
      0,
      100,
      5,
      w.borderStoneVar,
      (v, c) => {
        w.borderStoneVar = Math.round(v)
        if (c) ctx.applySite(true)
      },
      1
    ),
    sliderRow(
      'Đá góc cạnh %',
      0,
      100,
      5,
      w.borderStoneJag,
      (v, c) => {
        w.borderStoneJag = Math.round(v)
        if (c) ctx.applySite(true)
      },
      1
    ),
  ]
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

// 💧 PERF: tắt riêng mặt nước (giữ hồ) → mesh ẩn = reflector ngừng render RTT (đỡ 1 lần render scene/frame
// MỖI hồ). LIVE thuần visible — 0 rebuild; bật lại = frame đầu compile shader + cấp RTT (khựng nhẹ 1 lần).
function surfaceOnRow(ctx: APGuiCtx, w: WaterConfig): HTMLElement {
  return toggleRow('💧 Mặt nước (tắt đỡ lag)', w.surfaceOn, (on) => {
    w.surfaceOn = on
    ctx.tuneWater(w, (s) => (s.getMesh().visible = on), true)
  })
}

// BẬC 4 "Surface" (mặt hồ): màu nước + gương/sóng/rung/đục — uniform LIVE qua tuneWater(w,…), KHÔNG dựng lại.
function buildSurfaceTab(host: HTMLElement, ctx: APGuiCtx, w: WaterConfig): void {
  host.append(
    surfaceOnRow(ctx, w),
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
  host.appendChild(waveSizeRow(ctx, w))
}
type SurfKey = 'reflectivity' | 'flow' | 'distortion' | 'detail' | 'refract' | 'tint'

// Wave size — RAW (không phải %). ĐẢO rippleScale: v≤12 = 13−v NHƯ CŨ (state cũ hiển thị đúng chỗ);
// v>12 = 1/(v−11) → rs PHÂN SỐ (0.5→~0.077, chu kỳ sóng tới ~13m) — NgQuan 2026-06-10 "tăng lên 24".
// Tách khỏi buildSurfaceTab (Rule-50 — thêm row 💧 Mặt nước đẩy hàm quá 50 dòng).
function waveSizeRow(ctx: APGuiCtx, w: WaterConfig): HTMLElement {
  return sliderRow(
    'Wave size',
    1,
    24,
    0.5,
    w.rippleScale >= 1 ? 13 - w.rippleScale : 11 + 1 / w.rippleScale,
    (v, c) => {
      const rs = v <= 12 ? 13 - v : 1 / (v - 11) // size→rippleScale (cao=to → freq thấp)
      w.rippleScale = rs
      ctx.tuneWater(w, (s) => s.setRippleScale(rs), c)
    },
    1
  )
}

// BẬC 4 "Bottom" (đáy hồ) → BẬC 5: Floor (đáy: màu + chất liệu) | Walls (tường: độ sâu + chất liệu). Trả
// Tabs (Floor|Walls) cho caller dispose. Floor/wall = 2 mesh RIÊNG → material độc lập (None | Caro tile).
// "Floor color" = màu nền (mat None) ĐỒNG THỜI màu GỐC dẫn xuất caro (mat tile) → đổi màu áp cả 2.
// BẬC 5 "Floor" (đáy hồ): màu + chất liệu + 2 màu caro + mix. Tách khỏi buildBottomTab (Rule-50).
function mkBottomFloorPane(ctx: APGuiCtx, w: WaterConfig): HTMLElement {
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
  // 🎨 Mix đáy hồ (floorMix): board inline ĐÃ THÁO — áp/gỡ/chỉnh+cọ vẽ qua khay 🧪 (🪣/🧽/🎯).
  if (w.floorMix) floor.appendChild(mixStatusRow())
  // 🏔️ GÒ ĐÁY HỒ — CHỈ pond (hồ thiên nhiên). Pool = hồ bơi sạch, đáy PHẲNG (NgQuan 2026-06-13 tách 3 loại
  // nước). Reuse TerrainConfig + buildTerrainControls (y hệt gò nền sân vườn): đáy basin grid hóa + nhô gò (FBM).
  // Live = applyPoolFloorLive(w) SWAP geometry đáy (KHÔNG rebuild site/water-RTT → né tụt fps). Buông → applySite.
  if (w.kind === 'pond') {
    w.floorTerrain ??= defaultTerrain() // ensure tồn tại (save cũ undefined tới khi mở tab)
    buildTerrainControls(
      floor,
      ctx,
      w.floorTerrain,
      () => ctx.applyPoolFloorLive(w),
      () => undefined,
      false
    )
  }
  return floor
}

function buildBottomTab(host: HTMLElement, ctx: APGuiCtx, w: WaterConfig): Tabs {
  const floor = mkBottomFloorPane(ctx, w)
  const walls = document.createElement('div')
  waterSlider(walls, ctx, w, 'Wall depth m', 0.1, 3, 'depthY') // depthY = độ sâu lòng hồ = chiều cao tường
  materialRow(walls, ctx, w, 'Wall mat', 'wallMaterial')
  // 🎨 Mix vách hồ (wallMix): board inline ĐÃ THÁO — áp/gỡ/chỉnh+cọ vẽ qua khay 🧪 (🪣/🧽/🎯).
  if (w.wallMix) walls.appendChild(mixStatusRow())
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
  const items: TabItem[] = [
    { label: edgeLabel, panel: edge, title: `${edgeLabel} — outline / size / position` },
    { label: 'Surface', panel: surface, title: 'Water surface look' },
    { label: 'Bottom', panel: bottom, title: 'Floor + walls' },
  ]
  // 🐟 CHỈ pond (hồ thiên nhiên) có tab Cá; pool/puddle không (pool sạch — NgQuan 2026-06-13). Đa-đàn (list F1/F2…).
  let fishTabs: { dispose: () => void } | null = null
  if (w.kind === 'pond') {
    const fishPane = document.createElement('div')
    fishTabs = buildPondFishTab(fishPane, ctx, w)
    host.appendChild(fishPane)
    items.push({ label: '🐟 Cá', panel: fishPane, title: 'Đàn cá theo bậc — vùng bơi = lòng hồ' })
  }
  const tabs = new Tabs(host, items, {
    classes: {
      bar: 'ap-tab-bar ap-water-l4tabs',
      tab: 'ap-tab-btn',
      panel: 'ap-water-l4sub',
      active: 'ap-tab-active',
    },
    injectCss: false,
  })
  return {
    dispose: (): void => {
      tabs.dispose()
      bottomTabs.dispose()
      fishTabs?.dispose()
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
    texPaletteRow('Wall mat', wallTexOpts, f.wallTex ?? 'plain', (v) => {
      f.wallTex = v
      ctx.applySite(true)
    })
  )
  // 🎨 Mix mặt tường rào (f.mix — CHỈ hiệu lực Type=Wall): board inline ĐÃ THÁO — khay 🧪 (🪣/🧽/🎯).
  if (f.mix) body.appendChild(mixStatusRow())
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

// ── 🌉 CẦU (bridge bắc ngang hồ) — đa-instance site.bridges (mirror buildFenceDomain) ──────────────
// Tham số parametric theo industry (Houdini Arch Bridge SOP / CityEngine pier / RailClone deck+pier /
// SideFX Japanese taiko-bashi): nhịp + vồng (vòm/THẲNG boardwalk) + ván rời (dày) + vành biên + lan can
// (tay vịn + trụ con vuông/tròn) + trụ đỡ 2-bên tự đâm đáy hồ. Đặt TỰ DO trong lô. Slider LIVE khi kéo
// (applyBridgeLive — rebuild CHỈ cầu), buông tay commit (applySite). Builder hình: site/render/bridge.ts.
type BridgeMKey = 'offsetX' | 'offsetZ' | 'span' | 'deckWidth' | 'rise' | 'railHeight'
type BridgeNKey = 'plankCount' | 'postCount' | 'pierCount'
type BridgeCmKey = 'deckThick' | 'rimSize' | 'railBeam' | 'postWidth' | 'pierWidth'

// slider mét (hiển thị m, lưu mm) — kéo LIVE (rebuild chỉ cầu), buông tay commit. Tách (rule-50).
function bridgeMSlider(
  ctx: APGuiCtx,
  b: BridgeConfig,
  label: string,
  key: BridgeMKey,
  min: number,
  max: number
): HTMLElement {
  return sliderRow(
    label,
    min,
    max,
    0.05,
    b[key] / 1000,
    (v, c) => {
      b[key] = Math.round(v * 1000)
      if (c) ctx.applySite(true)
      else ctx.applyBridgeLive()
    },
    2
  )
}

// slider số nguyên (đếm) — kéo LIVE, buông tay commit.
function bridgeNSlider(
  ctx: APGuiCtx,
  b: BridgeConfig,
  label: string,
  key: BridgeNKey,
  min: number,
  max: number
): HTMLElement {
  return sliderRow(
    label,
    min,
    max,
    1,
    b[key],
    (v, c) => {
      b[key] = Math.round(v)
      if (c) ctx.applySite(true)
      else ctx.applyBridgeLive()
    },
    0
  )
}

// slider TIẾT DIỆN cm (hiển thị cm, lưu mm) — chi tiết nhỏ (ván/vành/tay vịn/trụ) cần bước mịn hơn slider m.
function bridgeCmSlider(
  ctx: APGuiCtx,
  b: BridgeConfig,
  label: string,
  key: BridgeCmKey,
  min: number,
  max: number
): HTMLElement {
  return sliderRow(
    label,
    min,
    max,
    0.5,
    b[key] / 10,
    (v, c) => {
      b[key] = Math.round(v * 10)
      if (c) ctx.applySite(true)
      else ctx.applyBridgeLive()
    },
    1
  )
}

// Toggle cầu (áp ngay) — tách giữ buildBridgeControls gọn (rule-50).
function bridgeToggle(
  pane: HTMLElement,
  ctx: APGuiCtx,
  b: BridgeConfig,
  label: string,
  key: 'enabled' | 'railOn' | 'pierOn'
): void {
  pane.appendChild(
    toggleRow(label, b[key], (on) => {
      b[key] = on
      ctx.applySite(true)
    })
  )
}

// Thân cầu: vị trí/xoay + nhịp/rộng/vồng + ván rời (số + dày) + vành biên. Tách (rule-50).
function bridgeBodyRows(pane: HTMLElement, ctx: APGuiCtx, b: BridgeConfig): void {
  pane.appendChild(bridgeMSlider(ctx, b, 'Pos X m', 'offsetX', -20, 20))
  pane.appendChild(bridgeMSlider(ctx, b, 'Pos Z m', 'offsetZ', -20, 20))
  pane.appendChild(
    sliderRow(
      'Xoay °',
      0,
      360,
      5,
      b.rotDeg,
      (v, c) => {
        b.rotDeg = v
        if (c) ctx.applySite(true)
        else ctx.applyBridgeLive()
      },
      0
    )
  )
  pane.appendChild(bridgeMSlider(ctx, b, 'Dài (nhịp) m', 'span', 1, 20))
  pane.appendChild(bridgeMSlider(ctx, b, 'Rộng mặt m', 'deckWidth', 0.6, 4))
  pane.appendChild(bridgeMSlider(ctx, b, 'Vồng/Cao sàn m', 'rise', 0, 2))
  pane.appendChild(bridgeNSlider(ctx, b, 'Số ván', 'plankCount', 4, 40))
  pane.appendChild(bridgeCmSlider(ctx, b, 'Dày ván cm', 'deckThick', 2, 20))
  pane.appendChild(bridgeCmSlider(ctx, b, 'Vành cầu cm', 'rimSize', 4, 40))
}

// Lan can: bật/cao + tay vịn + trụ con (số/tiết diện/dáng vuông-tròn). Tách (rule-50).
function bridgeRailRows(pane: HTMLElement, ctx: APGuiCtx, b: BridgeConfig): void {
  bridgeToggle(pane, ctx, b, 'Lan can', 'railOn')
  pane.appendChild(bridgeMSlider(ctx, b, 'Cao lan can m', 'railHeight', 0.3, 1.5))
  pane.appendChild(bridgeCmSlider(ctx, b, 'Tay vịn cm', 'railBeam', 2, 15))
  pane.appendChild(bridgeNSlider(ctx, b, 'Trụ con / bên', 'postCount', 0, 20))
  pane.appendChild(bridgeCmSlider(ctx, b, 'Trụ con cm', 'postWidth', 2, 15))
  pane.appendChild(
    selectRow<BridgeConfig['postShape']>(
      'Dáng trụ con',
      [
        ['Vuông', 'square'],
        ['Tròn', 'round'],
      ],
      b.postShape,
      (v) => {
        b.postShape = v
        ctx.applySite(true)
      }
    )
  )
}

// Controls 1 cầu — bộ tham số parametric. Toggle/select áp ngay; slider kéo LIVE + buông tay commit.
function buildBridgeControls(pane: HTMLElement, ctx: APGuiCtx, b: BridgeConfig): void {
  bridgeToggle(pane, ctx, b, 'Bật cầu', 'enabled')
  pane.appendChild(
    selectRow<BridgeConfig['material']>(
      'Vật liệu',
      [
        ['Gỗ', 'wood'],
        ['Đá', 'stone'],
      ],
      b.material,
      (v) => {
        b.material = v
        ctx.applySite(true)
      }
    )
  )
  pane.appendChild(
    selectRow<BridgeConfig['shape']>(
      'Dáng cầu',
      [
        ['Vòm (taiko)', 'arch'],
        ['Thẳng (đường đi)', 'flat'],
      ],
      b.shape,
      (v) => {
        b.shape = v
        ctx.applySite(true)
      }
    )
  )
  bridgeBodyRows(pane, ctx, b)
  bridgeRailRows(pane, ctx, b)
  bridgeToggle(pane, ctx, b, 'Trụ đỡ gầm', 'pierOn')
  pane.appendChild(bridgeNSlider(ctx, b, 'Hàng trụ (×2 bên)', 'pierCount', 0, 6))
  pane.appendChild(bridgeCmSlider(ctx, b, 'Trụ đỡ cm', 'pierWidth', 4, 40))
}

// 1 pane cầu i: controls + ✕ xoá (splice site.bridges + applySite).
function buildBridgePane(
  ctx: APGuiCtx,
  b: BridgeConfig,
  i: number,
  rebuild: (focus?: number) => void
): HTMLElement {
  const pane = document.createElement('div')
  buildBridgeControls(pane, ctx, b)
  pane.appendChild(
    removeRow('✕ Remove cầu', () => {
      ctx.site.bridges.splice(ctx.site.bridges.indexOf(b), 1)
      rebuild(Math.max(0, i - 1))
      ctx.applySite(true)
    })
  )
  return pane
}

// Sub-tab "Cầu" → hàng tab instance C1/C2… + ＋ (mirror buildFenceDomain) trên site.bridges.
function buildBridgeDomain(ctx: APGuiCtx): {
  panel: HTMLElement
  dispose: () => void
  navigateToBridge: (idx: number) => void
} {
  const host = document.createElement('div')
  host.classList.add('ap-fence-domain') // mượn tông nâu fence
  let tabs: Tabs | null = null
  const rebuild = (focus = 0): void => {
    tabs?.dispose()
    host.replaceChildren()
    const items: TabItem[] = ctx.site.bridges.map((b, i) => {
      const pane = buildBridgePane(ctx, b, i, rebuild)
      host.appendChild(pane)
      return { label: `C${i + 1}`, panel: pane, title: `Cầu ${i + 1}` }
    })
    const addBtn = addInstanceButton('Cầu', () => {
      const last = ctx.site.bridges[ctx.site.bridges.length - 1]
      const b = makeBridge()
      if (last) b.offsetX = last.offsetX + 3000 // stagger né chồng cầu cũ
      ctx.site.bridges.push(b)
      rebuild(ctx.site.bridges.length - 1)
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
    // 👆 Click cầu 3D → chọn tab instance C của cầu trúng (clamp khi cầu vừa bị xoá).
    navigateToBridge: (idx: number): void => {
      const clamped = Math.max(0, Math.min(idx, ctx.site.bridges.length - 1))
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

// ── 🐟 BẦY CÁ KOI — CON của hồ POND (w.fish), GUI nằm trong tab Pond (NgQuan 2026-06-13). Vùng bơi = LÒNG HỒ
// THẬT (form + depthY + gò đáy) — KHÔNG còn slider vùng/X/Z (đi theo hồ). 2 tab: Hình thái · Hành vi.
// Mọi slider = LIVE qua tuneFish (setter PondFish — 0 rebuild); riêng SỐ CÁ = commit rebuild (tạo/huỷ instance).

// Spec slider 1 bầy: [label, min, max, step, mf, get, set, live(f) | null=commit-rebuild].
type FishSlider = [
  string,
  number,
  number,
  number,
  number,
  () => number,
  (v: number) => void,
  ((f: PondFish) => void) | null,
]

// Render 1 list FishSlider với handler chuẩn: previewFish (tia-Y tại tâm hồ) khi kéo + tuneFish live /
// applySite commit (live=null → rebuild khi buông, vd Số cá). Tách giữ rule-50 (dùng chung 2 tab cá).
function appendFishSpecs(
  pane: HTMLElement,
  ctx: APGuiCtx,
  fs: FishSchool,
  specs: FishSlider[]
): void {
  for (const [label, min, max, step, mf, get, set, live] of specs)
    pane.appendChild(
      sliderRow(
        label,
        min,
        max,
        step,
        get(),
        (v, c) => {
          set(v)
          ctx.previewFish(fs) // 🐟 kéo slider → flash tia-Y tại tâm hồ chứa (xác nhận bầy nào)
          if (live) ctx.tuneFish(fs, live, c)
          else if (c) ctx.applySite(true)
        },
        mf
      )
    )
}

// 🐟 Tab "Hình thái": Số cá (range theo BẬC — rebuild) + Cỡ cá + Độ mập + 3 màu + Tỉ lệ mảng + Xáo màu.
function buildFishMorphTab(pane: HTMLElement, ctx: APGuiCtx, fs: FishSchool): void {
  const p = fishTierPreset(fs.tier) // 🐟 range Số cá theo bậc (bậc cao ít, bậc thấp đông)
  appendFishSpecs(pane, ctx, fs, [
    [
      'Số cá',
      p.countMin,
      p.countMax,
      1,
      1,
      () => fs.count,
      (v) => (fs.count = Math.round(v)),
      null,
    ], // rebuild
    [
      'Cỡ cá', // range theo BẬC (vd bậc 5: 40–120mm) — fishTierPreset
      p.sizeMin / 1000,
      p.sizeMax / 1000,
      0.01,
      1000,
      () => fs.size / 1000,
      (v) => (fs.size = Math.round(v * 1000)),
      (f) => f.setFishLength(fs.size / 1000),
    ],
  ])
  buildFishShapeColor(pane, ctx, fs)
}

// 🐟 Tab "Hành vi": Tốc bơi + Lượn (sway) + Lăng xăng (wander) + Nhấp nhô (bob) + Bứt tốc (burst) — setter live.
function buildFishBehaviorTab(pane: HTMLElement, ctx: APGuiCtx, fs: FishSchool): void {
  appendFishSpecs(pane, ctx, fs, [
    [
      'Tốc bơi %',
      5,
      80,
      5,
      1,
      () => fs.speed * 100,
      (v) => (fs.speed = v / 100),
      (f) => f.setSpeed(fs.speed),
    ],
  ])
  pane.appendChild(
    fishTuneSlider(ctx, fs, 'Lượn %', [0, 200, 5], fs.swayAmp * 100, (v) => {
      fs.swayAmp = v / 100
      return (f) => f.setSwayAmp(fs.swayAmp)
    })
  )
  pane.appendChild(
    fishTuneSlider(ctx, fs, 'Lăng xăng %', [0, 200, 5], fs.wanderAmp * 100, (v) => {
      fs.wanderAmp = v / 100
      return (f) => f.setWanderAmp(fs.wanderAmp)
    })
  )
  pane.appendChild(
    fishTuneSlider(ctx, fs, 'Nhấp nhô %', [0, 300, 5], fs.bobAmp * 100, (v) => {
      fs.bobAmp = v / 100
      return (f) => f.setBobAmp(fs.bobAmp)
    })
  )
  // 🐟 BỨT TỐC: vài con phóng vọt rồi khựng; slider = TẦN SUẤT (0 = tắt, cao = bứt thường xuyên). 0..100% → 0..1.
  pane.appendChild(
    fishTuneSlider(ctx, fs, 'Bứt tốc %', [0, 100, 5], fs.burstRate * 100, (v) => {
      fs.burstRate = v / 100
      return (f) => f.setBurstRate(fs.burstRate)
    })
  )
  pane.appendChild(fishHungerRow(ctx, fs)) // 🐟 ĐÓI (master độ no) + mốc đỏ ngưỡng chết
}

// 🐟 Slider ĐÓI (0..20): mốc đỏ ở 6 = NGƯỠNG CHẾT. >6 chưa chết; ≤6 chết theo tỉ lệ (6→1/6 đàn, 5→2/6,…,0→cả
// đàn). Càng đói (còn sống) bơi càng chậm; lao nhanh bâu mồi = khi click-thả-mồi (sau). Tách giữ rule-50.
function fishHungerRow(ctx: APGuiCtx, fs: FishSchool): HTMLElement {
  return fishTuneSlider(
    ctx,
    fs,
    'Đói (no→chết)',
    [0, 20, 1],
    fs.satiation * 20,
    (v) => {
      fs.satiation = v / 20
      return (f) => f.setSatiation(fs.satiation)
    },
    [6], // 🔖 ngưỡng bắt đầu chết
    // 🎨 tô nền: 0-6 ĐỎ (vùng chết theo tỉ lệ) · 6-10 VÀNG (hiệu ứng "sắp đói" — thêm sau)
    [
      { from: 0, to: 6, color: 'rgba(229,72,72,.55)' },
      { from: 6, to: 10, color: 'rgba(232,193,58,.5)' },
    ]
  )
}

// 🎨 3 màu koi (nền/mảng/đốm) → colorRow, set chung qua setColors. Tách giữ rule-50.
function fishColorRows(pane: HTMLElement, ctx: APGuiCtx, fs: FishSchool): void {
  const tune = (c: boolean): void =>
    ctx.tuneFish(fs, (f) => f.setColors(fs.colorBase, fs.colorPatch, fs.colorSpot), c)
  const rows: [string, 'colorBase' | 'colorPatch' | 'colorSpot'][] = [
    ['Màu nền', 'colorBase'],
    ['Màu mảng', 'colorPatch'],
    ['Màu đốm', 'colorSpot'],
  ]
  for (const [label, key] of rows)
    pane.appendChild(colorRow(label, fs[key], (hex, c) => ((fs[key] = hex), tune(c))))
}

// 🐟 1 slider live "Dáng & Màu" (uniform setter) — tách giữ rule-50.
function fishTuneSlider(
  ctx: APGuiCtx,
  fs: FishSchool,
  label: string,
  range: [number, number, number],
  cur: number,
  apply: (v: number) => (f: PondFish) => void,
  markers: number[] = [], // 🔖 mốc trên track (vd ngưỡng chết cá)
  bands: SliderBand[] = [] // 🎨 tô nền vùng track (vd Đói: đỏ vùng chết)
): HTMLElement {
  return sliderRow(
    label,
    range[0],
    range[1],
    range[2],
    cur,
    (v, c) => ctx.tuneFish(fs, apply(v), c),
    0,
    markers,
    bands
  )
}

// 🎨 Section riêng "Dáng & Màu": Độ mập + 3 màu + Tỉ lệ mảng + Xáo màu — TẤT CẢ live (uniform, 0 rebuild).
function buildFishShapeColor(pane: HTMLElement, ctx: APGuiCtx, fs: FishSchool): void {
  const hdr = document.createElement('div')
  hdr.className = 'ap-terrain-hdr' // dùng lại divider (border-top) cho gọn
  hdr.textContent = '🎨 Dáng & Màu'
  hdr.style.cssText = 'margin:7px 0 3px;font-weight:600;opacity:.85'
  pane.appendChild(hdr)
  pane.appendChild(
    fishTuneSlider(ctx, fs, 'Độ mập %', [20, 250, 5], fs.bodyWidth * 100, (v) => {
      fs.bodyWidth = v / 100
      return (f) => f.setBodyWidth(fs.bodyWidth)
    })
  )
  fishColorRows(pane, ctx, fs)
  pane.appendChild(
    fishTuneSlider(ctx, fs, 'Tỉ lệ mảng %', [0, 100, 5], fs.patchAmount * 100, (v) => {
      fs.patchAmount = v / 100
      return (f) => f.setPatchAmount(fs.patchAmount)
    })
  )
  pane.appendChild(
    fishTuneSlider(ctx, fs, 'Xáo màu', [0, 99, 1], fs.seed, (v) => {
      fs.seed = Math.round(v)
      return (f) => f.setColorSeed(fs.seed)
    })
  )
}

// 🐟 Dropdown BẬC (tier) — đổi bậc → áp size/count preset (vẫn chỉnh tay sau) → rebuild GUI (range Số cá đổi theo
// bậc) + applySite. Bậc 4-6 = pond; 1-3 = sea (deferred — nhãn ⏳, chọn được nhưng size placeholder).
const FISH_TIER_OPTS: [string, string][] = [
  ['Bậc 4 — Koi / Chép', '4'],
  ['Bậc 5 — Cá nhỏ đàn', '5'],
  ['Bậc 6 — Tép / Phù du', '6'],
  ['Bậc 3 — Cá thu (sea ⏳)', '3'],
  ['Bậc 2 — Mập / Orca (sea ⏳)', '2'],
  ['Bậc 1 — Cá voi (sea ⏳)', '1'],
]
function fishTierRow(
  ctx: APGuiCtx,
  fs: FishSchool,
  rebuild: (focus?: number) => void,
  i: number
): HTMLElement {
  return selectRow('Bậc', FISH_TIER_OPTS, String(fs.tier), (v) => {
    const p = fishTierPreset(Number(v))
    fs.tier = Number(v)
    fs.size = p.sizeMm // áp cỡ + số con + HÀNH VI mặc định của bậc (chỉnh tay lại ở slider dưới)
    fs.count = p.count
    fs.speed = p.speed // 🐟 bậc thấp chậm hơn chút (mồi)
    fs.burstRate = p.burstRate // 🐟 bậc thấp bứt tốc thường hơn
    fs.wanderAmp = p.wanderAmp // 🐟 bậc thấp lăng xăng hơn
    rebuild(i) // range slider Số cá/Cỡ đổi theo bậc → dựng lại pane đàn này
    ctx.applySite(true)
  })
}

// 🐟 2 tab LỒNG [Hình thái · Hành vi] của 1 đàn (tông l5). Trả Tabs cho caller dispose.
function buildFishInnerTabs(host: HTMLElement, ctx: APGuiCtx, fs: FishSchool): Tabs {
  const morph = document.createElement('div')
  buildFishMorphTab(morph, ctx, fs)
  const behavior = document.createElement('div')
  buildFishBehaviorTab(behavior, ctx, fs)
  host.append(morph, behavior)
  return new Tabs(
    host,
    [
      { label: 'Hình thái', panel: morph, title: 'Số cá + hình dáng + màu' },
      { label: 'Hành vi', panel: behavior, title: 'Bơi/lượn/lăng xăng/nhấp nhô/bứt tốc + Đói' },
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

// 🐟 1 nút tab đàn (F1/F2…) — active highlight do showPane toggle. Tách giữ rule-50.
function fishTabBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'ap-tab-btn'
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

// 🐟 Pane 1 ĐÀN (đổ vào `content`): Show + dropdown Bậc + 2 tab lồng [Hình thái·Hành vi] + ✕ xoá. ✕ → splice
// w.fishSchools + rebuild + applySite. Trả dispose (gỡ Tabs lồng đàn đó).
function buildFishPane(
  content: HTMLElement,
  ctx: APGuiCtx,
  w: WaterConfig,
  fs: FishSchool,
  i: number,
  rebuild: (focus?: number) => void
): () => void {
  content.appendChild(
    toggleRow('🐟 Hiện đàn', fs.enabled, (on) => {
      fs.enabled = on
      ctx.applySite(true)
    })
  )
  content.appendChild(fishTierRow(ctx, fs, rebuild, i))
  const inner = buildFishInnerTabs(content, ctx, fs)
  content.appendChild(
    // 🦈 hồi cá bị predator đớp (consumed→false) — live qua tuneFish (0 rebuild), khớp đúng đàn cfg
    removeRow('↺ Reset đàn (hồi cá bị ăn)', () => ctx.tuneFish(fs, (f) => f.resetSchool(), true))
  )
  content.appendChild(
    removeRow('✕ Xoá đàn', () => {
      const arr = w.fishSchools
      if (arr) arr.splice(arr.indexOf(fs), 1) // xoá ĐÚNG đàn này (ref fs) khỏi w.fishSchools
      rebuild(Math.max(0, i - 1))
      ctx.applySite(true)
    })
  )
  return (): void => inner.dispose() // ⚠️ BỌC arrow giữ `this` — trả `inner.dispose` trần = unbound → throw khi gọi d()
}

// 🐟 Tab "Cá" trong pane POND — quản LIST nhiều ĐÀN (chuỗi bậc lớn-ăn-bé). Hàng F1/F2…＋ tự dựng TAY (bar = con
// đầu BỀN của host: chỉ replaceChildren nội dung, KHÔNG gỡ phần tử bar → thêm/xoá đàn KHÔNG mất hàng tab) + vùng
// `content` hiện đàn đang chọn. ＋ thêm đàn (bậc 5), ✕ xoá, dropdown Bậc/đói RIÊNG mỗi đàn. cfg = FishSchool ref →
// _tuneFish/_previewFish khớp đúng đàn. Trả { dispose } gỡ Tabs lồng của pane đang mở.
function buildPondFishTab(
  host: HTMLElement,
  ctx: APGuiCtx,
  w: WaterConfig
): { dispose: () => void } {
  const schools = (): FishSchool[] => (w.fishSchools ??= [])
  const bar = document.createElement('div')
  bar.className = 'ap-tab-bar ap-water-itabs' // hàng F1/F2…＋ — STABLE (chỉ thay nội dung, không gỡ chính bar)
  const content = document.createElement('div')
  content.className = 'ap-water-isub'
  host.append(bar, content)
  let disposers: (() => void)[] = []
  let panes: HTMLElement[] = []
  let btns: HTMLButtonElement[] = []
  // Đổi đàn = TOGGLE display panes[i] (mọi pane dựng SẴN trong content) — index THẲNG vào panes[], KHÔNG đọc lại
  // schools() → click Fn luôn ra đúng đàn n (không kẹt về F1).
  const select = (i: number, preview = false): void => {
    panes.forEach((p, idx) => (p.style.display = idx === i ? '' : 'none'))
    btns.forEach((b, idx) => b.classList.toggle('ap-tab-active', idx === i))
    const fs = schools()[i]
    if (fs && preview) ctx.previewFish(fs) // flash tia-Y khi USER bấm tab (không flash lúc dựng GUI)
  }
  const rebuild = (focus = 0): void => {
    for (const d of disposers) d()
    disposers = []
    panes = []
    btns = []
    schools().forEach((fs, i) => {
      const pane = document.createElement('div')
      disposers.push(buildFishPane(pane, ctx, w, fs, i, rebuild))
      panes.push(pane)
      btns.push(fishTabBtn(`F${i + 1}`, () => select(i, true)))
    })
    const addBtn = addInstanceButton('đàn', () => {
      schools().push(makeFishSchool(5)) // đàn thêm = bậc 5 (cá nhỏ) — sẵn mồi cho bậc 4 (predation)
      rebuild(schools().length - 1)
      ctx.applySite(true)
    })
    content.replaceChildren(...panes)
    bar.replaceChildren(...btns, addBtn)
    select(Math.max(0, Math.min(focus, panes.length - 1)))
  }
  rebuild()
  return { dispose: (): void => disposers.forEach((d) => d()) }
}

// BẬC 2 type-Tabs Pool|Pond|Puddle (cá GỠ khỏi đây — giờ là tab CON trong pane Pond). Tách khỏi buildWaterDomain.
function makeWaterTypeTabs(
  waterSub: HTMLElement,
  subs: { pool: HTMLElement; pond: HTMLElement; puddle: HTMLElement }
): Tabs {
  return new Tabs(
    waterSub,
    [
      {
        label: 'Pool',
        panel: subs.pool,
        title: 'Hồ bơi nhân tạo — tile sạch, đáy phẳng (không cá/gò)',
      },
      { label: 'Pond', panel: subs.pond, title: 'Hồ thiên nhiên — có cá + đáy gò/đất đá' },
      { label: 'Puddle', panel: subs.puddle, title: 'Vũng nước — mặt phẳng (no depth/edge)' },
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
}

// Sub-tab "Water" → BẬC 2 folder-style Pool|Pond|Puddle (tông xanh curated --wt-*, tách tông nâu Ground);
// MỖI loại có BẬC 3 hàng tab instance (Pl/Pd/Pe + ＋). Cá = tab CON trong pane Pond. Trả { panel, dispose }.
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

  const typeTabs = makeWaterTypeTabs(waterSub, {
    pool: poolSub,
    pond: pondSub,
    puddle: puddleSub,
  })
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
    // Click hồ 3D (kể cả CÁ → hồ chứa) → mở type-tab theo kind + tab instance của cfg. Trả false nếu không khớp.
    navigateToWater: (cfg: WaterConfig): boolean => {
      const ki = kindIdx[cfg.kind]
      typeTabs.select(ki, { trusted: false })
      return ctls[ki].selectCfg(cfg)
    },
  }
}

// 🪨 Texture đá (triplanar) cho path-zone — DÙNG CHUNG set với border hồ (icelandic/coal/rock). 'none' = màu phẳng.
const STONE_MAT_OPTS: [string, BorderMaterialKey][] = [
  ['None (màu phẳng)', 'none'],
  ['Icelandic jagged', 'icelandic-jagged'],
  ['Coal stone', 'coal-stone'],
  ['Rock rough', 'rock-rough'],
]

// Hàng tab con SITE (Ground|Fence|Garden|Water|Cầu) — tách khỏi setupSitePanel cho rule-50.
function makeSiteTabs(
  host: HTMLElement,
  panels: {
    ground: HTMLElement
    fence: HTMLElement
    garden: HTMLElement
    water: HTMLElement
    bridge: HTMLElement
  }
): Tabs {
  return new Tabs(
    host,
    [
      { label: 'Ground', panel: panels.ground, title: 'Surface material / lot' },
      { label: 'Fence', panel: panels.fence, title: 'Fence' },
      { label: 'Garden', panel: panels.garden, title: 'Grass (3D, any surface) + trees' },
      { label: 'Water', panel: panels.water, title: 'Water: Pool / Pond / Puddle' },
      { label: 'Cầu', panel: panels.bridge, title: 'Cầu bắc ngang hồ (bridge)' },
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
// (Tab "Rock" non bộ ĐÃ GỠ 2026-06-09 — procedural "chưa ra dáng"; đá điểm nhấn → Houdini bake, xem deferred.)
// Trả { panel, dispose, navigateToWater }: panel cho drawer Tabs; navigateToWater = click hồ 3D → mở tab hồ.
interface SitePanel {
  panel: HTMLElement
  dispose: () => void
  navigateToWater: (cfg: WaterConfig) => boolean // 🐟 click cá 3D → navigateToWater(hồ chứa) → tab Pond ▸ tab Cá
  navigateToFence: (idx: number) => void
  navigateToGroundLayer: (idx: number) => void
  navigateToBridge: (idx: number) => void // 🌉 click cầu 3D → sub-tab Cầu ▸ tab C idx
}

export function setupSitePanel(ctx: APGuiCtx, container: Element | null): SitePanel {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-site-panel'
  // 5 sub-tab: Ground (G0+G1…) · Fence (F1…) · Garden (Grass|Tree) · Water (Pool|Pond|Puddle) · Cầu (UI shell).
  const groundSub = document.createElement('div')
  const ground = buildGroundDomain(ctx, () => {})
  groundSub.appendChild(ground.panel)
  const fence = buildFenceDomain(ctx)
  const fenceSub = fence.panel
  const garden = buildGardenDomain(ctx)
  const gardenSub = garden.panel
  const water = buildWaterDomain(ctx)
  const waterSub = water.panel
  const bridge = buildBridgeDomain(ctx) // 🌉 "Cầu" bắc ngang hồ — đa-instance site.bridges
  p.append(groundSub, fenceSub, gardenSub, waterSub, bridge.panel)
  container?.appendChild(p)

  const tabs = makeSiteTabs(p, {
    ground: groundSub,
    fence: fenceSub,
    garden: gardenSub,
    water: waterSub,
    bridge: bridge.panel,
  })
  return {
    panel: p,
    dispose: (): void => {
      tabs.dispose()
      for (const d of [ground, fence, garden, water, bridge]) d.dispose()
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
    // Click cầu 3D → mở sub-tab "Cầu" (index 4) + tab C idx.
    navigateToBridge: (idx: number): void => {
      tabs.select(4, { trusted: false })
      bridge.navigateToBridge(idx)
    },
  }
}
