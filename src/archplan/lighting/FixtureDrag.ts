/**
 * VỊ TRÍ   — archplan/src/archplan/lighting/FixtureDrag.ts
 * VAI TRÒ  — Tương tác 🤚 Move + 👆 Focus CHUNG cho mọi fixture đèn (uplight / bollard / đèn dây):
 *            nhấn trúng đèn → kéo trên mặt y=0 (0 rebuild) · click → focus panel. Mirror SunGizmo.
 *            Host bơm 1 `FixtureSystem` (interface pick/getBase/moveBase) ⇒ 1 class phục vụ cả 3 hệ.
 * LIÊN HỆ  — host = LightingController (tạo 1 FixtureDrag/hệ, adapter wrap pickX của lõi). ArchPlanLab hook
 *            pointer qua controller: down→tryStartDrag, move→drag, up→endDrag, right→cancelDrag, click→tryClickFocus.
 *
 * CÁCH DÙNG: const d = new FixtureDrag(host); if (d.tryStartDrag(e)) return
 */

import * as THREE from 'three'

/** Hợp đồng 1 hệ đèn cần để kéo/focus (mọi lõi site/lighting/* đều thoả: chỉ khác tên pickX → adapter). */
export interface FixtureSystem {
  pick: (ray: THREE.Raycaster) => number
  getBase: (i: number) => { x: number; z: number } | null
  moveBase: (i: number, x: number, z: number) => void
}

export interface FixtureDragHost {
  camera: THREE.Camera
  canvas: HTMLCanvasElement
  system: FixtureSystem
  setOrbit: (on: boolean) => void // tắt orbit khi kéo
  onMoved: (i: number, x: number, z: number) => void // commit dời → cập nhật config + persist
  onFocus: (i: number) => void // click/nhấn → panel focus đèn i
}

export class FixtureDrag {
  private readonly ray = new THREE.Raycaster()
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) // mặt đất y=0
  private readonly hit = new THREE.Vector3()
  private idx = -1
  private startX = 0
  private startZ = 0

  constructor(private readonly host: FixtureDragHost) {}

  isDragging(): boolean {
    return this.idx >= 0
  }

  /** Nhấn trúng đèn → bắt đầu kéo + focus. Trả true (caller dừng xử lý khác). */
  tryStartDrag(e: PointerEvent): boolean {
    this.ray.setFromCamera(this._ndc(e), this.host.camera)
    const i = this.host.system.pick(this.ray)
    if (i < 0) return false
    const base = this.host.system.getBase(i)
    if (!base) return false
    this.idx = i
    this.startX = base.x
    this.startZ = base.z
    this.host.setOrbit(false)
    this.host.onFocus(i)
    return true
  }

  /** Kéo: chiếu tia chuột xuống mặt y=0 → dời đèn (0 rebuild). */
  drag(e: PointerEvent): void {
    if (this.idx < 0) return
    this.ray.setFromCamera(this._ndc(e), this.host.camera)
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return
    this.host.system.moveBase(this.idx, this.hit.x, this.hit.z)
  }

  /** Buông: gập vị trí mới vào config (commit + persist). */
  endDrag(): void {
    if (this.idx < 0) return
    const base = this.host.system.getBase(this.idx)
    if (base) this.host.onMoved(this.idx, base.x, base.z)
    this._reset()
  }

  /** Right-click: trả đèn về vị trí trước kéo (huỷ Move). */
  cancelDrag(): void {
    if (this.idx < 0) return
    this.host.system.moveBase(this.idx, this.startX, this.startZ)
    this._reset()
  }

  /** Click không kéo → chỉ focus panel. Trả true nếu trúng đèn. */
  tryClickFocus(e: PointerEvent): boolean {
    this.ray.setFromCamera(this._ndc(e), this.host.camera)
    const i = this.host.system.pick(this.ray)
    if (i < 0) return false
    this.host.onFocus(i)
    return true
  }

  private _reset(): void {
    this.idx = -1
    this.host.setOrbit(true)
  }

  private _ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.host.canvas.getBoundingClientRect()
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    )
  }
}
