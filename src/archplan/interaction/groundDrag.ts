/**
 * VỊ TRÍ   — archplan/src/archplan/interaction/groundDrag.ts
 * VAI TRÒ  — Tương tác con trỏ NẮN HÌNH ground layer (Mảng add / Khoét cut) shape='free': overlay đỉnh polygon
 *            + 2 tay-cầm bezier (in/out) mỗi đỉnh + đường nối; kéo đỉnh/tay-cầm → ghi points[] live + viền
 *            định-vị. KHÔNG lo body-drag (dời cả layer = ArchPlanLab._layerDrag giữ). Mirror waterDrag nhưng
 *            target = mesh layer trong siteGroup (userData.groundLayerIdx), tâm = offsetX/Z, Y = đỉnh mesh.
 * LIÊN HỆ  — Tạo bởi ArchPlanLab (onInit) qua GroundToolHost. Pointer handlers ở lab dispatch tryStartVertex/
 *            dragMove/endDrag (Move). Active layer = lab _activeLayerIdx (focus tab GUI / click 3D). Sở hữu GPU
 *            riêng: handle group + sphere geo/mat + line + outline mesh/mat → dispose() đầy đủ.
 *
 * CÁCH DÙNG:
 *   const g = new GroundTool(host)
 *   g.tryStartVertex(e) / g.dragMove(e) / g.endDrag()   // Move mode (lab pointer handlers)
 *   g.isDragging() / g.cancelDrag()                      // lab kiểm tra / huỷ (đổi mode)
 *   g.rebuildHandles()                                   // sau render + đổi active layer + đổi moveMode
 * DISPOSE: g.dispose() — handle geo/mat + line + outline mesh/mat + gỡ handle group khỏi scene.
 */

import * as THREE from 'three'
import { shapeToLocalPolygon } from 'threejs-modules/site/shapes'
import type { GroundLayer, SiteState, WaterPoint } from 'threejs-modules/site/state'

// 1 phiên nắn ground layer free: vertex = dời 1 ĐỈNH polygon; handle = nắn 1 TAY-CẦM bezier (in/out) đỉnh idx.
// (body-drag = dời cả layer ở lab — KHÔNG ở đây.) plane = mặt ngang tại cao độ overlay.
type GroundDragSession =
  | { kind: 'vertex'; plane: THREE.Plane; idx: number }
  | { kind: 'handle'; plane: THREE.Plane; idx: number; which: 'in' | 'out' }

// Host: ArchPlanLab cấp scene refs + state + layer active + commit. Lab giữ _activeLayerIdx + render siteGroup.
export interface GroundToolHost {
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  raycaster: THREE.Raycaster
  scene: THREE.Scene
  siteGroup: THREE.Group // tìm mesh layer (userData.groundLayerIdx) → cao độ overlay
  site(): SiteState
  moveMode(): boolean
  activeLayerIdx(): number // layer ground đang focus (add/cut) — -1 = không
  commitSite(): void // _applySite(true): rebuild đặt shape mới + autosave
}

export class GroundTool {
  private _drag: GroundDragSession | null = null
  private readonly _handles: THREE.Group // overlay đỉnh + tay-cầm (free + moveMode)
  private _aGeo: THREE.SphereGeometry | null = null // sphere ĐỈNH (anchor) — dùng chung
  private _aMat: THREE.MeshBasicMaterial | null = null // màu vàng (anchor)
  private _tGeo: THREE.SphereGeometry | null = null // sphere TAY-CẦM bezier (nhỏ hơn)
  private _tMat: THREE.MeshBasicMaterial | null = null // màu cyan (tay-cầm)
  private _lineMat: THREE.LineBasicMaterial | null = null // đường nối anchor↔tay-cầm (dùng chung)
  private _lineGeo: THREE.BufferGeometry | null = null // geo nối — DỰNG LẠI mỗi rebuild (dispose ref cũ)
  private _outline: THREE.Mesh | null = null // viền form ở mặt layer (FILL mờ vẽ-trên-cùng) — định vị lúc kéo
  private _outlineMat: THREE.MeshBasicMaterial | null = null

