/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/interaction/manipulate.ts
 * VAI TRÒ  — Tương tác con trỏ trên 3D building: (a) Move tool — kéo element trong ràng buộc riêng
 *            (không rời cha); (b) click → Focus GUI panel tương ứng. Dùng chung lớp pick + raycast.
 * LIÊN HỆ  — Tạo bởi ArchPlanLab (onInit) qua ManipulateHost. Pointer handlers ở lab dispatch vào
 *            dragStart/dragMove/dragEnd (Move) + clickFocus (click thường). registerFocus do
 *            GUI builders gọi qua ctx.registerFocus. Mode coordination (_setMoveMode) GIỮ ở lab.
 *
 * CÁCH DÙNG:
 *   const m = new ManipulateTool(host)
 *   m.dragStart(e) / m.dragMove(e) / m.dragEnd()   // Move mode (lab pointer handlers)
 *   m.clickFocus(e)                                // click thường → trỏ GUI
 *   m.registerFocus(key, folder) / m.clearFocus()  // GUI builders đăng ký anchor (clear mỗi rebuild)
 *   m.isDragging() / m.cancelDrag()                // lab kiểm tra / huỷ phiên kéo (đổi mode)
 * DISPOSE: không giữ listener/GPU — _focusAnchors + _drag là ref thuần, GC tự dọn.
 */

import type GUI from 'lil-gui'
import * as THREE from 'three'

import type {
  BalconyState,
  ColumnState,
  OpeningState,
  ShapeInstance,
  StairState,
} from '../state/state'
import type { AABB } from './snap'
import { instAABB, shiftAABB, snapDelta, unionAABB } from './snap'

// userData gắn trên mỗi pick box (vô hình) — định danh element để paint/move.
export type PickUD = { instId?: string; segIdx?: number; key?: string; opIdx?: number }

// Snap nam-châm (mét) khi giữ Ctrl kéo khối: ngưỡng hít MẶT khối kề + ngưỡng canh thẳng mép vuông góc.
const SNAP_FLUSH = 0.4
const SNAP_ALIGN = 0.4

// 1 phiên kéo Move tool. Mỗi element kéo trong ràng buộc riêng (KHÔNG rời cha):
//  inst→XZ tự do · col/stairs→XZ local (un-rotate rotY) · bal→trượt dọc tường · open→mặt tường 2D.
type DragSession =
  | {
      kind: 'inst'
      inst: ShapeInstance
      plane: THREE.Plane
      start: THREE.Vector3
      x0: number
      z0: number
      fast: boolean // 1 instance duy nhất → kéo = DỜI group (0 rebuild); nhiều instance = false → LOD-rebuild
      // 🧲 Shape Group P2a: kéo khối THUỘC nhóm ≥2 → GHOST bbox cả nhóm bay theo (0 rebuild, 0 đụng
      // split-render KI-009); buông = cộng Δ (gdx/gdz, đã gồm snap) vào posX/posZ TẤT CẢ + rebuild 1 lần.
      group: string[] | null
      gdx: number
      gdz: number
    }
  | {
      kind: 'colz'
      target: ColumnState | StairState
      plane: THREE.Plane
      start: THREE.Vector3
      x0: number
      z0: number
      rotR: number
    }
  | {
      kind: 'bal'
      target: BalconyState
      plane: THREE.Plane
      start: THREE.Vector3
      x0: number
      th: number
      lo: number
      hi: number
    }
  | {
      kind: 'open'
      target: OpeningState
      plane: THREE.Plane
      start: THREE.Vector3
      x0: number
      y0: number
      th: number
      xHi: number
      yHi: number
    }

