/**
 * VỊ TRÍ   — archplan/src/archplan/interaction/sunGizmo.ts
 * VAI TRÒ  — Sun = VẬT THỂ kéo được trong scene: quả cầu phát sáng trên vòm bán kính 24m. Nhấn-giữ
 *            kéo → đổi hướng nắng (azimuth/elevation, clamp ban ngày 5–89°). Khi kéo hiện CHỈ trục Y
 *            (dây dọi sun→lưới) + bóng tròn đen mờ tại giao XZ. Bật/tắt + cường độ + màu nắng giờ ở
 *            khay 🌅 (ArchPlanLab._envSunControls) — gizmo CHỈ lo HƯỚNG; sync() cập nhật quả sun theo sunOpts.
 * LIÊN HỆ  — ArchPlanLab giữ ref + hook pointer (tryStartDrag/drag/endDrag) + _applySun gọi sync().
 *            Dùng SunOpts (scene.ts) làm nguồn sự thật; host bơm light/camera/canvas/orbit/persist.
 *
 * CÁCH DÙNG: const g = new SunGizmo(host); // trong onPointerDown: if (g.tryStartDrag(e)) return
 * DISPOSE: dispose() — gỡ gizmo mesh + trục Y/bóng + dispose geo/mat.
 */

import * as THREE from 'three'

import type { SunOpts } from '../scene/scene'

const DOME_R = 48 // m — bán kính vòm sun (khớp _applySun r) — gấp đôi để sun không sát mặt đất
const EL_MIN = 5 // ° — kẹp ban ngày: mặt trời luôn trên cao
const EL_MAX = 89

export interface SunGizmoHost {
  scene: THREE.Scene
  camera: THREE.Camera
  canvas: HTMLCanvasElement
  light: THREE.DirectionalLight
  opts: SunOpts
  setOrbit: (on: boolean) => void // tắt orbit khi đang kéo sun
  apply: () => void // = _applySun (đặt lại light theo opts + sync() gizmo)
  persist: () => void // lưu sunOpts
}

export class SunGizmo {
  private mesh: THREE.Mesh | null = null
  private geo: THREE.SphereGeometry | null = null
  private mat: THREE.MeshBasicMaterial | null = null
  private axes: THREE.Group | null = null // CHỈ trục Y (dây dọi sun→lưới) — hiện khi kéo
  private axesGeo: THREE.BufferGeometry | null = null
  private axesMat: THREE.LineBasicMaterial | null = null
  private shadowDot: THREE.Mesh | null = null // bóng tròn đen mờ ở chân trục (giao XZ)
  private shadowGeo: THREE.CircleGeometry | null = null
  private shadowMat: THREE.MeshBasicMaterial | null = null
  private readonly ray = new THREE.Raycaster()
  private dragging = false
  private isDisposed = false

  constructor(private readonly host: SunGizmoHost) {
    this.geo = new THREE.SphereGeometry(1, 20, 16)
    this.mat = new THREE.MeshBasicMaterial({
      color: host.opts.color,
      transparent: true,
      toneMapped: false, // giữ sáng rực bất kể tone mapping → trông như nguồn sáng
    })
    this.mesh = new THREE.Mesh(this.geo, this.mat)
    host.scene.add(this.mesh)
    this._buildAxes() // trục Y mờ xanh (tâm = sun) + bóng chân — ẩn, chỉ hiện khi kéo
    this.sync()
  }

  /** Nhấn trúng quả sun → bắt đầu kéo (tắt orbit). Trả true nếu trúng (caller dừng xử lý khác). */
  tryStartDrag(e: PointerEvent): boolean {
    if (this.isDisposed || !this.mesh || !this._raycastHit(e)) return false
    this.dragging = true
    this.host.setOrbit(false)
    if (this.axes) this.axes.visible = true // hiện trục Y + bóng chân (tham chiếu hướng)
    return true
  }

  isDragging(): boolean {
    return this.dragging
  }

  /** Kéo: chiếu tia chuột lên vòm → az/el mới (clamp ban ngày) → đặt lại light + lưu. */
  drag(e: PointerEvent): void {
    if (!this.dragging) return
    const p = this._domePoint(e)
    if (!p) return
    const az = (Math.atan2(p.z, p.x) * 180) / Math.PI
    const el = clamp((Math.asin(p.y / DOME_R) * 180) / Math.PI, EL_MIN, EL_MAX)
    this.host.opts.azimuth = (az + 360) % 360
    this.host.opts.elevation = el
    this.host.apply()
    this.host.persist()
  }

