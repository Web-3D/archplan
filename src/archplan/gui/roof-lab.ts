/**
 * VỊ TRÍ   — archplan/src/archplan/gui/roof-lab.ts
 * VAI TRÒ  — Thí nghiệm MÁI trong 🧪 Lab. Mái FRUSTUM 8 góc A–H (đáy ABCD + nóc EFGH thu giữa; ridgeDepth=0 → hip)
 *            + ĐỘ DÀY solidify (lớp trong đẩy theo pháp tuyến + bo mép hiên; thickness=0 → mặt mỏng)
 *            + 4 pháp tuyến & điểm A'B'C'D' (marker, chưa điều khiển mái) + LƯỠI DAO cắt (shader SDF). 8 ĐỈNH = NGUỒN
 *            SỰ THẬT: slider = dựng lại đối xứng (ghi đè) · ô số = tinh chỉnh TỪNG đỉnh. Editor SDF + mini-preview.
 * LIÊN HỆ  — setupRoofLab gọi từ ArchPlanLab._setupLabFloat. sliderRow của tweak.ts. RoofPreview (mái+pháp tuyến+điểm+
 *            cắt) + SdfPreview (raymarch bề mặt dao, dùng chung SDF_LIB). bladeSDF = chỗ nâng lên SDF iq Shadertoy.
 *
 * TÊN GÓC: ABCD = đáy (vòng) · EFGH = nóc ngang (E↑A F↑B G↑D H↑C). Hiên AB BC CD DA · Sống AE BF CH DG · Nóc EF FH HG GE.
 */

import * as THREE from 'three'

import { type LabeledPoint, NORMAL_LEN, RoofPreview } from './roof-preview'
import { SdfPreview } from './sdf-preview'
import { sliderRow } from './tweak'

// Thông số mái FRUSTUM (chóp cụt): đáy ABCD + nóc EFGH ngang thu giữa. ridgeDepth=0 → về mái hip. Đơn vị: mét.
// Quy ước trục: DÀI = X · RỘNG = Z · CAO = Y.
// BASE (frustum dưới): chân = width×depth, cao = height. Nóc base = MẶT PHẲNG CHUNG (ridge×ridgeDepth) ≡ chân PEAK.
// PEAK (chóp trên): chân lấy theo mặt phẳng chung; chỉ capHeight riêng. Đổi dài/rộng mặt phẳng chung KHÔNG đổi cao base/peak.
export interface RoofLabParams {
  width: number // chiều DÀI chân base (trục X)
  depth: number // chiều RỘNG chân base (trục Z)
  height: number // chiều CAO base (rise nóc so với chân, trục Y)
  ridge: number // chiều DÀI mặt phẳng chung theo X (nóc base ≡ chân peak; 0 = chóp nhọn · = width → gable)
  ridgeDepth: number // chiều RỘNG mặt phẳng chung theo Z (0 = sống đường thẳng/hip · >0 = chữ nhật/frustum)
  thickness: number // độ dày solidify base (m, ⊥ mặt). 0 = mặt mỏng như cũ · >0 = khối đặc có mép hiên
  capHeight: number // chiều CAO peak (rise đỉnh WX trên mặt phẳng chung, trục Y) — RIÊNG, độc lập cao base
}