  constructor(private readonly host: GroundToolHost) {
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

  // Layer ground ACTIVE (focus) + idx — null nếu không có / idx out-of-range.
  private _activeLayer(): { layer: GroundLayer; idx: number } | null {
    const idx = this.host.activeLayerIdx()
    const layer = this.host.site().groundLayers?.[idx]
    return layer ? { layer, idx } : null
  }

  // Mesh layer (add = extrude / cut = mảng xám) mang userData.groundLayerIdx=idx trong siteGroup → đọc cao độ.
  private _layerMesh(idx: number): THREE.Mesh | null {
    for (const o of this.host.siteGroup.children) {
      if (o instanceof THREE.Mesh && o.userData.groundLayerIdx === idx) return o
    }
    return null
  }

  isDragging(): boolean {
    return this._drag !== null
  }

  // Buông/đổi-mode huỷ nắn (KHÔNG commit). Lab _setMoveMode gọi.
  cancelDrag(): void {
    this._drag = null
    this.hideOutline()
  }

  // Buông chuột kết thúc nắn: ẩn viền + commit (rebuild đặt shape mới + autosave).
  endDrag(): void {
    this._drag = null
    this.hideOutline()
    this.host.commitSite()
  }

  // Layer active HỢP LỆ để nắn: free + moveMode + ≥3 đỉnh → trả layer; null nếu không (tách giữ complexity ≤10).
  private _editableLayer(): GroundLayer | null {
    const a = this._activeLayer()
    if (!a || a.layer.shape !== 'free' || !this.host.moveMode()) return null
    return (a.layer.points?.length ?? 0) >= 3 ? a.layer : null
  }

  // userData sphere trúng (vi=anchor / hi+which=tay-cầm) + plane → session nắn; null nếu sphere không hợp lệ.
  private _sessionFromUd(
    ud: { vi?: number; hi?: number; which?: 'in' | 'out' },
    plane: THREE.Plane
  ): GroundDragSession | null {
    if (typeof ud.hi === 'number' && ud.which)
      return { kind: 'handle', plane, idx: ud.hi, which: ud.which }
    if (typeof ud.vi === 'number') return { kind: 'vertex', plane, idx: ud.vi }
    return null
  }

  // Nhấn Move trúng 1 handle (đỉnh/tay-cầm) của layer active free → phiên nắn. Ray set ở đây. Trả false →
  // nhường body-drag/manipulate. Chỉ raycast SPHERE (Mesh) — bỏ LineSegments nối.
  tryStartVertex(e: PointerEvent): boolean {
    if (!this._editableLayer()) return false
    this.host.raycaster.setFromCamera(this._ndc(e), this.host.camera)
    const spheres = this._handles.children.filter((c) => c instanceof THREE.Mesh)
    const hit = this.host.raycaster.intersectObjects(spheres, false)[0]
    if (!hit) return false
    const ud = hit.object.userData as { vi?: number; hi?: number; which?: 'in' | 'out' }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this._handles.position.y)
    const session = this._sessionFromUd(ud, plane)
    if (!session) return false
    this._drag = session
    this.host.canvas.setPointerCapture(e.pointerId)
    return true
  }

  // Kéo: chiếu lên mặt ngang → dispatch nắn-đỉnh / nắn-tay-cầm → tessellate viền live + vẽ lại handle.
  dragMove(e: PointerEvent): void {
    const d = this._drag
    if (!d) return
    const a = this._activeLayer()
    if (!a) return
    this.host.raycaster.setFromCamera(this._ndc(e), this.host.camera)
    const cur = new THREE.Vector3()
    if (!this.host.raycaster.ray.intersectPlane(d.plane, cur)) return
    if (d.kind === 'vertex') this._dragVertex(a.layer, d.idx, cur)
    else this._dragHandle(a.layer, d.idx, d.which, cur)
    this.rebuildHandles()
    this.showOutline(a.layer)
  }

  // Nắn 1 ĐỈNH: world → local (trừ tâm layer = handle group pos) → ghi points[idx] (mm). Tay-cầm (offset so
  // anchor) DI THEO. Đáy/lỗ-cut theo sau khi buông (commit) → né rebuild geometry mỗi frame (PERFORMANCE.md).
  private _dragVertex(layer: GroundLayer, idx: number, cur: THREE.Vector3): void {
    const p = layer.points?.[idx]
    if (!p) return
    p.x = Math.round((cur.x - this._handles.position.x) * 1000)
    p.z = Math.round((cur.z - this._handles.position.z) * 1000)
  }

  // Nắn 1 TAY-CẦM bezier (in/out) đỉnh idx: offset (mm so anchor) = điểm world − anchor world. 2 tay-cầm ĐỘC
  // LẬP (kéo out KHÔNG đụng in → trộn góc/cong).
  private _dragHandle(
    layer: GroundLayer,
    idx: number,
    which: 'in' | 'out',
    cur: THREE.Vector3
  ): void {
    const p = layer.points?.[idx]
    if (!p) return
    const ox = Math.round((cur.x - this._handles.position.x) * 1000 - p.x)
    const oz = Math.round((cur.z - this._handles.position.z) * 1000 - p.z)
    if (which === 'out') {
      p.outX = ox
      p.outZ = oz
    } else {
      p.inX = ox
      p.inZ = oz
    }
  }

