/**
 * VỊ TRÍ   — archplan/src/archplan/gui/ground-lab.ts
 * VAI TRÒ  — Thí nghiệm 🟫 NỀN trong 🧪 Lab: demo 3 kỹ thuật CHỐNG LẶP texture ground (NgQuan nêu bệnh 2026-06-10:
 *            texture tile lặp đều đặn, thiếu ngẫu nhiên). Shader trên plane 12×12 m, texture ground THẬT của app:
 *            ① TEXTURE BOMBING (iq stochastic tiling): mỗi Ô hash → xoay 90°×k + offset ngẫu nhiên, blend mép
 *            ② MACRO NOISE: noise tần số THẤP điều biến sáng/màu — phá cảm giác grid
 *            ③ BLEND 2 LỚP (cỏ ↔ sỏi) theo mask fbm — biến thiên lớn
 * LIÊN HỆ  — lab-experiments.ts (chip 🟫 Nền). sliderRow của tweak.ts. Texture: assets/textures grass_o +
 *            construction_grave (production/basecolor.jpg — PROTOCOL). Catalog: Factory/deferred/houdini-algorithms.md
 *            mục 8 (anti-tiling). Tham khảo: iquilezles.org/articles/texturerepetition.
 *
 * CÁCH DÙNG: tick tắt "Bombing"/"Macro"/"2 lớp" để SO SÁNH bệnh lặp ↔ đã trị. Mặc định: bật hết (đã trị).
 * DISPOSE: dispose() — loop null + RO + controls + plane geo/mat + 2 texture + panel.
 */

import bgravelUrl from 'assets/textures/ground/beach_gravel/production/basecolor.jpg?url'
import cobbleUrl from 'assets/textures/ground/cobblestone/production/basecolor.jpg?url'
import gravelUrl from 'assets/textures/ground/construction_grave/production/basecolor.jpg?url'
import grassUrl from 'assets/textures/ground/grass_o/production/basecolor.jpg?url'
import sandUrl from 'assets/textures/ground/rippled_sand/production/basecolor.jpg?url'
import romanUrl from 'assets/textures/ground/roman_stone_floor/production/basecolor.jpg?url'
import asphaltUrl from 'assets/textures/ground/rough_asphalt/production/basecolor.jpg?url'
import uncutUrl from 'assets/textures/ground/uncut-grass/production/basecolor.jpg?url'
import pavementUrl from 'assets/textures/ground/worn_pavement/production/basecolor.jpg?url'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { sliderRow } from './tweak'

// Danh mục texture NỀN cho bảng trộn — đều có production/basecolor.jpg trong kho (verify 2026-06-10).
const TEX_OPTIONS: { key: string; label: string; url: string }[] = [
  { key: 'grass_o', label: 'Cỏ (grass_o)', url: grassUrl },
  { key: 'uncut-grass', label: 'Cỏ rậm (uncut)', url: uncutUrl },
  { key: 'construction_grave', label: 'Sỏi công trường', url: gravelUrl },
  { key: 'beach_gravel', label: 'Sỏi biển', url: bgravelUrl },
  { key: 'rippled_sand', label: 'Cát gợn', url: sandUrl },
  { key: 'cobblestone', label: 'Đá lát cobble', url: cobbleUrl },
  { key: 'roman_stone_floor', label: 'Sàn đá roman', url: romanUrl },
  { key: 'worn_pavement', label: 'Vỉa hè mòn', url: pavementUrl },
  { key: 'rough_asphalt', label: 'Nhựa đường', url: asphaltUrl },
]
const MAX_MIX = 4 // số SLOT lớp động trong shader (uTexL0..3) — thêm slot = sửa cả FRAG

