/**
 * VỊ TRÍ   — archplan/src/archplan/gui/roof-lab.ts
 * VAI TRÒ  — Thí nghiệm MÁI trong 🧪 Lab. Mái HIP 6 góc A–F + LƯỠI DAO cắt (shader SDF). 6 ĐỈNH = NGUỒN SỰ THẬT:
 *            slider mái = dựng lại đối xứng (GHI ĐÈ verts) · ô số tọa độ = tinh chỉnh TỪNG đỉnh. Editor SDF + mini-preview.
 * LIÊN HỆ  — setupRoofLab gọi từ ArchPlanLab._setupLabFloat. sliderRow của tweak.ts. RoofPreview (cắt mái) +
 *            SdfPreview (raymarch bề mặt dao, dùng chung SDF_LIB). bladeSDF = chỗ nâng lên SDF iq Shadertoy.
 *
 * TÊN GÓC: A B C D = đáy (đi vòng) · E F = 2 đầu NÓC. Cạnh = cặp chữ: sống hip AE BF CF DE · nóc EF · hiên AB BC CD DA.
 */

import * as THREE from 'three'

import { type LabeledPoint, RoofPreview } from './roof-preview'
import { SdfPreview } from './sdf-preview'
import { sliderRow } from './tweak'

// Thông số mái — sinh ra bộ đỉnh ĐỐI XỨNG (mái hip cắt nóc). Đơn vị: mét.
export interface RoofLabParams {
  width: number // bề ngang đáy (trục X)
  depth: number // bề sâu đáy (trục Z)
  height: number // chiều cao nóc so với đáy (rise, trục Y)
  ridge: number // chiều dài nóc (0 = chóp nhọn kim-tự-tháp · = width → mái dốc 2 mái/gable)
}

export const DEFAULT_ROOF: RoofLabParams = {
  width: 4,
  depth: 3,
  height: 1.6,
  ridge: 1.5,
}

// 🔪 Lưỡi dao = mặt cắt. transform (nghiêng X/Y/Z + vị trí) định vị; hình do bladeSDF (editor) quyết.
export interface BladeState {
  enabled: boolean
  tiltX: number // độ
  tiltY: number // độ
  tiltZ: number // độ
  offset: number // m — đẩy dọc pháp tuyến
}

export const DEFAULT_BLADE: BladeState = {
  enabled: false,
  tiltX: 0,
  tiltY: 0,
  tiltZ: 0,
  offset: 0,
}

// Thân bladeSDF mặc định = mặt phẳng local z=0 (khớp RoofPreview.sdfBody mặc định).
const DEFAULT_SDF = 'return p.z;'

interface SdfPreset {
  label: string
  code: string
}
// Preset SDF iq (p ở blade-local). Bấm = NẠP vào editor để sửa tiếp (hybrid). Dùng helper tiêm sẵn trong shader.
const SDF_PRESETS: SdfPreset[] = [
  { label: 'Mặt phẳng', code: 'return p.z;' },
  { label: 'Cầu', code: 'return sdSphere(p, 1.5);' },
  { label: 'Hộp', code: 'return sdBox(p, vec3(1.5));' },
  { label: 'Trụ', code: 'return length(p.xz) - 1.0;' },
  { label: 'Xuyến', code: 'return sdTorus(p, vec2(1.5, 0.5));' },
  { label: 'Cầu∪Hộp', code: 'return opSmoothUnion(sdSphere(p,1.2), sdBox(p,vec3(1.0)), 0.5);' },
]

const clampVal = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
const deg2rad = (d: number): number => (d * Math.PI) / 180

// Ma trận WORLD của mặt cắt: xoay theo tilt X/Y/Z + đẩy dọc pháp tuyến (local +Z) đoạn offset.
// RoofPreview lấy nghịch đảo → đưa world point về blade-local cho bladeSDF (SDF iq dựng ở gốc tọa độ).
function bladeMatrix(b: BladeState): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(deg2rad(b.tiltX), deg2rad(b.tiltY), deg2rad(b.tiltZ))
  )
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q) // pháp tuyến = +Z đã xoay
  const pos = n.multiplyScalar(b.offset) // đẩy dọc pháp tuyến
  return new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1))
}

