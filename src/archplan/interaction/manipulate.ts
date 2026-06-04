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

// userData gắn trên mỗi pick box (vô hình) — định danh element để paint/move.
export type PickUD = { instId?: string; segIdx?: number; key?: string; opIdx?: number }

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
  instanceCount(): number // tổng instance mọi tầng — quyết định fast-path kéo-cả-nhà (chỉ khi ==1)
  buildScene(): void
  buildSceneLive(): void
  translateBuildingLive(dx: number, dz: number): void // kéo-cả-nhà (1 inst): dời group theo Δ mét, KHÔNG rebuild
  refreshGuiNumbers(): void
}

export class ManipulateTool {
  private _drag: DragSession | null = null
  private _focusAnchors = new Map<string, GUI>()

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
  clearFocus(): void {
    this._focusAnchors.clear()
  }
  isDragging(): boolean {
    return this._drag !== null
  }
  cancelDrag(): void {
    this._drag = null
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
    if (this._drag) this.canvas.setPointerCapture(e.pointerId)
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
    const folder = key ? this._focusAnchors.get(key) : undefined
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
      d.inst.posX = d.x0 + dx * 1000
      d.inst.posZ = d.z0 + dz * 1000
      if (d.fast) {
        this.host.translateBuildingLive(dx, dz) // 1 inst → DỜI group (0 rebuild, mượt dù nhà phức tạp cỡ nào)
        return // bỏ qua _buildSceneLive: commit (rebuild + reset offset) để dragEnd lo
      }
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
    this._buildSceneLive()
  }

  // Buông chuột: commit 1 lần (history + persist) + refresh số GUI (giữ Move mode + folder state).
  dragEnd(): void {
    this._drag = null
    this._buildScene()
    this.host.refreshGuiNumbers()
  }
}
