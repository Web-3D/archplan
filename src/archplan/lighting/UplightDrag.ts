/**
 * VỊ TRÍ   — archplan/src/archplan/lighting/UplightDrag.ts
 * VAI TRÒ  — Tương tác 🤚 Move + 👆 Focus cho đèn-pha (uplight): nhấn trúng đế đèn → kéo trên mặt y=0
 *            (0 rebuild) · click → focus panel. Mirror SunGizmo (host bơm camera/canvas/system + callback).
 * LIÊN HỆ  — host = LightingController. ArchPlanLab hook pointer: down→tryStartDrag, move→drag, up→endDrag,
 *            right-click→cancelDrag, click→tryClickFocus. Raycast qua system.pickUplight (lõi).
 *
 * CÁCH DÙNG: const d = new UplightDrag(host); if (d.tryStartDrag(e)) return
 */

import * as THREE from 'three'
import type { SiteLightingSystem } from 'threejs-modules/site/lighting/SiteLightingSystem'

export interface UplightDragHost {
  camera: THREE.Camera
  canvas: HTMLCanvasElement
  system: SiteLightingSystem
  setOrbit: (on: boolean) => void // tắt orbit khi kéo đèn
  onMoved: (i: number, x: number, z: number) => void // commit dời → cập nhật config + persist
  onFocus: (i: number) => void // click/nhấn → panel focus đèn i
}

export class UplightDrag {
  private readonly ray = new THREE.Raycaster()
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) // mặt đất y=0
  private readonly hit = new THREE.Vector3()
  private idx = -1
  private startX = 0
  private startZ = 0

  constructor(private readonly host: UplightDragHost) {}

  isDragging(): boolean {
    return this.idx >= 0
  }

  /** Nhấn trúng đế đèn → bắt đầu kéo + focus. Trả true (caller dừng xử lý khác). */
  tryStartDrag(e: PointerEvent): boolean {
    this.ray.setFromCamera(this._ndc(e), this.host.camera)
    const i = this.host.system.pickUplight(this.ray)
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

  /** Kéo: chiếu tia chuột xuống mặt y=0 → dời đế đèn (0 rebuild). */
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
    const i = this.host.system.pickUplight(this.ray)
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