// Host: ArchPlanLab cấp scene refs + callback rebuild/locate. Lab giữ mode coordination + pick layer.
export interface ManipulateHost {
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  raycaster: THREE.Raycaster
  pickGroup: THREE.Group
  locateInst(id: string): ShapeInstance | null
  siblingInstances(id: string): ShapeInstance[] // khối shape KHÁC cùng tầng với id — cho Ctrl-snap
  instanceCount(): number // tổng instance mọi tầng — quyết định fast-path kéo-cả-nhà (chỉ khi ==1)
  buildScene(): void
  buildSceneLive(): void
  translateBuildingLive(dx: number, dz: number): void // kéo-cả-nhà (1 inst): dời group theo Δ mét, KHÔNG rebuild
  // 🚀 Kéo 1 shape khi CÓ NHIỀU shape (split-render): start = dựng shape khác (static) + shape đang kéo (group
  // riêng) 1 lần; translate = dời group shape đang kéo mỗi frame (0 rebuild); end = full rebuild commit.
  beginInstDragSplit(instId: string): void
  instDragTranslate(dx: number, dz: number): void
  rebuildDragShape(): void // kéo ELEMENT (cột/cửa/cầu thang) đa-shape: rebuild CHỈ shape chứa element (others static)
  endInstDragSplit(): void
  refreshGuiNumbers(): void
  // 🧲 Shape Group (P1+P2a — interaction/selection.ts): nhóm ad-hoc chọn bằng Shift+click ở lab.
  selectedIds(): string[] // [] = không có nhóm; kéo khối thuộc nhóm ≥2 → ghost-drag thay split
  beginGroupGhost(): void
  moveGroupGhost(dx: number, dz: number): void
  endGroupGhost(): void // idempotent — cancelDrag/đổi mode gọi an toàn
}

export class ManipulateTool {
  private _drag: DragSession | null = null
  private _splitActive = false // phiên kéo này dùng split-render (đa-shape) → translate/rebuild shape kéo, others static
  private _focusAnchors = new Map<string, GUI>()
  private _focusActions = new Map<string, () => void>() // pre-action trước anchor (section gọn round)

  constructor(private readonly host: ManipulateHost) {}

  // Ủy quyền về host — body method giữ NGUYÊN VĂN (this.canvas / this._ray / this.camera / …).
  private get canvas(): HTMLCanvasElement {
    return this.host.canvas
  }
  private get camera(): THREE.Camera {
    return this.host.camera
  }
  private get _ray(): THREE.Raycaster {
    return this.host.raycaster
  }
  private get pickGroup(): THREE.Group {
    return this.host.pickGroup
  }
  private _locateInst(id: string): { inst: ShapeInstance } | null {
    const inst = this.host.locateInst(id)
    return inst ? { inst } : null
  }
  private _buildScene(): void {
    this.host.buildScene()
  }
  private _buildSceneLive(): void {
    this.host.buildSceneLive()
  }

  // Lab gọi: đăng ký / xoá anchor folder (3D→GUI), kiểm tra / huỷ phiên kéo.
  registerFocus(key: string, folder: GUI): void {
    this._focusAnchors.set(key, folder)
  }
  // Action chạy TRƯỚC khi tra anchor — section gọn (round: N mặt 1 folder) dùng để đổi mặt đang chọn
  // + rebuild GUI; anchor mặt mới tự đăng ký trong rebuild nên tra anchor SAU action vẫn trúng folder.
  registerFocusAction(key: string, fn: () => void): void {
    this._focusActions.set(key, fn)
  }
  clearFocus(): void {
    this._focusAnchors.clear()
    this._focusActions.clear()
  }
  isDragging(): boolean {
    return this._drag !== null
  }
  cancelDrag(): void {
    const split = this._splitActive
    this._splitActive = false
    this._drag = null
    this.host.endGroupGhost() // ghost nhóm đang bay (nếu có) — gỡ, KHÔNG commit
    if (split) this.host.endInstDragSplit() // dọn dragGroup + full rebuild (kẻo shape đang kéo biến mất)
  }