// 1 lớp trong bảng trộn: texture + ngưỡng mask (cao = ít xuất hiện).
interface MixLayer {
  key: string
  bias: number
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// ① bombing: patternAt = bản sao texture XOAY 90°×k + OFFSET theo hash Ô; noTile = trộn 4 ô lân cận (mép smoothstep
// rộng uMargin → không seam). ② macro: fbm tần thấp nhân vào màu. ③ blend 2 tex theo mask fbm (ngưỡng + mềm biên).
const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexBase;
uniform sampler2D uTexL0;
uniform sampler2D uTexL1;
uniform sampler2D uTexL2;
uniform sampler2D uTexL3;
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

vec4 patternAt(sampler2D t, vec2 id, vec2 p) {
  vec2 sid = id + uSeed * 0.1231; // Seed dịch không gian hash → bố cục ngẫu nhiên KHÁC (deterministic)
  float h = hash21(sid);
  float ang = mix(floor(h * 3.999) * 1.5707963 * uRotOn, h * 6.2831853, uFreeRot); // 90°×k ↔ góc TỰ DO
  float cs = cos(ang); float sn = sin(ang);
  float sc = 1.0 + (hash21(sid + 5.7) - 0.5) * 2.0 * uScaleJit; // jitter SCALE per ô (1 ± jit)
  vec2 q = mat2(cs, -sn, sn, cs) * p * sc + hash22(sid) * 7.31; // xoay + scale + offset — texture wrap repeat
  return texture2D(t, q);
}
vec4 noTile(sampler2D t, vec2 p) {
  vec2 s = p - 0.5;
  vec2 id = floor(s); vec2 f = fract(s);
  vec2 w = smoothstep(0.5 - uMargin, 0.5 + uMargin, f); // mép trộn giữa 4 ô lân cận
  vec4 c00 = patternAt(t, id, p);               vec4 c10 = patternAt(t, id + vec2(1, 0), p);
  vec4 c01 = patternAt(t, id + vec2(0, 1), p);  vec4 c11 = patternAt(t, id + vec2(1, 1), p);
  return mix(mix(c00, c10, w.x), mix(c01, c11, w.x), w.y);
}
vec4 ground(sampler2D t, vec2 p) { return mix(texture2D(t, p), noTile(t, p), uBomb); }

// 1 LỚP trộn: đè texture lên màu hiện tại theo mask fbm (seed RIÊNG mỗi slot → loang khác chỗ). on=0 → giữ nguyên.
vec4 layerMix(vec4 col, sampler2D t, vec2 p, float on, float bias, float seed) {
  float msk = smoothstep(bias - uMaskSoft, bias + uMaskSoft, fbm(vUv * uMaskScale * 4.0 + seed));
  return mix(col, ground(t, p), msk * on);
}

void main() {
  vec2 p = vUv * uRepeat; // tọa độ theo Ô tile
  vec4 col = ground(uTexBase, p); // NỀN CHÍNH (bảng trộn: select đổi được)
  col = layerMix(col, uTexL0, p, uOn[0], uBias[0], 13.7); // 4 SLOT lớp động (＋ thêm / ✕ xóa)
  col = layerMix(col, uTexL1, p, uOn[1], uBias[1], 31.7);
  col = layerMix(col, uTexL2, p, uOn[2], uBias[2], 47.3);
  col = layerMix(col, uTexL3, p, uOn[3], uBias[3], 71.1);
  float m = fbm(vUv * uMacroScale * 6.0);
  col.rgb *= 1.0 + uMacro * (m - 0.5) * 1.4; // ② macro sáng/tối tần thấp
  float tm = smoothstep(0.35, 0.75, fbm(vUv * uMacroScale * 3.0 + 7.7));
  col.rgb = mix(col.rgb, col.rgb * vec3(1.18, 1.02, 0.55), uTint * tm); // ② loang ÚA: nhuộm ấm từng vạt
  gl_FragColor = vec4(col.rgb, 1.0);
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
  private readonly texCache = new Map<string, THREE.Texture>() // key kho → texture (load 1 lần, dispose cuối)
  private readonly ro: ResizeObserver
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

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.ro = new ResizeObserver(() => this._syncSize())
    this.ro.observe(this.canvas)
    this.renderer.setAnimationLoop(() => {
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    })
  }

