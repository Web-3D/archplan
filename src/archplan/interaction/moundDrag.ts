/**
 * VỊ TRÍ   — archplan/src/archplan/interaction/moundDrag.ts
 * VAI TRÒ  — Nặn gò terrain trong 3D: MỖI gò (terrain.mounds[]) hiện 2 handle — TÂM (cầu vàng, kéo XZ → dời
 *            x/z) + BÁN KÍNH (cầu cyan ở mép +X, kéo → đổi radius). Kéo = applyTerrainLive (swap geo nền base,
 *            rẻ — gò theo con trỏ); buông = commit (rebuild + autosave). Outline đĩa mờ footprint lúc kéo.
 *            Height/Falloff = slider GUI (3a). Mirror GroundTool (đơn giản hơn: không bezier, không per-mesh).
 * LIÊN HỆ  — Tạo bởi ArchPlanLab (onInit) qua MoundToolHost. Pointer handlers lab dispatch (Move mode):
 *            tryStartHandle/dragMove/endDrag. Chỉ hiện khi terrain.enabled + moveMode. Tạo gò = nút ＋ GUI.
 *
 * CÁCH DÙNG:
 *   const m = new MoundTool(host)
 *   m.tryStartHandle(e) / m.dragMove(e) / m.endDrag()   // Move mode (lab pointer handlers)
 *   m.isDragging() / m.cancelDrag()                      // lab kiểm tra / huỷ (đổi mode)
 *   m.rebuildHandles()                                   // sau render + đổi moveMode
 * DISPOSE: m.dispose() — sphere geo/mat (dùng chung) + outline geo/mat + gỡ handle group khỏi scene.
 */

import * as THREE from 'three'
import type { SiteState, TerrainMound } from 'threejs-modules/site/state'

// 1 phiên nặn: center = dời TÂM gò (x/z); radius = đổi BÁN KÍNH gò idx. plane = mặt ngang tại cao độ handle.
// m0 = SNAPSHOT gò gốc — right-click hủy giữa cú nặn TRẢ LẠI (NgQuan 2026-06-12).
type MoundDragSession =
  | {
      kind: 'center'
      plane: THREE.Plane
      idx: number
      m0: { x: number; z: number; radius: number }
    }
  | {
      kind: 'radius'
      plane: THREE.Plane
      idx: number
      m0: { x: number; z: number; radius: number }
    }

// Host: ArchPlanLab cấp scene refs + state + moveMode + 2 đường commit (live swap-geo / full rebuild).
export interface MoundToolHost {
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  raycaster: THREE.Raycaster
  scene: THREE.Scene
  site(): SiteState
  moveMode(): boolean
  applyTerrainLive(): void // kéo → swap geo nền base (né water-RTT/recompile = tụt fps)
  commitSite(): void // buông → _applySite(true): rebuild + autosave
}

const MOUND_RADIUS_MIN = 300 // mm — khớp slider GUI (moundSliderSpecs)
const MOUND_RADIUS_MAX = 20000 // mm — khớp parseMounds clamp

export class MoundTool {
  private _drag: MoundDragSession | null = null
  private readonly _handles: THREE.Group // overlay handle mọi gò (terrain bật + moveMode)
  private _cGeo: THREE.SphereGeometry | null = null // sphere TÂM (anchor) — dùng chung
  private _cMat: THREE.MeshBasicMaterial | null = null // vàng (tâm)
  private _rGeo: THREE.SphereGeometry | null = null // sphere BÁN KÍNH (nhỏ hơn) — dùng chung
  private _rMat: THREE.MeshBasicMaterial | null = null // cyan (bán kính)
  private _ring: THREE.Mesh | null = null // đĩa mờ footprint (vẽ-trên-cùng) — định vị lúc kéo
  private _ringMat: THREE.MeshBasicMaterial | null = null

  constructor(private readonly host: MoundToolHost) {
    this._handles = new THREE.Group()
    host.scene.add(this._handles)
  }

