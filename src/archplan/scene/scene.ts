/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/scene/scene.ts
 * VAI TRÒ  — HeightGridSystem (laser grids + measure labels) và HumanFigure (scale reference).
 * LIÊN HỆ  — Import bởi ArchPlanLab.ts.
 */

import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

// ── HeightGridSystem ───────────────────────────────────────────────────────────

// Measure: 2 mặt ĐỨNG zPos/xPos — sáng khi chạm, nhãn kích thước mặt cắt.
// Coordinate: 1 mặt NGANG cyPos trượt theo Y — cùng cơ chế (lưới mờ, sáng khi cắt nhà),
// nhãn = khoảng cách (mm) từ tâm 0 mặt phẳng XZ tới 4 cạnh tường (= tọa độ tường).
export type GridOpts = {
  zPos: number
  xPos: number
  zVisible: boolean
  xVisible: boolean
  cyPos: number
  cyVisible: boolean
}

// Tham số đèn mặt trời (DirectionalLight) — điều khiển qua panel ☀ Sun.
export type SunOpts = {
  azimuth: number // deg — hướng la bàn quanh trục Y
  elevation: number // deg — cao độ so với mặt phẳng ngang
  intensity: number
  color: number // màu sáng (hex) — điều khiển qua ô màu trên gizmo sun
  enabled: boolean // bật/tắt sun (nút trên gizmo) — tắt → chỉ còn hemisphere fill
  fill: number // 🌅 hệ số fill môi trường (× hemi + IBL) — 1 = mức cũ; mặt ngang xa sun tối → tăng
  overcast: number // ☁️ mức u ám bầu trời [0..1] — sky xám dần + nuốt đĩa nắng (SkyGradient.setOvercast)
}

// 🌅 Preset ánh sáng môi trường (khay 🌅 utilTray) — 1 nút set cả bộ {elevation, intensity, color, fill},
// mirror Environment-Light-Mixer của Unreal: rig là 1 KHỐI, không phải N đèn rời. KHÔNG đổi azimuth
// (giữ hướng nắng user đã kéo trên gizmo). 🌙 Đêm = enabled:false (sun off, chỉ còn fill thấp).
export type EnvPreset = {
  icon: string
  label: string
  opts: Partial<Omit<SunOpts, 'azimuth'>>
}

export const ENV_PRESETS: EnvPreset[] = [
  {
    icon: '☀️',
    label: 'Trưa — nắng đỉnh, trời trong, fill sáng',
    opts: { enabled: true, elevation: 65, intensity: 2.4, color: 0xfff5e0, fill: 1.5, overcast: 0 },
  },
  {
    icon: '🌇',
    label: 'Hoàng hôn — nắng xiên cam, fill vừa',
    opts: {
      enabled: true,
      elevation: 12,
      intensity: 1.7,
      color: 0xffb878,
      fill: 1.0,
      overcast: 0.1,
    },
  },
  {
    icon: '☁️',
    label: 'Âm u — sun yếu xám, trời mây đặc, fill cao (sky gánh)',
    opts: {
      enabled: true,
      elevation: 55,
      intensity: 0.5,
      color: 0xdde6ee,
      fill: 2.2,
      overcast: 0.85,
    },
  },
  {
    icon: '🌙',
    label: 'Đêm — tắt sun (trời tối theo), fill mờ',
    opts: { enabled: false, fill: 0.5, overcast: 0.15 },
  },
]

// Loại nền môi trường: 'none' = ground tối + lưới tọa độ (như cũ); còn lại = vật liệu tự nhiên
// (cung cấp màu bounce qua HemisphereLight.groundColor). sand/dirt-rock thêm sau.
// 3 giá trị cuối = texture PhotoGround (TRÙNG tên GroundMaterialKey site → share material world-XZ qua _photoEditorGround).
export type GroundType =
  | 'none'
  | 'grass'
  | 'stone'
  | 'asphalt'
  | 'sand'
  | 'dirt-rock'
  | 'grass-o'
  | 'thai-beach-sand-2k'
  | 'thai-beach-sand-4k'

const MEASURE_COLOR = 0x00a8ff // cyan — lưới đo kích thước
const COORD_COLOR = 0xffb454 // hổ phách — lưới tọa độ (phân biệt với measure cyan trong 3D)