  endDrag(): void {
    if (!this.dragging) return
    this.dragging = false
    this.host.setOrbit(true)
    if (this.axes) this.axes.visible = false
  }

  /** Đồng bộ gizmo theo light (gọi cuối _applySun): vị trí + màu + mờ đi khi tắt. Nguồn đổi sun =
   *  khay 🌅 (_envSunControls) hoặc kéo quả sun → quả sun cập nhật theo. */
  sync(): void {
    if (this.isDisposed || !this.mesh || !this.mat) return
    this.mesh.position.copy(this.host.light.position)
    const on = this.host.opts.enabled
    this.mat.color.set(on ? this.host.opts.color : 0x556070)
    this.mat.opacity = on ? 1 : 0.35
    this._updateAxisY() // đáy trục Y luôn chạm lưới (world y=0) dù sun cao/thấp
  }

  // Kéo đáy trục Y (v3) xuống chạm lưới: sun ở tâm local triad → world y=0 = local -sunY.
  private _updateAxisY(): void {
    if (!this.axesGeo || !this.mesh) return
    const y = -this.mesh.position.y // local → world y=0 (lưới)
    const pos = this.axesGeo.getAttribute('position') as THREE.BufferAttribute
    pos.setY(1, y) // v1 = đáy trục Y
    pos.needsUpdate = true
    if (this.shadowDot) this.shadowDot.position.y = y // bóng bám chân trục
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this._disposeAxes()
    this.mesh?.parent?.remove(this.mesh)
    this.geo?.dispose()
    this.mat?.dispose()
    this.mesh = null
    this.geo = null
    this.mat = null
  }

  private _disposeAxes(): void {
    this.axes?.parent?.remove(this.axes)
    this.axesGeo?.dispose()
    this.axesMat?.dispose()
    this.shadowGeo?.dispose()
    this.shadowMat?.dispose()
    this.axes = null
    this.axesGeo = null
    this.axesMat = null
    this.shadowDot = null
    this.shadowGeo = null
    this.shadowMat = null
  }

  // CHỈ trục Y (dây dọi mờ xanh sun→lưới) + bóng tròn đen mờ tại giao XZ — hiện khi kéo sun.
  private _buildAxes(): void {
    const top = 4 // nhô lên 1 đoạn trên sun
    const yBot = -this.host.light.position.y // local → world y=0 (sun ở tâm local)
    this.axesGeo = new THREE.BufferGeometry()
    this.axesGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, top, 0, 0, yBot, 0], 3)
    )
    this.axesMat = new THREE.LineBasicMaterial({
      color: 0x9ec7ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      toneMapped: false,
    })
    const axes = new THREE.Group()
    axes.add(new THREE.LineSegments(this.axesGeo, this.axesMat))
    this.shadowGeo = new THREE.CircleGeometry(0.8, 24)
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const dot = new THREE.Mesh(this.shadowGeo, this.shadowMat)
    dot.rotation.x = -Math.PI / 2 // nằm phẳng trên mặt XZ
    dot.position.set(0, yBot, 0)
    this.shadowDot = dot
    axes.add(dot)
    axes.visible = false
    this.mesh?.add(axes) // CHILD của sun → tâm = sun, đi theo sun khi kéo
    this.axes = axes
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.host.canvas.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 2 - 1
    const y = -((e.clientY - r.top) / r.height) * 2 + 1
    return new THREE.Vector2(x, y)
  }

  private _raycastHit(e: PointerEvent): boolean {
    if (!this.mesh) return false
    this.ray.setFromCamera(this._ndc(e), this.host.camera)
    return this.ray.intersectObject(this.mesh, false).length > 0
  }

  // Tia chuột ∩ cầu vòm (tâm gốc, bán kính DOME_R) → điểm gần nhất phía trước; null nếu trượt.
  private _domePoint(e: PointerEvent): THREE.Vector3 | null {
    this.ray.setFromCamera(this._ndc(e), this.host.camera)
    const o = this.ray.ray.origin
    const d = this.ray.ray.direction
    const b = 2 * o.dot(d)
    const c = o.lengthSq() - DOME_R * DOME_R
    const disc = b * b - 4 * c
    if (disc < 0) return null
    const sq = Math.sqrt(disc)
    const t1 = (-b - sq) / 2
    const t2 = (-b + sq) / 2
    const t = t1 > 0.01 ? t1 : t2 > 0.01 ? t2 : -1
    if (t < 0) return null
    return o.clone().addScaledVector(d, t)
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