  // 🟫 Mảng mờ form layer ở MẶT layer (FILL vẽ-trên-cùng) theo polygon hiện tại. Hiện lúc kéo để định vị
  // (geometry+lỗ-cut chưa rebuild). Geo dựng lại mỗi lần kéo (nhỏ → rẻ); mat dùng chung.
  showOutline(layer: GroundLayer): void {
    const local = shapeToLocalPolygon({
      shape: layer.shape ?? 'free',
      width: layer.length,
      depth: layer.width,
      points: layer.points ?? [],
    })
    if (local.length < 3) return
    const ox = layer.offsetX / 1000
    const oz = layer.offsetZ / 1000
    const y = this._handles.position.y - 0.04 // ~ngay trên mặt layer (handle ở +0.05)
    const shape = new THREE.Shape()
    local.forEach((q, i) =>
      i === 0 ? shape.moveTo(ox + q.x, -(oz + q.z)) : shape.lineTo(ox + q.x, -(oz + q.z))
    )
    shape.closePath()
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2) // XY → nằm ngang XZ
    geo.translate(0, y, 0)
    if (!this._outline) {
      this._outlineMat = new THREE.MeshBasicMaterial({
        color: 0xffcc33, // vàng (phân biệt nước = cyan)
        transparent: true,
        opacity: 0.35,
        depthTest: false, // vẽ trên cùng dù đất che
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      this._outline = new THREE.Mesh(geo, this._outlineMat)
      this._outline.renderOrder = 999
      this._outline.frustumCulled = false
      this.host.scene.add(this._outline)
    } else {
      this._outline.geometry.dispose()
      this._outline.geometry = geo
    }
    this._outline.visible = true
  }

  hideOutline(): void {
    if (this._outline) this._outline.visible = false
  }

  // Dựng lại overlay layer ACTIVE: group tại tâm layer (offsetX/Z, world) ở cao độ đỉnh mesh; mỗi ĐỈNH = sphere
  // vàng (vi) + 2 TAY-CẦM bezier cyan (hi+which) + đường nối. Chỉ khi layer active free + moveMode (≥3 đỉnh) +
  // mesh đã render (lấy cao độ). Add/cut đều có mesh mang groundLayerIdx (cut = mảng xám, raycast được dù ẩn).
  rebuildHandles(): void {
    const g = this._handles
    this._clearHandles(g)
    const a = this._activeLayer()
    if (!a || a.layer.shape !== 'free' || !this.host.moveMode()) return
    const pts = a.layer.points ?? []
    if (pts.length < 3) return
    const mesh = this._layerMesh(a.idx)
    if (!mesh) return
    mesh.geometry.computeBoundingBox()
    const topY = mesh.geometry.boundingBox?.max.y ?? this.host.site().groundThick / 1000
    g.position.set(a.layer.offsetX / 1000, topY + 0.05, a.layer.offsetZ / 1000)
    const assets = this._handleAssets()
    const lines: number[] = []
    pts.forEach((p, i) => this._addAnchor(g, p, i, assets, lines))
    this._addConnectorLines(g, lines)
  }

  // Geo/mat sphere anchor + tay-cầm (lazy, dùng chung mọi rebuild). Tách khỏi rebuildHandles giữ complexity ≤10.
  private _handleAssets(): {
    aGeo: THREE.SphereGeometry
    aMat: THREE.Material
    tGeo: THREE.SphereGeometry
    tMat: THREE.Material
  } {
    const aGeo = (this._aGeo ??= new THREE.SphereGeometry(0.12, 12, 8))
    const aMat = (this._aMat ??= new THREE.MeshBasicMaterial({ color: 0xffcc33 }))
    const tGeo = (this._tGeo ??= new THREE.SphereGeometry(0.08, 10, 6))
    const tMat = (this._tMat ??= new THREE.MeshBasicMaterial({ color: 0x4cd9ff }))
    return { aGeo, aMat, tGeo, tMat }
  }

  // 1 đỉnh: sphere anchor (vi) + tay-cầm out/in (hi+which) nếu offset có; đẩy cặp anchor↔tay-cầm vào `lines`.
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
    const geo = new THREE.BufferGeometry() // LineSegments + LineBasicMaterial (không NodeMaterial → UV vô nghĩa)
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
    this._aGeo?.dispose()
    this._aMat?.dispose()
    this._tGeo?.dispose()
    this._tMat?.dispose()
    this._lineMat?.dispose()
    this._lineGeo?.dispose()
    this._aGeo = null
    this._aMat = null
    this._tGeo = null
    this._tMat = null
    this._lineMat = null
    this._lineGeo = null
    this._outline?.removeFromParent() // 🟫 mảng định vị
    this._outline?.geometry.dispose()
    this._outlineMat?.dispose()
    this._outline = null
    this._outlineMat = null
    this._handles.removeFromParent()
  }
}