export class HeightGridSystem {
  private readonly scene: THREE.Scene
  private readonly opts: GridOpts
  private zGridGroup: THREE.Group | null = null
  private xGridGroup: THREE.Group | null = null
  private zMeasureGrp: THREE.Group | null = null
  private xMeasureGrp: THREE.Group | null = null
  private zContactGeos: THREE.BufferGeometry[] = []
  private xContactGeos: THREE.BufferGeometry[] = []
  private zContactMat: THREE.LineBasicMaterial | null = null
  private xContactMat: THREE.LineBasicMaterial | null = null
  // Coordinate — 1 mặt NGANG trượt theo Y, cùng cơ chế measure (mờ, sáng khi cắt nhà).
  // Khi cyPos ∈ [bbox.y] → outline footprint hổ phách + nhãn mm 4 cạnh tường.
  private cyGridGroup: THREE.Group | null = null
  private cyScanGrp: THREE.Group | null = null
  private cyContactGeos: THREE.BufferGeometry[] = []
  private cyContactMat: THREE.LineBasicMaterial | null = null
  // Tia trục Y tại gốc (0,0) — hiện khi tick (persistent), không phụ thuộc chạm nhà.
  private cyAxisGrp: THREE.Group | null = null
  private cyAxisGeos: THREE.BufferGeometry[] = []
  private readonly geos: THREE.BufferGeometry[] = []
  private readonly mats: THREE.Material[] = []
  private isDisposed = false

  constructor(scene: THREE.Scene, opts: GridOpts) {
    this.scene = scene
    this.opts = opts
  }

  getZGridGroup(): THREE.Group | null {
    return this.zGridGroup
  }
  getXGridGroup(): THREE.Group | null {
    return this.xGridGroup
  }
  getCYGridGroup(): THREE.Group | null {
    return this.cyGridGroup
  }

  build(): void {
    const W = 40
    const H = 20
    this.zGridGroup = this.makeSlideGrid(W, H, 'z', this.opts.zPos, this.opts.zVisible)
    this.xGridGroup = this.makeSlideGrid(W, H, 'x', this.opts.xPos, this.opts.xVisible)
    this.zContactMat = this.lineMat(MEASURE_COLOR)
    this.xContactMat = this.lineMat(MEASURE_COLOR)
    // Lưới ngang mờ (dimMat như measure), trượt theo Y; outline sáng dựng trong update.
    this.cyGridGroup = new THREE.Group()
    this.cyGridGroup.add(this.makeFlatGridLines(W, W, this.dimMat()))
    this.cyGridGroup.position.y = this.opts.cyPos
    this.cyGridGroup.visible = this.opts.cyVisible
    this.scene.add(this.cyGridGroup)
    this.cyContactMat = this.lineMat(COORD_COLOR)
  }

