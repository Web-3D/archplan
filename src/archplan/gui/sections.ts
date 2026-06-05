/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/gui/sections.ts
 * VAI TRÒ  — Section/folder GUI builders cho ArchPlanLab (structure, roof, walls, segments...).
 * LIÊN HỆ  — Import bởi gui/gui.ts (dùng trong buildInstanceFolder).
 */

import type GUI from 'lil-gui'
import type { Controller } from 'lil-gui'

import {
  defaultOpening,
  mkBalcony,
  mkSeg,
  type OpeningState,
  type SegmentState,
  SHAPE_CONFIGS,
  type ShapeInstance,
  type StairState,
  type StructureState,
  TURN_OPTIONS,
  type WallMaterial,
} from '../state/state'
import type { APGuiCtx } from './ctx'
import { buildTabBar } from './gui'

// Material chia 4 nhóm select ngang hàng (Brick/Wood/Metal/Concrete) cho dễ chọn. Loại trừ nhau qua
// seg.material: chọn 1 giá trị ở nhóm → set material; nhóm khác về 'none' sau rebuild.
const MAT_CATS: { name: string; vals: WallMaterial[] }[] = [
  { name: 'Brick', vals: ['brick', 'brick-tex', 'brick-3d'] },
  { name: 'Wood', vals: ['wood', 'wood-3d', 'wood-strip'] },
  { name: 'Metal', vals: ['metal'] },
  { name: 'Concrete', vals: ['concrete'] },
]

// Đánh dấu controller để CSS xếp NGANG (inline-block). KHÔNG di chuyển DOM — giữ .lil-children làm
// cha thật, nếu không lil-gui destroy() gọi $children.removeChild(domElement) sẽ lỗi (node không còn
// là con) → crash blank lab. cls = 'ap-half' (2 cột) | 'ap-third' (3 cột) | 'ap-mat' (4 ô material 50px).
function rowOf(ctrls: { domElement: HTMLElement }[], cls: string): void {
  for (const c of ctrls) c.domElement.classList.add(cls)
}

// Slider geometry: KÉO → render live trực tiếp (throttle rAF, không history/persist); BUÔNG →
// commit 1 lần (history + persist). Cho mọi slider ảnh hưởng building để canh trực quan. Select/
// checkbox/number KHÔNG dùng cái này (giữ onChange/onFinishChange = ctx.build commit thẳng).
function live(ctrl: Controller, ctx: APGuiCtx): Controller {
  return ctrl.onChange(ctx.buildLive).onFinishChange(ctx.build)
}

// Kích thước tường: withWidth=true (wall folder) → Height|Width chia đôi (Width = seg.length →
// reshape qua walk-turtle); false (segment folder đã có "Length mm" riêng) → chỉ Height full-width.
// Color ĐÃ BỎ — màu giờ qua palette brush (sơn 3D), không dùng colorIndex dropdown nữa.
function addDimRow(folder: GUI, seg: SegmentState, ctx: APGuiCtx, withWidth = false): void {
  const hCtrl = folder.add(seg, 'wallH').name('Height').onFinishChange(ctx.build)
  if (!withWidth) return // segment: chỉ Height (Length đã có riêng) — để full-width
  hCtrl.domElement.classList.add('ap-dim')
  const wCtrl = folder.add(seg, 'length').name('Width').onFinishChange(ctx.build)
  wCtrl.domElement.classList.add('ap-dim')
  rowOf([hCtrl, wCtrl], 'ap-half')
}

// Option 1 select nhóm: { [Tên nhóm]: 'none' } + biến thể. Biến thể shader TRÙNG tên nhóm → "<v> demo".
function matOptions(cat: { name: string; vals: WallMaterial[] }): Record<string, WallMaterial> {
  const opts: Record<string, WallMaterial> = { [cat.name]: 'none' }
  for (const v of cat.vals) opts[v === cat.name.toLowerCase() ? `${v} demo` : v] = v
  return opts
}

