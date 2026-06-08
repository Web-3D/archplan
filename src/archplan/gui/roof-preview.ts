/**
 * VỊ TRÍ   — archplan/src/archplan/gui/roof-preview.ts
 * VAI TRÒ  — Mini-scene WebGL render khối MÁI trong 🧪 Lab + HỆ TỌA ĐỘ (trục X/Y/Z + nhãn góc A–F) + LƯỠI DAO
 *            cắt khối bằng SHADER SDF (discard). `bladeSDF` hot-swap được qua editor → đây là chỗ cắm SDF iq.
 * LIÊN HỆ  — setupRoofLab (roof-lab.ts): setGeometry/setLabels (mái) · setBlade (transform) · setBladeSDF (code) ·
 *            setOnCompile (báo lỗi về editor). Thư viện SDF iq tiêm sẵn (SDF_LIB) → preset/code gọi trực tiếp.
 *
 * ⚠️ WebGL THƯỜNG. bladeSDF(p) tính ở BLADE-LOCAL (p = uBladeInv * worldPos) → SDF iq (shape ở gốc) cắm thẳng.
 * DISPOSE: dispose() — loop null + onShaderError null + controls/geo/mat/renderer + sprite + bladeMesh.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const INIT = 220 // px — cạnh khởi tạo trước khi ResizeObserver đo canvas thật
export const NORMAL_LEN = 3 // m — chiều dài pháp tuyến dựng từ đỉnh đáy (= max cao điểm di động A'B'C'D')
export const MAX_CORNER_SEG = 12 // SỐ ĐỐT tối đa chia lưới góc đao (định cỡ buffer cornerGeo) — khớp max slider
export const MAX_RAFTER_SEG = 24 // SỐ ĐỐT tối đa XÀ GÓC (gấp đôi — slider riêng, mịn hơn mặt)
const FRAME_SIZE = 0.07 // m — cạnh tiết diện vuông thanh gỗ KHUNG KLMNEFGH (timber)
const BEAM_SIZE = 0.04 // m — cạnh tiết diện vuông XÀ GÓC cong (rafter đao, timber theo đốt) — bóp 1 nửa, nằm dưới mái

// Thư viện SDF kiểu iq (Shadertoy) tiêm sẵn vào shader mái → editor/preset gọi trực tiếp trong bladeSDF.
// Export: SdfPreview (mini raymarch) dùng chung CÙNG thư viện → code/preset chạy giống nhau ở cả 2 nơi.
export const SDF_LIB = [
  'float sdSphere(vec3 p, float r){ return length(p) - r; }',
  'float sdBox(vec3 p, vec3 b){ vec3 d = abs(p) - b; return length(max(d,0.0)) + min(max(d.x,max(d.y,d.z)),0.0); }',
  'float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }',
  'float opSmoothUnion(float a, float b, float k){ float h = clamp(0.5+0.5*(b-a)/k,0.0,1.0); return mix(b,a,h)-k*h*(1.0-h); }',
  'float opSmoothSub(float a, float b, float k){ float h = clamp(0.5-0.5*(b+a)/k,0.0,1.0); return mix(b,-a,h)+k*h*(1.0-h); }',
].join('\n')

// 1 đỉnh có TÊN + tọa độ — dùng chung cho nhãn 3D lẫn bảng tọa độ (roof-lab.ts sinh ra).
export interface LabeledPoint {
  name: string
  x: number
  y: number
  z: number
}

// Nóc trên mỗi góc đáy: E↑A(0) F↑B(1) H↑C(2) G↑D(3) → index nóc theo góc đáy. Dùng dựng xà góc (frame K/L/N/M = chiếu nóc).
const NOC_OF_BASE = [4, 5, 7, 6]

// 2 MẶT tạo nên mỗi hip (theo góc đáy) — để xà sống straddle (2 cạnh đáy nằm trên 2 mặt). Mặt = 4 index góc.
// Trước ABFE[0,1,5,4] · phải BCHF[1,2,7,5] · sau CDGH[2,3,6,7] · trái DAEG[3,0,4,6].
const HIP_FACES: ReadonlyArray<readonly [number[], number[]]> = [
  [
    [0, 1, 5, 4],
    [3, 0, 4, 6],
  ], // A (hip AE): trước + trái
  [
    [0, 1, 5, 4],
    [1, 2, 7, 5],
  ], // B (hip BF): trước + phải
  [
    [1, 2, 7, 5],
    [2, 3, 6, 7],
  ], // C (hip CH): phải + sau
  [
    [2, 3, 6, 7],
    [3, 0, 4, 6],
  ], // D (hip DG): sau + trái
]

// 4 cạnh HIÊN: c1,c2 = 2 góc đáy; i1,i2 = 2 điểm O–V (= [vertX, vertZ] lấy .x từ vertX, .z từ vertZ, y=0) chặn vùng góc.
// Hiên 1 cạnh = cung góc(i1→tip c1) + ĐOẠN PHẲNG i1→i2 (luôn y=0) + cung góc(i2→tip c2). Phẳng = PO/RQ/TS/VU.
const EAVE_EDGES = [
  { c1: 0, c2: 1, i1: [4, 0], i2: [5, 0] }, // trước A-B: O(E.x,A.z) P(F.x,A.z)
  { c1: 1, c2: 2, i1: [1, 4], i2: [1, 6] }, // phải  B-C: Q(B.x,E.z) R(B.x,G.z)
  { c1: 2, c2: 3, i1: [5, 2], i2: [4, 2] }, // sau   C-D: S(F.x,C.z) T(E.x,C.z)
  { c1: 3, c2: 0, i1: [0, 6], i2: [0, 4] }, // trái  D-A: U(A.x,G.z) V(A.x,E.z)
] as const

// 1 hộp = 8 đỉnh (0-3 đáy · 4-7 nóc). 12 tam giác. DoubleSide nên winding không tới hạn.
// prettier-ignore
const BOX_TRI = [
  0, 2, 1, 0, 3, 2, // đáy
  4, 5, 6, 4, 6, 7, // nóc
  0, 1, 5, 0, 5, 4, // cạnh 0-1
  1, 2, 6, 1, 6, 5, // cạnh 1-2
  2, 3, 7, 2, 7, 6, // cạnh 2-3
  3, 0, 4, 3, 4, 7, // cạnh 3-0
]

export class RoofPreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly panel: HTMLElement
  private readonly mat: THREE.MeshStandardMaterial
  private underMat: THREE.MeshStandardMaterial | null = null // vàng nhạt — lớp ĐỘ DÀY (mặt trong+tường hiên), group 1
  private mesh: THREE.Mesh | null = null
  private readonly labelGroup = new THREE.Group() // nhãn góc A–F — dựng lại mỗi setLabels
  // Đường dựng = CẶP solid(phần thấy)+dashed(phần khuất sau mặt, depthFunc GREATER). Chung geometry. Dashed giữ ref
  // để computeLineDistances mỗi khi đổi vị trí. lineGeos/lineMats để dispose.
  private readonly lineGeos: THREE.BufferGeometry[] = []
  private readonly lineMats: THREE.Material[] = []
  private readonly guideLines: THREE.LineSegments[] = [] // mọi đường dựng (cặp solid+dashed) — toggle bật/tắt
  private normalsGeo: THREE.BufferGeometry | null = null // 4 pháp tuyến từ đỉnh đáy ABCD
  private normalsDash: THREE.LineSegments | null = null
  private readonly apexMarkers: THREE.Mesh[] = [] // 4 điểm di động A'B'C'D' trên pháp tuyến (sphere cam)
  private readonly apexLabels: THREE.Sprite[] = [] // nhãn A'B'C'D'
  private apexGeo: THREE.SphereGeometry | null = null // geo CHUNG 4 điểm
  private apexMat: THREE.MeshBasicMaterial | null = null
  private projGeo: THREE.BufferGeometry | null = null // KLMN (chiếu EFGH↓đáy) + 4 đường chiếu dọc
  private projDash: THREE.LineSegments | null = null
  private readonly projLabels: THREE.Sprite[] = [] // nhãn K L M N
  private extGeo: THREE.BufferGeometry | null = null // 8 đoạn: cạnh KLMN kéo dài cắt biên đáy ABCD
  private extDash: THREE.LineSegments | null = null
  private readonly extLabels: THREE.Sprite[] = [] // nhãn O P Q R S T U V
  private cutGeo: THREE.BufferGeometry | null = null // WX = giao 2 mặt hồi BFEA × DGHC (apex 2 mái dốc)
  private cutDash: THREE.LineSegments | null = null
  private readonly cutLabels: THREE.Sprite[] = [] // nhãn W X
  private capGeo: THREE.BufferGeometry | null = null // khối GEFHWX = nêm trên nóc (đáy EFGH → đỉnh WX)
  private capMat: THREE.MeshStandardMaterial | null = null // xanh dương nhạt, opacity dùng chung setOpacity
  private capMesh: THREE.Mesh | null = null
  private hipGeo: THREE.BufferGeometry | null = null // 4 hộp xà dọc sống EA/FB/HC/GD (2 cạnh đáy dính 2 mặt)
  private hipMat: THREE.MeshStandardMaterial | null = null
  private hipMesh: THREE.Mesh | null = null
  private readonly hipMids: THREE.Mesh[] = [] // 4 trung điểm hip I1..I4 (sphere)
  private readonly hipMidLabels: THREE.Sprite[] = [] // nhãn I1..I4
  private hipMidGeo: THREE.SphereGeometry | null = null
  private hipMidMat: THREE.MeshBasicMaterial | null = null
  private readonly jMids: THREE.Mesh[] = [] // J1..J4 = trung điểm cạnh góc-đáy→điểm khung (AK/BL/CN/DM, y=0)
  private readonly jMidLabels: THREE.Sprite[] = [] // nhãn J1..J4
  private jMidGeo: THREE.SphereGeometry | null = null
  private jMidMat: THREE.MeshBasicMaterial | null = null
  private readonly arcMids: THREE.Mesh[] = [] // X1 (mid cung OA'), Y1 (mid cung VA') — trung điểm 2 cung hiên góc A
  private readonly arcMidLabels: THREE.Sprite[] = [] // nhãn X1 Y1
  private arcMidGeo: THREE.SphereGeometry | null = null
  private arcMidMat: THREE.MeshBasicMaterial | null = null
  private cornerGeo: THREE.BufferGeometry | null = null // LƯỚI ĐỐT góc đao tại D (2 tam giác slope DTG/DUG)
  private cornerDash: THREE.LineSegments | null = null
  private frameGeo: THREE.BufferGeometry | null = null // KHUNG GỖ KLMNEFGH (12 thanh timber: đáy KLMN + nóc EFHG + 4 trụ)
  private frameMat: THREE.MeshStandardMaterial | null = null
  private frameMesh: THREE.Mesh | null = null
  private beamGeo: THREE.BufferGeometry | null = null // 4 XÀ GÓC cong timber (K→A' L→B' N→C' M→D') = rafter đao
  private beamMat: THREE.MeshStandardMaterial | null = null
  private beamMesh: THREE.Mesh | null = null
  private eaveGeo: THREE.BufferGeometry | null = null // ĐƯỜNG HIÊN cong (起翘) — 4 cung nối A'B'C'D', võng giữa
  private eaveDash: THREE.LineSegments | null = null
  private readonly decor: THREE.Object3D[] = [] // trục + lưới + nhãn trục (tĩnh, dispose ở cuối)
  private hemi: THREE.HemisphereLight | null = null // đèn nền — settings đổi độ sáng
  private key: THREE.DirectionalLight | null = null // đèn chiếu chính — settings đổi độ sáng
  private readonly gridMats: THREE.Material[] = [] // material 2 mặt lưới — settings đổi độ đậm
  // 🔪 Lưỡi dao: cắt qua SHADER (discard theo SDF ở blade-local). Uniform ref chung → đổi không recompile;
  // chỉ đổi THÂN bladeSDF (editor) mới recompile. `bladeSDF` = chỗ nâng lên SDF iq.
  private readonly bladeUniforms = {
    uBladeOn: { value: 0 },
    uBladeInv: { value: new THREE.Matrix4() }, // world → blade-local
    uTime: { value: 0 }, // cho cut động
  }
  private sdfBody = 'return p.z;' // thân bladeSDF (mặc định: mặt phẳng local z=0). Hot-swap qua setBladeSDF.
  private lastGoodBody = 'return p.z;' // bản compile chạy được gần nhất (để revert khi lỗi)
  private pendingCompile = false
  private compileErr: string | null = null
  private onCompile: ((err: string | null) => void) | null = null
  private bladeMesh: THREE.Mesh | null = null // tấm viz vị trí lưỡi dao (translucent)
  private readonly ro: ResizeObserver
  private lastW = 0
  private lastH = 0
  private isDisposed = false

  constructor(container: Element | null) {
    this.panel = document.createElement('div')
    this.panel.className = 'ap-scan-panel ap-preview-panel'
    const ttl = document.createElement('div')
    ttl.className = 'ap-scan-title'
    ttl.textContent = '🔎 Preview mái — trục X đỏ · Y lục · Z lam'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ap-preview-canvas'
    this.panel.append(ttl, this.canvas)
    container?.appendChild(this.panel)

    this.scene.background = new THREE.Color(0xe9edf1) // nền studio sáng
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100)
    this.camera.position.set(6, 5, 8)
    this._initSceneDecor() // đèn + sàn lưới + hệ trục X/Y/Z + nhãn trục

    this.mat = new THREE.MeshStandardMaterial({
      color: 0x9c7248, // COL_ROOF — khớp màu mái building-kit
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide, // dựng dở chưa kín → thấy cả 2 mặt
      flatShading: true, // facet rõ → soi từng mảng mái khi chỉnh
      transparent: true, // mặt BÁN TRONG SUỐT (kiểu hình học không gian)
      opacity: 0.7,
      depthWrite: true, // VẪN ghi depth → đường khuất sau mặt mới đứt được
      polygonOffset: true, // đẩy mặt lùi 1 chút → đường dựng trên mặt không z-fight
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    this.mat.onBeforeCompile = (s) => this._injectBlade(s) // tiêm SDF cắt vào shader mái
    this._initUnderMat() // material vàng nhạt cho lớp độ dày (group 1)

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setSize(INIT, INIT, false)
    this.renderer.debug.onShaderError = (gl, _p, _vs, fs) => {
      this.compileErr = gl.getShaderInfoLog(fs) ?? 'shader error'
    }
    this._initBladeViz() // tấm viz lưỡi dao (translucent)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.target.set(0, 1, 0) // tâm xoay ~ giữa khối mái
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.update()

    this.ro = new ResizeObserver(() => this._syncSize())
    this.ro.observe(this.canvas)

    this.renderer.setAnimationLoop(() => {
      this.controls.update() // damping + thao tác kéo/zoom
      this.bladeUniforms.uTime.value = performance.now() / 1000 // cho SDF động
      this.renderer.render(this.scene, this.camera)
      if (this.pendingCompile) this._afterCompile() // hậu-kiểm compile (lỗi → revert)
    })
  }

  // Material VÀNG NHẠT cho lớp ĐỘ DÀY (group 1) — tách khỏi constructor cho gọn. Lưỡi dao cắt cả lớp này.
  private _initUnderMat(): void {
    this.underMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a, // vàng nhạt — dễ phân biệt mặt trong/dưới
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: true,
    })
    this.underMat.onBeforeCompile = (s) => this._injectBlade(s)
  }

  // Đèn (lưu ref → settings đổi sáng) + 2 mặt lưới graph-paper (sàn XZ + tường sau XY dựng đứng → đọc cả
  // X lẫn CAO Y) + HỆ TỌA ĐỘ (trục X đỏ/Y lục/Z lam, depthTest off → luôn nổi) + nhãn trục.
  private _initSceneDecor(): void {
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x4a4036, 1.1)
    this.scene.add(this.hemi)
    this.key = new THREE.DirectionalLight(0xfff2e0, 2.0)
    this.key.position.set(5, 9, 4)
    this.scene.add(this.key)

    const mkGrid = (rotX: number, pos: readonly [number, number, number]): void => {
      const g = new THREE.GridHelper(12, 12, 0x8b95a0, 0xc2c9d0) // đậm hơn mức cũ 1 chút
      g.rotation.x = rotX
      g.position.set(pos[0], pos[1], pos[2])
      const m = g.material as THREE.Material
      m.transparent = true
      m.opacity = 0.6
      this.scene.add(g)
      this.gridMats.push(m)
      this.decor.push(g)
    }
    mkGrid(0, [0, 0, 0]) // sàn (XZ)
    mkGrid(Math.PI / 2, [0, 6, -6]) // tường sau dựng đứng (XY) → đọc chiều cao Y

    const axes = new THREE.AxesHelper(3)
    const am = axes.material as THREE.Material
    am.depthTest = false
    axes.renderOrder = 998
    this.scene.add(axes)
    this.decor.push(axes)
    this._addDecorLabel('X', 3.3, 0, 0, '#cc3333')
    this._addDecorLabel('Y', 0, 3.3, 0, '#2e9e2e')
    this._addDecorLabel('Z', 0, 0, 3.3, '#3366cc')
    this.scene.add(this.labelGroup)

    // 4 pháp tuyến (buffer 8 đỉnh = 4 đoạn) — cặp solid/dashed; vị trí cập nhật ở setNormals.
    this.normalsGeo = this._mkLineGeo(8)
    this.normalsDash = this._mkHiddenLines(this.normalsGeo, 0x55cc77)
    this._initApex()
    this._initProjection()
    this._initExtension()
    this._initCutEdge()
    this._initCapBlock()
    this._initHipBeams()
    this._initHipMids()
    this._initJMids()
    this._initArcMids()
    this._initCornerGrid()
    this._initFrame()
    this._initCornerBeams()
    this._initEave()
  }

  // Geometry rỗng cho LineSegments (vertCount đỉnh) — push vào lineGeos để dispose.
  private _mkLineGeo(vertCount: number): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(vertCount * 3), 3)
    )
    this.lineGeos.push(geo)
    return geo
  }

  // Cặp đường CHUNG geometry: solid (phần THẤY, depthFunc mặc định) + dashed (phần KHUẤT sau mặt, depthFunc GREATER).
  // Cả 2 transparent → vẽ ở pass sau mặt (mặt renderOrder 0 ghi depth trước). Trả LineSegments dashed để computeLineDistances.
  private _mkHiddenLines(geo: THREE.BufferGeometry, color: number): THREE.LineSegments {
    const solid = new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false })
    const dashed = new THREE.LineDashedMaterial({
      color,
      dashSize: 0.18,
      gapSize: 0.12,
      transparent: true,
      depthWrite: false,
    })
    dashed.depthFunc = THREE.GreaterDepth // chỉ vẽ nơi đường BỊ KHUẤT sau mặt
    this.lineMats.push(solid, dashed)
    const ls = new THREE.LineSegments(geo, solid)
    const ld = new THREE.LineSegments(geo, dashed)
    ls.renderOrder = 3
    ld.renderOrder = 3
    this.scene.add(ls, ld)
    this.guideLines.push(ls, ld) // để toggle bật/tắt đường dựng
    return ld
  }

  // Bật/tắt MỌI đường dựng (pháp tuyến, KLMN, O–V, WX, lưới góc, hiên — cả solid lẫn đứt quãng).
  setGuides(visible: boolean): void {
    for (const l of this.guideLines) l.visible = visible
  }

  // Bật/tắt MỌI nhãn chữ (A–H + A'B'C'D' + KLMN + O–V + WX + I + J + X1/Y1) — giữ nhãn trục X/Y/Z.
  setLabelsVisible(visible: boolean): void {
    this.labelGroup.visible = visible // nhãn góc A–H
    for (const arr of [
      this.apexLabels,
      this.projLabels,
      this.extLabels,
      this.cutLabels,
      this.hipMidLabels,
      this.jMidLabels,
      this.arcMidLabels,
    ])
      for (const sp of arr) sp.visible = visible
  }

  // KLMN = hình chiếu vuông nóc EFGH xuống đáy: rect KLMN + 4 đường chiếu dọc (cặp solid/dashed, tím) + 4 nhãn.
  private _initProjection(): void {
    this.projGeo = this._mkLineGeo(16)
    this.projDash = this._mkHiddenLines(this.projGeo, 0xc850e0)
    for (const n of ['K', 'L', 'M', 'N']) {
      const lbl = this._makeTextSprite(n, '#9b2fb0')
      lbl.scale.set(0.2, 0.2, 1)
      this.projLabels.push(lbl)
      this.scene.add(lbl)
    }
  }

  // 8 điểm O–V = cạnh KLMN kéo dài cắt biên đáy ABCD: 8 đoạn (góc KLMN → biên, lục lam) + 8 nhãn.
  private _initExtension(): void {
    this.extGeo = this._mkLineGeo(16)
    this.extDash = this._mkHiddenLines(this.extGeo, 0x1ba39c)
    for (const n of ['O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V']) {
      const lbl = this._makeTextSprite(n, '#0f6b65')
      lbl.scale.set(0.2, 0.2, 1)
      this.extLabels.push(lbl)
      this.scene.add(lbl)
    }
  }

  // WX = cạnh giao 2 mặt phẳng hồi BFEA (trước) × DGHC (sau): đường apex nơi 2 mái dốc gặp nhau (kéo dài). 1 đoạn + 2 nhãn.
  private _initCutEdge(): void {
    this.cutGeo = this._mkLineGeo(2)
    this.cutDash = this._mkHiddenLines(this.cutGeo, 0xd6336c)
    for (const n of ['W', 'X']) {
      const lbl = this._makeTextSprite(n, '#9c1f4f')
      lbl.scale.set(0.2, 0.2, 1)
      this.cutLabels.push(lbl)
      this.scene.add(lbl)
    }
  }

  // PEAK GEFHWX (xanh dương nhạt) — chân = nóc base EFGH, 6 đỉnh E0 F1 G2 H3 W4 X5. Index cố định, vị trí ở setCapBlock.
  private _initCapBlock(): void {
    this.capGeo = new THREE.BufferGeometry()
    this.capGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3))
    // KHÔNG có mặt đáy EFGH — chân peak HỞ ngồi đúng trên nóc base (mép chân = E-F-H-G-E = mép nóc base; nóc do mái lo).
    // prettier-ignore
    this.capGeo.setIndex([
      0, 1, 5, 0, 5, 4, // dốc trước: E F X W
      3, 2, 4, 3, 4, 5, // dốc sau:  H G W X
      2, 0, 4,          // bịt hồi trái (x=E.x): G E W
      1, 3, 5,          // bịt hồi phải (x=F.x): F H X
    ])
    this.capMat = new THREE.MeshStandardMaterial({
      color: 0x9cc4f0, // xanh dương nhạt
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    this.capMesh = new THREE.Mesh(this.capGeo, this.capMat)
    this.capMesh.visible = false // hiện khi setCapBlock có apex hợp lệ
    this.scene.add(this.capMesh)
  }

  // 4 xà sống CONG dọc hip EA/FB/HC/GD — mỗi xà = chuỗi tối đa MAX_CORNER_SEG đốt hộp × 4 = 4·MAX hộp × 8 đỉnh.
  private _initHipBeams(): void {
    const maxBox = 4 * MAX_CORNER_SEG
    this.hipGeo = new THREE.BufferGeometry()
    this.hipGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(maxBox * 8 * 3), 3)
    )
    const idx: number[] = []
    for (let k = 0; k < maxBox; k++) for (const t of BOX_TRI) idx.push(t + k * 8)
    this.hipGeo.setIndex(idx)
    this.hipMat = new THREE.MeshStandardMaterial({
      color: 0x6b4a2a, // gỗ nâu sẫm
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
    })
    this.hipMesh = new THREE.Mesh(this.hipGeo, this.hipMat)
    this.hipMesh.visible = false // BỎ hộp xà sống (NgQuan 2026-06-08) — chỉ giữ I1–I4 (trung điểm hip)
    this.scene.add(this.hipMesh)
  }

  // 4 trung điểm xà sống I1..I4 (sphere lục + nhãn) — vị trí cập nhật ở setHipBeams.
  private _initHipMids(): void {
    this.hipMidGeo = new THREE.SphereGeometry(0.035, 12, 9)
    this.hipMidMat = new THREE.MeshBasicMaterial({ color: 0x16a34a })
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.hipMidGeo, this.hipMidMat)
      this.hipMids.push(m)
      this.scene.add(m)
      const lbl = this._makeTextSprite(`I${i + 1}`, '#0f6b30')
      lbl.scale.set(0.21, 0.21, 1)
      this.hipMidLabels.push(lbl)
      this.scene.add(lbl)
    }
  }

  // 4 điểm J1..J4 (sphere tím + nhãn) = trung điểm cạnh AK/BL/CN/DM — vị trí cập nhật ở setJMids.
  private _initJMids(): void {
    this.jMidGeo = new THREE.SphereGeometry(0.035, 12, 9)
    this.jMidMat = new THREE.MeshBasicMaterial({ color: 0x9333ea }) // tím
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.jMidGeo, this.jMidMat)
      this.jMids.push(m)
      this.scene.add(m)
      const lbl = this._makeTextSprite(`J${i + 1}`, '#6b21a8')
      lbl.scale.set(0.21, 0.21, 1)
      this.jMidLabels.push(lbl)
      this.scene.add(lbl)
    }
  }

  // 2 điểm X1, Y1 (sphere đỏ + nhãn) = trung điểm 2 cung hiên góc A (OA', VA') — vị trí cập nhật ở setArcMids.
  private _initArcMids(): void {
    this.arcMidGeo = new THREE.SphereGeometry(0.035, 12, 9)
    this.arcMidMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 }) // đỏ
    for (const name of ['X1', 'Y1']) {
      const m = new THREE.Mesh(this.arcMidGeo, this.arcMidMat)
      this.arcMids.push(m)
      this.scene.add(m)
      const lbl = this._makeTextSprite(name, '#991b1b')
      lbl.scale.set(0.21, 0.21, 1)
      this.arcMidLabels.push(lbl)
      this.scene.add(lbl)
    }
  }

  // LƯỚI ĐỐT góc đao (Tầng 1) — cặp solid/dashed vàng hổ phách, buffer định cỡ theo MAX_CORNER_SEG. Vị trí ở setCornerGrid.
  private _initCornerGrid(): void {
    this.cornerGeo = this._mkLineGeo(6 * MAX_CORNER_SEG * (MAX_CORNER_SEG + 1)) // 2 tam giác × 3 họ cạnh
    this.cornerDash = this._mkHiddenLines(this.cornerGeo, 0xeab308) // vàng hổ phách = vùng góc đao
  }

  // KHUNG GỖ KLMNEFGH (lăng trụ đứng dưới nóc) — 12 thanh timber × 8 đỉnh = 96. Index cố định, vị trí ở setFrame.
  private _initFrame(): void {
    this.frameGeo = new THREE.BufferGeometry()
    this.frameGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(288), 3)
    )
    const idx: number[] = []
    for (let k = 0; k < 12; k++) for (const t of BOX_TRI) idx.push(t + k * 8)
    this.frameGeo.setIndex(idx)
    this.frameMat = new THREE.MeshStandardMaterial({
      color: 0x8a6240, // nâu gỗ nhạt
      roughness: 0.75,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
    })
    this.frameMesh = new THREE.Mesh(this.frameGeo, this.frameMat)
    this.scene.add(this.frameMesh)
  }

  // 4 XÀ GÓC cong TIMBER (rafter đao) — mỗi xà tối đa MAX_CORNER_SEG đốt hộp × 4 góc = 48 hộp × 8 đỉnh. Vị trí ở setCornerBeams.
  private _initCornerBeams(): void {
    const maxBox = 4 * MAX_RAFTER_SEG // xà góc số đốt riêng (gấp đôi)
    this.beamGeo = new THREE.BufferGeometry()
    this.beamGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(maxBox * 8 * 3), 3)
    )
    const idx: number[] = []
    for (let k = 0; k < maxBox; k++) for (const t of BOX_TRI) idx.push(t + k * 8)
    this.beamGeo.setIndex(idx)
    this.beamMat = new THREE.MeshStandardMaterial({
      color: 0xc1440e, // cam đất = xà góc nổi bật
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
    })
    this.beamMesh = new THREE.Mesh(this.beamGeo, this.beamMat)
    this.scene.add(this.beamMesh)
  }

  // ĐƯỜNG HIÊN cong (起翘) — 4 cung (cặp solid/dashed xanh dương) nối A'B'C'D'. Buffer 4 cạnh × MAX_CORNER_SEG đoạn × 2.
  private _initEave(): void {
    this.eaveGeo = this._mkLineGeo(16 * MAX_CORNER_SEG + 8) // 4 cạnh × (2 cung n đoạn + 1 đoạn phẳng) × 2
    this.eaveDash = this._mkHiddenLines(this.eaveGeo, 0x1d4ed8) // xanh dương = đường hiên cong
  }

  // 4 điểm di động A'B'C'D' (sphere cam) trên pháp tuyến + nhãn — vị trí cập nhật ở setApex.
  private _initApex(): void {
    this.apexGeo = new THREE.SphereGeometry(0.04, 14, 10)
    this.apexMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d })
    const names = ["A'", "B'", "C'", "D'"]
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.apexGeo, this.apexMat)
      this.apexMarkers.push(m)
      this.scene.add(m)
      const lbl = this._makeTextSprite(names[i], '#b5541d')
      lbl.scale.set(0.21, 0.21, 1)
      this.apexLabels.push(lbl)
      this.scene.add(lbl)
    }
  }

  // ── Settings preview (gọi từ buildPreviewSettings): độ đậm lưới + độ sáng 2 đèn. ──
  setGridOpacity(v: number): void {
    for (const m of this.gridMats) m.opacity = v
  }
  setAmbient(v: number): void {
    if (this.hemi) this.hemi.intensity = v
  }
  setKey(v: number): void {
    if (this.key) this.key.intensity = v
  }
  // Độ đục mặt mái + khối nêm GEFHWX (0 = trong suốt hẳn · 1 = đặc). Vẫn ghi depth nên nét khuất vẫn đứt.
  setOpacity(v: number): void {
    this.mat.opacity = v
    if (this.capMat) this.capMat.opacity = v
  }

  // Tiêm SDF cắt vào shader mái: vWorldPos (vertex) + thư viện iq + bladeSDF(thân hiện tại) + discard ở blade-local.
  private _injectBlade(shader: THREE.WebGLProgramParametersWithUniforms): void {
    shader.uniforms.uBladeOn = this.bladeUniforms.uBladeOn
    shader.uniforms.uBladeInv = this.bladeUniforms.uBladeInv
    shader.uniforms.uTime = this.bladeUniforms.uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      )
    const head = `#include <common>
varying vec3 vWorldPos;
uniform float uBladeOn;
uniform mat4 uBladeInv;
uniform float uTime;
${SDF_LIB}
float bladeSDF(vec3 p){ ${this.sdfBody} }`
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', head)
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (uBladeOn > 0.5 && bladeSDF((uBladeInv * vec4(vWorldPos,1.0)).xyz) < 0.0) discard;'
      )
  }

  // Hậu-kiểm sau recompile: lỗi → revert thân chạy được + báo log; OK → ghi nhận bản tốt.
  private _afterCompile(): void {
    this.pendingCompile = false
    if (this.compileErr) {
      const err = this.compileErr
      this.compileErr = null
      this.sdfBody = this.lastGoodBody // quay về bản chạy được
      this.mat.needsUpdate = true
      this.onCompile?.(err)
    } else {
      this.lastGoodBody = this.sdfBody
      this.onCompile?.(null)
    }
  }

  // Tấm viz lưỡi dao (translucent) — KHÔNG bị cắt (material riêng). Ẩn khi tắt.
  private _initBladeViz(): void {
    const geo = new THREE.PlaneGeometry(14, 14)
    const m = new THREE.MeshBasicMaterial({
      color: 0x2aa8ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.bladeMesh = new THREE.Mesh(geo, m)
    this.bladeMesh.visible = false
    this.bladeMesh.renderOrder = 5
    this.scene.add(this.bladeMesh)
  }

  // Đặt transform lưỡi dao (ma trận world của mặt cắt). enabled=false → không cắt + ẩn viz. uBladeInv = nghịch đảo.
  setBlade(transform: THREE.Matrix4, enabled: boolean): void {
    if (this.isDisposed) return
    this.bladeUniforms.uBladeOn.value = enabled ? 1 : 0
    if (!enabled) {
      if (this.bladeMesh) this.bladeMesh.visible = false
      return
    }
    this.bladeUniforms.uBladeInv.value.copy(transform).invert()
    if (this.bladeMesh) {
      this.bladeMesh.visible = true
      this.bladeMesh.matrixAutoUpdate = false
      this.bladeMesh.matrix.copy(transform)
    }
  }

  // Hot-swap thân bladeSDF (từ editor) → recompile material. Kết quả báo qua onCompile (sau 1 frame).
  setBladeSDF(body: string): void {
    if (this.isDisposed) return
    this.sdfBody = body
    this.mat.needsUpdate = true
    this.pendingCompile = true
  }

  setOnCompile(cb: (err: string | null) => void): void {
    this.onCompile = cb
  }

  // Sprite chữ từ canvas (depthTest:false → luôn thấy). color = CSS hex.
  private _makeTextSprite(text: string, color: string): THREE.Sprite {
    const px = 128
    const canvas = document.createElement('canvas')
    canvas.width = px
    canvas.height = px
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.font = 'bold 78px sans-serif'
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, px / 2, px / 2)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.minFilter = THREE.LinearFilter
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
    const sp = new THREE.Sprite(mat)
    sp.renderOrder = 999
    return sp
  }

  private _addDecorLabel(text: string, x: number, y: number, z: number, color: string): void {
    const sp = this._makeTextSprite(text, color)
    sp.position.set(x, y, z)
    sp.scale.set(0.45, 0.45, 1)
    this.scene.add(sp)
    this.decor.push(sp)
  }

  private _disposeSprite(sp: THREE.Sprite): void {
    sp.material.map?.dispose()
    sp.material.dispose()
  }

  private _disposeMat(m: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(m)) for (const x of m) x.dispose()
    else m.dispose()
  }

  // Đặt nhãn góc A–F tại đúng tọa độ (nhô lên 1 chút cho khỏi dính mặt). Dựng lại mỗi lần geometry đổi.
  setLabels(points: LabeledPoint[]): void {
    if (this.isDisposed) return
    for (const c of this.labelGroup.children) {
      if (c instanceof THREE.Sprite) this._disposeSprite(c)
    }
    this.labelGroup.clear()
    for (const p of points) {
      const sp = this._makeTextSprite(p.name, '#16261a')
      sp.position.set(p.x, p.y + 0.28, p.z)
      sp.scale.set(0.21, 0.21, 1)
      this.labelGroup.add(sp)
    }
  }

  // Vẽ 4 PHÁP TUYẾN dựng đứng từ 4 đỉnh đáy (A,B,C,D = 4 đỉnh đầu) lên cao NORMAL_LEN — guide cho điểm di động sau.
  setNormals(base: LabeledPoint[]): void {
    if (this.isDisposed || !this.normalsGeo) return
    const attr = this.normalsGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < 4; i++) {
      const c = base[i]
      attr.setXYZ(i * 2, c.x, c.y, c.z)
      attr.setXYZ(i * 2 + 1, c.x, c.y + NORMAL_LEN, c.z)
    }
    attr.needsUpdate = true
    this.normalsDash?.computeLineDistances() // nét đứt theo vị trí mới
  }

  // Đặt 4 điểm A'B'C'D' tại ĐỈNH GÓC ĐÃ CUỘN (chạm đỉnh mái cong): góc nhấc heights[i] + cuộn mũi tipCurl.
  setApex(base: LabeledPoint[], heights: number[], tipCurl: number): void {
    if (this.isDisposed || base.length < 8) return
    const cx = this._baseCenterX(base)
    const cz = this._baseCenterZ(base)
    for (let i = 0; i < 4; i++) {
      const t = this._curledTip(base[i], heights[i], cx, cz, tipCurl)
      this.apexMarkers[i].position.copy(t)
      this.apexLabels[i].position.set(t.x, t.y + 0.25, t.z)
    }
  }

  // KLMN = chiếu vuông nóc EFGH (verts[4..7]) xuống đáy y=0: rect KLMN + 4 đường chiếu dọc (E↓K F↓L G↓M H↓N) + nhãn.
  setProjection(verts: LabeledPoint[]): void {
    if (this.isDisposed || !this.projGeo || verts.length < 8) return
    const [E, F, G, H] = [verts[4], verts[5], verts[6], verts[7]]
    const attr = this.projGeo.getAttribute('position') as THREE.BufferAttribute
    let i = 0
    const put = (x: number, y: number, z: number): void => {
      attr.setXYZ(i++, x, y, z)
    }
    // rect KLMN trên đáy: K-L, L-N, N-M, M-K (K↓E L↓F M↓G N↓H)
    put(E.x, 0, E.z)
    put(F.x, 0, F.z)
    put(F.x, 0, F.z)
    put(H.x, 0, H.z)
    put(H.x, 0, H.z)
    put(G.x, 0, G.z)
    put(G.x, 0, G.z)
    put(E.x, 0, E.z)
    // đường chiếu dọc xuống đáy
    put(E.x, E.y, E.z)
    put(E.x, 0, E.z)
    put(F.x, F.y, F.z)
    put(F.x, 0, F.z)
    put(G.x, G.y, G.z)
    put(G.x, 0, G.z)
    put(H.x, H.y, H.z)
    put(H.x, 0, H.z)
    attr.needsUpdate = true
    this.projDash?.computeLineDistances() // nét đứt theo vị trí mới
    const top = [E, F, G, H]
    for (let k = 0; k < 4; k++) this.projLabels[k].position.set(top[k].x, 0.2, top[k].z)
  }

  // O–V = cạnh KLMN kéo dài cắt biên đáy. Góc KLMN = (E/F/G/H .x,0,.z); biên = A/B/C/D. 8 đoạn nối + 8 nhãn.
  setExtension(verts: LabeledPoint[]): void {
    if (this.isDisposed || !this.extGeo || verts.length < 8) return
    const [A, B, C, D, E, F, G, H] = verts
    const attr = this.extGeo.getAttribute('position') as THREE.BufferAttribute
    let i = 0
    const put = (x: number, z: number): void => {
      attr.setXYZ(i++, x, 0, z)
    }
    put(E.x, E.z) // K→O
    put(E.x, A.z)
    put(E.x, E.z) // K→V
    put(A.x, E.z)
    put(F.x, F.z) // L→P
    put(F.x, A.z)
    put(F.x, F.z) // L→Q
    put(B.x, F.z)
    put(G.x, G.z) // M→T
    put(G.x, D.z)
    put(G.x, G.z) // M→U
    put(A.x, G.z)
    put(H.x, H.z) // N→S
    put(H.x, C.z)
    put(H.x, H.z) // N→R
    put(B.x, H.z)
    attr.needsUpdate = true
    this.extDash?.computeLineDistances()
    // O P Q R S T U V (đi vòng A→B→C→D, mỗi cạnh 2 điểm)
    const pts: [number, number][] = [
      [E.x, A.z],
      [F.x, A.z],
      [B.x, E.z],
      [B.x, G.z],
      [F.x, C.z],
      [E.x, C.z],
      [A.x, G.z],
      [A.x, E.z],
    ]
    for (let k = 0; k < 8; k++) this.extLabels[k].position.set(pts[k][0], 0.2, pts[k][1])
  }

  // Lưới đốt 1 TAM GIÁC (P0,P1,P2) chia `seg`: ghi 3 họ cạnh (∥P0P1, ∥P0P2, ∥P1P2) từ chỉ số `start`. Trả chỉ số kế.
  private _triGrid(
    attr: THREE.BufferAttribute,
    start: number,
    P0: THREE.Vector3,
    P1: THREE.Vector3,
    P2: THREE.Vector3,
    seg: number
  ): number {
    const d1 = new THREE.Vector3().subVectors(P1, P0)
    const d2 = new THREE.Vector3().subVectors(P2, P0)
    const at = (a: number, b: number): THREE.Vector3 =>
      new THREE.Vector3()
        .copy(P0)
        .addScaledVector(d1, a / seg)
        .addScaledVector(d2, b / seg)
    let i = start
    const edge = (p: THREE.Vector3, q: THREE.Vector3): void => {
      attr.setXYZ(i++, p.x, p.y, p.z)
      attr.setXYZ(i++, q.x, q.y, q.z)
    }
    for (let a = 0; a < seg; a++) {
      for (let b = 0; b < seg - a; b++) {
        const p = at(a, b)
        edge(p, at(a + 1, b)) // ∥ P0→P1
        edge(p, at(a, b + 1)) // ∥ P0→P2
        edge(at(a + 1, b), at(a, b + 1)) // ∥ P1→P2 (cạnh huyền ô)
      }
    }
    return i
  }

  // LƯỚI ĐỐT góc đao tại D = 2 tam giác slope: DTG (mặt sau) + DUG (mặt trái), gặp nhau ở sống DG. Chia `seg` đốt.
  // Tầng 1: chỉ guide-line (chưa cong, D' chưa nhúc nhích). T=(E.x,C.z) U=(A.x,G.z) trên 2 mép; G = nóc trên D.
  setCornerGrid(verts: LabeledPoint[], seg: number): void {
    if (this.isDisposed || !this.cornerGeo || verts.length < 8) return
    const v = (p: LabeledPoint): THREE.Vector3 => new THREE.Vector3(p.x, p.y, p.z)
    const D = v(verts[3])
    const G = v(verts[6])
    const T = new THREE.Vector3(verts[4].x, 0, verts[2].z) // mép sau gần D
    const U = new THREE.Vector3(verts[0].x, 0, verts[6].z) // mép trái gần D
    const n = Math.max(1, Math.min(MAX_CORNER_SEG, Math.round(seg)))
    const attr = this.cornerGeo.getAttribute('position') as THREE.BufferAttribute
    let i = this._triGrid(attr, 0, D, T, G, n) // mặt sau: D→T (mép) · D→G (sống)
    i = this._triGrid(attr, i, D, U, G, n) // mặt trái: D→U (mép) · D→G (sống)
    attr.needsUpdate = true
    this.cornerGeo.setDrawRange(0, i)
    this.cornerDash?.computeLineDistances()
  }

  // 1 THANH timber dọc cạnh P→Q, tiết diện vuông cạnh 2·half. Ghi 8 đỉnh tại boxIdx*8 (0-3 đầu P · 4-7 đầu Q).
  private _edgeBox(
    attr: THREE.BufferAttribute,
    boxIdx: number,
    P: THREE.Vector3,
    Q: THREE.Vector3,
    half: number,
    dropY = 0 // hạ cả hộp xuống đoạn này (để xà góc nằm DƯỚI mặt mái, mặt trên ≈ ngay curve)
  ): void {
    const dir = new THREE.Vector3().subVectors(Q, P).normalize()
    const ref = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(dir, ref).normalize().multiplyScalar(half)
    const v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(half)
    let i = boxIdx * 8
    for (const base of [P, Q]) {
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const p = new THREE.Vector3().copy(base).addScaledVector(u, su).addScaledVector(v, sv)
        attr.setXYZ(i++, p.x, p.y - dropY, p.z)
      }
    }
  }

  // KHUNG GỖ KLMNEFGH (timber): đáy KLMN (chiếu nóc↓y=0) + nóc EFHG + 4 trụ. 12 thanh tiết diện vuông FRAME_SIZE.
  // INSET vào trong nửa tiết diện → mặt NGOÀI thanh trùng mép nóc base (không lấn ra ngoài mép nóc).
  setFrame(verts: LabeledPoint[]): void {
    if (this.isDisposed || !this.frameGeo || verts.length < 8) return
    const noc = [verts[4], verts[5], verts[7], verts[6]] // vòng nóc E-F-H-G
    const cx = (noc[0].x + noc[1].x + noc[2].x + noc[3].x) / 4 // tâm nóc (xz)
    const cz = (noc[0].z + noc[1].z + noc[2].z + noc[3].z) / 4
    const d = FRAME_SIZE / 2
    const inset = (p: LabeledPoint, y: number): THREE.Vector3 =>
      new THREE.Vector3(p.x - Math.sign(p.x - cx) * d, y, p.z - Math.sign(p.z - cz) * d)
    const top = noc.map((p) => inset(p, p.y)) // nóc EFHG (inset → mặt ngoài = mép nóc)
    const bot = noc.map((p) => inset(p, 0)) // KLMN (chiếu y=0): K-L-N-M
    const edges: [THREE.Vector3, THREE.Vector3][] = []
    for (let k = 0; k < 4; k++) {
      edges.push([bot[k], bot[(k + 1) % 4]]) // đáy KLMN
      edges.push([top[k], top[(k + 1) % 4]]) // nóc EFHG
      edges.push([bot[k], top[k]]) // trụ đứng
    }
    const attr = this.frameGeo.getAttribute('position') as THREE.BufferAttribute
    for (let k = 0; k < edges.length; k++)
      this._edgeBox(attr, k, edges[k][0], edges[k][1], FRAME_SIZE / 2)
    attr.needsUpdate = true
    this.frameGeo.computeVertexNormals()
  }

  // Điểm trên Bézier bậc 2 (P0,P1,P2) tại tham số t∈[0,1].
  private _bezierAt(
    P0: THREE.Vector3,
    P1: THREE.Vector3,
    P2: THREE.Vector3,
    t: number
  ): THREE.Vector3 {
    const u = 1 - t
    return new THREE.Vector3()
      .addScaledVector(P0, u * u)
      .addScaledVector(P1, 2 * u * t)
      .addScaledVector(P2, t * t)
  }

  // ĐỈNH GÓC ĐÃ CUỘN (= đúng đỉnh mái cong sau tip-curl): góc nhấc A' + quặp VÀO TRONG (về tâm xz) + LÊN, đoạn `curl`.
  // Khớp tipCurlOffset của surface ở (u,v)=(0,0) → mọi thứ neo vào đây luôn CHẠM đỉnh mái.
  private _curledTip(
    base: LabeledPoint,
    lift: number,
    cx: number,
    cz: number,
    curl: number
  ): THREE.Vector3 {
    const tip = new THREE.Vector3(base.x, base.y + lift, base.z)
    const inward = new THREE.Vector3(cx - base.x, 0, cz - base.z)
    if (inward.lengthSq() > 0) inward.normalize()
    tip.addScaledVector(inward, curl) // quặp vào trong
    tip.y += curl // và lên
    return tip
  }

  private _baseCenterX(v: LabeledPoint[]): number {
    return (v[0].x + v[1].x + v[2].x + v[3].x) / 4
  }
  private _baseCenterZ(v: LabeledPoint[]): number {
    return (v[0].z + v[1].z + v[2].z + v[3].z) / 4
  }

  // 4 XÀ GÓC cong TIMBER (rafter đao): mỗi xà = chuỗi `n` ĐỐT HỘP men theo Bézier. P0 = điểm khung K/L/N/M (y=0)
  // → P2 = ĐỈNH ĐÃ CUỘN (chạm đỉnh mái cong). Control = trung điểm chord kéo về GÓC ĐÁY gốc theo `curve`. Thon dần về mũi.
  setCornerBeams(
    verts: LabeledPoint[],
    heights: number[],
    seg: number,
    curve: number,
    tipCurl: number
  ): void {
    if (this.isDisposed || !this.beamGeo || verts.length < 8) return
    const n = Math.max(1, Math.min(MAX_RAFTER_SEG, Math.round(seg)))
    const cx = this._baseCenterX(verts)
    const cz = this._baseCenterZ(verts)
    const attr = this.beamGeo.getAttribute('position') as THREE.BufferAttribute
    let box = 0
    for (let c = 0; c < 4; c++) {
      const base = verts[c]
      const noc = verts[NOC_OF_BASE[c]]
      const P0 = new THREE.Vector3(noc.x, 0, noc.z) // điểm khung (chân trụ)
      const P2 = this._curledTip(base, heights[c], cx, cz, tipCurl) // ĐỈNH ĐÃ CUỘN → chạm đỉnh mái
      const ground = new THREE.Vector3(base.x, base.y, base.z) // góc đáy gốc
      const ctrl = new THREE.Vector3().addVectors(P0, P2).multiplyScalar(0.5).lerp(ground, curve)
      let prev = P0
      for (let s = 1; s <= n; s++) {
        const p = this._bezierAt(P0, ctrl, P2, s / n)
        const half = (BEAM_SIZE / 2) * (1 - 0.8 * ((s - 0.5) / n)) // THON DẦN: dày ở khung K → mỏng (20%) ở góc A'
        this._edgeBox(attr, box++, prev, p, half, half) // dropY = half → mặt trên xà SÁT mặt mái
        prev = p
      }
    }
    attr.needsUpdate = true
    this.beamGeo.setDrawRange(0, box * BOX_TRI.length) // chỉ vẽ số hộp đã dùng (index cố định)
    this.beamGeo.computeVertexNormals()
  }

  // Lấy mẫu Bézier bậc 2 (P0,P1,P2) thành polyline `seg` đoạn (LineSegments) từ chỉ số `start`. Trả chỉ số kế.
  private _bezierLine(
    attr: THREE.BufferAttribute,
    start: number,
    P0: THREE.Vector3,
    P1: THREE.Vector3,
    P2: THREE.Vector3,
    seg: number
  ): number {
    let i = start
    let prev = P0
    for (let s = 1; s <= seg; s++) {
      const p = this._bezierAt(P0, P1, P2, s / seg)
      attr.setXYZ(i++, prev.x, prev.y, prev.z)
      attr.setXYZ(i++, p.x, p.y, p.z)
      prev = p
    }
    return i
  }

  // CUNG GÓC hiên: từ điểm O–V `inner` (y=0) vểnh lên đầu xà `tip`. Control kéo về GÓC ĐÁY `ground` theo `curve`
  // (0 = thẳng inner-tip · 1 = tiếp tuyến PHẲNG tại inner rồi vút đứng lên tip — khớp êm với đoạn phẳng giữa).
  private _cornerArc(
    attr: THREE.BufferAttribute,
    start: number,
    inner: THREE.Vector3,
    ground: THREE.Vector3,
    tip: THREE.Vector3,
    seg: number,
    curve: number
  ): number {
    const ctrl = inner.clone().add(tip).multiplyScalar(0.5).lerp(ground, curve)
    return this._bezierLine(attr, start, inner, ctrl, tip, seg)
  }

  // ĐƯỜNG HIÊN (起翘): mỗi cạnh = cung góc (i1→tip c1) + ĐOẠN PHẲNG i1→i2 LUÔN y=0 + cung góc (i2→tip c2).
  // Chỉ vùng góc vểnh; đoạn giữa (PO/RQ/TS/VU, giữa 2 điểm O–V) giữ phẳng. `curve` chung với xà góc.
  setEave(verts: LabeledPoint[], heights: number[], seg: number, curve: number): void {
    if (this.isDisposed || !this.eaveGeo || verts.length < 8) return
    const n = Math.max(1, Math.min(MAX_CORNER_SEG, Math.round(seg)))
    const attr = this.eaveGeo.getAttribute('position') as THREE.BufferAttribute
    const tip = (c: number): THREE.Vector3 =>
      new THREE.Vector3(verts[c].x, verts[c].y + heights[c], verts[c].z)
    const ground = (c: number): THREE.Vector3 =>
      new THREE.Vector3(verts[c].x, verts[c].y, verts[c].z)
    const ov = (p: readonly number[]): THREE.Vector3 =>
      new THREE.Vector3(verts[p[0]].x, 0, verts[p[1]].z) // điểm O–V ở y=0
    let idx = 0
    for (const e of EAVE_EDGES) {
      const in1 = ov(e.i1)
      const in2 = ov(e.i2)
      idx = this._cornerArc(attr, idx, in1, ground(e.c1), tip(e.c1), n, curve)
      attr.setXYZ(idx++, in1.x, 0, in1.z) // đoạn phẳng giữa — LUÔN y=0
      attr.setXYZ(idx++, in2.x, 0, in2.z)
      idx = this._cornerArc(attr, idx, in2, ground(e.c2), tip(e.c2), n, curve)
    }
    attr.needsUpdate = true
    this.eaveGeo.setDrawRange(0, idx)
    this.eaveDash?.computeLineDistances()
  }

  // PEAK GEFHWX: chân = nóc base EFGH (mặt phẳng chung, DÍNH LIỀN — dài/rộng theo nóc) vuốt lên cạnh đỉnh WX cao thêm
  // capHeight (chỉ chiều cao là RIÊNG). 6 đỉnh E0 F1 G2 H3 + W4 X5. WX dài = chân peak (E.x→F.x), giữa z. Cập nhật LUÔN WX + nhãn.
  setCapBlock(verts: LabeledPoint[], capHeight: number): void {
    if (this.isDisposed || !this.capGeo || !this.capMesh || verts.length < 8) return
    const [, , , , E, F, G, H] = verts
    const y = E.y + capHeight // cao cạnh đỉnh WX = mức nóc + capHeight
    const midZ = (E.z + G.z) / 2 // tâm chiều rộng nóc → WX nằm giữa
    const a = this.capGeo.getAttribute('position') as THREE.BufferAttribute
    a.setXYZ(0, E.x, E.y, E.z) // E (nóc trước-trái)
    a.setXYZ(1, F.x, F.y, F.z) // F (nóc trước-phải)
    a.setXYZ(2, G.x, G.y, G.z) // G (nóc sau-trái)
    a.setXYZ(3, H.x, H.y, H.z) // H (nóc sau-phải)
    a.setXYZ(4, E.x, y, midZ) // W
    a.setXYZ(5, F.x, y, midZ) // X
    a.needsUpdate = true
    this.capGeo.computeVertexNormals()
    this.capMesh.visible = true
    this._placeCutEdge(E.x, F.x, y, midZ) // cạnh đỉnh WX = ridge của peak (dài theo nóc)
  }

  // Ghi cạnh đỉnh WX vào buffer + đặt nhãn W/X (cao y, x từ x0→x1, tại z).
  private _placeCutEdge(x0: number, x1: number, y: number, z: number): void {
    if (!this.cutGeo) return
    const attr = this.cutGeo.getAttribute('position') as THREE.BufferAttribute
    attr.setXYZ(0, x0, y, z)
    attr.setXYZ(1, x1, y, z)
    attr.needsUpdate = true
    this.cutDash?.computeLineDistances()
    this.cutLabels[0].position.set(x0, y + 0.25, z)
    this.cutLabels[1].position.set(x1, y + 0.25, z)
  }

  // Đặt trung điểm xà I (hi=0..3) tại điểm `ctr` (trên hip cong). show=false → ẩn marker + nhãn.
  private _placeHipMidAt(hi: number, ctr: THREE.Vector3, show: boolean): void {
    this.hipMids[hi].position.copy(ctr)
    this.hipMids[hi].visible = show
    this.hipMidLabels[hi].position.set(ctr.x, ctr.y + 0.22, ctr.z)
    this.hipMidLabels[hi].visible = show
  }

  // Hướng TRONG MẶT từ điểm `from` về tâm mặt `target`, bỏ thành phần dọc `t` → ⊥ hip, nằm trong mặt. Chuẩn hóa.
  private _perpDir(target: THREE.Vector3, from: THREE.Vector3, t: THREE.Vector3): THREE.Vector3 {
    const v = new THREE.Vector3().subVectors(target, from)
    v.addScaledVector(t, -v.dot(t))
    return v.normalize()
  }

  // Tâm 1 mặt (4 góc) có TÍNH cao góc nhấc cho 4 đỉnh đáy (0-3); nóc (4-7) giữ nguyên.
  private _faceCentroid(v: LabeledPoint[], h: number[], face: number[]): THREE.Vector3 {
    const c = new THREE.Vector3()
    for (const i of face) c.add(new THREE.Vector3(v[i].x, v[i].y + (i < 4 ? h[i] : 0), v[i].z))
    return c.multiplyScalar(1 / face.length)
  }

  // 1 ĐỐT xà sống STRADDLE: 2 cạnh đáy (P0/P1 + s1·a, P0/P1 + s2·a) nằm trên 2 mặt (s1,s2 = hướng trong-mặt ⊥ hip);
  // vươn LÊN TRÊN đoạn `side` (hv = (s2−s1)×t, lật để +Y → thân xà NẰM TRÊN sống). 8 đỉnh: 0-3 đáy · 4-7 = đáy + hv.
  private _straddleSeg(
    attr: THREE.BufferAttribute,
    boxIdx: number,
    seg: [THREE.Vector3, THREE.Vector3],
    cen: [THREE.Vector3, THREE.Vector3],
    side: number
  ): void {
    const [P0, P1] = seg
    const [c1, c2] = cen
    const t = new THREE.Vector3().subVectors(P1, P0).normalize()
    const m = new THREE.Vector3().addVectors(P0, P1).multiplyScalar(0.5)
    const s1 = this._perpDir(c1, m, t)
    const s2 = this._perpDir(c2, m, t)
    const bdir = new THREE.Vector3().subVectors(s2, s1)
    const a = side / (bdir.length() || 1) // rộng tiết diện = a·|s2−s1| = side (vuông)
    const hv = new THREE.Vector3().crossVectors(bdir, t).normalize()
    if (hv.y < 0) hv.negate() // vươn LÊN (thân xà nằm TRÊN sống, không chìm xuống dưới)
    hv.multiplyScalar(side)
    const lows = [
      new THREE.Vector3().copy(P0).addScaledVector(s1, a),
      new THREE.Vector3().copy(P0).addScaledVector(s2, a),
      new THREE.Vector3().copy(P1).addScaledVector(s2, a),
      new THREE.Vector3().copy(P1).addScaledVector(s1, a),
    ]
    let i = boxIdx * 8
    for (const lp of lows) attr.setXYZ(i++, lp.x, lp.y, lp.z)
    for (const lp of lows) attr.setXYZ(i++, lp.x + hv.x, lp.y + hv.y, lp.z + hv.z)
  }

  // 4 XÀ SỐNG dọc hip EA/FB/HC/GD — CHỈ NỬA DƯỚI (góc nhấc tip → ĐIỂM I), chuỗi `n` đốt STRADDLE: 2 cạnh
  // đáy LUÔN trên 2 mặt tạo hip, thân vươn LÊN (nằm trên sống). I1–I4 = điểm TRƯỢT trên hip (t=`midT`, ngay trên hip cong).
  // Đốt neo ở I kéo xuống tip theo `lenFrac` (lenFrac=1 → I→tip đầy). Bézier tip → nóc, control theo `curve`.
  setHipBeams(
    verts: LabeledPoint[],
    heights: number[],
    area: number,
    lenFrac: number,
    seg: number,
    curve: number,
    midT = 0.5, // VỊ TRÍ I dọc hip (t∈[0,1]: 0 = góc nhấc/tip · 1 = nóc). Slider "Vị trí I".
    midY = 0 // ĐÈ HIP: dịch Y của I (nâng/hạ sống). Slider "Đè hip Y". Tent đỉnh tại I → marker lên đúng đoạn này.
  ): void {
    if (this.isDisposed || !this.hipGeo || verts.length < 8) return
    const side = Math.sqrt(Math.max(0, area))
    const n = Math.max(1, Math.min(MAX_CORNER_SEG, Math.round(seg)))
    const show = side > 0 && lenFrac > 0
    const attr = this.hipGeo.getAttribute('position') as THREE.BufferAttribute
    const tStart = midT * (1 - lenFrac) // neo ở I (t=midT) kéo xuống tip (t=0) theo lenFrac
    let box = 0
    for (let c = 0; c < 4; c++) {
      const co = verts[c]
      const noc = verts[NOC_OF_BASE[c]]
      const tip = new THREE.Vector3(co.x, co.y + heights[c], co.z) // góc nhấc (vd D')
      const nocV = new THREE.Vector3(noc.x, noc.y, noc.z)
      const ctrl = new THREE.Vector3()
        .addVectors(tip, nocV)
        .multiplyScalar(0.5)
        .lerp(new THREE.Vector3(co.x, co.y, co.z), curve)
      const c1 = this._faceCentroid(verts, heights, HIP_FACES[c][0])
      const c2 = this._faceCentroid(verts, heights, HIP_FACES[c][1])
      let prev = this._bezierAt(tip, ctrl, nocV, tStart)
      for (let s = 1; s <= n; s++) {
        const p = this._bezierAt(tip, ctrl, nocV, tStart + (midT - tStart) * (s / n))
        if (show) this._straddleSeg(attr, box, [prev, p], [c1, c2], side)
        box++
        prev = p
      }
      const iPt = this._bezierAt(tip, ctrl, nocV, midT) // I trên hip (t=midT)
      iPt.y += midY // ĐÈ Y: nâng/hạ I (tent đỉnh=1 tại midT) → khớp mặt hip đã đè
      this._placeHipMidAt(c, iPt, show)
    }
    attr.needsUpdate = true
    this.hipGeo.setDrawRange(0, Number(show) * box * BOX_TRI.length) // show=false → 0 (né ternary, giảm complexity)
    this.hipGeo.computeVertexNormals()
  }

  // J1..J4 = TRUNG ĐIỂM TRÊN ĐƯỜNG CONG xà góc A'K/B'L/C'N/D'M (CÙNG Bézier với setCornerBeams: K điểm khung →
  // A' góc nhấc, control kéo về góc đáy theo `curve`) — bám theo cong giống I bám hip (t=0.5).
  setJMids(verts: LabeledPoint[], heights: number[], curve: number, tipCurl: number): void {
    if (this.isDisposed || verts.length < 8) return
    const cx = this._baseCenterX(verts)
    const cz = this._baseCenterZ(verts)
    for (let c = 0; c < 4; c++) {
      const base = verts[c]
      const noc = verts[NOC_OF_BASE[c]]
      const P0 = new THREE.Vector3(noc.x, 0, noc.z) // K điểm khung
      const P2 = this._curledTip(base, heights[c], cx, cz, tipCurl) // A' ĐÃ CUỘN (khớp tip rafter)
      const ground = new THREE.Vector3(base.x, base.y, base.z) // A góc đáy
      const ctrl = new THREE.Vector3().addVectors(P0, P2).multiplyScalar(0.5).lerp(ground, curve)
      const j = this._bezierAt(P0, ctrl, P2, 0.5) // trung điểm TRÊN đường cong xà góc
      this.jMids[c].position.copy(j)
      this.jMidLabels[c].position.set(j.x, j.y + 0.22, j.z)
    }
  }

  // X1 trên cung hiên OA' (mép trước gần A), Y1 trên cung hiên VA' (mép trái gần A) — TRƯỢT THEO I: cùng tỉ lệ
  // khoảng-cách-từ-A' như I trên hip (midT). Cung Bézier inner(O/V,y=0)→A'(tip): A' ở t=1 → fraction midT từ A' = t=1−midT.
  setArcMids(verts: LabeledPoint[], heights: number[], curve: number, midT = 0.5): void {
    if (this.isDisposed || verts.length < 8) return
    const a = new THREE.Vector3(verts[0].x, verts[0].y, verts[0].z) // góc đáy A
    const tip = new THREE.Vector3(verts[0].x, verts[0].y + heights[0], verts[0].z) // A'
    const ptO = new THREE.Vector3(verts[4].x, 0, verts[0].z) // O = (E.x, A.z) mép trước
    const ptV = new THREE.Vector3(verts[0].x, 0, verts[4].z) // V = (A.x, E.z) mép trái
    const arcAt = (inner: THREE.Vector3): THREE.Vector3 => {
      const ctrl = new THREE.Vector3().addVectors(inner, tip).multiplyScalar(0.5).lerp(a, curve)
      return this._bezierAt(inner, ctrl, tip, 1 - midT) // bám I: cùng fraction từ A'
    }
    const pts = [arcAt(ptO), arcAt(ptV)]
    for (let i = 0; i < 2; i++) {
      this.arcMids[i].position.copy(pts[i])
      this.arcMidLabels[i].position.set(pts[i].x, pts[i].y + 0.22, pts[i].z)
    }
  }

  // Khớp buffer render với kích thước HIỂN THỊ canvas (rộng×cao theo CSS) + aspect. Bỏ qua khi ẩn (client = 0).
  private _syncSize(): void {
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    if (cw < 1 || ch < 1) return
    const w = Math.max(40, Math.round(cw))
    const h = Math.max(40, Math.round(ch))
    if (w === this.lastW && h === this.lastH) return
    this.lastW = w
    this.lastH = h
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false) // updateStyle=false → CSS lo hiển thị
  }

  // Thay khối mái = geo mới (slider đổi thông số → dựng lại geometry → gọi đây). Dispose geo cũ.
  setGeometry(geo: THREE.BufferGeometry): void {
    if (this.isDisposed) {
      geo.dispose()
      return
    }
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
    }
    // 2 material theo group: 0 = mặt ngoài (nâu mái) · 1 = lớp độ dày (vàng nhạt)
    this.mesh = new THREE.Mesh(geo, this.underMat ? [this.mat, this.underMat] : this.mat)
    this.scene.add(this.mesh)
  }

  private _disposeApex(): void {
    // nhãn sprite: A'B'C'D' · KLMN · O–V · WX · I1–I4 · J1–J4
    for (const arr of [
      this.apexLabels,
      this.projLabels,
      this.extLabels,
      this.cutLabels,
      this.hipMidLabels,
      this.jMidLabels,
      this.arcMidLabels,
    ])
      for (const sp of arr) this._disposeSprite(sp)
    // geo/mat dùng chung: sphere A'B'C'D' + nêm GEFHWX + 4 hộp xà + sphere I + sphere J
    for (const d of [
      this.apexGeo,
      this.apexMat,
      this.capGeo,
      this.capMat,
      this.hipGeo,
      this.hipMat,
      this.hipMidGeo,
      this.hipMidMat,
      this.jMidGeo,
      this.jMidMat,
      this.arcMidGeo,
      this.arcMidMat,
      this.frameGeo,
      this.frameMat,
      this.beamGeo,
      this.beamMat,
    ])
      d?.dispose()
    for (const g of this.lineGeos) g.dispose() // geo pháp tuyến + KLMN (chung solid/dashed)
    for (const m of this.lineMats) m.dispose()
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.renderer.debug.onShaderError = null
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.setAnimationLoop(null)
    for (const c of this.labelGroup.children) {
      if (c instanceof THREE.Sprite) this._disposeSprite(c)
    }
    for (const d of this.decor) {
      if (d instanceof THREE.Sprite) this._disposeSprite(d)
      else if (d instanceof THREE.LineSegments) {
        // AxesHelper + GridHelper đều là LineSegments
        d.geometry.dispose()
        this._disposeMat(d.material)
      }
    }
    if (this.bladeMesh) {
      this.bladeMesh.geometry.dispose()
      this._disposeMat(this.bladeMesh.material)
    }
    this._disposeApex()
    if (this.mesh) this.mesh.geometry.dispose()
    this.mat.dispose()
    this.underMat?.dispose()
    this.renderer.dispose()
    this.panel.remove()
  }
}