// ⭐ MÁI CHUẨN — hình dáng GỐC (frustum chia tọa độ A–V) để bắt đầu mọi dạng mái. Mở Mái = state này.
// Đổi bộ số này = đổi "mái chuẩn". (chi tiết: memory canonical-roof-base)
export const DEFAULT_ROOF: RoofLabParams = {
  width: 5, // Dài chân base
  depth: 5, // Rộng chân base
  height: 0.6, // Cao base
  ridge: 3, // Dài mặt phẳng chung
  ridgeDepth: 2.5, // Rộng mặt phẳng chung
  thickness: 0.1, // Độ dày base
  capHeight: 1, // Cao peak → đỉnh WX ở y=1.6 (cao base 0.6 + 1)
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

// 8 góc FRUSTUM. Đáy ABCD (y=0, vòng A→B→C→D) · nóc EFGH (y=H, thu giữa): E↑A F↑B G↑D H↑C.
// G ở trên-TRÁI (phía cạnh ED) · H ở trên-PHẢI (phía cạnh FC). ridgeDepth=0 → E,F,G,H sụp về sống → mái hip.
export function roofVertices(p: RoofLabParams): LabeledPoint[] {
  const hw = p.width / 2
  const hd = p.depth / 2
  const rl = clampVal(p.ridge, 0, p.width) / 2 // nửa bề ngang nóc (X)
  const rd = clampVal(p.ridgeDepth, 0, p.depth) / 2 // nửa bề sâu nóc (Z)
  const H = p.height
  return [
    { name: 'A', x: -hw, y: 0, z: -hd },
    { name: 'B', x: hw, y: 0, z: -hd },
    { name: 'C', x: hw, y: 0, z: hd },
    { name: 'D', x: -hw, y: 0, z: hd },
    { name: 'E', x: -rl, y: H, z: -rd }, // trên-trái-trước (↑A)
    { name: 'F', x: rl, y: H, z: -rd }, // trên-phải-trước (↑B)
    { name: 'G', x: -rl, y: H, z: rd }, // trên-trái-sau  (↑D)
    { name: 'H', x: rl, y: H, z: rd }, // trên-phải-sau  (↑C)
  ]
}

// Index 5 mặt NGOÀI (nóc EFHG + 4 thang cân). Tách module để lớp TRONG tái dùng (đảo winding) khi solidify.
// ridgeDepth=0: nóc sụp thành đường → 2 mặt thang + 2 tam giác hồi (đúng mái hip cũ).
// prettier-ignore
const ROOF_IDX = [
  4, 5, 7, 4, 7, 6, // nóc EFHG (E=4 F=5 H=7 G=6)
  0, 1, 5, 0, 5, 4, // trước (-z): thang A-B-F-E
  1, 2, 7, 1, 7, 5, // phải  (+x): thang B-C-H-F
  2, 3, 6, 2, 6, 7, // sau   (+z): thang C-D-G-H
  3, 0, 4, 3, 4, 6, // trái  (-x): thang D-A-E-G
]
// Biên HỞ = vành đáy A→B→C→D→A (4 cạnh) — nơi bo mép hiên nối lớp ngoài↔trong khi solidify.
const RIM: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
]

// Pháp tuyến đỉnh QUAY RA NGOÀI (rời tâm khối) cho 8 đỉnh — để solidify đẩy lớp trong vào ĐÚNG phía.
// Tích có hướng (area-weighted) cộng dồn theo mặt → chuẩn hóa → lật nếu chĩa vào tâm (winding không tin được).
function outwardNormals(v: LabeledPoint[]): THREE.Vector3[] {
  const p = v.map((q) => new THREE.Vector3(q.x, q.y, q.z))
  const c = new THREE.Vector3()
  for (const q of p) c.add(q)
  c.multiplyScalar(1 / p.length)
  const n = p.map(() => new THREE.Vector3())
  for (let i = 0; i < ROOF_IDX.length; i += 3) {
    const [a, b, d] = [ROOF_IDX[i], ROOF_IDX[i + 1], ROOF_IDX[i + 2]]
    const fn = new THREE.Vector3()
      .subVectors(p[b], p[a])
      .cross(new THREE.Vector3().subVectors(p[d], p[a]))
    n[a].add(fn)
    n[b].add(fn)
    n[d].add(fn)
  }
  for (let i = 0; i < n.length; i++) {
    n[i].normalize()
    if (n[i].dot(new THREE.Vector3().subVectors(p[i], c)) < 0) n[i].negate()
  }
  return n
}

// Mái MỎNG (độ dày 0): chỉ 5 mặt ngoài như cũ. DoubleSide nên winding không tới hạn.
function buildThinShell(v: LabeledPoint[]): THREE.BufferGeometry {
  const pos: number[] = []
  for (const q of v) pos.push(q.x, q.y, q.z)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex([...ROOF_IDX])
  geo.computeVertexNormals()
  return geo
}

