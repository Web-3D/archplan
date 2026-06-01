/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/gui/gui.ts
 * VAI TRÒ  — Root GUI orchestration: setupGUI, grid panel, floor/instance/actions folders.
 * LIÊN HỆ  — Import bởi ArchPlanLab.ts. Section builders: gui/sections.ts.
 */

import GUI from 'lil-gui'
import type * as THREE from 'three'
import { Tabs } from 'threejs-modules/ui/Tabs'

import type { GroundType, SunOpts } from '../scene/scene'
import { type FloorDef, ROT_OPTIONS, type ShapeInstance } from '../state/state'
import type { APGuiCtx } from './ctx'
import {
  buildColumnsSection,
  buildRoofSection,
  buildSegmentsSection,
  buildStructureSection,
  buildWallsSection,
} from './sections'

export type { APGuiCtx, HighlightTarget } from './ctx'

// ── Root GUI ───────────────────────────────────────────────────────────────────

export function setupGUI(ctx: APGuiCtx): GUI {
  const gui = new GUI({
    title: 'ArchPlan Lab',
    width: Math.max(190, Math.round(window.innerWidth / 5) + 10),
  })
  gui.domElement.classList.add('archplan-lab')
  const rootCh = gui.domElement.querySelector('.lil-children') as HTMLElement
  const floorPanels: { label: string; folder: GUI }[] = []
  for (let fi = 0; fi < ctx.state.floors.length; fi++) {
    const folder = buildFloorFolder(gui, ctx.state.floors[fi], fi, ctx)
    floorPanels.push({ label: floorLabel(fi), folder })
  }
  // Floors thành hàng tab ngang (GF/2F/3F…) + nút "＋" thêm tầng ở cuối
  const addFloorBtn = document.createElement('button')
  addFloorBtn.textContent = '＋'
  addFloorBtn.className = 'ap-tab-btn ap-tab-add'
  addFloorBtn.addEventListener('click', () => ctx.addFloor())
  buildTabBar(rootCh, floorPanels, addFloorBtn)
  buildActionsFooter(gui, ctx)
  makeDraggable(gui)
  return gui
}

