/**
 * VỊ TRÍ   — archplan/src/archplan/gui/site.ts
 * VAI TRÒ  — Panel "🌳 Ground" (drawer tab): sửa SiteState. CHIA BẬC TAB con: "Ground" (nền/lô/cỏ
 *            + bảng coverage) · "Fence" (hàng rào) · "Tree" (cây — placeholder) chung 1 hàng tab.
 *            Nhãn TOÀN tiếng Anh.
 *            Slider input = live (applySite false), change/select/toggle = commit (true).
 * LIÊN HỆ  — Dựng vào drawerBody bởi ArchPlanLab._buildLeftTools (con của drawer Tabs). Sub-tab = Tabs
 *            (ui/Tabs) → trả { panel, tabs } cho caller dispose. State+render qua APGuiCtx.
 */

import type { GroundMaterialKey } from 'threejs-modules/site/state'
import { GROUND_THICK_MAX, GROUND_THICK_MIN } from 'threejs-modules/site/state'
import { Tabs } from 'threejs-modules/ui/Tabs'

import type { APGuiCtx } from './ctx'

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
    toggleRow('Show ground + fence', site.show, (on) => {
      site.show = on
      ctx.applySite(true)
      refresh()
    })
  )
  const groundOpts: [string, GroundMaterialKey][] = [
    ['Grass', 'grass'],
    ['Soil', 'soil'],
    ['Gravel', 'gravel'],
  ]
  body.appendChild(
    selectRow('Surface', groundOpts, site.ground, (v) => {
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

// Cỏ 3D nhú lên (tier B — GrassBlades): chỉ on/off ở đây; thông số chi tiết → panel 🎛️ Tinh chỉnh.
function buildGrass3dControls(body: HTMLElement, ctx: APGuiCtx): void {
  const g = ctx.site.grass3d
  body.appendChild(
    toggleRow('🌿 3D grass (Grass surface)', g.enabled, (on) => {
      g.enabled = on
      ctx.applySite(true)
    })
  )
}

// Hàng rào (bật, kiểu gỗ/tường, chiều cao).
function buildFenceControls(body: HTMLElement, ctx: APGuiCtx): void {
  const site = ctx.site
  body.appendChild(
    toggleRow('Fence', site.fence.enabled, (on) => {
      site.fence.enabled = on
      ctx.applySite(true)
    })
  )
  const typeOpts: [string, 'wood' | 'wall'][] = [
    ['Wood', 'wood'],
    ['Wall', 'wall'],
  ]
  body.appendChild(
    selectRow('Type', typeOpts, site.fence.type, (v) => {
      site.fence.type = v
      ctx.applySite(true)
    })
  )
  body.appendChild(
    sliderRow(
      'Height m',
      0.3,
      3,
      0.1,
      site.fence.height / 1000,
      (v, c) => {
        site.fence.height = Math.round(v * 1000)
        ctx.applySite(c)
      },
      1000
    )
  )
}

// Panel "🌳 Ground" (drawer tab) — chia BẬC TAB con "Ground" | "Fence" (chung 1 hàng tab, folder-style).
// Trả { panel, tabs }: panel cho drawer Tabs quản; tabs (nested) để caller dispose.
export function setupSitePanel(
  ctx: APGuiCtx,
  container: Element | null
): { panel: HTMLElement; tabs: Tabs } {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-site-panel'

  // Sub-tab "Ground": nền/lô/cỏ + bảng coverage.
  const groundSub = document.createElement('div')
  const { el: roEl, refresh } = readout(ctx)
  ctx.registerSiteReadout(refresh)
  buildGroundControls(groundSub, ctx, refresh)
  buildGrass3dControls(groundSub, ctx)
  groundSub.appendChild(roEl)

  // Sub-tab "Fence": hàng rào.
  const fenceSub = document.createElement('div')
  buildFenceControls(fenceSub, ctx)

  // Sub-tab "Tree": cây (chưa có tính năng — placeholder, chờ wire controls sau).
  const treeSub = document.createElement('div')
  const treeNote = document.createElement('div')
  treeNote.className = 'ap-site-empty'
  treeNote.textContent = '🌲 Trees — coming soon'
  treeSub.appendChild(treeNote)

  p.append(groundSub, fenceSub, treeSub)
  container?.appendChild(p)

  const tabs = new Tabs(
    p,
    [
      { label: 'Ground', panel: groundSub, title: 'Surface / lot / grass' },
      { label: 'Fence', panel: fenceSub, title: 'Fence' },
      { label: 'Tree', panel: treeSub, title: 'Trees (coming soon)' },
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
  return { panel: p, tabs }
}