// 4 select nhóm material (1 hàng, BỎ name — option đầu = tên nhóm) + Pattern scale + control brick/wood.
function addMaterialControls(folder: GUI, seg: SegmentState, ctx: APGuiCtx): void {
  const ctrls = MAT_CATS.map((cat) => {
    const proxy: { v: WallMaterial } = {
      v: cat.vals.includes(seg.material) ? seg.material : 'none',
    }
    return folder
      .add(proxy, 'v', matOptions(cat))
      .name('')
      .onChange(() => {
        if (proxy.v === 'none') {
          if (cat.vals.includes(seg.material)) seg.material = 'none' // tắt nhóm đang bật
        } else {
          seg.material = proxy.v
        }
        ctx.rebuild()
        ctx.build()
      })
  })
  rowOf(ctrls, 'ap-mat')
  ctrls[0].domElement.classList.add('ap-mat-first') // mép trái mang nửa-khe phụ → canh đều 2 cạnh
  ctrls[ctrls.length - 1].domElement.classList.add('ap-mat-last')
  live(folder.add(seg, 'matScale', 0.3, 3, 0.05).name('Pattern scale'), ctx)
  if (seg.material === 'brick' || seg.material === 'brick-3d') {
    addBrickControls(folder, seg, ctx, seg.material === 'brick') // relief chỉ cho shader brick
  }
  if (seg.material === 'wood-strip') addWoodStripControls(folder, seg, ctx)
}

// Controls màu rãnh vữa (brick/brick-3d) + độ lõm/đậm rãnh (chỉ 'brick' shader) — range 0–2 (đậm hơn).
function addBrickControls(
  folder: GUI,
  seg: SegmentState,
  ctx: APGuiCtx,
  showRelief: boolean
): void {
  folder.addColor(seg, 'mortarColor').name('Mortar color').onChange(ctx.build)
  if (showRelief) {
    live(folder.add(seg, 'brickRelief', 0, 2, 0.05).name('Mortar relief'), ctx)
  }
}

// Controls wood-strip: chiều cao tấm (reveal) + độ nhô butt + nghiêng step — chỉnh trực quan.
function addWoodStripControls(folder: GUI, seg: SegmentState, ctx: APGuiCtx): void {
  // Self-heal field thiếu (design cũ trước migrate) → tránh gui.add(undefined) crash blank cả app.
  if (typeof seg.woodReveal !== 'number') seg.woodReveal = 320
  if (typeof seg.woodButt !== 'number') seg.woodButt = 45
  if (typeof seg.woodStepTilt !== 'number') seg.woodStepTilt = -35
  live(folder.add(seg, 'woodReveal', 80, 600, 10).name('Reveal mm'), ctx)
  live(folder.add(seg, 'woodButt', 5, 100, 1).name('Butt mm'), ctx)
  live(folder.add(seg, 'woodStepTilt', -85, 85, 1).name('Step tilt°'), ctx)
}

// Slab → 1 tab riêng (ngang hàng Foundation/Stairs/Balcony): bật/tắt + độ dày (kéo live).
function buildSlabSubfolder(parent: GUI, s: StructureState, ctx: APGuiCtx): GUI {
  const f = parent.addFolder('Slab ▦')
  f.close()
  f.domElement.classList.add('ap-found') // chung style nhỏ 7px với Foundation/Stairs
  f.add(s, 'showSlab').name('Show slab').onChange(ctx.build)
  live(f.add(s, 'slabThick', 50, 500, 10).name('Thickness mm'), ctx)
  s.slabMaterial ??= 'none' // backfill design cũ (né gui.add(undefined) blank app)
  f.add(s, 'slabMaterial', { Concrete: 'none', 'Wood (demo)': 'wood' })
    .name('Material')
    .onChange(ctx.build)
  return f
}

// Dropdown chọn tường gắn ban công (W-1..W-N theo số segment).
function wallIdxOptions(inst: ShapeInstance): Record<string, number> {
  const o: Record<string, number> = {}
  for (let i = 0; i < inst.segments.length; i++) o[`W-${i + 1}`] = i
  return o
}