  // Lưới ngang (mặt XZ, local y=0): các đường song song trục X và trục Z.
  private makeFlatGridLines(
    size: number,
    divs: number,
    mat: THREE.LineBasicMaterial
  ): THREE.LineSegments {
    const pts: number[] = []
    const h = size / 2
    for (let i = 0; i <= divs; i++) {
      const t = (i / divs - 0.5) * size
      pts.push(-h, 0, t, h, 0, t)
      pts.push(t, 0, -h, t, 0, h)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.geos.push(geo)
    return new THREE.LineSegments(geo, mat)
  }

  private dimMat(): THREE.LineBasicMaterial {
    const m = new THREE.LineBasicMaterial({ color: 0x0c1a2a, transparent: true, opacity: 0.12 })
    this.mats.push(m)
    return m
  }

  private lineMat(color: number): THREE.LineBasicMaterial {
    const m = new THREE.LineBasicMaterial({ color })
    this.mats.push(m)
    return m
  }

  // Mặt phẳng quét trượt theo 1 trục. axis='x' → xoay 90° (vuông góc trục X).
  private makeSlideGrid(
    w: number,
    h: number,
    axis: 'x' | 'z',
    pos: number,
    visible: boolean
  ): THREE.Group {
    const g = new THREE.Group()
    g.add(this.makeRectGridLines(w, h, w, h, this.dimMat()))
    if (axis === 'x') g.rotation.y = Math.PI / 2
    g.position[axis] = pos
    g.visible = visible
    this.scene.add(g)
    return g
  }

  update(buildingGroup: THREE.Group): void {
    this.disposeMeasureGrp(this.zMeasureGrp, this.zGridGroup, this.zContactGeos)
    this.zMeasureGrp = null
    this.disposeMeasureGrp(this.xMeasureGrp, this.xGridGroup, this.xContactGeos)
    this.xMeasureGrp = null
    this.disposeMeasureGrp(this.cyScanGrp, this.cyGridGroup, this.cyContactGeos)
    this.cyScanGrp = null
    // Tia trục Y (persistent) — dựng lại theo cyPos, hiện khi tick dù chưa chạm nhà.
    this.disposeMeasureGrp(this.cyAxisGrp, this.cyGridGroup, this.cyAxisGeos)
    this.cyAxisGrp = this.buildCyAxis()
    const bbox = new THREE.Box3().setFromObject(buildingGroup)
    if (bbox.isEmpty()) return
    const { min: mn, max: mx } = bbox
    this.scanZGrid(mn, mx)
    this.scanXGrid(mn, mx)
    this.scanCYGrid(mn, mx)
  }

  // Tia thẳng đứng tại gốc (0,0): từ mặt phẳng (local 0) xuống đất (local -cyPos).
  private buildCyAxis(): THREE.Group | null {
    if (!this.cyGridGroup || !this.cyContactMat) return null
    const grp = this.scanContact(
      [0, 0, 0, 0, -this.opts.cyPos, 0],
      this.cyContactMat,
      this.cyAxisGeos
    )
    this.cyGridGroup.add(grp)
    return grp
  }

  private removeGroup(grp: THREE.Group | null): null {
    if (grp) this.scene.remove(grp)
    return null
  }

  private disposeGeos(geos: THREE.BufferGeometry[]): void {
    for (const g of geos) g.dispose()
    geos.length = 0
  }

  dispose(): void {
    if (this.isDisposed) return
    this.zGridGroup = this.removeGroup(this.zGridGroup)
    this.xGridGroup = this.removeGroup(this.xGridGroup)
    this.cyGridGroup = this.removeGroup(this.cyGridGroup)
    this.zMeasureGrp = this.xMeasureGrp = this.cyScanGrp = this.cyAxisGrp = null
    this.disposeGeos(this.zContactGeos)
    this.disposeGeos(this.xContactGeos)
    this.disposeGeos(this.cyContactGeos)
    this.disposeGeos(this.cyAxisGeos)
    this.disposeGeos(this.geos)
    this.zContactMat = this.xContactMat = this.cyContactMat = null
    for (const m of this.mats) m.dispose()
    this.mats.length = 0
    this.isDisposed = true
  }

  private makeRectGridLines(
    w: number,
    h: number,
    wDivs: number,
    hDivs: number,
    mat: THREE.LineBasicMaterial
  ): THREE.LineSegments {
    const pts: number[] = []
    for (let i = 1; i < hDivs; i++) {
      const y = (i / hDivs) * h
      pts.push(-w / 2, y, 0, w / 2, y, 0)
    }
    for (let i = 0; i <= wDivs; i++) {
      const x = (i / wDivs - 0.5) * w
      pts.push(x, 0.02, 0, x, h, 0)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.geos.push(geo)
    return new THREE.LineSegments(geo, mat)
  }

  private makeMeasureLabel(
    text: string,
    lx: number,
    ly: number,
    cls: 'height-label-y' | 'height-label-xz'
  ): CSS2DObject {
    const div = document.createElement('div')
    div.textContent = text
    div.className = `height-label ${cls}`
    const obj = new CSS2DObject(div)
    obj.position.set(lx, ly, 0)
    return obj
  }

  // CSS2DRenderer không tự xóa DOM khi object bị remove — phải traverse trước.
  private disposeMeasureGrp(
    grp: THREE.Group | null,
    parent: THREE.Group | null,
    geos: THREE.BufferGeometry[]
  ): void {
    if (!grp) return
    grp.traverse((obj) => {
      if (obj instanceof CSS2DObject) obj.element.remove()
    })
    parent?.remove(grp)
    for (const g of geos) g.dispose()
    geos.length = 0
  }

  // Outline mặt cắt (cạnh trên + 2 cạnh đứng) — local plane coords.
  private zContactPts(mn: THREE.Vector3, mx: THREE.Vector3): number[] {
    // prettier-ignore
    return [mn.x, mx.y, 0, mx.x, mx.y, 0, mn.x, 0.02, 0, mn.x, mx.y, 0, mx.x, 0.02, 0, mx.x, mx.y, 0]
  }
  private xContactPts(mn: THREE.Vector3, mx: THREE.Vector3): number[] {
    // prettier-ignore
    return [-mx.z, mx.y, 0, -mn.z, mx.y, 0, -mx.z, 0.02, 0, -mx.z, mx.y, 0, -mn.z, 0.02, 0, -mn.z, mx.y, 0]
  }

  // Dựng group highlight mặt cắt từ pts + material; lưu geo để dispose theo store.
  private scanContact(
    pts: number[],
    mat: THREE.LineBasicMaterial,
    store: THREE.BufferGeometry[]
  ): THREE.Group {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    store.push(geo)
    const grp = new THREE.Group()
    grp.add(new THREE.LineSegments(geo, mat))
    return grp
  }

  // mm tọa độ (khoảng cách có dấu từ tâm 0 mặt phẳng XZ tới cạnh tường).
  private coordMM(pos: number): string {
    return `${Math.round(pos * 1000)}mm`
  }

  private scanZGrid(mn: THREE.Vector3, mx: THREE.Vector3): void {
    if (!this.zGridGroup || !this.zContactMat) return
    if (this.opts.zPos < mn.z || this.opts.zPos > mx.z) return
    const grp = this.scanContact(this.zContactPts(mn, mx), this.zContactMat, this.zContactGeos)
    grp.add(this.makeMeasureLabel(`${mx.y.toFixed(2)}m`, 0.4, mx.y, 'height-label-y'))
    grp.add(
      this.makeMeasureLabel(
        `${(mx.x - mn.x).toFixed(2)}m`,
        (mn.x + mx.x) / 2,
        -0.4,
        'height-label-xz'
      )
    )
    this.zGridGroup.add(grp)
    this.zMeasureGrp = grp
  }

  private scanXGrid(mn: THREE.Vector3, mx: THREE.Vector3): void {
    if (!this.xGridGroup || !this.xContactMat) return
    if (this.opts.xPos < mn.x || this.opts.xPos > mx.x) return
    const grp = this.scanContact(this.xContactPts(mn, mx), this.xContactMat, this.xContactGeos)
    grp.add(this.makeMeasureLabel(`${mx.y.toFixed(2)}m`, 0.4, mx.y, 'height-label-y'))
    grp.add(
      this.makeMeasureLabel(
        `${(mx.z - mn.z).toFixed(2)}m`,
        -(mn.z + mx.z) / 2,
        -0.4,
        'height-label-xz'
      )
    )
    this.xGridGroup.add(grp)
    this.xMeasureGrp = grp
  }

  // Outline footprint (hình chữ nhật bbox) trên mặt XZ, local y=0.
  private footprintPts(mn: THREE.Vector3, mx: THREE.Vector3): number[] {
    // prettier-ignore
    return [
      mn.x, 0, mn.z, mx.x, 0, mn.z,
      mx.x, 0, mn.z, mx.x, 0, mx.z,
      mx.x, 0, mx.z, mn.x, 0, mx.z,
      mn.x, 0, mx.z, mn.x, 0, mn.z,
    ]
  }

  // 4 tia vuông góc từ gốc (0,0) ra 4 cạnh tường — dọc trục X (tới mn.x/mx.x) và Z (mn.z/mx.z).
  private coordRaysPts(mn: THREE.Vector3, mx: THREE.Vector3): number[] {
    // prettier-ignore
    return [
      0, 0, 0, mn.x, 0, 0,
      0, 0, 0, mx.x, 0, 0,
      0, 0, 0, 0, 0, mn.z,
      0, 0, 0, 0, 0, mx.z,
    ]
  }

  // Nhãn tọa độ đặt phẳng tại (x, 0, z) trong cyGridGroup (khác makeMeasureLabel z=0).
  private makeCoordLabel(text: string, x: number, z: number): CSS2DObject {
    const div = document.createElement('div')
    div.textContent = text
    div.className = 'height-label coord-dist'
    const obj = new CSS2DObject(div)
    obj.position.set(x, 0, z)
    return obj
  }

  // Coordinate: mặt ngang ở cao độ cyPos cắt nhà → outline footprint + nhãn mm 4 cạnh
  // tường (= khoảng cách có dấu từ tâm 0 tới từng cạnh trên trục X/Z).
  private scanCYGrid(mn: THREE.Vector3, mx: THREE.Vector3): void {
    if (!this.cyGridGroup || !this.cyContactMat) return
    if (this.opts.cyPos < mn.y || this.opts.cyPos > mx.y) return
    const grp = this.scanContact(
      [...this.footprintPts(mn, mx), ...this.coordRaysPts(mn, mx)],
      this.cyContactMat,
      this.cyContactGeos
    )
    const midX = (mn.x + mx.x) / 2
    const midZ = (mn.z + mx.z) / 2
    grp.add(this.makeCoordLabel(this.coordMM(mn.x), mn.x, midZ))
    grp.add(this.makeCoordLabel(this.coordMM(mx.x), mx.x, midZ))
    grp.add(this.makeCoordLabel(this.coordMM(mn.z), midX, mn.z))
    grp.add(this.makeCoordLabel(this.coordMM(mx.z), midX, mx.z))
    this.cyGridGroup.add(grp)
    this.cyScanGrp = grp
  }
}

// ── CoordPicker ──────────────────────────────────────────────────────────────
// Click/rê chuột trên mặt phẳng XZ (y=0) → marker hổ phách + nhãn tọa độ mm tại điểm.
export class CoordPicker {
  private readonly scene: THREE.Scene
  private group: THREE.Group | null = null
  private label: HTMLDivElement | null = null
  private mat: THREE.MeshBasicMaterial | null = null
  private readonly geos: THREE.BufferGeometry[] = []
  private readonly raycaster = new THREE.Raycaster()
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) // y = 0
  private readonly ndc = new THREE.Vector2()
  private readonly hit = new THREE.Vector3()
  private isDisposed = false

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  build(): void {
    const g = new THREE.Group()
    g.visible = false
    const sphereGeo = new THREE.SphereGeometry(0.12, 12, 8)
    this.geos.push(sphereGeo)
    this.mat = new THREE.MeshBasicMaterial({ color: COORD_COLOR })
    g.add(new THREE.Mesh(sphereGeo, this.mat))
    const div = document.createElement('div')
    div.className = 'height-label coord-dist'
    this.label = div
    const obj = new CSS2DObject(div)
    obj.position.set(0, 0.4, 0)
    g.add(obj)
    this.scene.add(g)
    this.group = g
  }

  setVisible(on: boolean): void {
    if (this.group) this.group.visible = on
  }

  // ndcX/Y ∈ [-1,1]. Raycast xuống plane y=0 → đặt marker + nhãn mm. Trả false nếu trượt.
  pick(ndcX: number, ndcY: number, camera: THREE.Camera): boolean {
    if (!this.group || !this.label) return false
    this.ndc.set(ndcX, ndcY)
    this.raycaster.setFromCamera(this.ndc, camera)
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return false
    this.group.position.set(this.hit.x, 0, this.hit.z)
    this.group.visible = true
    this.label.textContent = `X ${Math.round(this.hit.x * 1000)} · Z ${Math.round(this.hit.z * 1000)} mm`
    return true
  }

  dispose(): void {
    if (this.isDisposed) return
    if (this.group) {
      this.group.traverse((o) => {
        if (o instanceof CSS2DObject) o.element.remove()
      })
      this.scene.remove(this.group)
      this.group = null
    }
    this.label = null
    for (const g of this.geos) g.dispose()
    this.geos.length = 0
    this.mat?.dispose()
    this.mat = null
    this.isDisposed = true
  }
}

// ── HumanFigure ────────────────────────────────────────────────────────────────

export class HumanFigure {
  private mat: THREE.MeshToonMaterial | null = null
  private readonly geos: THREE.BufferGeometry[] = []
  readonly group = new THREE.Group()
  private isDisposed = false

