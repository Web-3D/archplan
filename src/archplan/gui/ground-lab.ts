/**
 * VỊ TRÍ   — archplan/src/archplan/gui/ground-lab.ts
 * VAI TRÒ  — Thí nghiệm 🟫 NỀN trong 🧪 Lab — bản TỔNG KẾT (NgQuan 2026-06-10 "làm hết luôn"), đủ 6 trụ
 *            so với nền AAA (UE Landscape/Unity Terrain/Quixel):
 *            ① TEXTURE BOMBING (iq stochastic tiling): mỗi Ô hash → xoay + offset + jitter scale, blend mép
 *            ② MACRO NOISE: fbm tần thấp sáng/tối + loang úa — phá cảm giác grid
 *            ③ BẢNG TRỘN LỚP: nền + 4 slot, mask fbm/slot + NGƯỠNG; có HEIGHT-LERP (biên đi theo độ sáng
 *               albedo = proxy cao độ — sỏi LẤN THEO VIÊN thay vì fade đều; height map thật = deferred)
 *            ④ PAINTED MASK (ground-paint.ts): 🖌 vẽ tay mask per-slot — chủ đích như splat-paint UE
 *            ⑤ ÁNH SÁNG + NORMAL: blend cả normal map (xoay theo ô bombing), đèn nắng az/el chỉnh được —
 *               nền ăn đèn (chuẩn bị ngày/đêm khi port site.ts); tắt được để so unlit cũ
 *            ⑥ TRỘN XA (dual-scale): xa pha bản scale khác theo khoảng cách camera — diệt lặp ở xa
 * LIÊN HỆ  — lab-experiments.ts (chip 🟫 Nền) · ground-paint.ts (PaintMask) · sliderRow tweak.ts.
 *            Texture: assets/textures/ground (PROTOCOL — basecolor + normal, 9 bộ verify 2026-06-10).
 *            Catalog: Factory/deferred/houdini-algorithms.md mục 8. Tham khảo: iquilezles.org/articles/
 *            texturerepetition · UE HeightLerp · hex-tiling (Mikkelsen) = nâng cấp deferred.
 *
 * CÁCH DÙNG: tắt/bật từng nhóm để so bệnh ↔ đã trị; 🖌 trên slot lớp = vẽ mask (orbit tạm khóa).
 * DISPOSE: dispose() — loop + RO + controls + geo/mat + texture cache + PaintMask + panel.
 */

import bgravelUrl from 'assets/textures/ground/beach_gravel/production/basecolor.jpg?url'
import bgravelN from 'assets/textures/ground/beach_gravel/production/normal.jpg?url'
import cobbleUrl from 'assets/textures/ground/cobblestone/production/basecolor.jpg?url'
import cobbleN from 'assets/textures/ground/cobblestone/production/normal.jpg?url'
import gravelUrl from 'assets/textures/ground/construction_grave/production/basecolor.jpg?url'
import gravelN from 'assets/textures/ground/construction_grave/production/normal.jpg?url'
import grassUrl from 'assets/textures/ground/grass_o/production/basecolor.jpg?url'
import grassN from 'assets/textures/ground/grass_o/production/normal.jpg?url'
import sandUrl from 'assets/textures/ground/rippled_sand/production/basecolor.jpg?url'
import sandN from 'assets/textures/ground/rippled_sand/production/normal.jpg?url'
import romanUrl from 'assets/textures/ground/roman_stone_floor/production/basecolor.jpg?url'
import romanN from 'assets/textures/ground/roman_stone_floor/production/normal.jpg?url'
import asphaltUrl from 'assets/textures/ground/rough_asphalt/production/basecolor.jpg?url'
import asphaltN from 'assets/textures/ground/rough_asphalt/production/normal.jpg?url'
import uncutUrl from 'assets/textures/ground/uncut-grass/production/basecolor.jpg?url'
import uncutN from 'assets/textures/ground/uncut-grass/production/normal.jpg?url'
import pavementUrl from 'assets/textures/ground/worn_pavement/production/basecolor.jpg?url'
import pavementN from 'assets/textures/ground/worn_pavement/production/normal.jpg?url'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { PaintMask } from './ground-paint'
import { sliderRow } from './tweak'