// 1 panel ban công: tường gắn + vị trí/bề rộng/độ vươn/cao độ/lan can (kéo live) + Remove.
function buildOneBalcony(parent: GUI, inst: ShapeInstance, balconyIdx: number, ctx: APGuiCtx): GUI {
  const b = inst.structure.balconies[balconyIdx]
  const f = parent.addFolder(`Balcony ${balconyIdx + 1}`)
  f.close()
  ctx.registerFocus(`bal:${inst.id}:${balconyIdx}`, f) // 3D click ban công → folder này
  f.add(b, 'wallIdx', wallIdxOptions(inst)).name('Wall').onChange(ctx.build)
  live(f.add(b, 'x', 0, 20000, 50).name('X mm'), ctx)
  live(f.add(b, 'width', 300, 12000, 50).name('Width mm'), ctx)
  live(f.add(b, 'depth', 300, 4000, 50).name('Project mm'), ctx)
  live(f.add(b, 'y', -3000, 12000, 50).name('Y mm'), ctx)
  live(f.add(b, 'railH', 200, 2000, 50).name('Rail H mm'), ctx)
  live(f.add(b, 'slabT', 50, 400, 10).name('Slab T mm'), ctx)
  f.add(
    {
      fn: () => {
        inst.structure.balconies.splice(balconyIdx, 1)
        ctx.rebuild()
        ctx.build()
      },
    },
    'fn'
  )
    .name('✕ Remove')
    .domElement.classList.add('ap-btn-remove')
  return f
}

// Ban công → hàng TAB ngang "1 2 3… [＋]" (như Cột). Click tab Balcony i → highlight cái đó.
function buildBalconySubfolder(parent: GUI, inst: ShapeInstance, ctx: APGuiCtx): GUI {
  const f = parent.addFolder('Balcony ⊐')
  f.close()
  f.domElement.classList.add('ap-found')
  if (!Array.isArray(inst.structure.balconies)) inst.structure.balconies = [] // self-heal
  const sections: { label: string; folder: GUI; highlight?: () => void }[] = []
  inst.structure.balconies.forEach((_, i) => {
    const balconyIdx = i
    sections.push({
      label: `${i + 1}`,
      folder: buildOneBalcony(f, inst, i, ctx),
      highlight: () => ctx.highlightPart({ kind: 'balcony', instId: inst.id, balconyIdx }),
    })
  })
  const addBtn = document.createElement('button')
  addBtn.textContent = '＋'
  addBtn.className = 'ap-tab-btn ap-tab-add'
  addBtn.title = 'Thêm ban công'
  addBtn.addEventListener('click', () => {
    inst.structure.balconies.push(mkBalcony())
    ctx.rebuild()
    ctx.build()
  })
  const ch = f.domElement.querySelector('.lil-children') as HTMLElement
  buildTabBar(ch, sections, addBtn, ctx, `bal:${inst.id}`)
  return f
}

// ── Opening subfolders ─────────────────────────────────────────────────────────

// Dựng 1 panel cửa: type + 4 slider (Width/Height/X/Y) mỗi cái 1 hàng — KÉO = live. + Remove.
// Width/Height cho vượt chiều tường + Y cho ÂM (kéo xuống dưới sàn) → lỗ tròn bị tường clip thành
// cửa bán nguyệt/cung. X giới hạn trong chiều dài tường (xMax).
function buildOneOpening(
  segFolder: GUI,
  inst: ShapeInstance,
  segIdx: number,
  op: OpeningState,
  opIdx: number,
  ctx: APGuiCtx
): GUI {
  const opF = segFolder.addFolder(`Opening ${opIdx + 1}`)
  const kindCtrl = opF
    .add(op, 'kind', ['door', 'window', 'loading_door'])
    .name('')
    .onChange(ctx.build)
  kindCtrl.domElement.classList.add('ap-noname', 'ap-open-type') // bỏ chữ "kind" + dịch xuống 2px
  opF.add(op, 'round').name('Tròn (ellip)').onChange(ctx.build) // dáng lỗ — trục geometry tách rời kind
  const xMax = Math.max(1000, inst.segments[segIdx].length)
  live(opF.add(op, 'w', 100, 6000, 10).name('Width'), ctx)
  live(opF.add(op, 'h', 100, 6000, 10).name('Height'), ctx)
  live(opF.add(op, 'x', 0, xMax, 10).name('X'), ctx)
  live(opF.add(op, 'yOffset', -3000, 6000, 10).name('Y'), ctx)
  opF
    .add(
      {
        fn: () => {
          inst.segments[segIdx].openings.splice(opIdx, 1)
          rebuildOpeningSubfolders(segFolder, inst, segIdx, ctx)
          ctx.build()
        },
      },
      'fn'
    )
    .name('✕ Remove')
  return opF
}