// Mái DÀY (solidify kiểu Blender): lớp NGOÀI A–H (0..7) giữ nguyên hình chuẩn + lớp TRONG (8..15) đẩy vào dọc
// pháp tuyến đoạn t (độ dày ⊥ mặt ≈ t) + bo mép hiên (vành đáy) nối 2 lớp → khối đặc. Lớp trong đảo winding.
function buildSolid(v: LabeledPoint[], t: number): THREE.BufferGeometry {
  const n = outwardNormals(v)
  const pos: number[] = []
  for (const q of v) pos.push(q.x, q.y, q.z)
  for (let i = 0; i < v.length; i++)
    pos.push(v[i].x - n[i].x * t, v[i].y - n[i].y * t, v[i].z - n[i].z * t)
  const idx = [...ROOF_IDX]
  for (let i = 0; i < ROOF_IDX.length; i += 3)
    idx.push(ROOF_IDX[i] + 8, ROOF_IDX[i + 2] + 8, ROOF_IDX[i + 1] + 8)
  for (const [a, b] of RIM) idx.push(a, b, b + 8, a, b + 8, a + 8)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

// Geometry mái từ 8 ĐỈNH. thickness>0 → khối đặc (solidify) · =0 → mặt mỏng như cũ. A–H luôn là lớp ngoài chuẩn.
export function buildRoofGeometry(v: LabeledPoint[], thickness = 0): THREE.BufferGeometry {
  return thickness > 0 ? buildSolid(v, thickness) : buildThinShell(v)
}

// Bảng tọa độ EDIT ĐƯỢC (cột phải khung trên): mỗi đỉnh = tên + 3 ô số x/y/z (sửa → onEdit). sync() = nạp lại
// giá trị từ verts (gọi sau khi slider regenerate, KHÔNG dựng lại DOM → không mất focus khi đang gõ).
function buildCoordEditor(
  verts: LabeledPoint[],
  onEdit: () => void
): { el: HTMLElement; sync: () => void } {
  const el = document.createElement('div')
  el.style.marginTop = '10px' // tách khỏi nhóm slider phía trên (xếp dọc)
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
  legend.textContent =
    'Trục: Dài=X Rộng=Z Cao=Y · Base chân: ABCD · Nóc base ≡ chân peak: EFGH · Sống: AE BF CH DG · Chiếu↓đáy: KLMN · KLMN cắt biên: O–V · Đỉnh peak: WX'
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

// Tiêu đề nhóm slider (tái dùng).
function mkColTitle(text: string): HTMLElement {
  const t = document.createElement('div')
  t.className = 'ap-roof-col-title'
  t.textContent = text
  return t
}

// Cột TRÁI khung trên: Độ mờ + 3 nhóm Base / Mặt phẳng chung / Peak + 4 điểm A'B'C'D'.
function buildRoofParamCol(
  params: RoofLabParams,
  regen: () => void,
  apex: ApexState,
  updateApex: () => void,
  preview: RoofPreview
): HTMLElement {
  const col = document.createElement('div')
  col.className = 'ap-roof-col'
  col.append(
    mkColTitle('🏠 Mái'),
    sliderRow('Độ mờ', 0, 1, 0.05, 0.7, (v) => preview.setOpacity(v)), // độ đục base + peak
    buildBaseRows(params, regen),
    buildSharedRows(params, regen),
    buildPeakRows(params, regen),
    buildApexRows(apex, updateApex)
  )
  return col
}

// BASE (phần dưới = frustum): chân base Dài(X)/Rộng(Z) + Cao(Y) + Độ dày solidify.
function buildBaseRows(params: RoofLabParams, regen: () => void): HTMLElement {
  const box = document.createElement('div')
  box.append(
    mkColTitle('🟫 Base (phần dưới)'),
    sliderRow('Dài chân base (m)', 1, 12, 0.1, params.width, (v) => {
      params.width = v
      regen()
    }),
    sliderRow('Rộng chân base (m)', 1, 12, 0.1, params.depth, (v) => {
      params.depth = v
      regen()
    }),
    sliderRow('Cao base (m)', 0.2, 6, 0.1, params.height, (v) => {
      params.height = v
      regen()
    }),
    sliderRow('Độ dày base (m)', 0, 0.8, 0.02, params.thickness, (v) => {
      params.thickness = v
      regen()
    })
  )
  return box
}

// MẶT PHẲNG CHUNG = nóc base ≡ chân peak (dính liền): Dài(X)=ridge · Rộng(Z)=ridgeDepth. Đổi KHÔNG đụng cao base/peak.
function buildSharedRows(params: RoofLabParams, regen: () => void): HTMLElement {
  const box = document.createElement('div')
  box.append(
    mkColTitle('▭ Mặt phẳng chung (nóc base ≡ chân peak)'),
    sliderRow('Dài (m)', 0, 12, 0.1, params.ridge, (v) => {
      params.ridge = v
      regen()
    }),
    sliderRow('Rộng (m)', 0, 12, 0.1, params.ridgeDepth, (v) => {
      params.ridgeDepth = v
      regen()
    })
  )
  return box
}

// PEAK (chóp): dài/rộng chân = mặt phẳng chung; CHỈ Cao(Y) riêng. Đỉnh WX dài = chân peak (= nóc base).
function buildPeakRows(params: RoofLabParams, regen: () => void): HTMLElement {
  const box = document.createElement('div')
  box.append(
    mkColTitle('🔺 Peak (chóp)'),
    sliderRow('Cao peak (m)', 0, 6, 0.1, params.capHeight, (v) => {
      params.capHeight = v
      regen()
    })
  )
  return box
}

// 4 điểm di động A'B'C'D' trên pháp tuyến — mỗi cái 1 slider cao [0, NORMAL_LEN]. Chưa điều khiển mái (chỉ marker).
interface ApexState {
  hA: number
  hB: number
  hC: number
  hD: number
}

const DEFAULT_APEX: ApexState = { hA: 1.5, hB: 1.5, hC: 1.5, hD: 1.5 }

// 1 dạng mái đã lưu = bộ thông số mái + cao A'B'C'D' (đủ tái dựng hình). Lưu localStorage.
interface SavedShape {
  params: RoofLabParams
  apex: ApexState
}
const PRESET_KEY = 'archplan-roof-shapes'

function loadPresets(): Record<string, SavedShape> {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '{}') as Record<string, SavedShape>
  } catch {
    return {}
  }
}
function savePresets(p: Record<string, SavedShape>): void {
  localStorage.setItem(PRESET_KEY, JSON.stringify(p))
}
function mkBtn(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'ap-roof-presetbtn'
  b.textContent = label
  if (title) b.title = title // nút chỉ còn symbol → title giải nghĩa khi hover
  b.addEventListener('click', onClick)
  return b
}

