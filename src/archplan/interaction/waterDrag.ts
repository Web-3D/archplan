/**
 * VỊ TRÍ   — archplan/src/archplan/interaction/waterDrag.ts
 * VAI TRÒ  — Tương tác con trỏ trên 3D HỒ NƯỚC (site element, Move tool): kéo dời thân hồ + nắn đỉnh
 *            polygon (shape='free') + viền-định-vị + handle đỉnh + click→Focus GUI hồ. Tách khỏi
 *            ArchPlanLab (manipulate lo building, waterDrag lo hồ). Sở hữu GPU riêng: handle group +
 *            sphere geo/mat + outline mesh/mat → dispose() đầy đủ.
 * LIÊN HỆ  — Tạo bởi ArchPlanLab (onInit) qua WaterToolHost. Pointer handlers ở lab dispatch vào
 *            tryStartDrag/dragMove/endDrag (Move) + tryClick (click thường). Mode coordination
 *            (_setMoveMode) + render _siteWaters/_activeWater GIỮ ở lab; tool đọc/ghi qua host.
 *
 * CÁCH DÙNG:
 *   const w = new WaterTool(host)
 *   w.tryStartDrag(e) / w.dragMove(e) / w.endDrag()  // Move mode (lab pointer handlers)
 *   w.tryClick(e)                                     // click thường → trỏ GUI hồ
 *   w.isDragging() / w.cancelDrag()                   // lab kiểm tra / huỷ (đổi mode)
 *   w.rebuildHandles() / w.setActiveCfg(cfg)          // sau render / GUI đổi tab hồ
 *   w.showOutline(cfg) / w.hideOutline()              // preview định vị / commit
 * DISPOSE: w.dispose() — handle geo/mat + outline mesh/mat + gỡ handle group khỏi scene.
 */

import * as THREE from 'three'
import type { WaterSurface } from 'threejs-modules/components/WaterSurface'
import { pondWorldXZ } from 'threejs-modules/site/render/fromState'
import { shapeToLocalPolygon } from 'threejs-modules/site/shapes'
import type { SiteState, WaterConfig, WaterPoint } from 'threejs-modules/site/state'

// 1 phiên kéo hồ: body = dời cả hồ (offset); vertex = nắn 1 ĐỈNH polygon; handle = nắn 1 TAY-CẦM bezier (in/out)
// của đỉnh idx → cong cạnh kề. (chỉ shape='free'.)
// p0 = SNAPSHOT đỉnh gốc (clone cả tay-cầm) — right-click hủy giữa cú kéo TRẢ LẠI (NgQuan 2026-06-12).
type WaterDragSession =
  | {
      kind: 'body'
      cfg: WaterConfig
      surf: WaterSurface
      plane: THREE.Plane
      sx: number
      sz: number
      ox0: number
      oz0: number
    }
  | {
      kind: 'vertex'
      cfg: WaterConfig
      surf: WaterSurface
      plane: THREE.Plane
      idx: number
      p0: WaterPoint
    }
  | {
      kind: 'handle'
      cfg: WaterConfig
      surf: WaterSurface
      plane: THREE.Plane
      idx: number
      which: 'in' | 'out'
      p0: WaterPoint
    }

// Host: ArchPlanLab cấp scene refs + state hồ + callback điều hướng/commit. Lab giữ mode + render _siteWaters.
export interface WaterToolHost {
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  raycaster: THREE.Raycaster
  scene: THREE.Scene
  pickGroup: THREE.Group
  site(): SiteState
  moveMode(): boolean
  siteWaters(): { cfg: WaterConfig; surf: WaterSurface }[] // cfg↔surf zip ĐANG render (lab sở hữu)
  activeWater(): WaterConfig | null // pool của tab đang chọn (lab sở hữu — render reassign default)
  setActiveWater(cfg: WaterConfig): void // ghi _activeWater ở lab (KHÔNG rebuild — tool tự gọi rebuildHandles)
  navigateToWater(cfg: WaterConfig): void // mở GUI tới tab hồ cfg
  commitSite(): void // _applySite(true): rebuild đặt nước+lỗ vào vị trí mới + autosave
}