export function rebuildOpeningSubfolders(
  segFolder: GUI,
  inst: ShapeInstance,
  segIdx: number,
  ctx: APGuiCtx
): void {
  const key = `${inst.id}:${segIdx}`
  for (const f of ctx.opFolders.get(key) ?? []) f.destroy()
  // Gỡ tab-bar opening CŨ (con trực tiếp của .lil-children) → tránh nhân đôi mỗi lần rebuild.
  const ch = segFolder.domElement.querySelector('.lil-children') as HTMLElement
  for (const el of Array.from(ch.children)) {
    if (el.classList.contains('ap-tab-bar')) el.remove()
  }
  const opArr: GUI[] = []
  ctx.opFolders.set(key, opArr)
  const sections: { label: string; folder: GUI; highlight?: () => void }[] = []
  inst.segments[segIdx].openings.forEach((op, opIdx) => {
    const opF = buildOneOpening(segFolder, inst, segIdx, op, opIdx, ctx)
    opArr.push(opF)
    sections.push({
      label: `${opIdx + 1}`,
      folder: opF,
      highlight: () => ctx.highlightPart({ kind: 'open', instId: inst.id, segIdx, opIdx }),
    })
  })
  // Nút "open" (thêm cửa/sổ) NẰM CUỐI hàng tab (như nút ＋ thêm tầng). 0 lỗ → đứng 1 mình.
  const openBtn = document.createElement('button')
  openBtn.textContent = 'open'
  openBtn.className = 'ap-tab-btn ap-tab-add ap-tab-open'
  openBtn.title = 'Thêm cửa/sổ'
  openBtn.addEventListener('click', () => {
    inst.segments[segIdx].openings.push(defaultOpening('window'))
    ctx.setActiveTab(`op:${key}`, inst.segments[segIdx].openings.length - 1)
    rebuildOpeningSubfolders(segFolder, inst, segIdx, ctx)
    ctx.build()
  })
  // Opening → hàng tab ngang "1 2 3… [open]" (giống tab tường + nút thêm).
  buildTabBar(ch, sections, openBtn, ctx, `op:${key}`)
}

// Decor panel GUI đã gỡ (2026-05-31, theo yêu cầu). State seg.panels[] giữ nguyên (render vẫn chạy
// nếu có sẵn trong design cũ) — chỉ bỏ control thêm/sửa panel trong GUI.

// ── Section builders ───────────────────────────────────────────────────────────

export function buildStructureSection(
  parent: GUI,
  inst: ShapeInstance,
  ctx: APGuiCtx,
  isGround: boolean
): GUI {
  const f = parent.addFolder('Structure')
  f.close()
  ctx.registerFocus(`struct:${inst.id}`, f) // 3D click móng/sàn → Structure section
  live(f.add(inst, 'wallDepth', 100, 400, 10).name('Wall depth'), ctx)
  addDimsControls(f, inst, ctx) // total W/D… (từ tab Dims cũ)
  // Foundation / Slab / Stairs / Balcony → hàng tab ngang, bấm để thả panel. Foundation chỉ ở
  // tầng trệt (GF). Tab đơn (foundation/slab/stairs) click → highlight; Balcony là container nhiều
  // tab con (như Cols) → KHÔNG highlight ở tab container, chỉ từng ban công riêng.
  const hi =
    (kind: 'foundation' | 'slab' | 'stairs'): (() => void) =>
    (): void =>
      ctx.highlightPart({ kind, instId: inst.id })
  const subs: { label: string; folder: GUI; highlight?: () => void }[] = []
  if (isGround) {
    const foundF = buildFoundationSubfolder(f, inst.structure, ctx)
    ctx.registerFocus(`found:${inst.id}`, foundF) // 3D click móng → tab Foundation
    subs.push({ label: 'Foundation', folder: foundF, highlight: hi('foundation') })
  }
  const slabF = buildSlabSubfolder(f, inst.structure, ctx)
  ctx.registerFocus(`slab:${inst.id}`, slabF) // 3D click sàn → tab Slab
  subs.push({ label: 'Slab', folder: slabF, highlight: hi('slab') })
  const stairsF = buildStairsSubfolder(f, inst.structure.stairs, ctx)
  ctx.registerFocus(`stairs:${inst.id}`, stairsF) // 3D click cầu thang → tab Stairs
  subs.push({ label: 'Stairs', folder: stairsF, highlight: hi('stairs') })
  // Balcony container — không highlight (chỉ từng ban công riêng, xem buildBalconySubfolder).
  subs.push({ label: 'Balcony', folder: buildBalconySubfolder(f, inst, ctx) })
  const ch = f.domElement.querySelector('.lil-children') as HTMLElement
  buildTabBar(ch, subs, undefined, ctx, `struct:${inst.id}`)
  return f
}