// Popup confirm nhỏ treo dưới `anchor` (vd nút 🗑): "msg" + [Hủy][Xóa]. Click ngoài / Hủy → đóng; Xóa → onYes().
function confirmPopup(anchor: HTMLElement, msg: string, onYes: () => void): void {
  const pop = document.createElement('div')
  pop.className = 'ap-roof-confirm'
  const m = document.createElement('div')
  m.className = 'ap-roof-confirm-msg'
  m.textContent = msg
  const row = document.createElement('div')
  row.className = 'ap-roof-confirm-row'
  const no = document.createElement('button')
  no.className = 'ap-roof-confirm-no'
  no.textContent = 'Hủy'
  const yes = document.createElement('button')
  yes.className = 'ap-roof-confirm-yes'
  yes.textContent = 'Xóa'
  row.append(no, yes)
  pop.append(m, row)
  document.body.appendChild(pop)
  const r = anchor.getBoundingClientRect()
  pop.style.left = `${Math.round(r.left)}px`
  pop.style.top = `${Math.round(r.bottom + 4)}px`
  const close = (): void => {
    pop.remove()
    document.removeEventListener('mousedown', onOut, true)
  }
  function onOut(e: MouseEvent): void {
    if (!pop.contains(e.target as Node)) close()
  }
  no.addEventListener('click', close)
  yes.addEventListener('click', () => {
    onYes()
    close()
  })
  setTimeout(() => document.addEventListener('mousedown', onOut, true), 0) // né click mở
}