export class WaterTool {
  private _drag: WaterDragSession | null = null
  private readonly _handles: THREE.Group // overlay handle đỉnh polygon (free + moveMode)
  private _handleGeo: THREE.SphereGeometry | null = null // sphere ĐỈNH (anchor) — dùng chung
  private _handleMat: THREE.MeshBasicMaterial | null = null // màu vàng (anchor)
  private _tanGeo: THREE.SphereGeometry | null = null // sphere TAY-CẦM bezier (nhỏ hơn)
  private _tanMat: THREE.MeshBasicMaterial | null = null // màu cyan (tay-cầm)
  private _lineMat: THREE.LineBasicMaterial | null = null // đường nối anchor↔tay-cầm (dùng chung)
  private _lineGeo: THREE.BufferGeometry | null = null // geo nối — DỰNG LẠI mỗi rebuildHandles (dispose ref cũ)
  private _outline: THREE.Mesh | null = null // viền form ở mặt nền (FILL mờ vẽ-trên-cùng) — định vị lúc kéo
  private _outlineMat: THREE.MeshBasicMaterial | null = null

  constructor(private readonly host: WaterToolHost) {
    this._handles = new THREE.Group()
    host.scene.add(this._handles)
  }

  // Ủy quyền về host — body method giữ NGUYÊN VĂN (this.canvas / this._ray / this.camera / this.scene / …).
  private get canvas(): HTMLCanvasElement {
    return this.host.canvas
  }
  private get camera(): THREE.Camera {
    return this.host.camera
  }
  private get _ray(): THREE.Raycaster {
    return this.host.raycaster
  }
  private get scene(): THREE.Scene {
    return this.host.scene
  }
  private get pickGroup(): THREE.Group {
    return this.host.pickGroup
  }
  private get site(): SiteState {
    return this.host.site()
  }
  private get moveMode(): boolean {
    return this.host.moveMode()
  }