  /** instId dưới con trỏ (pick layer) — lab dùng cho Shift+click chọn nhóm (chung raycast với Move). */
  pickInstId(e: PointerEvent): string | null {
    const hit = this._pickHit(e)
    const id = hit ? (hit.object.userData as PickUD).instId : undefined
    return typeof id === 'string' ? id : null
  }

  private _ndcOf(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect()
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    )
  }

  private _rayPlanePoint(e: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null {
    this._ray.setFromCamera(this._ndcOf(e), this.camera)
    const out = new THREE.Vector3()
    return this._ray.ray.intersectPlane(plane, out) ? out : null
  }

  // Raycast pick layer, ưu tiên hit cửa (opIdx) hơn box tường trùng vùng. null = trượt ra ngoài.
  private _pickHit(e: PointerEvent): THREE.Intersection | null {
    this._ray.setFromCamera(this._ndcOf(e), this.camera)
    const hits = this._ray.intersectObjects(this.pickGroup.children, false)
    if (hits.length === 0) return null
    return hits.find((h) => (h.object.userData as PickUD).opIdx !== undefined) ?? hits[0]
  }

  // Nhấn xuống Move mode: chọn element → mở GUI tương ứng (tiện chỉnh) + bắt đầu phiên kéo.
  dragStart(e: PointerEvent): void {
    const hit = this._pickHit(e)
    if (!hit) return
    const ud = hit.object.userData as PickUD
    const inst = typeof ud.instId === 'string' ? this._locateInst(ud.instId)?.inst : null
    if (!inst) return
    this._focusGuiFor(ud) // 3D → GUI: nhấn vật thể → trỏ thẳng panel tương ứng
    this._drag = this._makeDragSession(inst, ud, hit.point, hit.object.rotation.y)
    if (this._drag) {
      this.canvas.setPointerCapture(e.pointerId)
      if (this._tryGroupGhost(inst)) return // 🧲 khối thuộc nhóm ≥2 → ghost-drag cả nhóm (không split)
      // ĐA-SHAPE → split-render 1 lần (shape khác static, shape chứa element đang kéo vào group riêng): kéo
      // SHAPE = translate group đó; kéo ELEMENT (cột/cửa/cầu thang) = rebuild CHỈ group đó → mượt bất kể số
      // shape. ('inst' fast = 1 shape duy nhất → giữ path dời-cả-group; split vô ích vì dragged = cả nhà.)
      const isFastInst = this._drag.kind === 'inst' && this._drag.fast
      if (this.host.instanceCount() > 1 && !isFastInst) {
        this.host.beginInstDragSplit(inst.id)
        this._splitActive = true
      }
    }
  }

  // 🧲 Kéo KHỐI thuộc nhóm chọn ≥2 → ghost-drag cả nhóm (P2a): KHÔNG split, KHÔNG rebuild khi kéo —
  // chỉ bbox ghost bay theo, commit khi buông. (Kéo ELEMENT trong khối thuộc nhóm vẫn đường thường.)
  private _tryGroupGhost(inst: ShapeInstance): boolean {
    const d = this._drag
    if (!d || d.kind !== 'inst') return false
    const sel = this.host.selectedIds()
    if (sel.length < 2 || !sel.includes(inst.id)) return false
    d.group = sel
    this.host.beginGroupGhost()
    return true
  }

  // Click thường (không Move): chỉ trỏ GUI tới panel của element, không kéo.
  clickFocus(e: PointerEvent): void {
    const hit = this._pickHit(e)
    if (hit) this._focusGuiFor(hit.object.userData as PickUD)
  }

  // Map userData pick → key folder GUI đã đăng ký. Cửa (opIdx) → folder tường chứa nó.
  private _focusKey(ud: PickUD): string | null {
    if (typeof ud.instId !== 'string') return null
    const id = ud.instId
    if (typeof ud.segIdx === 'number') return `wall:${id}:${ud.segIdx}` // tường + cửa → folder tường
    const k = ud.key ?? ''
    if (k.startsWith('col:')) return `col:${id}:${k.slice(4)}`
    if (k.startsWith('bal:')) return `bal:${id}:${k.slice(4)}`
    if (k === 'stairs') return `stairs:${id}`
    if (k === 'roof') return `roof:${id}`
    if (k === 'found') return `found:${id}` // tab Foundation con (trong Structure)
    if (k === 'slab') return `slab:${id}` // tab Slab con
    return null
  }

  // 3D → GUI: mở folder + mọi cha (lil-gui .open) + kích hoạt mọi tab chứa nó (Tabs ẩn = display:none)
  // → cuộn vào tầm nhìn + flash. Public API lil-gui; chỉ phần tab chạm DOM (aria-controls).
  private _focusGuiFor(ud: PickUD): void {
    const key = this._focusKey(ud)
    if (!key) return
    this._focusActions.get(key)?.() // section gọn (round): đổi mặt chọn + rebuild → anchor mới có ngay
    const folder = this._focusAnchors.get(key)
    if (!folder) return
    for (let g: GUI | undefined = folder; g; g = g.parent) g.open()
    for (let n: HTMLElement | null = folder.domElement; n; n = n.parentElement) {
      if (n.getAttribute('role') === 'tabpanel' && n.style.display === 'none') {
        const btn = document.querySelector(`[aria-controls="${n.id}"]`)
        if (btn instanceof HTMLElement) btn.click()
      }
    }
    folder.domElement.scrollIntoView({ block: 'nearest' })
    folder.domElement.classList.add('ap-focus-flash')
    window.setTimeout(() => folder.domElement.classList.remove('ap-focus-flash'), 800)
  }

  // Mặt chiếu khi kéo: ngang (cả nhà/cột/cầu thang) hay đứng theo mặt tường (ban công/cửa).
  private _horizPlane(p: THREE.Vector3): THREE.Plane {
    return new THREE.Plane(new THREE.Vector3(0, 1, 0), -p.y)
  }
  private _wallPlane(p: THREE.Vector3, th: number): THREE.Plane {
    return new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(Math.sin(th), 0, Math.cos(th)),
      p
    )
  }

  // Dispatch phiên kéo theo loại element. plane = mặt chiếu; start = điểm neo; *0 = field gốc.
  private _makeDragSession(
    inst: ShapeInstance,
    ud: PickUD,
    p: THREE.Vector3,
    th: number
  ): DragSession | null {
    if (typeof ud.opIdx === 'number' && typeof ud.segIdx === 'number') {
      return this._dragOpen(inst, ud.segIdx, ud.opIdx, p, th)
    }
    const key = ud.key ?? ''
    if (key.startsWith('bal:')) return this._dragBal(inst, Number(key.slice(4)), p, th)
    if (key.startsWith('col:')) {
      const col = inst.structure.columns[Number(key.slice(4))]
      return col ? this._localDrag(col, p, inst.rotY) : null
    }
    if (key === 'stairs') return this._localDrag(inst.structure.stairs, p, inst.rotY)
    // tường/mái/móng/sàn → kéo cả nhà. fast = chỉ 1 instance (dời group an toàn; nhiều instance dùng
    // chung buildingGroup nên dời group sẽ dời TẤT CẢ → phải rebuild theo posX/posZ riêng từng cái).
    return {
      kind: 'inst',
      inst,
      plane: this._horizPlane(p),
      start: p,
      x0: inst.posX,
      z0: inst.posZ,
      fast: this.host.instanceCount() === 1,
      group: null,
      gdx: 0,
      gdz: 0,
    }
  }

  // Cửa/cửa sổ: trượt trên mặt tường 2D (dọc tường + lên/xuống), clamp trong khung tường.
  private _dragOpen(
    inst: ShapeInstance,
    segIdx: number,
    opIdx: number,
    p: THREE.Vector3,
    th: number
  ): DragSession | null {
    const seg = inst.segments[segIdx]
    const op = seg?.openings[opIdx]
    if (!op) return null
    const xHi = Math.max(0, seg.length - op.w)
    const yHi = Math.max(0, seg.wallH - op.h)
    const plane = this._wallPlane(p, th)
    return { kind: 'open', target: op, plane, start: p, x0: op.x, y0: op.yOffset, th, xHi, yHi }
  }

  // Ban công: trượt 1D dọc tiếp tuyến tường gắn, clamp [0, wallLen − width].
  private _dragBal(
    inst: ShapeInstance,
    idx: number,
    p: THREE.Vector3,
    th: number
  ): DragSession | null {
    const b = inst.structure.balconies[idx]
    if (!b) return null
    const hi = Math.max(0, (inst.segments[b.wallIdx]?.length ?? 0) - b.width)
    return {
      kind: 'bal',
      target: b,
      plane: this._wallPlane(p, th),
      start: p,
      x0: b.x,
      th,
      lo: 0,
      hi,
    }
  }

  // Cột/cầu thang: trượt trên mặt phẳng ngang, ghi vào x/z LOCAL (un-rotate rotY trong dragMove).
  private _localDrag(
    target: ColumnState | StairState,
    p: THREE.Vector3,
    rotY: number
  ): DragSession {
    return {
      kind: 'colz',
      target,
      plane: this._horizPlane(p),
      start: p,
      x0: target.x,
      z0: target.z,
      rotR: (rotY * Math.PI) / 180,
    }
  }

  dragMove(e: PointerEvent): void {
    const d = this._drag
    if (!d) return
    const cur = this._rayPlanePoint(e, d.plane)
    if (!cur) return
    const dx = cur.x - d.start.x // mét
    const dy = cur.y - d.start.y
    const dz = cur.z - d.start.z
    if (d.kind === 'inst') {
      if (d.group) {
        this._ghostMove(d, e, dx, dz) // 🧲 ghost nhóm — KHÔNG đụng posX/posZ thật; Δ chốt ở dragEnd
        return
      }
      d.inst.posX = d.x0 + dx * 1000
      d.inst.posZ = d.z0 + dz * 1000
      if (d.fast) {
        this.host.translateBuildingLive(dx, dz) // 1 inst → DỜI group (0 rebuild, mượt dù nhà phức tạp cỡ nào)
        return // bỏ qua _buildSceneLive: commit (rebuild + reset offset) để dragEnd lo
      }
      if (e.ctrlKey) this._applySnap(d.inst) // giữ Ctrl → hít khối kề (chỉ multi-instance: fast=1 inst né nhánh này)
      // Đa-shape: DỜI group shape đang kéo (split) — 0 rebuild shape khác. Δ theo posX/posZ (gồm snap).
      this.host.instDragTranslate((d.inst.posX - d.x0) / 1000, (d.inst.posZ - d.z0) / 1000)
      return // bỏ qua _buildSceneLive: split chỉ translate; dragEnd full-rebuild commit
    } else if (d.kind === 'colz') {
      const c = Math.cos(d.rotR)
      const s = Math.sin(d.rotR)
      d.target.x = d.x0 + (dx * c + dz * s) * 1000 // un-rotate world → local
      d.target.z = d.z0 + (-dx * s + dz * c) * 1000
    } else if (d.kind === 'bal') {
      const along = (dx * Math.cos(d.th) - dz * Math.sin(d.th)) * 1000
      d.target.x = Math.max(d.lo, Math.min(d.hi, d.x0 + along))
    } else {
      const along = (dx * Math.cos(d.th) - dz * Math.sin(d.th)) * 1000
      d.target.x = Math.max(0, Math.min(d.xHi, d.x0 + along))
      d.target.yOffset = Math.max(0, Math.min(d.yHi, d.y0 + dy * 1000))
    }
    // Element (cột/cửa/ban công): geometry shape đổi → rebuild. Split (đa-shape) → CHỈ shape chứa nó; không
    // thì full (1 shape = cả nhà). Cả 2 đều throttle rAF ≤1/frame ở host.
    if (this._splitActive) this.host.rebuildDragShape()
    else this._buildSceneLive()
  }

  // Dời ghost nhóm theo chuột (+ Ctrl-snap union) — Δ cuối lưu vào session cho _commitGroup.
  private _ghostMove(
    d: Extract<DragSession, { kind: 'inst' }>,
    e: PointerEvent,
    dx: number,
    dz: number
  ): void {
    let gx = dx
    let gz = dz
    if (e.ctrlKey && d.group) {
      const s = this._groupSnap(d.group, d.inst.id, gx, gz)
      gx += s.dx
      gz += s.dz
    }
    d.gdx = gx
    d.gdz = gz
    this.host.moveGroupGhost(gx, gz)
  }

  // Snap NHÓM (Ctrl khi ghost-drag): union AABB cả nhóm (dịch theo Δ chuột) hít vào khối cùng tầng
  // NGOÀI nhóm — cả cụm như 1 khối lớn. Không có khối ngoài / không trong tầm → {0,0} (kéo tự do).
  private _groupSnap(
    group: string[],
    draggedId: string,
    dx: number,
    dz: number
  ): { dx: number; dz: number } {
    const boxes: AABB[] = []
    for (const id of group) {
      const inst = this.host.locateInst(id)
      if (inst) boxes.push(instAABB(inst))
    }
    if (boxes.length === 0) return { dx: 0, dz: 0 }
    const sibs = this.host
      .siblingInstances(draggedId)
      .filter((s) => !group.includes(s.id))
      .map(instAABB)
    if (sibs.length === 0) return { dx: 0, dz: 0 }
    return snapDelta(shiftAABB(unionAABB(boxes), dx, dz), sibs, SNAP_FLUSH, SNAP_ALIGN)
  }

  // Giữ Ctrl khi kéo khối: hít MẶT NGOÀI vào khối kề CÙNG TẦNG + canh thẳng mép (nam châm như game xây).
  // Sửa posX/posZ TRƯỚC rebuild (snap.ts pure). Không khối kề trong tầm → no-op (kéo tự do).
  private _applySnap(inst: ShapeInstance): void {
    const sibs = this.host.siblingInstances(inst.id)
    if (sibs.length === 0) return
    const { dx, dz } = snapDelta(instAABB(inst), sibs.map(instAABB), SNAP_FLUSH, SNAP_ALIGN)
    inst.posX += Math.round(dx * 1000)
    inst.posZ += Math.round(dz * 1000)
  }

  // Buông chuột: commit 1 lần (history + persist) + refresh số GUI (giữ Move mode + folder state).
  dragEnd(): void {
    const d = this._drag
    if (d && d.kind === 'inst' && d.group) {
      this._drag = null
      this._commitGroup(d.group, d.gdx, d.gdz)
      return
    }
    const split = this._splitActive
    this._splitActive = false
    this._drag = null
    if (split)
      this.host.endInstDragSplit() // split: dọn dragGroup + full rebuild merge commit (history/persist trong đó)
    else this._buildScene()
    this.host.refreshGuiNumbers()
  }

  // 🧲 Commit ghost-drag nhóm: CÙNG 1 Δ đã-round cho mọi khối (vị trí tương đối giữ TUYỆT ĐỐI — round
  // từng khối riêng sẽ trôi lệch 1mm) + rebuild đúng 1 lần (history/persist trong _buildScene).
  private _commitGroup(group: string[], gdx: number, gdz: number): void {
    this.host.endGroupGhost()
    const mx = Math.round(gdx * 1000)
    const mz = Math.round(gdz * 1000)
    for (const id of group) {
      const inst = this.host.locateInst(id)
      if (!inst) continue
      inst.posX += mx
      inst.posZ += mz
    }
    this._buildScene()
    this.host.refreshGuiNumbers()
  }
}