// Hàng checkbox nhỏ (ô tick + nhãn). onChange(checked).
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

// 6 góc ĐỐI XỨNG từ thông số (base). A B C D = đáy (y=0, vòng A→B→C→D) · E F = 2 đầu nóc (y=H, trục X, z=0).
export function roofVertices(p: RoofLabParams): LabeledPoint[] {
  const hw = p.width / 2
  const hd = p.depth / 2
  const rl = clampVal(p.ridge, 0, p.width) / 2 // nửa chiều dài nóc, kẹp trong [0, width]
  const H = p.height
  return [
    { name: 'A', x: -hw, y: 0, z: -hd },
    { name: 'B', x: hw, y: 0, z: -hd },
    { name: 'C', x: hw, y: 0, z: hd },
    { name: 'D', x: -hw, y: 0, z: hd },
    { name: 'E', x: -rl, y: H, z: 0 },
    { name: 'F', x: rl, y: H, z: 0 },
  ]
}

// Geometry mái HIP từ 6 ĐỈNH (nguồn sự thật): 2 mặt thang (A-B-F-E / C-D-E-F) + 2 tam giác hồi (A-E-D / B-C-F).
export function buildRoofGeometry(v: LabeledPoint[]): THREE.BufferGeometry {
  const pos: number[] = []
  for (const q of v) pos.push(q.x, q.y, q.z)
  // prettier-ignore
  const idx = [
    0, 1, 5, 0, 5, 4, // mặt trước (-z): thang A-B-F-E
    2, 3, 4, 2, 4, 5, // mặt sau  (+z): thang C-D-E-F
    0, 4, 3,          // hồi trái  (-x): tam giác A-E-D
    1, 2, 5,          // hồi phải  (+x): tam giác B-C-F
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals() // DoubleSide nên hướng pháp tuyến không tới hạn
  return geo
}

// Bảng tọa độ EDIT ĐƯỢC (cột phải khung trên): mỗi đỉnh = tên + 3 ô số x/y/z (sửa → onEdit). sync() = nạp lại
// giá trị từ verts (gọi sau khi slider regenerate, KHÔNG dựng lại DOM → không mất focus khi đang gõ).
function buildCoordEditor(
  verts: LabeledPoint[],
  onEdit: () => void
): { el: HTMLElement; sync: () => void } {
  const el = document.createElement('div')
  const title = document.createElement('div')
  title.className = 'ap-roof-col-title'
  title.textContent = '📐 Tọa độ (m)'
  el.appendChild(title)
  const axes = ['x', 'y', 'z'] as const
  const inputs: HTMLInputElement[] = []
  for (const q of verts) {
    const row = document.createElement('div')
    row.className = 'ap-roof-coord'
    const nm = document.createElement('b')
    nm.textContent = q.name
    row.appendChild(nm)
    for (const ax of axes) {
      const inp = document.createElement('input')
      inp.type = 'number'
      inp.step = '0.1'
      inp.className = 'ap-coord-input'
      inp.value = q[ax].toFixed(2)
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value)
        if (!Number.isNaN(v)) {
          q[ax] = v
          onEdit()
        }
      })
      inputs.push(inp)
      row.appendChild(inp)
    }
    el.appendChild(row)
  }
  const legend = document.createElement('div')
  legend.className = 'ap-roof-legend'
  legend.textContent = 'Sống hip: AE BF CF DE · Nóc: EF · Hiên: AB BC CD DA'
  el.appendChild(legend)
  const sync = (): void => {
    let i = 0
    for (const q of verts) for (const ax of axes) inputs[i++].value = q[ax].toFixed(2)
  }
  return { el, sync }
}