// Nháy chữ nút ~1.1s để báo đã làm (vd "✓ Đã lưu") rồi trả lại.
function flash(btn: HTMLButtonElement, msg: string): void {
  const old = btn.textContent ?? ''
  btn.textContent = msg
  setTimeout(() => (btn.textContent = old), 1100)
}

// ⬇ Tải toàn bộ dạng đã lưu ra file roof-shapes.json (mang đi / đẩy vào pipeline).
function exportShapes(): void {
  const blob = new Blob([JSON.stringify(loadPresets(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'roof-shapes.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

// ⬆ Nạp file .json → MERGE vào dạng đã lưu (localStorage). onDone refresh dropdown.
function importShapes(onDone: () => void): void {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.accept = 'application/json,.json'
  inp.addEventListener('change', () => {
    const f = inp.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = (): void => {
      try {
        const incoming = JSON.parse(String(r.result)) as Record<string, SavedShape>
        savePresets({ ...loadPresets(), ...incoming })
        onDone()
      } catch {
        /* file json lỗi → bỏ qua */
      }
    }
    r.readAsText(f)
  })
  inp.click()
}

function buildApexRows(apex: ApexState, updateApex: () => void): HTMLElement {
  const box = document.createElement('div')
  const title = document.createElement('div')
  title.className = 'ap-roof-col-title'
  title.textContent = '🔼 Điểm A′B′C′D′ (trên pháp tuyến)'
  const h = (label: string, get: () => number, set: (v: number) => void): HTMLElement =>
    sliderRow(label, 0, NORMAL_LEN, 0.05, get(), (v) => {
      set(v)
      updateApex()
    })
  box.append(
    title,
    h(
      "Cao A'",
      () => apex.hA,
      (v) => (apex.hA = v)
    ),
    h(
      "Cao B'",
      () => apex.hB,
      (v) => (apex.hB = v)
    ),
    h(
      "Cao C'",
      () => apex.hC,
      (v) => (apex.hC = v)
    ),
    h(
      "Cao D'",
      () => apex.hD,
      (v) => (apex.hD = v)
    )
  )
  return box
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

// Thanh quản lý BLUEPRINT: ↺ (về chuẩn) · ô tên gộp nút 💾 lưu · dropdown blueprint đã lưu · 🗑 (confirm) · 📤/📥 JSON.
// current() = chụp state hiện tại · apply(s) = nạp 1 dạng. Lưu localStorage qua loadPresets/savePresets.
// Cụm "khung tên + 💾" gộp 1: gõ tên (trống → tự đặt) → 💾 lưu blueprint hiện tại, nháy "✓".
function buildSaveRow(
  current: () => SavedShape,
  refresh: () => void,
  sel: HTMLSelectElement
): HTMLElement {
  const nameInp = document.createElement('input')
  nameInp.className = 'ap-roof-presetname'
  nameInp.placeholder = 'tên blueprint'
  const save = mkBtn(
    '💾',
    () => {
      const ps = loadPresets()
      const name = nameInp.value.trim() || `mái ${Object.keys(ps).length + 1}` // trống → tự đặt tên
      ps[name] = current()
      savePresets(ps)
      refresh()
      sel.value = name
      nameInp.value = ''
      flash(save, '✓')
    },
    'Lưu blueprint'
  )
  save.classList.add('ap-roof-savebtn')
  const row = document.createElement('div')
  row.className = 'ap-roof-saverow'
  row.append(nameInp, save)
  return row
}

// Nút 🗑 — xóa blueprint đang chọn nhưng QUA popup confirm (tránh xóa nhầm).
function buildDelBtn(sel: HTMLSelectElement, refresh: () => void): HTMLButtonElement {
  const del = mkBtn(
    '🗑',
    () => {
      if (!sel.value) return
      confirmPopup(del, `Xóa blueprint "${sel.value}"?`, () => {
        const ps = loadPresets()
        delete ps[sel.value]
        savePresets(ps)
        refresh()
      })
    },
    'Xóa blueprint đang chọn'
  )
  return del
}

function buildPresetBar(current: () => SavedShape, apply: (s: SavedShape) => void): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'ap-roof-presetbar'
  const sel = document.createElement('select')
  sel.className = 'ap-roof-presetsel'
  const refresh = (): void => {
    sel.replaceChildren(new Option('blueprint', '')) // option đầu = nhãn/placeholder
    for (const name of Object.keys(loadPresets())) sel.appendChild(new Option(name, name))
  }
  sel.addEventListener('change', () => {
    const s = loadPresets()[sel.value]
    if (s) apply(s)
  })
  const std = mkBtn(
    '↺',
    () => apply({ params: { ...DEFAULT_ROOF }, apex: { ...DEFAULT_APEX } }),
    'Về mái chuẩn'
  )
  bar.append(
    std,
    buildSaveRow(current, refresh, sel),
    sel,
    buildDelBtn(sel, refresh),
    mkBtn('📤', exportShapes, 'Tải tất cả blueprint ra file .json'),
    mkBtn('📥', () => importShapes(refresh), 'Nạp blueprint từ file .json')
  )
  refresh()
  return bar
}

// Mount cột thông số + thanh preset vào khung trên. render() dựng lại slider (đồng bộ sau khi nạp dạng).
function mountParams(
  host: Element | null,
  ctx: {
    params: RoofLabParams
    apex: ApexState
    preview: RoofPreview
    regen: () => void
    updateApex: () => void
    coordEl: HTMLElement
  }
): void {
  const wrap = document.createElement('div')
  const render = (): void =>
    wrap.replaceChildren(
      buildRoofParamCol(ctx.params, ctx.regen, ctx.apex, ctx.updateApex, ctx.preview),
      ctx.coordEl
    )
  const apply = (s: SavedShape): void => {
    Object.assign(ctx.params, s.params)
    Object.assign(ctx.apex, s.apex)
    render() // slider khớp giá trị mới
    ctx.regen() // dựng lại hình
  }
  render()
  const cur = (): SavedShape => ({ params: { ...ctx.params }, apex: { ...ctx.apex } })
  host?.replaceChildren(buildPresetBar(cur, apply), wrap)
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
  const apex: ApexState = { ...DEFAULT_APEX } // cao A'B'C'D' dọc pháp tuyến
  const preview = new RoofPreview(previewHost)
  buildPreviewSettings(settingsHost, preview) // ⚙ lưới/sáng/đèn
  const updateApex = (): void => preview.setApex(verts, [apex.hA, apex.hB, apex.hC, apex.hD])

  const docHead = docHost?.previousElementSibling // khung trên headless → chỉ đặt nhãn khung dưới
  if (docHead) docHead.textContent = '🔪 Lưỡi dao'

  const applyBlade = (): void => preview.setBlade(bladeMatrix(blade), blade.enabled)
  const rebuild = (): void => {
    preview.setGeometry(buildRoofGeometry(verts, params.thickness))
    preview.setLabels(verts)
    preview.setNormals(verts) // 4 pháp tuyến dựng từ đỉnh đáy ABCD
    updateApex() // 4 điểm A'B'C'D' bám đỉnh đáy theo cao hiện tại
    preview.setProjection(verts) // KLMN = chiếu nóc EFGH xuống đáy
    preview.setExtension(verts) // O–V = cạnh KLMN kéo dài cắt biên đáy
    preview.setCapBlock(verts, params.capHeight) // peak GEFHWX (chân = nóc base) + cạnh đỉnh WX
    coordEd.sync() // đồng bộ ô số (không dựng lại DOM)
  }
  const regen = (): void => {
    // slider → dựng lại đối xứng, GHI ĐÈ verts TẠI CHỖ (giữ ref object cho coordEd/preview)
    roofVertices(params).forEach((b, i) => Object.assign(verts[i], b))
    rebuild()
  }
  const coordEd = buildCoordEditor(verts, rebuild) // ô số sửa verts → rebuild
  // Khung TRÊN: thanh preset (↺ chuẩn / 💾 lưu / chọn dạng) + slider mái + A'B'C'D' + ô số tọa độ. Khung DƯỚI: lưỡi dao.
  mountParams(paramHost, { params, apex, preview, regen, updateApex, coordEl: coordEd.el })
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