  private _ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.host.canvas.getBoundingClientRect()
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    )
  }

  private _mounds(): TerrainMound[] {
    return this.host.site().terrain?.mounds ?? []
  }

  // Có hiện/nặn handle không: terrain bật + Move mode (gò vô hình khi terrain tắt → không nặn).
  private _active(): boolean {
    return !!this.host.site().terrain?.enabled && this.host.moveMode()
  }

  // Y handle (world): mặt nền + đỉnh gò (xấp xỉ, bỏ qua noise) + 12cm → nổi trên mặt. depthTest=false đảm bảo
  // luôn hiện + raycast trúng dù bị noise che. Gò lõm (height<0) → đặt ngay trên mặt nền.
  private _handleY(m: TerrainMound): number {
    return this.host.site().groundThick / 1000 + Math.max(0, m.height / 1000) + 0.12
  }

  isDragging(): boolean {
    return this._drag !== null
  }

  // Huỷ nặn (right-click giữa cú kéo / đổi mode) → TRẢ GÒ GỐC từ snapshot m0 + swap geo nền về.
  // KHÔNG commit. (NgQuan 2026-06-12)
  cancelDrag(): void {
    const d = this._drag
    this._drag = null
    if (d) {
      const m = this._mounds()[d.idx]
      if (m) {
        m.x = d.m0.x
        m.z = d.m0.z
        m.radius = d.m0.radius
        this.host.applyTerrainLive()
        this.rebuildHandles()
      }
    }
    this.hideRing()
  }

  // Buông chuột kết thúc nặn: ẩn đĩa + commit (rebuild đặt gò mới + cỏ né lại + autosave).
  endDrag(): void {
    this._drag = null
    this.hideRing()
    this.host.commitSite()
  }

  // Nhấn Move trúng 1 handle gò → phiên nặn. Ray set ở đây. Trả false → nhường tool khác/body-drag. Chỉ
  // raycast SPHERE. depthTest=false nên trúng cả khi handle bị terrain che.
  tryStartHandle(e: PointerEvent): boolean {
    if (!this._active() || this._mounds().length === 0) return false
    this.host.raycaster.setFromCamera(this._ndc(e), this.host.camera)
    const hit = this.host.raycaster.intersectObjects(this._handles.children, false)[0]
    if (!hit) return false
    const ud = hit.object.userData as { mi?: number; role?: 'center' | 'radius' }
    const m = typeof ud.mi === 'number' ? this._mounds()[ud.mi] : undefined
    if (!m || !ud.role) return false
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this._handleY(m))
    this._drag = {
      kind: ud.role,
      plane,
      idx: ud.mi as number,
      m0: { x: m.x, z: m.z, radius: m.radius }, // snapshot gốc — right-click hủy trả lại
    }
    this.host.canvas.setPointerCapture(e.pointerId)
    return true
  }

  // Kéo: chiếu ray lên mặt ngang → dời tâm (x/z) HOẶC đổi radius (= khoảng cách ngang tâm→con trỏ). applyTerrainLive
  // (swap geo nền, KHÔNG commit mỗi frame — né tụt fps) + vẽ lại handle + đĩa footprint.
  dragMove(e: PointerEvent): void {
    const d = this._drag
    if (!d) return
    const m = this._mounds()[d.idx]
    if (!m) return
    this.host.raycaster.setFromCamera(this._ndc(e), this.host.camera)
    const cur = new THREE.Vector3()
    if (!this.host.raycaster.ray.intersectPlane(d.plane, cur)) return
    if (d.kind === 'center') {
      m.x = Math.round(cur.x * 1000)
      m.z = Math.round(cur.z * 1000)
    } else {
      const r = Math.hypot(cur.x - m.x / 1000, cur.z - m.z / 1000) * 1000
      m.radius = Math.round(Math.max(MOUND_RADIUS_MIN, Math.min(MOUND_RADIUS_MAX, r)))
    }
    this.host.applyTerrainLive()
    this.rebuildHandles()
    this.showRing(m)
  }

  // Đĩa mờ footprint gò (FILL vẽ-trên-cùng) ở mặt nền theo radius hiện tại — định vị lúc kéo (geo nền swap nhưng
  // đĩa rõ). Geo dựng lại mỗi kéo (nhỏ → rẻ); mat dùng chung.
  showRing(m: TerrainMound): void {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, m.radius / 1000, 0, Math.PI * 2, false)
    const geo = new THREE.ShapeGeometry(shape, 48)
    geo.rotateX(-Math.PI / 2) // XY → nằm ngang XZ
    geo.translate(m.x / 1000, this.host.site().groundThick / 1000 + 0.02, m.z / 1000)
    if (!this._ring) {
      this._ringMat = new THREE.MeshBasicMaterial({
        color: 0xffcc33,
        transparent: true,
        opacity: 0.18,
        depthTest: false, // vẽ trên cùng dù đất che
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      this._ring = new THREE.Mesh(geo, this._ringMat)
      this._ring.renderOrder = 998
      this._ring.frustumCulled = false
      this.host.scene.add(this._ring)
    } else {
      this._ring.geometry.dispose()
      this._ring.geometry = geo
    }
    this._ring.visible = true
  }

  hideRing(): void {
    if (this._ring) this._ring.visible = false
  }

  // Dựng lại overlay: MỖI gò = sphere TÂM (mi+center) + sphere BÁN KÍNH (mi+radius, ở mép +X). Chỉ khi terrain
  // bật + moveMode. depthTest=false (mat) + renderOrder cao → luôn thấy/grab dù gò che.
  rebuildHandles(): void {
    const g = this._handles
    g.clear()
    if (!this._active()) return
    const a = this._handleAssets()
    this._mounds().forEach((m, i) => {
      const y = this._handleY(m)
      const c = new THREE.Mesh(a.cGeo, a.cMat)
      c.position.set(m.x / 1000, y, m.z / 1000)
      c.userData = { mi: i, role: 'center' }
      c.renderOrder = 1000
      g.add(c)
      const rh = new THREE.Mesh(a.rGeo, a.rMat)
      rh.position.set(m.x / 1000 + m.radius / 1000, y, m.z / 1000)
      rh.userData = { mi: i, role: 'radius' }
      rh.renderOrder = 1000
      g.add(rh)
    })
  }

  // Geo/mat sphere tâm + bán kính (lazy, dùng chung mọi rebuild). depthTest=false → luôn hiện. Tách rule-50.
  private _handleAssets(): {
    cGeo: THREE.SphereGeometry
    cMat: THREE.Material
    rGeo: THREE.SphereGeometry
    rMat: THREE.Material
  } {
    const cGeo = (this._cGeo ??= new THREE.SphereGeometry(0.16, 12, 8))
    const cMat = (this._cMat ??= new THREE.MeshBasicMaterial({ color: 0xffcc33, depthTest: false }))
    const rGeo = (this._rGeo ??= new THREE.SphereGeometry(0.1, 10, 6))
    const rMat = (this._rMat ??= new THREE.MeshBasicMaterial({ color: 0x4cd9ff, depthTest: false }))
    return { cGeo, cMat, rGeo, rMat }
  }

  dispose(): void {
    this._cGeo?.dispose()
    this._cMat?.dispose()
    this._rGeo?.dispose()
    this._rMat?.dispose()
    this._cGeo = null
    this._cMat = null
    this._rGeo = null
    this._rMat = null
    this._ring?.removeFromParent()
    this._ring?.geometry.dispose()
    this._ringMat?.dispose()
    this._ring = null
    this._ringMat = null
    this._handles.removeFromParent()
  }
}