  build(): void {
    const mat = new THREE.MeshToonMaterial({ color: 0x5c7a9e })
    this.mat = mat
    const ab = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
      const g = new THREE.BoxGeometry(w, h, d)
      this.geos.push(g)
      const m = new THREE.Mesh(g, mat)
      m.position.set(x, y, z)
      this.group.add(m)
    }
    const as = (r: number, y: number): void => {
      const g = new THREE.SphereGeometry(r, 8, 6)
      this.geos.push(g)
      const m = new THREE.Mesh(g, mat)
      m.position.set(0, y, 0)
      this.group.add(m)
    }
    as(0.13, 1.62)
    ab(0.08, 0.1, 0.08, 0, 1.47, 0)
    ab(0.32, 0.55, 0.14, 0, 1.19, 0)
    ab(0.28, 0.2, 0.13, 0, 0.87, 0)
    ab(0.1, 0.32, 0.1, -0.22, 1.15, 0)
    ab(0.1, 0.32, 0.1, 0.22, 1.15, 0)
    ab(0.08, 0.28, 0.08, -0.22, 0.85, 0)
    ab(0.08, 0.28, 0.08, 0.22, 0.85, 0)
    ab(0.12, 0.38, 0.12, -0.1, 0.61, 0)
    ab(0.12, 0.38, 0.12, 0.1, 0.61, 0)
    ab(0.1, 0.38, 0.1, -0.1, 0.22, 0)
    ab(0.1, 0.38, 0.1, 0.1, 0.22, 0)
    this.group.position.set(8, 0, 0)
  }

  dispose(): void {
    if (this.isDisposed) return
    for (const g of this.geos) g.dispose()
    this.geos.length = 0
    this.mat?.dispose()
    this.mat = null
    this.isDisposed = true
  }
}