// Bộ slider Cài đặt preview (popover ⚙): độ đậm lưới + độ sáng đèn nền + đèn chiếu. Default khớp RoofPreview.
function buildPreviewSettings(host: Element | null, preview: RoofPreview): void {
  if (!host) return
  const title = document.createElement('div')
  title.className = 'ap-lab-settings-title'
  title.textContent = '⚙ Cài đặt preview'
  host.replaceChildren(
    title,
    sliderRow('Lưới', 0, 1, 0.05, 0.6, (v) => preview.setGridOpacity(v)),
    sliderRow('Sáng nền', 0, 3, 0.1, 1.1, (v) => preview.setAmbient(v)),
    sliderRow('Đèn chiếu', 0, 4, 0.1, 2.0, (v) => preview.setKey(v))
  )
}

// Cột TRÁI khung trên: slider hình MÁI → REGEN (dựng lại đối xứng, ghi đè verts + ô số).
function buildRoofParamCol(params: RoofLabParams, regen: () => void): HTMLElement {
  const col = document.createElement('div')
  col.className = 'ap-roof-col'
  const title = document.createElement('div')
  title.className = 'ap-roof-col-title'
  title.textContent = '🏠 Mái'
  col.append(
    title,
    sliderRow('Ngang (m)', 1, 12, 0.1, params.width, (v) => {
      params.width = v
      regen()
    }),
    sliderRow('Sâu (m)', 1, 12, 0.1, params.depth, (v) => {
      params.depth = v
      regen()
    }),
    sliderRow('Cao (m)', 0.2, 6, 0.1, params.height, (v) => {
      params.height = v
      regen()
    }),
    sliderRow('Nóc (m)', 0, 12, 0.1, params.ridge, (v) => {
      params.ridge = v
      regen()
    })
  )
  return col
}

// Phần TRANSFORM lưỡi dao: bật cắt + nghiêng X/Y/Z + vị trí (đẩy dọc pháp tuyến). Slider live (uniform).
function buildBladeTransform(blade: BladeState, apply: () => void): HTMLElement {
  const box = document.createElement('div')
  box.append(
    checkRow('✂ Cắt', blade.enabled, (v) => {
      blade.enabled = v
      apply()
    }),
    sliderRow('Nghiêng X', -90, 90, 1, blade.tiltX, (v) => {
      blade.tiltX = v
      apply()
    }),
    sliderRow('Nghiêng Y', -90, 90, 1, blade.tiltY, (v) => {
      blade.tiltY = v
      apply()
    }),
    sliderRow('Nghiêng Z', -90, 90, 1, blade.tiltZ, (v) => {
      blade.tiltZ = v
      apply()
    }),
    sliderRow('Vị trí (m)', -8, 8, 0.1, blade.offset, (v) => {
      blade.offset = v
      apply()
    })
  )
  return box
}

// Editor SDF (mini-Shadertoy): chip preset + textarea bladeSDF + ▶ Áp dụng + log · KÈM mini-preview raymarch bề mặt.
// Mini chỉ nhận body ĐÃ validate (RoofPreview compile OK) → không nháy lỗi. Trả { el, dispose } để dọn mini.
function buildSdfEditor(roofPreview: RoofPreview): { el: HTMLElement; dispose: () => void } {
  const wrap = document.createElement('div')
  wrap.className = 'ap-sdf-editor'

  const left = document.createElement('div')
  left.className = 'ap-sdf-left'
  const ta = document.createElement('textarea')
  ta.className = 'ap-sdf-code'
  ta.spellcheck = false
  ta.value = DEFAULT_SDF

  const presets = document.createElement('div')
  presets.className = 'ap-sdf-presets'
  for (const p of SDF_PRESETS) {
    const b = document.createElement('button')
    b.className = 'ap-sdf-chip'
    b.textContent = p.label
    b.addEventListener('click', () => (ta.value = p.code))
    presets.appendChild(b)
  }

  const bar = document.createElement('div')
  bar.className = 'ap-sdf-bar'
  const apply = document.createElement('button')
  apply.className = 'ap-sdf-apply'
  apply.textContent = '▶ Áp dụng'
  const log = document.createElement('div')
  log.className = 'ap-sdf-log'
  bar.append(apply, log)

  const hint = document.createElement('div')
  hint.className = 'ap-sdf-hint'
  hint.textContent =
    'bladeSDF(vec3 p) — p ở blade-local. Có: sdSphere/sdBox/sdTorus/opSmoothUnion/opSmoothSub/uTime.'
  left.append(presets, ta, bar, hint)

  const right = document.createElement('div')
  right.className = 'ap-sdf-mini'
  const mini = new SdfPreview(right)

  apply.addEventListener('click', () => roofPreview.setBladeSDF(ta.value))
  roofPreview.setOnCompile((err) => {
    log.textContent = err ? err.trim().split('\n')[0] : '✓ OK'
    log.classList.toggle('ap-sdf-log-err', err !== null)
    if (!err) mini.setSDF(ta.value) // chỉ đẩy body ĐÃ validate sang mini
  })

  wrap.append(left, right)
  return { el: wrap, dispose: () => mini.dispose() }
}