  private _ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect()
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    )
  }

  // Entry hồ ACTIVE (pool của tab đang chọn) trong _siteWaters — null nếu hồ đó chưa render (tắt/placeholder).
  private _activeEntry(): { cfg: WaterConfig; surf: WaterSurface } | null {
    return this.host.siteWaters().find((x) => x.cfg === this.host.activeWater()) ?? null
  }

  // Chọn pool active (GUI đổi tab Pl, hoặc kéo trúng thân 1 hồ) → 3D drag/handle nhắm hồ này.
  setActiveCfg(cfg: WaterConfig): void {
    this.host.setActiveWater(cfg)
    this.rebuildHandles()
  }

  isDragging(): boolean {
    return this._drag !== null
  }

  // Huỷ kéo (right-click giữa cú kéo / đổi mode) → TRẢ VỊ TRÍ BAN ĐẦU (NgQuan 2026-06-12): body = offset
  // gốc (ox0/oz0) + dời mesh về; vertex/handle = thay nguyên đỉnh bằng snapshot p0 (giữ cả tay-cầm gốc,
  // KHÔNG Object.assign — kéo có thể đã THÊM field tay-cầm mới). KHÔNG commit.
  cancelDrag(): void {
    const d = this._drag
    this._drag = null
    if (d) this._revertDrag(d)
    this.hideOutline()
  }

  private _revertDrag(d: WaterDragSession): void {
    if (d.kind === 'body') {
      d.cfg.offsetX = d.ox0
      d.cfg.offsetZ = d.oz0
      const mesh = d.surf.getMesh()
      mesh.position.set(d.ox0 / 1000, mesh.position.y, d.oz0 / 1000)
      this._handles.position.set(mesh.position.x, mesh.position.y + 0.05, mesh.position.z)
    } else {
      if (d.cfg.points[d.idx]) d.cfg.points[d.idx] = { ...d.p0 }
      this._liveShape(d.surf, d.cfg)
    }
    this.rebuildHandles()
  }

  // Buông chuột kết thúc kéo: ẩn viền + commit (rebuild đặt nước+lỗ vào vị trí mới + autosave).
  endDrag(): void {
    this._drag = null
    this.hideOutline()
    this.host.commitSite()
  }

  // Raycast mặt nước: trả entry + điểm trúng NẾU có hồ gần hơn building pick (else null → nhường building).
  // Dùng chung cho click-focus (trỏ GUI, mode thường) lẫn bắt đầu kéo thân hồ (Move mode).
  private _pickEntry(
    e: PointerEvent
  ): { entry: { cfg: WaterConfig; surf: WaterSurface }; point: THREE.Vector3 } | null {
    const waters = this.host.siteWaters()
    if (waters.length === 0) return null
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const meshes = waters.map((x) => x.surf.getMesh())
    const wHit = this._ray.intersectObjects(meshes, false)[0]
    if (!wHit) return null
    const pHit = this._ray.intersectObjects(this.pickGroup.children, false)[0]
    if (pHit && pHit.distance < wHit.distance) return null // building element gần hơn → nhường
    const entry = waters.find((x) => x.surf.getMesh() === wHit.object)
    return entry ? { entry, point: wHit.point } : null
  }

  // Click thường (mode KHÔNG pick/paint/move) trúng mặt nước → set active + mở GUI tới tab hồ (như click
  // tường/sàn trỏ GUI). Trả false → nhường _maybeClickFocus cho building. KHÔNG bắt đầu kéo.
  tryClick(e: PointerEvent): boolean {
    const got = this._pickEntry(e)
    if (!got) return false
    this.setActiveCfg(got.entry.cfg)
    this.host.navigateToWater(got.entry.cfg)
    return true
  }

  // Nhấn Move: ưu tiên ĐỈNH polygon (hồ active, free) → thân hồ GẦN NHẤT trong mọi hồ → nhường manipulate.
  tryStartDrag(e: PointerEvent): boolean {
    if (this.host.siteWaters().length === 0) return false
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const active = this._activeEntry()
    if (active && this._tryStartVertex(active)) {
      this.canvas.setPointerCapture(e.pointerId) // đỉnh trước (handle nhỏ, nằm trên mặt hồ active)
      return true
    }
    const got = this._pickEntry(e)
    if (!got) return false
    const { entry, point } = got
    this.setActiveCfg(entry.cfg) // kéo hồ nào → hồ đó thành active
    this.host.navigateToWater(entry.cfg) // + mở GUI tới tab hồ đó (click thẳng vào pool/pond/puddle)
    this._drag = {
      kind: 'body',
      cfg: entry.cfg,
      surf: entry.surf,
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -point.y),
      sx: point.x,
      sz: point.z,
      ox0: entry.cfg.offsetX,
      oz0: entry.cfg.offsetZ,
    }
    this.canvas.setPointerCapture(e.pointerId)
    return true
  }

  // Trúng 1 handle (hồ active) → phiên kéo ĐỈNH (anchor, userData.vi) hoặc TAY-CẦM bezier (userData.hi+which). Ray
  // đã set ở caller. Mặt chiếu = ngang tại mặt nước. Chỉ raycast SPHERE (Mesh) — bỏ LineSegments nối.
  private _tryStartVertex(entry: { cfg: WaterConfig; surf: WaterSurface }): boolean {
    const spheres = this._handles.children.filter((c) => c instanceof THREE.Mesh)
    if (spheres.length === 0) return false
    const hit = this._ray.intersectObjects(spheres, false)[0]
    if (!hit) return false
    const ud = hit.object.userData as { vi?: number; hi?: number; which?: 'in' | 'out' }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -entry.surf.getMesh().position.y)
    if (typeof ud.hi === 'number' && ud.which) {
      const p = entry.cfg.points[ud.hi]
      if (!p) return false
      this._drag = {
        kind: 'handle',
        cfg: entry.cfg,
        surf: entry.surf,
        plane,
        idx: ud.hi,
        which: ud.which,
        p0: { ...p }, // snapshot gốc — right-click hủy trả lại đỉnh + tay-cầm
      }
      return true
    }
    if (typeof ud.vi !== 'number') return false
    const pv = entry.cfg.points[ud.vi]
    if (!pv) return false
    this._drag = {
      kind: 'vertex',
      cfg: entry.cfg,
      surf: entry.surf,
      plane,
      idx: ud.vi,
      p0: { ...pv },
    }
    return true // pointer capture do caller tryStartDrag lo
  }

  // Kéo hồ: chiếu lên mặt ngang → dispatch dời-thân / nắn-đỉnh.
  dragMove(e: PointerEvent): void {
    const d = this._drag
    if (!d) return
    this._ray.setFromCamera(this._ndc(e), this.camera)
    const cur = new THREE.Vector3()
    if (!this._ray.ray.intersectPlane(d.plane, cur)) return
    if (d.kind === 'body') this._dragBody(d, cur)
    else if (d.kind === 'handle') this._dragHandle(d, cur)
    else this._dragVertex(d, cur)
  }

  // Tessellate shape hiện tại (mọi loại) → mặt nước live. Dùng chung cho kéo đỉnh/tay-cầm (KHÔNG tái tạo reflector).
  private _liveShape(surf: WaterSurface, cfg: WaterConfig): void {
    surf.setShape(shapeToLocalPolygon(cfg))
  }

  // Dời cả hồ: ghi offset (mm) vào cfg + DỜI MESH LIVE (reflector.target con → theo cùng) + handle theo. Đáy/
  // viền/lỗ-nền KHÔNG rebuild ở đây (tái tạo reflector mỗi frame = leak+lag) → theo sau khi BUÔNG (commit).
  private _dragBody(
    d: { cfg: WaterConfig; surf: WaterSurface; sx: number; sz: number; ox0: number; oz0: number },
    cur: THREE.Vector3
  ): void {
    d.cfg.offsetX = Math.round(d.ox0 + (cur.x - d.sx) * 1000)
    d.cfg.offsetZ = Math.round(d.oz0 + (cur.z - d.sz) * 1000)
    const mesh = d.surf.getMesh()
    mesh.position.set(d.cfg.offsetX / 1000, mesh.position.y, d.cfg.offsetZ / 1000)
    this._handles.position.set(mesh.position.x, mesh.position.y + 0.05, mesh.position.z)
    this.showOutline(d.cfg) // viền form ở mặt nền → định vị (mặt nước chui dưới đất khi lỗ chưa theo)
  }

  // Nắn 1 ĐỈNH (anchor) hồ active: world → local (trừ tâm hồ) → ghi points[idx] (mm) + tessellate mặt nước live.
  // Tay-cầm (offset so anchor) DI THEO anchor → chỉ cần rebuildHandles vẽ lại đúng vị trí. Đáy/viền theo sau khi buông.
  private _dragVertex(
    d: { cfg: WaterConfig; surf: WaterSurface; idx: number },
    cur: THREE.Vector3
  ): void {
    const mesh = d.surf.getMesh()
    const p = d.cfg.points[d.idx]
    if (!p) return
    p.x = Math.round((cur.x - mesh.position.x) * 1000)
    p.z = Math.round((cur.z - mesh.position.z) * 1000)
    this._liveShape(d.surf, d.cfg)
    this.rebuildHandles()
    this.showOutline(d.cfg)
  }

  // Nắn 1 TAY-CẦM bezier (in/out) của đỉnh idx: offset (mm so anchor) = (điểm world − anchor world). 2 tay-cầm
  // ĐỘC LẬP (kéo out KHÔNG đụng in → trộn góc/cong). Tessellate lại → cạnh kề cong theo live.
  private _dragHandle(
    d: { cfg: WaterConfig; surf: WaterSurface; idx: number; which: 'in' | 'out' },
    cur: THREE.Vector3
  ): void {
    const mesh = d.surf.getMesh()
    const p = d.cfg.points[d.idx]
    if (!p) return
    const ox = Math.round((cur.x - mesh.position.x) * 1000 - p.x)
    const oz = Math.round((cur.z - mesh.position.z) * 1000 - p.z)
    if (d.which === 'out') {
      p.outX = ox
      p.outZ = oz
    } else {
      p.inX = ox
      p.inZ = oz
    }
    this._liveShape(d.surf, d.cfg)
    this.rebuildHandles()
    this.showOutline(d.cfg)
  }

  // 💧 Mảng mờ form hồ ở MẶT NỀN (rim) — ShapeGeometry FILL vẽ-trên-cùng (depthTest/depthWrite=false,
  // renderOrder cao) theo polygon hồ. Hiện lúc kéo để định vị (mặt nước chui dưới đất vì lỗ chưa rebuild).
  // Geo dựng lại mỗi lần kéo (nhỏ → rẻ); mat dùng chung.
  showOutline(cfg: WaterConfig): void {
    const poly = pondWorldXZ(cfg) // world XZ (đã gồm offset/points)
    if (poly.length < 3) return
    const y = this.site.groundThick / 1000 + 0.015 // 1.5cm trên mặt nền
    const shape = new THREE.Shape()
    poly.forEach((q, i) => (i === 0 ? shape.moveTo(q.x, -q.z) : shape.lineTo(q.x, -q.z))) // XY: x, −z
    shape.closePath()
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2) // XY → nằm ngang XZ
    geo.translate(0, y, 0)
    if (!this._outline) {
      this._outlineMat = new THREE.MeshBasicMaterial({
        color: 0x4cd9ff,
        transparent: true,
        opacity: 0.4,
        depthTest: false, // vẽ trên cùng dù đất/nước che
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      this._outline = new THREE.Mesh(geo, this._outlineMat)
      this._outline.renderOrder = 999
      this._outline.frustumCulled = false
      this.scene.add(this._outline)
    } else {
      this._outline.geometry.dispose()
      this._outline.geometry = geo
    }
    this._outline.visible = true
  }

  hideOutline(): void {
    if (this._outline) this._outline.visible = false
  }

  // Dựng lại handle hồ ACTIVE: group tại tâm hồ (world); mỗi ĐỈNH = sphere vàng (vi) + 2 TAY-CẦM bezier sphere
  // cyan (hi+which) + 2 đường nối anchor↔tay-cầm. Chỉ khi hồ active ĐANG render + shape='free' + moveMode (≥3 đỉnh).
  rebuildHandles(): void {
    const g = this._handles
    this._clearHandles(g)
    const entry = this._activeEntry()
    const w = entry?.cfg
    if (!entry || !w || w.shape !== 'free' || !this.moveMode || w.points.length < 3) return
    const mesh = entry.surf.getMesh()
    g.position.set(mesh.position.x, mesh.position.y + 0.05, mesh.position.z)
    const a = this._handleAssets()
    const lines: number[] = []
    w.points.forEach((p, i) => this._addAnchor(g, p, i, a, lines))
    this._addConnectorLines(g, lines)
  }

  // Geo/mat sphere anchor + tay-cầm (lazy, dùng chung mọi rebuild). Tách khỏi rebuildHandles giữ complexity ≤10.
  private _handleAssets(): {
    aGeo: THREE.SphereGeometry
    aMat: THREE.Material
    tGeo: THREE.SphereGeometry
    tMat: THREE.Material
  } {
    const aGeo = (this._handleGeo ??= new THREE.SphereGeometry(0.12, 12, 8))
    const aMat = (this._handleMat ??= new THREE.MeshBasicMaterial({ color: 0xffcc33 }))
    const tGeo = (this._tanGeo ??= new THREE.SphereGeometry(0.08, 10, 6))
    const tMat = (this._tanMat ??= new THREE.MeshBasicMaterial({ color: 0x4cd9ff }))
    return { aGeo, aMat, tGeo, tMat }
  }

  // 1 đỉnh: sphere anchor (vi) + tay-cầm out/in (hi+which) nếu offset có; đẩy cặp điểm anchor↔tay-cầm vào `lines`.
  private _addAnchor(
    g: THREE.Group,
    p: WaterPoint,
    i: number,
    a: {
      aGeo: THREE.SphereGeometry
      aMat: THREE.Material
      tGeo: THREE.SphereGeometry
      tMat: THREE.Material
    },
    lines: number[]
  ): void {
    const ax = p.x / 1000
    const az = p.z / 1000
    const anchor = new THREE.Mesh(a.aGeo, a.aMat)
    anchor.position.set(ax, 0, az)
    anchor.userData = { vi: i }
    g.add(anchor)
    const tans: ['out' | 'in', number | undefined, number | undefined][] = [
      ['out', p.outX, p.outZ],
      ['in', p.inX, p.inZ],
    ]
    for (const [which, hx, hz] of tans) {
      if (hx === undefined && hz === undefined) continue
      const wx = ax + (hx ?? 0) / 1000
      const wz = az + (hz ?? 0) / 1000
      const t = new THREE.Mesh(a.tGeo, a.tMat)
      t.position.set(wx, 0, wz)
      t.userData = { hi: i, which }
      g.add(t)
      lines.push(ax, 0, az, wx, 0, wz)
    }
  }

  // 1 LineSegments nối anchor↔tay-cầm (group-local, y=0). Geo dựng lại mỗi rebuild → dispose ở _clearHandles.
  private _addConnectorLines(g: THREE.Group, lines: number[]): void {
    if (lines.length === 0) return
    const mat = (this._lineMat ??= new THREE.LineBasicMaterial({
      color: 0x4cd9ff,
      transparent: true,
      opacity: 0.6,
    }))
    const geo = new THREE.BufferGeometry() // perf-ok: LineSegments + LineBasicMaterial (không NodeMaterial → UV vô nghĩa)
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
    this._lineGeo = geo
    g.add(new THREE.LineSegments(geo, mat))
  }

  // Gỡ mọi child (sphere + line) + dispose geo line cũ (sphere geo/mat dùng chung → giữ).
  private _clearHandles(g: THREE.Group): void {
    g.clear()
    this._lineGeo?.dispose()
    this._lineGeo = null
  }

  dispose(): void {
    this._handleGeo?.dispose()
    this._handleMat?.dispose()
    this._handleGeo = null
    this._handleMat = null
    this._tanGeo?.dispose() // tay-cầm bezier
    this._tanMat?.dispose()
    this._lineMat?.dispose() // đường nối anchor↔tay-cầm
    this._lineGeo?.dispose()
    this._tanGeo = null
    this._tanMat = null
    this._lineMat = null
    this._lineGeo = null
    this._outline?.removeFromParent() // 💧 mảng định vị
    this._outline?.geometry.dispose()
    this._outlineMat?.dispose()
    this._outline = null
    this._outlineMat = null
    this._handles.removeFromParent()
  }
}