// Kéo GUI — giữ chuột vào title bar → drag tự do
export function makeDraggable(gui: GUI): void {
  const el = gui.domElement as HTMLElement
  const title = el.querySelector('.title') as HTMLElement | null
  if (!title) return
  let ox = 0,
    oy = 0,
    ix = 0,
    iy = 0,
    dragging = false
  const onDown = (e: MouseEvent): void => {
    dragging = true
    const r = el.getBoundingClientRect()
    ox = r.left
    oy = r.top
    ix = e.clientX
    iy = e.clientY
    el.style.position = 'fixed'
    el.style.right = 'auto'
    el.style.left = `${ox}px`
    el.style.top = `${oy}px`
    title.style.cursor = 'grabbing'
    e.preventDefault()
  }
  const onMove = (e: MouseEvent): void => {
    if (!dragging) return
    el.style.left = `${ox + e.clientX - ix}px`
    el.style.top = `${oy + e.clientY - iy}px`
  }
  const onUp = (): void => {
    dragging = false
    title.style.cursor = 'grab'
  }
  title.addEventListener('mousedown', onDown)
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ── Grid Scanner panel ─────────────────────────────────────────────────────────

type GridPosKey = 'zPos' | 'xPos' | 'cyPos'
type GridVisKey = 'zVisible' | 'xVisible' | 'cyVisible'

// Dropdown gọn: title "Scanner" bấm để mở/đóng danh sách X/Y/Z. X/Z = mặt đứng đo kích
// thước; Y = mặt ngang tọa độ. Mặc định đóng (collapse).
export function setupGridPanel(ctx: APGuiCtx, container: Element | null): HTMLElement {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel'
  const ttl = document.createElement('button')
  ttl.className = 'ap-scan-title'
  const body = document.createElement('div')
  body.appendChild(mkGridRow('X', 'xPos', 'xVisible', 'x', -30, 30, () => ctx.getXGridGroup(), ctx))
  body.appendChild(
    mkGridRow('Y', 'cyPos', 'cyVisible', 'y', 0, 60, () => ctx.getCYGridGroup(), ctx)
  )
  body.appendChild(mkGridRow('Z', 'zPos', 'zVisible', 'z', -30, 30, () => ctx.getZGridGroup(), ctx))
  body.appendChild(mkPickRow(ctx))
  let open = false
  const render = (): void => {
    ttl.textContent = `${open ? '▾' : '▸'} Scanner`
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

function mkGridRow(
  axis: string,
  posKey: GridPosKey,
  visKey: GridVisKey,
  axisProp: 'x' | 'y' | 'z',
  min: number,
  max: number,
  getGroup: () => THREE.Group | null,
  ctx: APGuiCtx
): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:3px;margin-bottom:3px'
  const lbl = document.createElement('span')
  lbl.textContent = axis
  lbl.style.width = '8px'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = ctx.gridOpts[visKey]
  cb.style.cssText = 'width:11px;height:11px;flex-shrink:0;cursor:pointer'
  cb.addEventListener('change', () => {
    ctx.gridOpts[visKey] = cb.checked
    const grp = getGroup()
    if (grp) grp.visible = cb.checked
  })
  const sl = document.createElement('input')
  sl.type = 'range'
  sl.min = String(min)
  sl.max = String(max)
  sl.step = '0.1'
  sl.value = String(ctx.gridOpts[posKey])
  sl.style.cssText = 'flex:1;min-width:0;cursor:pointer'
  sl.addEventListener('input', () => {
    const v = parseFloat(sl.value)
    ctx.gridOpts[posKey] = v
    const grp = getGroup()
    if (grp) grp.position[axisProp] = v
    ctx.updateMeasureLabels()
  })
  row.appendChild(lbl)
  row.appendChild(cb)
  row.appendChild(sl)
  return row
}

// Toggle "📍 Pick XZ": tick → click/rê chuột trên mặt phẳng XZ ra tọa độ (tắt orbit).
function mkPickRow(ctx: APGuiCtx): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:3px;margin-top:4px'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.style.cssText = 'width:11px;height:11px;flex-shrink:0;cursor:pointer'
  cb.addEventListener('change', () => ctx.setPickMode(cb.checked))
  // Cho ArchPlanLab đồng bộ ô tick khi thoát pick bằng chuột phải
  ctx.registerPickToggle((on) => {
    cb.checked = on
  })
  const lbl = document.createElement('span')
  lbl.textContent = '📍 Pick XZ'
  lbl.style.cssText = 'cursor:pointer'
  lbl.addEventListener('click', () => {
    cb.checked = !cb.checked
    ctx.setPickMode(cb.checked)
  })
  row.appendChild(cb)
  row.appendChild(lbl)
  return row
}

// ── Sun panel ────────────────────────────────────────────────────────────────

// Panel ☀ Sun (dropdown) nằm dưới Scanner trong wrapper .ap-left-tools. Az/El/Intensity →
// xoay/đổi cường độ DirectionalLight real-time (ctx.applySun đọc ctx.sunOpts).
export function setupSunPanel(ctx: APGuiCtx, container: Element | null): HTMLElement {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-sun-panel' // dùng lại theme coban + slider của scanner
  const ttl = document.createElement('button')
  ttl.className = 'ap-scan-title'
  const body = document.createElement('div')
  body.appendChild(mkSunRow('Az', 'azimuth', 0, 360, 1, ctx))
  body.appendChild(mkSunRow('El', 'elevation', 5, 85, 1, ctx))
  body.appendChild(mkSunRow('Int', 'intensity', 0, 5, 0.1, ctx))
  let open = false
  const render = (): void => {
    ttl.textContent = `${open ? '▾' : '▸'} ☀ Sun`
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

// Panel chọn nền môi trường (cỏ/xi măng/lưới). Đổi nền → swap material + màu bounce hemisphere.
export function setupGroundPanel(ctx: APGuiCtx, container: Element | null): HTMLElement {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-ground-panel'
  const ttl = document.createElement('button')
  ttl.className = 'ap-scan-title'
  const body = document.createElement('div')
  // Bỏ nhãn "Surface" — chỉ còn select full-width (title "🌱 Ground" đã đủ ngữ cảnh).
  const sel = document.createElement('select')
  sel.className = 'ap-ground-sel' // style theme cobalt full-width (xem archplan-lab.css)
  const opts: [string, GroundType][] = [
    ['Grid', 'none'],
    ['Stone paving', 'stone'],
    ['Asphalt', 'asphalt'],
  ]
  for (const [text, val] of opts) {
    const o = document.createElement('option')
    o.value = val
    o.textContent = text
    if (val === ctx.groundType) o.selected = true
    sel.appendChild(o)
  }
  sel.addEventListener('change', () => ctx.setGround(sel.value as GroundType))
  body.appendChild(sel)
  let open = true
  const render = (): void => {
    ttl.textContent = `${open ? '▾' : '▸'} 🌱 Ground`
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

function mkSunRow(
  label: string,
  key: keyof SunOpts,
  min: number,
  max: number,
  step: number,
  ctx: APGuiCtx
): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:3px;margin-bottom:3px'
  const lbl = document.createElement('span')
  lbl.textContent = label
  lbl.style.cssText = 'width:16px;flex-shrink:0'
  const sl = document.createElement('input')
  sl.type = 'range'
  sl.min = String(min)
  sl.max = String(max)
  sl.step = String(step)
  sl.value = String(ctx.sunOpts[key])
  sl.style.cssText = 'flex:1;min-width:0;cursor:pointer'
  sl.addEventListener('input', () => {
    ctx.sunOpts[key] = parseFloat(sl.value)
    ctx.applySun()
  })
  row.appendChild(lbl)
  row.appendChild(sl)
  return row
}

// ── Shape row inline ───────────────────────────────────────────────────────────

function mkShapeSelect(floorId: string, ctx: APGuiCtx): HTMLSelectElement {
  // Dropdown "＋" đặt cuối hàng tab shape: chọn 1 mục = thêm shape ngay.
  // addInstance → rebuild GUI → select tự reset về "＋".
  const sel = document.createElement('select')
  sel.className = 'ap-shape-sel'
  const shapes: [string, string][] = [
    ['＋', ''],
    ['▣', 'rectangle'],
    ['L', 'l-shape'],
    ['T', 't-shape'],
    ['U', 'u-shape'],
    ['⚙', '__custom__'],
  ]
  for (const [text, val] of shapes) {
    const opt = document.createElement('option')
    opt.value = val
    opt.textContent = text
    sel.appendChild(opt)
  }
  sel.addEventListener('change', () => {
    if (sel.value === '') return
    ctx.addInstance(floorId, sel.value === '__custom__' ? null : sel.value)
  })
  return sel
}

// ── Undo / Redo row ────────────────────────────────────────────────────────────

function mkUndoRedoRow(ctx: APGuiCtx): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ap-undo-row'
  const mkBtn = (symbol: string, action: () => void): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.textContent = symbol
    btn.className = 'ap-undo-btn'
    btn.addEventListener('click', action)
    return btn
  }
  row.appendChild(mkBtn('↶', () => ctx.undo()))
  row.appendChild(mkBtn('↷', () => ctx.redo()))
  return row
}

// ── Floor folder ───────────────────────────────────────────────────────────────

export function floorLabel(fi: number): string {
  return fi === 0 ? 'GF' : `${fi + 1}F`
}

export function buildFloorFolder(gui: GUI, floor: FloorDef, fi: number, ctx: APGuiCtx): GUI {
  const f = gui.addFolder(floorLabel(fi))
  const fCh = f.domElement.querySelector('.lil-children') as HTMLElement
  const instPanels: { label: string; folder: GUI }[] = []
  for (const inst of floor.instances) {
    const folder = buildInstanceFolder(f, inst, floor.id, ctx, fi === 0)
    const lbl = inst.shapeKey ? (SHAPE_LABELS[inst.shapeKey] ?? inst.shapeKey) : 'S-⚙'
    instPanels.push({ label: lbl, folder })
  }
  // Dropdown "＋" thêm shape nằm cuối hàng tab shape
  buildTabBar(fCh, instPanels, mkShapeSelect(floor.id, ctx))
  if (ctx.state.floors.length > 1) {
    f.add(
      {
        fn: () => {
          if (window.confirm('Xóa tầng này?')) ctx.removeFloor(floor.id)
        },
      },
      'fn'
    )
      .name('✕ Remove Floor')
      .domElement.classList.add('ap-btn-remove')
  }
  return f
}

// ── Instance folder ────────────────────────────────────────────────────────────

const SHAPE_LABELS: Record<string, string> = {
  rectangle: 'S-▣',
  'l-shape': 'S-L',
  't-shape': 'S-T',
  'u-shape': 'S-U',
}

export function buildInstanceFolder(
  gui: GUI,
  inst: ShapeInstance,
  floorId: string,
  ctx: APGuiCtx,
  isGround: boolean
): GUI {
  const label = inst.shapeKey ? (SHAPE_LABELS[inst.shapeKey] ?? inst.shapeKey) : 'S-⚙'
  const f = gui.addFolder(label)
  f.close()
  const ch = f.domElement.querySelector('.lil-children') as HTMLElement
  ch.appendChild(buildTransformRow(inst, ctx))
  const sections: { label: string; folder: GUI; highlight?: () => void }[] = [
    {
      label: 'Struct',
      folder: buildStructureSection(f, inst, ctx, isGround),
      highlight: () => ctx.highlightPart({ kind: 'struct', instId: inst.id }),
    },
    {
      label: 'Roof',
      folder: buildRoofSection(f, inst, ctx),
      highlight: () => ctx.highlightPart({ kind: 'roof', instId: inst.id }),
    },
    // Cols section KHÔNG highlight (chỉ từng cột riêng — xem buildColumnFolder).
    { label: 'Cols', folder: buildColumnsSection(f, inst, ctx) },
  ]
  const wallsHi = (): void => ctx.highlightPart({ kind: 'walls', instId: inst.id })
  if (inst.shapeKey !== null) {
    sections.push({ label: 'Walls', folder: buildWallsSection(f, inst, ctx), highlight: wallsHi })
  } else {
    sections.push({ label: 'Segs', folder: buildSegmentsSection(f, inst, ctx), highlight: wallsHi })
  }
  buildTabBar(ch, sections, undefined, ctx, `section:${inst.id}`)
  f.add(
    {
      fn: () => {
        if (window.confirm('Xóa shape này?')) ctx.removeInstance(floorId, inst.id)
      },
    },
    'fn'
  )
    .name('✕ Remove Shape')
    .domElement.classList.add('ap-btn-remove')
  // Undo/Redo nhỏ ở đáy mỗi shape panel
  ch.appendChild(mkUndoRedoRow(ctx))
  return f
}

// ── Inline transform row — X/Z coord + rotation on one line ───────────────────

function buildTransformRow(inst: ShapeInstance, ctx: APGuiCtx): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ap-transform-row'
  for (const [lbl, prop] of [
    ['X', 'posX'],
    ['Z', 'posZ'],
  ] as [string, 'posX' | 'posZ'][]) {
    const field = document.createElement('span')
    field.className = 'ap-coord-field'
    const s = document.createElement('span')
    s.textContent = lbl
    const inp = document.createElement('input')
    inp.type = 'number'
    inp.step = '100'
    inp.value = String(inst[prop])
    inp.addEventListener('change', () => {
      inst[prop] = Number(inp.value) || 0
      ctx.build()
    })
    field.appendChild(s)
    field.appendChild(inp)
    row.appendChild(field)
  }
  const sel = document.createElement('select')
  sel.className = 'ap-rot-sel'
  for (const [lbl, val] of Object.entries(ROT_OPTIONS)) {
    const opt = document.createElement('option')
    opt.value = String(val)
    opt.textContent = lbl
    if (val === inst.rotY) opt.selected = true
    sel.appendChild(opt)
  }
  sel.addEventListener('change', () => {
    inst.rotY = Number(sel.value)
    ctx.build()
  })
  row.appendChild(sel)
  return row
}

// Dựng tablist cho 1 nhóm folder lil-gui qua component Tabs (threejs-modules/ui) — ARIA + keyboard
// nav (←/→/Home/End) có sẵn. Giữ class ap-tab-* → CSS Tabs template (dính + màu cấp) áp nguyên.
// onChange: mở folder lil-gui + nhớ tab active (ctx) + flash highlight khi user (trusted). tabKey/ctx
// (optional): nhớ tab qua _rebuildGUI; không truyền → luôn mở tab đầu. Trả Tabs để caller dispose nếu cần.
export function buildTabBar(
  ch: HTMLElement,
  sections: { label: string; folder: GUI; title?: string; highlight?: () => void }[],
  addEl?: HTMLElement,
  ctx?: APGuiCtx,
  tabKey?: string
): Tabs | undefined {
  if (sections.length === 0 && !addEl) return undefined // không tab + không nút add → bỏ
  const items = sections.map((s) => ({
    label: s.label,
    panel: s.folder.domElement as HTMLElement,
    title: s.title,
  }))
  return new Tabs(ch, items, {
    initial: ctx && tabKey ? ctx.getActiveTab(tabKey) : 0,
    addEl,
    classes: {
      bar: 'ap-tab-bar',
      tab: 'ap-tab-btn',
      panel: 'ap-tab-section',
      active: 'ap-tab-active',
    },
    injectCss: false, // CSS đã có sẵn trong archplan-lab.css
    onChange: (idx, { trusted }) => {
      sections[idx].folder.open()
      if (ctx && tabKey) ctx.setActiveTab(tabKey, idx)
      if (trusted) sections[idx].highlight?.() // flash chỉ khi user, bỏ qua lúc dựng/rebuild
    },
  })
}

// ── Actions folder ─────────────────────────────────────────────────────────────

// Thanh nút cố định ở đáy panel (thay folder Actions) — Build / Reset / JSON.
// Append vào gui.domElement (ngoài .lil-children cuộn) → luôn dính đáy. Reset có confirm.
function buildActionsFooter(gui: GUI, ctx: APGuiCtx): void {
  const bar = document.createElement('div')
  bar.className = 'ap-footer'
  const mk = (label: string, cls: string, action: () => void): void => {
    const b = document.createElement('button')
    b.textContent = label
    b.className = `ap-footer-btn ${cls}`
    b.addEventListener('click', action)
    bar.appendChild(b)
  }
  mk('▶ Build', 'ap-footer-build', () => ctx.build())
  mk('Reset', 'ap-footer-reset', () => {
    if (window.confirm('Reset toàn bộ về mặc định?')) ctx.resetState()
  })
  mk('💾 Save', 'ap-footer-save', () => ctx.saveFile())
  mk('📁 Load', 'ap-footer-load', () => ctx.loadFile())
  mk('📄 JSON', 'ap-footer-json', () => ctx.exportJSON())
  gui.domElement.appendChild(bar)
}
