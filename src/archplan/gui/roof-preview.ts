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

export class RoofPreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly panel: HTMLElement
  private readonly mat: THREE.MeshStandardMaterial
  private mesh: THREE.Mesh | null = null
  private readonly labelGroup = new THREE.Group() // nhãn góc A–F — dựng lại mỗi setLabels
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
    })
    this.mat.onBeforeCompile = (s) => this._injectBlade(s) // tiêm SDF cắt vào shader mái

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
      sp.scale.set(0.42, 0.42, 1)
      this.labelGroup.add(sp)
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
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.scene.add(this.mesh)
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
    if (this.mesh) this.mesh.geometry.dispose()
    this.mat.dispose()
    this.renderer.dispose()
    this.panel.remove()
  }
}