// Danh mục texture NỀN cho bảng trộn — đều có production/basecolor.jpg + normal.jpg (verify 2026-06-10).
const TEX_OPTIONS: { key: string; label: string; url: string; nrm: string }[] = [
  { key: 'grass_o', label: 'Cỏ (grass_o)', url: grassUrl, nrm: grassN },
  { key: 'uncut-grass', label: 'Cỏ rậm (uncut)', url: uncutUrl, nrm: uncutN },
  { key: 'construction_grave', label: 'Sỏi công trường', url: gravelUrl, nrm: gravelN },
  { key: 'beach_gravel', label: 'Sỏi biển', url: bgravelUrl, nrm: bgravelN },
  { key: 'rippled_sand', label: 'Cát gợn', url: sandUrl, nrm: sandN },
  { key: 'cobblestone', label: 'Đá lát cobble', url: cobbleUrl, nrm: cobbleN },
  { key: 'roman_stone_floor', label: 'Sàn đá roman', url: romanUrl, nrm: romanN },
  { key: 'worn_pavement', label: 'Vỉa hè mòn', url: pavementUrl, nrm: pavementN },
  { key: 'rough_asphalt', label: 'Nhựa đường', url: asphaltUrl, nrm: asphaltN },
]
const MAX_MIX = 4 // số SLOT lớp động trong shader (uTexL0..3) — thêm slot = sửa cả FRAG

// 1 lớp trong bảng trộn: texture + ngưỡng mask (cao = ít xuất hiện).
interface MixLayer {
  key: string
  bias: number
}

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// ① bombing: patAt = bản sao texture XOAY + OFFSET + jitter scale theo hash Ô — ALBEDO + NORMAL cùng phép
//   biến đổi (normal tangent-space xoay bằng Mᵀ của ma trận uv → ánh sáng đúng từng ô); noTile = trộn 4 ô.
// ③ layerMix: mask = fbm + CHÊNH ĐỘ SÁNG (height-lerp proxy: lum albedo ≈ cao độ — sỏi sáng LẤN THEO VIÊN)
//   rồi max với mask VẼ TAY (kênh slot trong uMaskPaint). ⑤ đèn nắng + hemi trên normal đã blend.
// ⑥ trộn xa: albedo pha bản scale uFarScale theo khoảng cách camera (normal giữ bản gần — xa không cần relief).
const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vWorld;
uniform sampler2D uTexBase;  uniform sampler2D uNrmBase;
uniform sampler2D uTexL0;    uniform sampler2D uNrmL0;
uniform sampler2D uTexL1;    uniform sampler2D uNrmL1;
uniform sampler2D uTexL2;    uniform sampler2D uNrmL2;
uniform sampler2D uTexL3;    uniform sampler2D uNrmL3;
uniform sampler2D uMaskPaint;
uniform float uOn[4];
uniform float uBias[4];
uniform float uRepeat;
uniform float uBomb;
uniform float uRotOn;
uniform float uFreeRot;
uniform float uSeed;
uniform float uScaleJit;
uniform float uMargin;
uniform float uMacro;
uniform float uMacroScale;
uniform float uTint;
uniform float uMaskScale;
uniform float uMaskSoft;
uniform float uHeightK;
uniform float uLightOn;
uniform vec3  uSunDir;
uniform float uSunI;
uniform float uAmb;
uniform float uNormalK;
uniform float uFarOn;
uniform float uFarRange;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash22(vec2 p) { float h = hash21(p); return vec2(h, hash21(p + h + 17.17)); }