// Khung DƯỚI = lưỡi dao (full): TRANSFORM (slider) + EDITOR SDF (+ mini-preview). Trả { el, dispose }.
function buildBladeCol(
  blade: BladeState,
  preview: RoofPreview,
  apply: () => void
): { el: HTMLElement; dispose: () => void } {
  const col = document.createElement('div')
  col.className = 'ap-roof-col'
  const editor = buildSdfEditor(preview)
  col.append(buildBladeTransform(blade, apply), editor.el)
  return { el: col, dispose: editor.dispose }
}

// Gắn thí nghiệm mái vào Lab. verts = nguồn sự thật; slider → regen đối xứng; ô số → sửa đỉnh; lưỡi dao cắt shader.
export function setupRoofLab(
  previewHost: Element | null,
  paramHost: Element | null,
  docHost: Element | null,
  settingsHost: Element | null
): { dispose: () => void } {
  const params: RoofLabParams = { ...DEFAULT_ROOF }
  const blade: BladeState = { ...DEFAULT_BLADE }
  const verts = roofVertices(params) // NGUỒN SỰ THẬT — sửa TẠI CHỖ (slider regen / ô số)
  const preview = new RoofPreview(previewHost)
  buildPreviewSettings(settingsHost, preview) // ⚙ lưới/sáng/đèn

  const paramHead = paramHost?.previousElementSibling
  if (paramHead) paramHead.textContent = '🏠 Mái · 📐 Tọa độ'
  const docHead = docHost?.previousElementSibling
  if (docHead) docHead.textContent = '🔪 Lưỡi dao'

  const applyBlade = (): void => preview.setBlade(bladeMatrix(blade), blade.enabled)
  const rebuild = (): void => {
    preview.setGeometry(buildRoofGeometry(verts))
    preview.setLabels(verts)
    coordEd.sync() // đồng bộ ô số (không dựng lại DOM)
  }
  const regen = (): void => {
    // slider → dựng lại đối xứng, GHI ĐÈ verts tại chỗ
    roofVertices(params).forEach((b, i) => {
      verts[i].x = b.x
      verts[i].y = b.y
      verts[i].z = b.z
    })
    rebuild()
  }
  const coordEd = buildCoordEditor(verts, rebuild) // ô số sửa verts → rebuild

  // Khung TRÊN chia DỌC 2 cột: TRÁI = slider mái · PHẢI = ô số tọa độ.
  const topCols = document.createElement('div')
  topCols.className = 'ap-roof-cols'
  topCols.append(buildRoofParamCol(params, regen), coordEd.el)
  paramHost?.replaceChildren(topCols)

  // Khung DƯỚI = lưỡi dao (transform + editor + mini-preview).
  const bladeCol = buildBladeCol(blade, preview, applyBlade)
  docHost?.replaceChildren(bladeCol.el)

  rebuild() // dựng khối + nhãn + ô số lần đầu
  applyBlade() // trạng thái dao ban đầu (mặc định tắt)

  return {
    dispose: (): void => {
      preview.dispose()
      bladeCol.dispose()
    },
  }
}