// Móng — dropdown riêng, cùng cấp Stairs. Nhô riêng 4 hướng N/E/S/W (m) tính TỪ mặt ngoài
// tường: min 0 (sát mặt tường), max 2m. Wall/shape KHÔNG dời khi móng nhô (dựng đối xứng +
// translate tâm trong makePositionedFoundation).
function buildFoundationSubfolder(parent: GUI, s: StructureState, ctx: APGuiCtx): GUI {
  const f = parent.addFolder('Foundation')
  f.close()
  f.domElement.classList.add('ap-found') // fontsize 7px — chung style với Stairs
  f.add(s, 'showFoundation').name('Show foundation').onChange(ctx.build)
  s.foundType ??= 'concrete' // backfill design cũ (né gui.add undefined)
  f.add(s, 'foundType', { Concrete: 'concrete', 'Wood deck (JP)': 'wood-deck' })
    .name('Type')
    .onChange(ctx.build)
  live(f.add(s, 'foundH', 100, 2000, 50).name('Height'), ctx)
  live(f.add(s.foundOh, 'n', 0, 2, 0.05).name('Expand N m'), ctx)
  live(f.add(s.foundOh, 'e', 0, 2, 0.05).name('Expand E m'), ctx)
  live(f.add(s.foundOh, 's', 0, 2, 0.05).name('Expand S m'), ctx)
  live(f.add(s.foundOh, 'w', 0, 2, 0.05).name('Expand W m'), ctx)
  return f
}

// Cầu thang — footprint chiếu lên Y khoét lỗ slab tầng trên (cầu thang đi xuống)
function buildStairsSubfolder(parent: GUI, stair: StairState, ctx: APGuiCtx): GUI {
  const f = parent.addFolder('Stairs ↗')
  f.close()
  f.domElement.classList.add('ap-stairs') // fontsize 7px cho bộ phận bên trong
  f.add(stair, 'show').name('Show stairs').onChange(ctx.build)
  live(f.add(stair, 'rotDeg', 0, 360, 5).name('Rotate °'), ctx)
  live(f.add(stair, 'x', -15000, 15000, 50).name('X local'), ctx)
  live(f.add(stair, 'z', -15000, 15000, 50).name('Z local'), ctx)
  live(f.add(stair, 'runL', 500, 12000, 100).name('Run length'), ctx)
  live(f.add(stair, 'width', 500, 5000, 50).name('Width'), ctx)
  live(f.add(stair, 'steps', 3, 40, 1).name('Steps'), ctx)
  return f
}

export function buildColumnFolder(
  parent: GUI,
  inst: ShapeInstance,
  colIdx: number,
  ctx: APGuiCtx
): GUI {
  const col = inst.structure.columns[colIdx]
  const f = parent.addFolder(`Col ${colIdx + 1}`)
  f.close()
  ctx.registerFocus(`col:${inst.id}:${colIdx}`, f) // 3D click cột → folder này
  f.add(col, 'type', ['round', 'square']).name('Type').onChange(ctx.build)
  live(f.add(col, 'x', -15000, 15000, 50).name('X local mm'), ctx)
  live(f.add(col, 'z', -15000, 15000, 50).name('Z local mm'), ctx)
  live(f.add(col, 'h', 500, 8000, 50).name('Height mm'), ctx)
  live(f.add(col, 'r', 50, 500, 10).name('Radius mm (round)'), ctx)
  live(f.add(col, 'size', 100, 600, 10).name('Side mm (square)'), ctx)
  f.add(
    {
      fn: () => {
        if (window.confirm('Xóa cột này?')) ctx.removeColumn(inst, colIdx)
      },
    },
    'fn'
  )
    .name('✕ Remove Col')
    .domElement.classList.add('ap-btn-remove')
  return f
}