float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);          float b = hash21(i + vec2(1, 0));
  float c = hash21(i + vec2(0, 1)); float d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) { // 3 octave ~0..0.9
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// 1 Ô bombing: q = M·p·sc + offset; albedo sample thẳng, normal.xy xoay bằng Mᵀ (đưa vector trong ảnh
// về không gian mặt — thiếu bước này đèn sẽ sai hướng ở ô xoay; scale đều bỏ qua, normalize ở cuối).
void patAt(sampler2D tA, sampler2D tN, vec2 id, vec2 p, out vec4 A, out vec3 N) {
  vec2 sid = id + uSeed * 0.1231; // Seed dịch không gian hash → bố cục KHÁC (deterministic)
  float h = hash21(sid);
  float ang = mix(floor(h * 3.999) * 1.5707963 * uRotOn, h * 6.2831853, uFreeRot); // 90°×k ↔ TỰ DO
  float cs = cos(ang); float sn = sin(ang);
  float sc = 1.0 + (hash21(sid + 5.7) - 0.5) * 2.0 * uScaleJit;
  mat2 M = mat2(cs, -sn, sn, cs);
  vec2 q = M * p * sc + hash22(sid) * 7.31;
  A = texture2D(tA, q);
  vec3 n = texture2D(tN, q).xyz * 2.0 - 1.0;
  N = vec3(n.x * cs + n.y * sn, -n.x * sn + n.y * cs, n.z); // Mᵀ·n.xy
}
// Trộn 4 ô lân cận (mép smoothstep rộng uMargin) — cả albedo lẫn normal cùng trọng số.
void noTile(sampler2D tA, sampler2D tN, vec2 p, out vec4 A, out vec3 N) {
  vec2 s = p - 0.5;
  vec2 id = floor(s); vec2 f = fract(s);
  vec2 w = smoothstep(0.5 - uMargin, 0.5 + uMargin, f);
  vec4 a0; vec3 n0; patAt(tA, tN, id,               p, a0, n0);
  vec4 a1; vec3 n1; patAt(tA, tN, id + vec2(1, 0), p, a1, n1);
  vec4 a2; vec3 n2; patAt(tA, tN, id + vec2(0, 1), p, a2, n2);
  vec4 a3; vec3 n3; patAt(tA, tN, id + vec2(1, 1), p, a3, n3);
  A = mix(mix(a0, a1, w.x), mix(a2, a3, w.x), w.y);
  N = mix(mix(n0, n1, w.x), mix(n2, n3, w.x), w.y);
}
// Bề mặt 1 texture tại p: pha thẳng↔bombing theo uBomb; ⑥ albedo pha thêm BẢN XA scale 0.23 theo
// khoảng cách camera (chu kỳ lệch pha → hết lặp ở xa; normal giữ bản gần — relief xa không thấy).
void ground(sampler2D tA, sampler2D tN, vec2 p, float far, out vec4 A, out vec3 N) {
  vec4 ab; vec3 nb; noTile(tA, tN, p, ab, nb);
  A = mix(texture2D(tA, p), ab, uBomb);
  vec3 nFlat = texture2D(tN, p).xyz * 2.0 - 1.0;
  N = mix(nFlat, nb, uBomb);
  if (far > 0.001) {
    vec4 af; vec3 nf; noTile(tA, tN, p * 0.23, af, nf);
    A = mix(A, af, far);
  }
}

// 1 LỚP trộn: raw fbm + CHÊNH lum(lớp − nền hiện tại)·uHeightK trước smoothstep (height-lerp proxy —
// biên bám cấu trúc vật liệu), max với mask VẼ pv (chủ đích thắng loang). Slot tắt → thoát sớm.
void layerMix(inout vec4 col, inout vec3 nrm, sampler2D tA, sampler2D tN, vec2 p,
              float on, float bias, float seed, float pv, float far) {
  if (on < 0.5) return;
  vec4 A; vec3 N;
  ground(tA, tN, p, far, A, N);
  float raw = fbm(vUv * uMaskScale * 4.0 + seed) + (lum(A.rgb) - lum(col.rgb)) * uHeightK;
  float m = max(smoothstep(bias - uMaskSoft, bias + uMaskSoft, raw), pv);
  col = mix(col, A, m);
  nrm = mix(nrm, N, m);
}

void main() {
  vec2 p = vUv * uRepeat;
  float far = uFarOn * smoothstep(uFarRange * 0.45, uFarRange, length(cameraPosition - vWorld));
  vec4 col; vec3 nrm;
  ground(uTexBase, uNrmBase, p, far, col, nrm); // NỀN CHÍNH
  vec4 P = texture2D(uMaskPaint, vUv); // ④ mask vẽ tay — kênh R/G/B/A = slot 0..3
  layerMix(col, nrm, uTexL0, uNrmL0, p, uOn[0], uBias[0], 13.7, P.r, far);
  layerMix(col, nrm, uTexL1, uNrmL1, p, uOn[1], uBias[1], 31.7, P.g, far);
  layerMix(col, nrm, uTexL2, uNrmL2, p, uOn[2], uBias[2], 47.3, P.b, far);
  layerMix(col, nrm, uTexL3, uNrmL3, p, uOn[3], uBias[3], 71.1, P.a, far);
  float m = fbm(vUv * uMacroScale * 6.0);
  col.rgb *= 1.0 + uMacro * (m - 0.5) * 1.4; // ② macro sáng/tối tần thấp
  float tm = smoothstep(0.35, 0.75, fbm(vUv * uMacroScale * 3.0 + 7.7));
  col.rgb = mix(col.rgb, col.rgb * vec3(1.18, 1.02, 0.55), uTint * tm); // ② loang ÚA từng vạt
  // ⑤ ánh sáng: tangent plane XZ (T=+X, B=−Z, N=+Y sau rotateX(−π/2)) → N_world = (n.x, n.z, −n.y)
  vec3 n = normalize(vec3(nrm.xy * uNormalK, max(nrm.z, 0.1)));
  vec3 Nw = normalize(vec3(n.x, n.z, -n.y));
  float dif = max(dot(Nw, normalize(uSunDir)), 0.0);
  vec3 lit = col.rgb * (uAmb * mix(0.75, 1.05, Nw.y) + uSunI * dif);
  gl_FragColor = vec4(mix(col.rgb, lit, uLightOn), 1.0);
}
`

const INIT = 220 // px — cạnh khởi tạo trước khi ResizeObserver đo canvas thật (khớp RoofPreview)

// Mini-scene WebGL: plane 12×12 nhìn xéo + orbit — đủ thấy lặp tile ở khoảng cách thật.
class GroundPreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly panel: HTMLElement
  private readonly geo: THREE.PlaneGeometry
  readonly mat: THREE.ShaderMaterial
  private readonly texCache = new Map<string, THREE.Texture>() // key kho (+tiền tố n:) → texture, dispose cuối
  private readonly ro: ResizeObserver
  private readonly paint = new PaintMask() // ④ mask vẽ tay 4 kênh (ground-paint.ts)
  private readonly ray = new THREE.Raycaster()
  private plane: THREE.Mesh | null = null
  private paintSlot: number | null = null // slot đang vẽ (🖌) — null = orbit bình thường
  private brushSize = 0.05 // bán kính cọ (× bề mặt)
  private brushErase = false
  private painting = false // đang giữ chuột vẽ
  private lastW = 0
  private lastH = 0
  private isDisposed = false

  constructor(container: Element | null) {
    this.panel = document.createElement('div')
    this.panel.className = 'ap-scan-panel ap-preview-panel'
    const ttl = document.createElement('div')
    ttl.className = 'ap-scan-title'
    ttl.textContent = '🔎 Preview nền — tắt/bật từng lớp để so sánh'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ap-preview-canvas'
    this.panel.append(ttl, this.canvas)
    container?.appendChild(this.panel)

    this.scene.background = new THREE.Color(0xe9edf1)
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100)
    this.camera.position.set(7, 6, 9)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setSize(INIT, INIT, false)

    this.mat = this._makeMat()
    this.geo = new THREE.PlaneGeometry(12, 12)
    const plane = new THREE.Mesh(this.geo, this.mat)
    plane.rotation.x = -Math.PI / 2 // nằm sàn XZ
    this.scene.add(plane)
    this.plane = plane

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this._bindPaint()
    this.ro = new ResizeObserver(() => this._syncSize())
    this.ro.observe(this.canvas)
    this.renderer.setAnimationLoop(() => {
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    })
  }

  // ④ Vẽ mask: khi 1 slot bật 🖌 (orbit khóa), kéo chuột = đóng dấu cọ vào kênh slot tại UV raycast.
  private _bindPaint(): void {
    const draw = (e: PointerEvent): void => {
      const uv = this._pickUV(e)
      if (uv)
        this.paint.stamp(uv.x, uv.y, this.brushSize, this.paintSlot as number, this.brushErase)
    }
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.paintSlot === null) return
      this.painting = true
      this.canvas.setPointerCapture(e.pointerId)
      draw(e)
    })
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.painting && this.paintSlot !== null) draw(e)
    })
    const stop = (): void => {
      this.painting = false
    }
    this.canvas.addEventListener('pointerup', stop)
    this.canvas.addEventListener('pointerleave', stop)
  }

  // UV điểm chuột chạm plane (null = trượt ra ngoài) — nguồn tọa độ cho dấu cọ.
  private _pickUV(e: PointerEvent): THREE.Vector2 | null {
    const r = this.canvas.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || !this.plane) return null
    const nd = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    )
    this.ray.setFromCamera(nd, this.camera)
    const hit = this.ray.intersectObject(this.plane)[0]
    return hit?.uv ? hit.uv.clone() : null
  }

  // Bật/tắt chế độ vẽ cho 1 slot: vẽ thì khóa orbit (chuột dành cho cọ), null = trả orbit.
  setPaintSlot(i: number | null): void {
    this.paintSlot = i
    this.controls.enabled = i === null
  }

  setBrush(size: number, erase: boolean): void {
    this.brushSize = size
    this.brushErase = erase
  }

  clearPaint(ch: number): void {
    this.paint.clear(ch)
  }

  // ⑤ Hướng nắng từ 2 slider (azimuth quanh trục Y + elevation trên chân trời, độ).
  setSun(azDeg: number, elDeg: number): void {
    if (this.isDisposed) return
    const az = (azDeg * Math.PI) / 180
    const el = (elDeg * Math.PI) / 180
    const u = this.mat.uniforms.uSunDir.value as THREE.Vector3
    u.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
  }

  // ShaderMaterial: nền chính + 4 SLOT lớp động (uOn/uBias array) + uniforms kỹ thuật ①②. Slot tắt vẫn cần
  // sampler hợp lệ → trỏ tạm grass_o. Trạng thái lớp thật do applyMix (bảng trộn UI) đẩy vào.
  private _makeMat(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTexBase: { value: this._tex('grass_o') },
        uNrmBase: { value: this._tex('grass_o', true) },
        uTexL0: { value: this._tex('grass_o') },
        uNrmL0: { value: this._tex('grass_o', true) },
        uTexL1: { value: this._tex('grass_o') },
        uNrmL1: { value: this._tex('grass_o', true) },
        uTexL2: { value: this._tex('grass_o') },
        uNrmL2: { value: this._tex('grass_o', true) },
        uTexL3: { value: this._tex('grass_o') },
        uNrmL3: { value: this._tex('grass_o', true) },
        uMaskPaint: { value: this.paint.texture },
        uOn: { value: [0, 0, 0, 0] },
        uBias: { value: [0.5, 0.5, 0.5, 0.5] },
        uRepeat: { value: 8 },
        uBomb: { value: 1 },
        uRotOn: { value: 1 },
        uFreeRot: { value: 0 },
        uSeed: { value: 0 },
        uScaleJit: { value: 0 },
        uMargin: { value: 0.12 },
        uMacro: { value: 0.35 },
        uMacroScale: { value: 1.2 },
        uTint: { value: 0.25 },
        uMaskScale: { value: 2.0 },
        uMaskSoft: { value: 0.18 },
        uHeightK: { value: 0.3 }, // ③ height-lerp proxy — 0 = fade đều như bản cũ
        uLightOn: { value: 1 }, // ⑤ tắt = unlit cũ (so sánh)
        uSunDir: { value: new THREE.Vector3(0.47, 0.82, 0.33) }, // ≈ az 35° · el 55° (setSun ghi đè)
        uSunI: { value: 0.9 },
        uAmb: { value: 0.55 },
        uNormalK: { value: 1 }, // nổi khối — scale n.xy
        uFarOn: { value: 0.6 }, // ⑥ trộn xa
        uFarRange: { value: 16 }, // khoảng cách đạt trộn đầy (m)
      },
    })
  }

  // Texture theo KEY kho (TEX_OPTIONS) — load 1 lần vào cache (albedo + bản normal khi nrm=true; normal
  // GIỮ colorSpace linear mặc định). jpg PROTOCOL production/, wrap repeat + anisotropy cho góc nhìn xéo.
  private _tex(key: string, nrm = false): THREE.Texture {
    const ck = (nrm ? 'n:' : '') + key
    const hit = this.texCache.get(ck)
    if (hit) return hit
    const o = TEX_OPTIONS.find((x) => x.key === key) ?? TEX_OPTIONS[0]
    const t = new THREE.TextureLoader().load(nrm ? o.nrm : o.url)
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.texCache.set(ck, t)
    return t
  }

  set(name: string, v: number): void {
    if (!this.isDisposed) this.mat.uniforms[name].value = v
  }

  // Đẩy BẢNG TRỘN vào shader: nền chính + tối đa MAX_MIX lớp, MỖI slot = CẶP albedo + normal cùng key
  // (slot thừa → uOn=0, sampler trỏ nền cho hợp lệ).
  applyMix(base: string, layers: MixLayer[]): void {
    if (this.isDisposed) return
    const u = this.mat.uniforms
    u.uTexBase.value = this._tex(base)
    u.uNrmBase.value = this._tex(base, true)
    const on = u.uOn.value as number[]
    const bias = u.uBias.value as number[]
    for (let i = 0; i < MAX_MIX; i++) {
      const L = layers[i]
      u[`uTexL${i}`].value = this._tex(L ? L.key : base)
      u[`uNrmL${i}`].value = this._tex(L ? L.key : base, true)
      on[i] = L ? 1 : 0
      bias[i] = L ? L.bias : 0.5
    }
  }

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
    this.renderer.setSize(w, h, false)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.setAnimationLoop(null)
    this.geo.dispose()
    this.mat.dispose()
    for (const t of this.texCache.values()) t.dispose()
    this.paint.dispose()
    this.renderer.dispose()
    this.panel.remove()
  }
}

// Hàng checkbox (bản local — chỗ dùng thứ 2 sau roof-lab; chạm 3 nơi thì tách về tweak.ts).
function checkRow(label: string, initial: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('label')
  row.className = 'ap-roof-check'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = initial
  cb.addEventListener('change', () => onChange(cb.checked))
  const span = document.createElement('span')
  span.textContent = label
  row.append(cb, span)
  return row
}

function mkTitle(text: string): HTMLElement {
  const t = document.createElement('div')
  t.className = 'ap-roof-col-title'
  t.textContent = text
  return t
}

// Nhóm ① bombing: bật/tắt + chế độ xoay (90° / tự do) + seed + jitter scale + số lặp + mép trộn.
function buildBombRows(p: GroundPreview): HTMLElement {
  const box = document.createElement('div')
  const t1 = document.createElement('div')
  t1.className = 'ap-roof-2col'
  t1.append(
    checkRow('Bombing', true, (v) => p.set('uBomb', v ? 1 : 0)),
    checkRow('Xoay 90°', true, (v) => p.set('uRotOn', v ? 1 : 0))
  )
  box.append(
    mkTitle('① Texture bombing (iq)'),
    t1,
    checkRow('Xoay tự do (góc bất kỳ — đè Xoay 90°)', false, (v) => p.set('uFreeRot', v ? 1 : 0)),
    sliderRow('Lặp (tiles)', 2, 24, 1, 8, (v) => p.set('uRepeat', v)),
    sliderRow('Mép trộn', 0.02, 0.49, 0.01, 0.12, (v) => p.set('uMargin', v)),
    sliderRow('Seed', 0, 100, 1, 0, (v) => p.set('uSeed', v)),
    sliderRow('Jitter scale', 0, 0.5, 0.01, 0, (v) => p.set('uScaleJit', v))
  )
  return box
}

// Nhóm ② macro noise: sáng/tối tần thấp + loang úa (nhuộm ấm từng vạt — đổi MÀU chứ không chỉ độ sáng).
function buildMacroRows(p: GroundPreview): HTMLElement {
  const box = document.createElement('div')
  box.append(
    mkTitle('② Macro noise'),
    sliderRow('Cường độ', 0, 1, 0.05, 0.35, (v) => p.set('uMacro', v)),
    sliderRow('Scale macro', 0.2, 4, 0.1, 1.2, (v) => p.set('uMacroScale', v)),
    sliderRow('Loang úa', 0, 1, 0.05, 0.25, (v) => p.set('uTint', v))
  )
  return box
}

// Select texture nền từ danh mục kho — bề ngang HẸP cố định (ap-mix-sel), không tràn cột.
function mkTexSelect(value: string, onChange: (key: string) => void): HTMLSelectElement {
  const sel = document.createElement('select')
  sel.className = 'ap-mix-sel'
  for (const o of TEX_OPTIONS) sel.appendChild(new Option(o.label, o.key))
  sel.value = value
  sel.addEventListener('change', () => onChange(sel.value))
  return sel
}

// 1 LỚP trong bảng trộn (block viền trái): hàng [select hẹp | 🖌 vẽ mask | ✕ nhỏ] + slider Ngưỡng.
// 🖌 bật = vẽ mask TAY cho slot này (orbit khóa, kéo chuột trên preview = cọ) — chủ đích kiểu splat-paint.
function mkLayerRow(
  layer: MixLayer,
  onApply: () => void,
  onRemove: () => void,
  brush: { on: boolean; toggle: () => void }
): HTMLElement {
  const box = document.createElement('div')
  box.className = 'ap-mix-layer'
  const head = document.createElement('div')
  head.className = 'ap-mix-row'
  const sel = mkTexSelect(layer.key, (k) => {
    layer.key = k
    onApply()
  })
  const pb = document.createElement('button')
  pb.className = 'ap-mix-x'
  pb.classList.toggle('ap-mix-brush-on', brush.on)
  pb.textContent = '🖌'
  pb.title = 'Vẽ mask tay cho lớp này (orbit tạm khóa)'
  pb.addEventListener('click', brush.toggle)
  const del = document.createElement('button')
  del.className = 'ap-mix-x'
  del.textContent = '✕'
  del.title = 'Xóa lớp này'
  del.addEventListener('click', onRemove)
  head.append(sel, pb, del)
  box.append(
    head,
    sliderRow('Ngưỡng', 0, 1, 0.05, layer.bias, (v) => {
      layer.bias = v
      onApply()
    })
  )
  return box
}

// Hàng CỌ VẼ (④): cỡ cọ + tẩy + xóa nét của slot đang vẽ — chỉ tác dụng khi có 🖌 bật.
function mkBrushRow(p: GroundPreview, state: { paintSlot: number | null }): HTMLElement {
  const box = document.createElement('div')
  let size = 0.05
  let erase = false
  const row = document.createElement('div')
  row.className = 'ap-mix-row'
  row.append(
    checkRow('Tẩy', false, (v) => {
      erase = v
      p.setBrush(size, erase)
    })
  )
  const clr = document.createElement('button')
  clr.className = 'ap-roof-presetbtn'
  clr.textContent = 'Xóa nét'
  clr.title = 'Xóa toàn bộ nét vẽ của slot đang bật 🖌'
  clr.addEventListener('click', () => {
    if (state.paintSlot !== null) p.clearPaint(state.paintSlot)
  })
  row.appendChild(clr)
  box.append(
    sliderRow('Cỡ cọ', 0.01, 0.15, 0.01, size, (v) => {
      size = v
      p.setBrush(size, erase)
    }),
    row
  )
  return box
}

// Hàng "Nền chính" của bảng trộn: nhãn + select hẹp (đổi nền base).
function mkBaseRow(state: { base: string }, apply: () => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ap-mix-row'
  const lbl = document.createElement('span')
  lbl.textContent = 'Nền chính'
  row.append(
    lbl,
    mkTexSelect(state.base, (k) => {
      state.base = k
      apply()
    })
  )
  return row
}

// Danh sách LỚP ĐỘNG (＋/✕/🖌) của bảng trộn — tách khỏi buildMixerBoard (gate 50 dòng).
// Xóa lớp đang vẽ → tắt chế độ vẽ (trả orbit).
function mkLayerList(
  p: GroundPreview,
  state: { layers: MixLayer[]; paintSlot: number | null },
  apply: () => void
): HTMLElement {
  const wrap = document.createElement('div')
  const list = document.createElement('div')
  const addBtn = document.createElement('button')
  addBtn.className = 'ap-roof-presetbtn ap-mix-add'
  addBtn.textContent = '＋ Thêm lớp'
  const setPaint = (i: number | null): void => {
    state.paintSlot = i
    p.setPaintSlot(i)
  }
  const render = (): void => {
    list.replaceChildren(
      ...state.layers.map((l, i) =>
        mkLayerRow(
          l,
          apply,
          () => {
            if (state.paintSlot === i) setPaint(null)
            state.layers.splice(i, 1)
            render()
            apply()
          },
          {
            on: state.paintSlot === i,
            toggle: () => {
              setPaint(state.paintSlot === i ? null : i)
              render()
            },
          }
        )
      )
    )
    addBtn.disabled = state.layers.length >= MAX_MIX
  }
  addBtn.addEventListener('click', () => {
    state.layers.push({ key: 'construction_grave', bias: 0.55 })
    render()
    apply()
  })
  wrap.append(list, addBtn)
  render()
  return wrap
}

// ③+④ BẢNG TRỘN LỚP: nền chính + lớp động (mkLayerList) + hàng cọ vẽ; Mềm biên/Scale mask/Theo cao độ CHUNG.
function buildMixerBoard(p: GroundPreview): HTMLElement {
  const state: { base: string; layers: MixLayer[]; paintSlot: number | null } = {
    base: 'grass_o', // nền chính mặc định = cỏ (NgQuan chốt) — đổi qua select
    layers: [
      { key: 'construction_grave', bias: 0.5 },
      { key: 'rippled_sand', bias: 0.62 },
    ],
    paintSlot: null,
  }
  const apply = (): void => p.applyMix(state.base, state.layers)
  const box = document.createElement('div')
  box.append(
    mkTitle('③ Bảng trộn lớp + ④ vẽ mask'),
    mkBaseRow(state, apply),
    mkLayerList(p, state, apply),
    mkBrushRow(p, state),
    sliderRow('Mềm biên', 0.01, 0.5, 0.01, 0.18, (v) => p.set('uMaskSoft', v)),
    sliderRow('Scale mask', 0.5, 6, 0.1, 2.0, (v) => p.set('uMaskScale', v)),
    // ③ height-lerp proxy: biên lớp bám CHÊNH ĐỘ SÁNG albedo (≈ cao độ vật liệu) — 0 = fade đều kiểu cũ
    sliderRow('Theo cao độ', 0, 0.8, 0.05, 0.3, (v) => p.set('uHeightK', v))
  )
  apply()
  return box
}

// ⑤ ÁNH SÁNG (normal map blend + nắng chỉnh hướng) + ⑥ TRỘN XA (dual-scale theo khoảng cách camera).
function buildLightRows(p: GroundPreview): HTMLElement {
  const sun = { az: 35, el: 55 }
  const box = document.createElement('div')
  box.append(
    mkTitle('⑤ Ánh sáng + ⑥ xa gần'),
    checkRow('Ánh sáng (tắt = unlit cũ)', true, (v) => p.set('uLightOn', v ? 1 : 0)),
    sliderRow('Hướng nắng (°)', 0, 360, 5, sun.az, (v) => {
      sun.az = v
      p.setSun(sun.az, sun.el)
    }),
    sliderRow('Cao nắng (°)', 10, 85, 1, sun.el, (v) => {
      sun.el = v
      p.setSun(sun.az, sun.el)
    }),
    sliderRow('Nổi khối', 0, 2, 0.05, 1, (v) => p.set('uNormalK', v)),
    sliderRow('Trộn xa', 0, 1, 0.05, 0.6, (v) => p.set('uFarOn', v)),
    sliderRow('Tầm xa (m)', 6, 30, 1, 16, (v) => p.set('uFarRange', v))
  )
  return box
}

// Gắn thí nghiệm NỀN vào Lab (cùng khung bench với Mái/Particles).
export function setupGroundLab(
  previewHost: Element | null,
  paramHost: Element | null,
  docHost: Element | null,
  settingsHost: Element | null
): { dispose: () => void } {
  const preview = new GroundPreview(previewHost)

  const col = document.createElement('div')
  col.className = 'ap-roof-col'
  col.append(
    mkTitle('🟫 Nền — chống lặp texture'),
    buildBombRows(preview),
    buildMacroRows(preview),
    buildMixerBoard(preview),
    buildLightRows(preview)
  )
  paramHost?.replaceChildren(col)

  const docHead = docHost?.previousElementSibling
  if (docHead) docHead.textContent = '📖 Kỹ thuật'
  const note = document.createElement('div')
  note.className = 'ap-roof-legend'
  note.textContent =
    '① Bombing (iq): mỗi ô hash → xoay (90°×k hoặc tự do) + offset + jitter scale, trộn mép 4 ô — phá chu kỳ lặp; Seed = đổi bố cục. ' +
    '② Macro noise tần thấp: sáng/tối loang + Loang úa nhuộm ấm từng vạt. ' +
    '③ Bảng trộn lớp: nền + tối đa 4 lớp, mask fbm seed riêng/slot + Ngưỡng; "Theo cao độ" = height-lerp (biên bám độ sáng albedo ≈ cao độ — sỏi lấn theo viên; height map thật = nâng cấp sau). ' +
    '④ 🖌 vẽ mask tay per-slot (splat-paint): kéo chuột trên preview, orbit tạm khóa, Tẩy/Xóa nét ở hàng cọ. ' +
    '⑤ Ánh sáng: normal map blend theo đúng phép xoay bombing + nắng az/el — tắt để so unlit. ' +
    '⑥ Trộn xa: pha bản scale 0.23 theo khoảng cách camera — diệt lặp ở xa (zoom out để thấy). ' +
    '9 bộ texture thật (basecolor + normal) từ assets/textures (PROTOCOL).'
  docHost?.replaceChildren(note)

  if (settingsHost) {
    const t = document.createElement('div')
    t.className = 'ap-lab-settings-title'
    t.textContent = '⚙ (Nền chưa có cài đặt riêng)'
    settingsHost.replaceChildren(t)
  }

  return { dispose: (): void => preview.dispose() }
}
