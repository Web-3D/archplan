/**
 * VỊ TRÍ   — archplan/src/archplan/gui/site.ts
 * VAI TRÒ  — Panel "🌳 Sân vườn": sửa SiteState (nền + hàng rào) + bảng số liệu đối chiếu nhà/lô
 *            (建ぺい率). Slider input = live (applySite false), change/select/toggle = commit (true).
 * LIÊN HỆ  — Dựng vào leftTools bởi ArchPlanLab._setupGUI. State + render qua APGuiCtx (ctx.site/applySite).
 */

import type { GroundMaterialKey } from 'threejs-modules/site/state'
import { GROUND_THICK_MAX, GROUND_THICK_MIN } from 'threejs-modules/site/state'

import type { APGuiCtx } from './ctx'

// onChange(value, commit): commit=false khi kéo (live), true khi buông/đổi select/tick.
type RowChange = (value: number, commit: boolean) => void

function sliderRow(
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  onChange: RowChange
): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px'
  const lbl = document.createElement('span')
  lbl.textContent = label
  lbl.style.cssText = 'width:64px;flex-shrink:0'
  const sl = document.createElement('input')
  sl.type = 'range'
  sl.min = String(min)
  sl.max = String(max)
  sl.step = String(step)
  sl.value = String(initial)
  sl.style.cssText = 'flex:1;min-width:0;cursor:pointer'
  sl.addEventListener('input', () => onChange(parseFloat(sl.value), false))
  sl.addEventListener('change', () => onChange(parseFloat(sl.value), true))
  row.appendChild(lbl)
  row.appendChild(sl)
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
      `<div><span>Lô</span><b>${s.lotArea.toFixed(1)} m²</b></div>` +
      `<div><span>Nhà</span><b>${s.footprintArea.toFixed(1)} m²</b></div>` +
      `<div><span>Phủ 建ぺい率</span><b>${s.coveragePct.toFixed(0)}%${warn}</b></div>` +
      `<div><span>Sân vườn</span><b>${s.gardenArea.toFixed(1)} m²</b></div>`
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
    toggleRow('Hiện nền + rào', site.show, (on) => {
      site.show = on
      ctx.applySite(true)
      refresh()
    })
  )
  const groundOpts: [string, GroundMaterialKey][] = [
    ['Cỏ', 'grass'],
    ['Đất', 'soil'],
    ['Sỏi', 'gravel'],
  ]
  body.appendChild(
    selectRow('Nền', groundOpts, site.ground, (v) => {
      site.ground = v
      ctx.applySite(true)
    })
  )
  body.appendChild(
    sliderRow('Dày nền cm', T, Tmax, 0.5, site.groundThick / 10, (v, c) => {
      site.groundThick = Math.round(v * 10)
      ctx.applySite(c)
    })
  )
  for (const [lbl, key] of [
    ['Lô ngang m', 'lotWidth'],
    ['Lô sâu m', 'lotDepth'],
  ] as [string, 'lotWidth' | 'lotDepth'][]) {
    body.appendChild(
      sliderRow(lbl, 3, 30, 0.1, site[key] / 1000, (v, c) => {
        site[key] = Math.round(v * 1000)
        ctx.applySite(c)
        refresh()
      })
    )
  }
}

// Hàng rào (bật, kiểu gỗ/tường, chiều cao).
function buildFenceControls(body: HTMLElement, ctx: APGuiCtx): void {
  const site = ctx.site
  body.appendChild(
    toggleRow('Hàng rào', site.fence.enabled, (on) => {
      site.fence.enabled = on
      ctx.applySite(true)
    })
  )
  const typeOpts: [string, 'wood' | 'wall'][] = [
    ['Gỗ', 'wood'],
    ['Tường', 'wall'],
  ]
  body.appendChild(
    selectRow('Kiểu rào', typeOpts, site.fence.type, (v) => {
      site.fence.type = v
      ctx.applySite(true)
    })
  )
  body.appendChild(
    sliderRow('Cao rào m', 0.3, 3, 0.1, site.fence.height / 1000, (v, c) => {
      site.fence.height = Math.round(v * 1000)
      ctx.applySite(c)
    })
  )
}

// Panel "🌳 Sân vườn" (collapsible) — đặt trong wrapper .ap-left-tools cạnh Ground/Sun.
export function setupSitePanel(ctx: APGuiCtx, container: Element | null): HTMLElement {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-site-panel'
  const ttl = document.createElement('button')
  ttl.className = 'ap-scan-title'
  const body = document.createElement('div')
  const { el: roEl, refresh } = readout(ctx)
  ctx.registerSiteReadout(refresh)
  buildGroundControls(body, ctx, refresh)
  buildFenceControls(body, ctx)
  body.appendChild(roEl)
  let open = true
  const render = (): void => {
    ttl.textContent = `${open ? '▾' : '▸'} 🌳 Sân vườn`
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