  // ShaderMaterial: nền chính + 4 SLOT lớp động (uOn/uBias array) + uniforms kỹ thuật ①②. Slot tắt vẫn cần
  // sampler hợp lệ → trỏ tạm grass_o. Trạng thái lớp thật do applyMix (bảng trộn UI) đẩy vào.
  private _makeMat(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTexBase: { value: this._tex('grass_o') },
        uTexL0: { value: this._tex('grass_o') },
        uTexL1: { value: this._tex('grass_o') },
        uTexL2: { value: this._tex('grass_o') },
        uTexL3: { value: this._tex('grass_o') },
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
      },
    })
  }

  // Texture theo KEY kho (TEX_OPTIONS) — load 1 lần vào cache. jpg PROTOCOL production/, wrap repeat
  // (bombing offset cần wrap) + anisotropy cho góc nhìn xéo.
  private _tex(key: string): THREE.Texture {
    const hit = this.texCache.get(key)
    if (hit) return hit
    const url = TEX_OPTIONS.find((o) => o.key === key)?.url ?? TEX_OPTIONS[0].url
    const t = new THREE.TextureLoader().load(url)
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.texCache.set(key, t)
    return t
  }

  set(name: string, v: number): void {
    if (!this.isDisposed) this.mat.uniforms[name].value = v
  }

  // Đẩy BẢNG TRỘN vào shader: nền chính + tối đa MAX_MIX lớp (slot thừa → uOn=0, sampler trỏ nền cho hợp lệ).
  applyMix(base: string, layers: MixLayer[]): void {
    if (this.isDisposed) return
    const u = this.mat.uniforms
    u.uTexBase.value = this._tex(base)
    const on = u.uOn.value as number[]
    const bias = u.uBias.value as number[]
    for (let i = 0; i < MAX_MIX; i++) {
      const L = layers[i]
      u[`uTexL${i}`].value = this._tex(L ? L.key : base)
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

// 1 LỚP trong bảng trộn (block viền trái): hàng [select hẹp | ✕ nhỏ] + slider Ngưỡng (cao = ít xuất hiện).
function mkLayerRow(layer: MixLayer, onApply: () => void, onRemove: () => void): HTMLElement {
  const box = document.createElement('div')
  box.className = 'ap-mix-layer'
  const head = document.createElement('div')
  head.className = 'ap-mix-row'
  const sel = mkTexSelect(layer.key, (k) => {
    layer.key = k
    onApply()
  })
  const del = document.createElement('button')
  del.className = 'ap-mix-x'
  del.textContent = '✕'
  del.title = 'Xóa lớp này'
  del.addEventListener('click', onRemove)
  head.append(sel, del)
  box.append(
    head,
    sliderRow('Ngưỡng', 0, 1, 0.05, layer.bias, (v) => {
      layer.bias = v
      onApply()
    })
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

// ③ BẢNG TRỘN LỚP: nền chính (select đổi được, mặc định grass) + lớp động ＋/✕ (tối đa MAX_MIX slot shader),
// mỗi lớp chọn texture kho riêng + Ngưỡng riêng; Mềm biên + Scale mask dùng CHUNG mọi lớp.
function buildMixerBoard(p: GroundPreview): HTMLElement {
  const state: { base: string; layers: MixLayer[] } = {
    base: 'grass_o', // nền chính mặc định = cỏ (NgQuan chốt) — đổi qua select
    layers: [
      { key: 'construction_grave', bias: 0.5 },
      { key: 'rippled_sand', bias: 0.62 },
    ],
  }
  const apply = (): void => p.applyMix(state.base, state.layers)
  const box = document.createElement('div')
  const list = document.createElement('div')
  const addBtn = document.createElement('button')
  addBtn.className = 'ap-roof-presetbtn ap-mix-add'
  addBtn.textContent = '＋ Thêm lớp'
  const render = (): void => {
    list.replaceChildren(
      ...state.layers.map((l, i) =>
        mkLayerRow(l, apply, () => {
          state.layers.splice(i, 1)
          render()
          apply()
        })
      )
    )
    addBtn.disabled = state.layers.length >= MAX_MIX
  }
  addBtn.addEventListener('click', () => {
    state.layers.push({ key: 'construction_grave', bias: 0.55 })
    render()
    apply()
  })
  box.append(
    mkTitle('③ Bảng trộn lớp'),
    mkBaseRow(state, apply),
    list,
    addBtn,
    sliderRow('Mềm biên', 0.01, 0.5, 0.01, 0.18, (v) => p.set('uMaskSoft', v)),
    sliderRow('Scale mask', 0.5, 6, 0.1, 2.0, (v) => p.set('uMaskScale', v))
  )
  render()
  apply()
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
    buildMixerBoard(preview)
  )
  paramHost?.replaceChildren(col)

  const docHead = docHost?.previousElementSibling
  if (docHead) docHead.textContent = '📖 Kỹ thuật'
  const note = document.createElement('div')
  note.className = 'ap-roof-legend'
  note.textContent =
    '① Bombing (iq): mỗi ô hash → xoay (90°×k hoặc tự do) + offset + jitter scale, trộn mép 4 ô → phá chu kỳ lặp, vẫn 1 texture; Seed = đổi bố cục. ' +
    '② Macro noise tần thấp: Cường độ = sáng/tối loang · Loang úa = nhuộm ấm từng vạt (đổi MÀU). ' +
    '③ Bảng trộn lớp: nền chính (select đổi được) + ＋ thêm tối đa 4 lớp, mỗi lớp chọn texture kho + Ngưỡng riêng (mask fbm seed riêng/slot). ' +
    '9 texture thật từ assets/textures (PROTOCOL).'
  docHost?.replaceChildren(note)

  if (settingsHost) {
    const t = document.createElement('div')
    t.className = 'ap-lab-settings-title'
    t.textContent = '⚙ (Nền chưa có cài đặt riêng)'
    settingsHost.replaceChildren(t)
  }

  return { dispose: (): void => preview.dispose() }
}
