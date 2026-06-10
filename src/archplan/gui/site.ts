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
  GROUND_THICK_MAX,
  GROUND_THICK_MIN,
  isGroundTexKey,
  makeFence,
  makeGroundLayer,
  makeGroundMixParams,
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
]

import type { APGuiCtx, MixPaintTarget } from './ctx'
import { confirmPopup } from './roof-lab' // ↺ reset nét cọ mix — tái dùng popup confirm (ap-roof-confirm)
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

// (readout Lot/House/Coverage/Garden ĐÃ GỠ — NgQuan 2026-06-11. ctx.siteStats/registerSiteReadout giữ trong
// interface + Lab plumbing optional-chain — vô hại, không gọi nữa.)

// 🎨 Section surface G0: toggle "Mix nền (Lab)" — bật = bảng trộn PhotoGroundMix (target 'base',
// site.groundMix); tắt = select texture đơn site.ground như cũ. Tự re-render khi toggle (swap select↔board).
function mkBaseMixSection(ctx: APGuiCtx): HTMLElement {
  const site = ctx.site
  const wrap = document.createElement('div')
  const render = (): void => {
    wrap.replaceChildren()
    wrap.appendChild(
      toggleRow('Mix nền (Lab)', site.groundMix !== undefined, (on) => {
        site.groundMix = on
          ? (site.groundMix ??
            makeGroundMixParams(isGroundTexKey(site.ground) ? site.ground : 'grass-o'))
          : undefined
        if (!on && ctx.getMixPaint?.()?.target === 'base') ctx.setMixPaint?.(null, 0) // 🖌 đang vẽ G0 → thoát
        render()
        ctx.applySite(true)
      })
    )
    if (site.groundMix) buildMixBoard(wrap, ctx, 'base', site.groundMix)
    else
      wrap.appendChild(
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
  }
  render()
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

// 🎨 CSS bảng trộn MIX trong hệ Ground (NgQuan 2026-06-11 "select gọn lại, bỏ button cọ/✕, tách khối").
// Pattern = inject <style> id-guard scoped .ap-ground-domain (như ensureCutGrayCss) — KHÔNG sửa archplan-lab.css
// (Factory-owned). Palette nâu --gr-* cascade từ .ap-scan-panel.ap-site-panel. Gồm: select gọn · block slot tách
// slider · slot active (viền trái accent) · nút ↺ vuông · khu tab Z (instance add) TỐI hơn 1 nấc · divider terrain.
function ensureMixCss(): void {
  if (document.getElementById('ap-mix-css')) return
  const s = document.createElement('style')
  s.id = 'ap-mix-css'
  const D = '.ap-ground-domain '
  s.textContent =
    `${D}.ap-mix-row{display:flex;align-items:center;gap:5px;margin:0}` +
    `${D}.ap-mix-tag{flex:0 0 auto;width:15px;height:15px;display:flex;align-items:center;justify-content:center;` +
    `font-size:8px;border-radius:3px;background:var(--gr-bg-1);border:1px solid var(--gr-bg-4);color:var(--gr-bg-5);cursor:pointer}` +
    `${D}.ap-mix-sel{flex:1;min-width:0;padding:1px 3px;border:1px solid var(--gr-bg-4);border-radius:3px;` +
    `background:var(--gr-bg-2);color:var(--gr-text);font:9px ui-monospace,'Cascadia Mono',monospace;cursor:pointer}` +
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
    // 🎨 khu tab Z (instance add: Z/P/B/W) TỐI hơn 1 nấc — lồng cấp như Garden (cut giữ xám riêng)
    `${D}.ap-zone-itabs>.ap-fence-itabs>.ap-tab-btn{background:rgba(62,47,28,.55);border-color:rgba(181,138,60,.3);color:#c9a877}` +
    `${D}.ap-zone-itabs>.ap-fence-itabs>.ap-tab-btn.ap-tab-active{background:var(--gr-bg-2);border-color:rgba(181,138,60,.55);border-bottom-color:transparent;color:var(--gr-text)}` +
    `${D}.ap-zone-itabs>.ap-fence-isub{background:var(--gr-bg-2)}`
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

// 🎨 select đổi key slot HOẶC xóa lớp (option sentinel '__del' — gộp nút ✕ cũ vào dropdown để hàng gọn).
function onSlotSel(
  ctx: APGuiCtx,
  mix: GroundMixParams,
  i: number,
  sel: HTMLSelectElement,
  redraw: () => void
): void {
  if (sel.value === DEL_SLOT) {
    mix.slots.splice(i, 1)
    redraw()
    ctx.applySite(true)
    return
  }
  mix.slots[i].key = sel.value as GroundMaterialKey
  ctx.applySite(true) // _groundMixFor tự load lazy ĐÚNG key thiếu — không prefetch cả kho (lag dropdown)
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
  cb: { redraw: () => void; onPick: () => void }
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
  if (paint?.target === target && paint.slot === i) tag.classList.add('ap-mix-brush-on')
  const sel = document.createElement('select')
  sel.className = 'ap-mix-sel'
  for (const [label, k] of MIX_TEX_OPTS) sel.appendChild(new Option(label, k))
  sel.appendChild(new Option('✕ Xóa lớp', DEL_SLOT))
  sel.value = slot.key
  sel.addEventListener('click', (e) => e.stopPropagation())
  sel.addEventListener('change', () => onSlotSel(ctx, mix, i, sel, cb.redraw))
  head.append(tag, sel)
  const sl = sliderRow(
    'Ngưỡng',
    0,
    1,
    0.05,
    slot.bias,
    (v, c) => {
      slot.bias = v
      ctx.tuneMixLive?.(target) // 🖌 stage 3: bias = uniform → kéo LIVE không recompile
      if (c) ctx.applySite(true)
    },
    1
  )
  sl.addEventListener('click', (e) => e.stopPropagation())
  box.append(head, sl)
  return box
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
    brush.classList.toggle('ap-mix-brush-on', ctx.getMixPaint?.()?.target === target)
  }
  brush.addEventListener('click', () => {
    const on = ctx.getMixPaint?.()?.target === target
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
function mkMixSliders(ctx: APGuiCtx, target: MixPaintTarget, mix: GroundMixParams): HTMLElement[] {
  const us: [string, number, number, number, keyof GroundMixParams][] = [
    ['Theo cao độ', 0, 0.8, 0.05, 'heightK'], // height-lerp proxy — 0 = fade đều
    ['Mềm biên', 0.01, 0.5, 0.01, 'maskSoft'],
    ['Scale mask', 0.05, 3, 0.05, 'maskScale'], // 1/m world
    ['Macro', 0, 1, 0.05, 'macro'],
    ['Loang úa', 0, 1, 0.05, 'tint'],
    ['Trộn xa', 0, 1, 0.05, 'farOn'],
  ]
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
        if (c) ctx.applySite(true)
      },
      1
    )
  )
}

// 🎨 BẢNG TRỘN MIX per-target (PhotoGroundMix — port bộ nền Lab; target = zone Z1+ HOẶC 'base' nền lô G0):
// Nền chính + ≤4 slot (block tách) + hàng cọ (🖌 chung) + 6 slider chung. activeSlot = slot đang chọn (GUI-only,
// closure sống qua redraw); 🖌 vẽ slot đó. Stage 3: mọi slider = uniform LIVE (tuneMixLive), buông applySite.
function buildMixBoard(
  pane: HTMLElement,
  ctx: APGuiCtx,
  target: MixPaintTarget,
  mix: GroundMixParams
): void {
  let active = 0
  let syncBrush = (): void => {}
  const list = document.createElement('div')
  list.className = 'ap-mix-slots' // block tách bạch với 6 slider chung bên dưới
  const pick = (i: number): void => {
    active = i
    if (ctx.getMixPaint?.()?.target === target) ctx.setMixPaint?.(target, i) // đang vẽ → chuyển slot ngay
    redraw()
  }
  const addBtn = addInstanceButton('lớp mix', () => {
    mix.slots.push({ key: 'construction-gravel', bias: 0.55, seed: 13.7 + mix.slots.length * 18 })
    redraw()
    ctx.applySite(true)
  })
  function redraw(): void {
    if (active >= mix.slots.length) active = Math.max(0, mix.slots.length - 1)
    list.replaceChildren(
      ...mix.slots.map((_, i) =>
        mkMixSlotRow(ctx, target, mix, i, i === active, { redraw, onPick: () => pick(i) })
      )
    )
    addBtn.disabled = mix.slots.length >= 4
    syncBrush()
  }
  ctx.registerMixPaintSync?.(redraw) // 🖌 mode vẽ tắt từ ngoài (Move/Pick) → bỏ highlight tag + nút 🖌
  // KHÔNG prefetch cả kho khi mở select (9 bộ × 4 map 2K decode = đứng hình) — _groundMixFor load lazy đúng key
  pane.appendChild(
    selectRow('Nền chính', MIX_TEX_OPTS, mix.base, (v) => {
      mix.base = v
      ctx.applySite(true)
    })
  )
  redraw()
  const brush = mkMixBrushRows(ctx, target, () => active)
  syncBrush = brush.sync
  pane.append(list, addBtn, ...brush.rows, ...mkMixSliders(ctx, target, mix))
}

// 🟫 Thân pane SURFACE-zone: MIX NỀN (toggle — bật = bảng trộn Lab thay texture đơn) | select texture đơn,
// + form + Length/Width + Thickness/Drape/Terrain (buildAddZoneExtras).
function buildSurfaceZoneBody(
  pane: HTMLElement,
  ctx: APGuiCtx,
  layer: GroundLayer,
  flatIdx: number,
  rebuild: (focus?: number) => void
): void {
  // 🎨 NgQuan 2026-06-10: "bê bộ nền Lab vào thay texture trong Z1" — mix off vẫn giữ đường texture đơn (nhẹ).
  // 2026-06-11: Drape (bám gò) đẩy LÊN ngang hàng Mix nền (1 flex-row đôi — gỡ khỏi buildAddZoneExtras).
  const dual = document.createElement('div')
  dual.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;align-items:center'
  dual.append(
    toggleRow('Mix nền (Lab)', layer.mix !== undefined, (on) => {
      layer.mix = on
        ? (layer.mix ??
          makeGroundMixParams(isGroundTexKey(layer.material) ? layer.material : 'grass-o'))
        : undefined
      if (!on && ctx.getMixPaint?.()?.target === layer) ctx.setMixPaint?.(null, 0) // 🖌 đang vẽ → thoát mode
      rebuild(flatIdx)
      ctx.applySite(true)
    }),
    toggleRow('Drape (bám gò)', layer.drape ?? false, (on) => {
      layer.drape = on
      ctx.applySite(true)
    })
  )
  pane.appendChild(dual)
  if (layer.mix) buildMixBoard(pane, ctx, layer, layer.mix)
  else
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
  // Wave size — RAW (không phải %). ĐẢO rippleScale: v≤12 = 13−v NHƯ CŨ (state cũ hiển thị đúng chỗ);
  // v>12 = 1/(v−11) → rs PHÂN SỐ (0.5→~0.077, chu kỳ sóng tới ~13m) — NgQuan 2026-06-10 "tăng lên 24".
  host.appendChild(
    sliderRow(
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

// 🪨 Texture đá (triplanar) cho path-zone — DÙNG CHUNG set với border hồ (icelandic/coal/rock). 'none' = màu phẳng.
const STONE_MAT_OPTS: [string, BorderMaterialKey][] = [
  ['None (màu phẳng)', 'none'],
  ['Icelandic jagged', 'icelandic-jagged'],
  ['Coal stone', 'coal-stone'],
  ['Rock rough', 'rock-rough'],
]

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
// (Tab "Rock" non bộ ĐÃ GỠ 2026-06-09 — procedural "chưa ra dáng"; đá điểm nhấn → Houdini bake, xem deferred.)
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

  // Sub-tab "Ground": hàng INSTANCE-tab tầng surface (G0 base + G1/G2… layer chồng + ＋) — xếp lớp 3D.
  // (Bảng Lot/House/Coverage/Garden ĐÃ GỠ — NgQuan 2026-06-11 "giờ không cần nữa"; refresh = noop cho caller.)
  const groundSub = document.createElement('div')
  const ground = buildGroundDomain(ctx, () => {})
  groundSub.appendChild(ground.panel)

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
      for (const d of [ground, fence, garden, water]) d.dispose()
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
