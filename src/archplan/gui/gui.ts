/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/gui/gui.ts
 * VAI TRÒ  — Root GUI orchestration: setupGUI, grid panel, floor/instance/actions folders.
 * LIÊN HỆ  — Import bởi ArchPlanLab.ts. Section builders: gui/sections.ts.
 */

import GUI from 'lil-gui'
import type * as THREE from 'three'
import { Tabs } from 'threejs-modules/ui/Tabs'

import type { GroundType } from '../scene/scene'
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

export function setupGUI(ctx: APGuiCtx, container?: HTMLElement | null): GUI {
  const gui = new GUI({
    container: container ?? undefined, // có → vào drawer (static flow); không → auto-place fixed
    title: 'Building',
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
  // Hàng Build/Reset/Save/Load/JSON + undo/redo ĐÃ CHUYỂN ra footer drawer dùng chung (ArchPlanLab._buildDrawerFooter).
  if (!container) makeDraggable(gui) // chỉ kéo khi đứng riêng; trong drawer → title click = thu/mở
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

// ── Tools panel (gộp Surface + Scanner + Pick/Move) ──────────────────────────────

type GridPosKey = 'zPos' | 'xPos' | 'cyPos'
type GridVisKey = 'zVisible' | 'xVisible' | 'cyVisible'

// 1 panel float trái: Surface (ô tick + symbol, TRÊN CÙNG) · Scanner X/Y/Z (bung ra) ·
// hàng đáy [Pick XZ: tick+📍 | Move: 🤚]. Không chữ — chỉ symbol.
export function setupToolsPanel(ctx: APGuiCtx, container: Element | null): HTMLElement {
  const p = document.createElement('div')
  p.className = 'ap-scan-panel ap-tools-panel'
  p.appendChild(mkSurfaceRow(ctx))
  p.appendChild(mkGridRow('X', 'xPos', 'xVisible', 'x', -30, 30, () => ctx.getXGridGroup(), ctx))
  p.appendChild(mkGridRow('Y', 'cyPos', 'cyVisible', 'y', 0, 60, () => ctx.getCYGridGroup(), ctx))
  p.appendChild(mkGridRow('Z', 'zPos', 'zVisible', 'z', -30, 30, () => ctx.getZGridGroup(), ctx))
  p.appendChild(mkPickRow(ctx))
  container?.appendChild(p)
  return p
}

// "BỘ NỀN": nhóm surface đổi bằng PHÍM SỐ 1..N — KHÔNG hiển thị gì (user chỉ bấm phím). 1=none 2=stone 3=asphalt
// 4=sand; thêm texture nền MỚI sau → push CUỐI `opts` → tự nhận phím kế (vd vị trí 5). Keydown trên window (bỏ
// qua khi gõ trong input + ctrl/meta/alt); tự gỡ listener khi panel rời DOM. Trả div RỖNG ẩn (neo lifecycle).
function mkSurfaceRow(ctx: APGuiCtx): HTMLElement {
  const row = document.createElement('div')
  row.style.display = 'none' // bộ nền không hiển thị — chỉ phím tắt
  // ← thứ tự = phím 1..N. 5=grass-o 6=thai-sand-2k 7=thai-sand-4k (texture PhotoGround nền-editor)
  const opts: GroundType[] = [
    'none',
    'stone',
    'asphalt',
    'sand',
    'grass-o',
    'thai-beach-sand-2k',
    'thai-beach-sand-4k',
  ]
  const onKey = (e: KeyboardEvent): void => {
    if (!document.contains(row)) return void window.removeEventListener('keydown', onKey) // panel rời DOM → tự gỡ
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const n = Number(e.key)
    if (!Number.isInteger(n) || n < 1 || n > opts.length) return
    ctx.setGround(opts[n - 1])
  }
  window.addEventListener('keydown', onKey)
  return row
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

// Hàng đáy: Pick XZ (ô tick + 📍, không chữ) toggle. Move 🤚 đã LÔI RA float góc trái-dưới (cạnh
// thanh sáng sun) — xem ArchPlanLab._buildFloatingMove. Tools panel này nằm trong drawer trái (ẩn).
function mkPickRow(ctx: APGuiCtx): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ap-pickmove-row'
  const pick = document.createElement('label')
  pick.className = 'ap-pick-opt'
  pick.title = 'Pick XZ — click/rê mặt phẳng XZ ra tọa độ'
  const pcb = document.createElement('input')
  pcb.type = 'checkbox'
  pcb.className = 'ap-pick-cb'
  pcb.addEventListener('change', () => ctx.setPickMode(pcb.checked))
  ctx.registerPickToggle((on) => {
    pcb.checked = on // đồng bộ khi thoát pick bằng chuột phải
  })
  const pin = document.createElement('span')
  pin.textContent = '📍'
  pick.append(pcb, pin)
  row.append(pick)
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
    ['◯', 'round'],
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
  // 🙈 Ẩn tầng: bỏ dựng mesh (giữ chiều cao) → xây tầng dưới không bị tầng trên che. Transient, không persist.
  f.add({ hidden: ctx.isFloorHidden(floor.id) }, 'hidden')
    .name('🙈 Ẩn tầng')
    .onChange((v: boolean) => ctx.setFloorHidden(floor.id, v))
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
  // Undo/Redo ĐÃ CHUYỂN ra footer drawer dùng chung (không còn nhỏ ở đáy mỗi shape panel).
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

// Hàng action Build/Reset/Save/Load/JSON + undo/redo ĐÃ CHUYỂN ra footer drawer dùng chung
// (ArchPlanLab._buildDrawerFooter) — không còn dựng trong gui Building. CSS .ap-footer/.ap-undo-row giữ nguyên.