export function buildRoofSection(parent: GUI, inst: ShapeInstance, ctx: APGuiCtx): GUI {
  const f = parent.addFolder('Roof')
  f.close()
  ctx.registerFocus(`roof:${inst.id}`, f) // 3D click mái → section này
  f.add(inst.roof, 'show').name('Show roof').onChange(ctx.build)
  f.add(inst.roof, 'type', ['gabled', 'hip', 'flat', 'shed', 'half-hip', 'skew'])
    .name('Type')
    .onChange(ctx.build)
  live(f.add(inst.roof, 'pitch', 5, 60, 1).name('Pitch °'), ctx)
  f.add(inst.roof, 'rotDeg', [0, 90, 180, 270]).name('Rotate °').onChange(ctx.build)
  // Overhang riêng 4 hướng (m) — bỏ scale chung
  live(f.add(inst.roof.overhang, 'n', 0, 1.5, 0.05).name('Overhang N m'), ctx)
  live(f.add(inst.roof.overhang, 'e', 0, 1.5, 0.05).name('Overhang E m'), ctx)
  live(f.add(inst.roof.overhang, 's', 0, 1.5, 0.05).name('Overhang S m'), ctx)
  live(f.add(inst.roof.overhang, 'w', 0, 1.5, 0.05).name('Overhang W m'), ctx)
  live(f.add(inst.roof, 'parapetH', 0, 1.5, 0.05).name('Parapet H m'), ctx)
  return f
}

// Dims (total W/D… theo shape config) — giờ nằm TRONG Structure (dưới Slab), bỏ tab Dims.
function addDimsControls(f: GUI, inst: ShapeInstance, ctx: APGuiCtx): void {
  const config = SHAPE_CONFIGS[inst.shapeKey ?? '']
  if (!config) return
  for (const [k, def] of Object.entries(config.dims)) {
    // bỏ " mm" ở label — Structure đã ngầm hiểu đơn vị mm
    f.add(inst.dims, k, def.min, def.max, def.step)
      .name(def.label.replace(/ mm$/, ''))
      .onChange(() => ctx.onDimChangeLive(inst)) // kéo → resize building live
      .onFinishChange(() => ctx.onDimChange(inst)) // buông → commit (history + persist)
  }
}

// Cột thành hàng TAB ngang "1 2 3… [＋]" (giống Walls/Opening). Click tab Col i → highlight cột đó.
export function buildColumnsSection(parent: GUI, inst: ShapeInstance, ctx: APGuiCtx): GUI {
  const f = parent.addFolder(`Columns (${inst.structure.columns.length})`)
  f.close()
  const sections: { label: string; folder: GUI; highlight?: () => void }[] = []
  inst.structure.columns.forEach((_, i) => {
    const colIdx = i
    sections.push({
      label: `${i + 1}`,
      folder: buildColumnFolder(f, inst, i, ctx),
      highlight: () => ctx.highlightPart({ kind: 'col', instId: inst.id, colIdx }),
    })
  })
  // Nút "＋" thêm cột ở cuối hàng tab (như nút thêm tầng/opening). 0 cột → đứng 1 mình.
  const addBtn = document.createElement('button')
  addBtn.textContent = '＋'
  addBtn.className = 'ap-tab-btn ap-tab-add'
  addBtn.title = 'Thêm cột'
  addBtn.addEventListener('click', () => ctx.addColumn(inst))
  const ch = f.domElement.querySelector('.lil-children') as HTMLElement
  buildTabBar(ch, sections, addBtn, ctx, `cols:${inst.id}`)
  return f
}

export function buildWallsSection(parent: GUI, inst: ShapeInstance, ctx: APGuiCtx): GUI {
  const key = inst.shapeKey ?? ''
  const config = SHAPE_CONFIGS[key]
  const f = parent.addFolder(`Walls (${inst.segments.length})`)
  f.close()
  if (config) {
    // Mỗi tường = 1 tab ngang W-1..W-N (giống tab Struct/Roof/Walls cấp trên). Hướng gốc
    // (S/E/N/W từ config.wallLabels) đưa vào tooltip nút tab — không mất thông tin.
    const sections: {
      label: string
      folder: GUI
      title?: string
      highlight?: () => void
    }[] = []
    for (let i = 0; i < inst.segments.length; i++) {
      const segIdx = i
      sections.push({
        label: `${i + 1}`,
        folder: buildWallFolder(f, inst, i, ctx),
        title: config.wallLabels[i],
        highlight: () => ctx.highlightPart({ kind: 'wall', instId: inst.id, segIdx }),
      })
    }
    const ch = f.domElement.querySelector('.lil-children') as HTMLElement
    buildTabBar(ch, sections, undefined, ctx, `wall:${inst.id}`)
  }
  return f
}

export function buildWallFolder(parent: GUI, inst: ShapeInstance, idx: number, ctx: APGuiCtx): GUI {
  const folder = parent.addFolder(`${idx + 1}`)
  folder.close()
  ctx.registerFocus(`wall:${inst.id}:${idx}`, folder) // 3D click tường/cửa → folder này
  ctx.opFolders.set(`${inst.id}:${idx}`, [])
  const seg = inst.segments[idx]
  addDimRow(folder, seg, ctx, true) // wall folder: Height|Width (Color bỏ — dùng palette brush)
  addMaterialControls(folder, seg, ctx)
  rebuildOpeningSubfolders(folder, inst, idx, ctx)
  return folder
}

export function buildSegmentsSection(parent: GUI, inst: ShapeInstance, ctx: APGuiCtx): GUI {
  const f = parent.addFolder(`Segments (${inst.segments.length})`)
  f.close()
  for (let i = 0; i < inst.segments.length; i++) {
    buildSegmentFolder(f, inst, i, ctx)
  }
  f.add(
    {
      fn: () => {
        inst.segments.push(mkSeg(4000, 90))
        ctx.rebuild()
      },
    },
    'fn'
  ).name('＋ Add Segment')
  return f
}

export function buildSegmentFolder(
  parent: GUI,
  inst: ShapeInstance,
  idx: number,
  ctx: APGuiCtx
): void {
  const seg = inst.segments[idx]
  const folder = parent.addFolder(`Seg ${idx + 1}`)
  folder.close()
  ctx.registerFocus(`wall:${inst.id}:${idx}`, folder) // 3D click segment/cửa → folder này
  ctx.opFolders.set(`${inst.id}:${idx}`, [])
  live(folder.add(seg, 'length', 500, 20000, 100).name('Length mm'), ctx)
  folder.add(seg, 'turnBefore', TURN_OPTIONS).name('Turn before').onChange(ctx.build)
  addDimRow(folder, seg, ctx)
  addMaterialControls(folder, seg, ctx)
  rebuildOpeningSubfolders(folder, inst, idx, ctx)
  buildSegActions(folder, inst, idx, ctx)
}

function buildSegActions(folder: GUI, inst: ShapeInstance, idx: number, ctx: APGuiCtx): void {
  if (idx > 0) {
    folder
      .add(
        {
          fn: () => {
            const tmp = inst.segments[idx - 1]
            inst.segments[idx - 1] = inst.segments[idx]
            inst.segments[idx] = tmp
            ctx.rebuild()
            ctx.build()
          },
        },
        'fn'
      )
      .name('↑ Move Up')
  }
  if (idx < inst.segments.length - 1) {
    folder
      .add(
        {
          fn: () => {
            const tmp = inst.segments[idx + 1]
            inst.segments[idx + 1] = inst.segments[idx]
            inst.segments[idx] = tmp
            ctx.rebuild()
            ctx.build()
          },
        },
        'fn'
      )
      .name('↓ Move Down')
  }
  if (inst.segments.length > 3) {
    folder
      .add(
        {
          fn: () => {
            inst.segments.splice(idx, 1)
            ctx.rebuild()
            ctx.build()
          },
        },
        'fn'
      )
      .name('✕ Remove Seg')
  }
}
