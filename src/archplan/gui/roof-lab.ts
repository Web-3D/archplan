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

import {
  type LabeledPoint,
  MAX_CORNER_SEG,
  MAX_RAFTER_SEG,
  NORMAL_LEN,
  RoofPreview,
} from './roof-preview'
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
  hipArea: number // DIỆN TÍCH tiết diện xà sống (m²) — tiết diện vuông cạnh √area (0 = ẩn xà)
  hipLen: number // CHIỀU DÀI xà sống (× độ dài sống, 0..1, tính từ đáy)
  cornerSeg: number // SỐ ĐỐT chia lưới góc đao tại D (1 = chỉ viền 2 tam giác DTG/DUG · >1 = chia mịn) + lấy mẫu xà góc
  cornerCurve: number // ĐỘ CONG xà góc (rafter đao) 0..1 (0 = thẳng · 1 = vút men bóng hip rồi lên đỉnh nhấc)
  tipSeg: number // TẦNG 2: số đốt con chia mịn vùng CHÓP (1..8) → mặt cong mịn hơn ở mũi
  tipCurl: number // TẦNG 2: ĐỘ CUỘN MŨI (0..1) — mũi quặp VÀO TRONG + lên, tắt dần tới X1/I1
  rafterSeg: number // XÀ GÓC A'K: số đốt RIÊNG (gấp đôi, 1..24) — mịn hơn mặt
  rafterCurve: number // XÀ GÓC A'K: độ cong RIÊNG (0..1) — tách khỏi cong mặt
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
  hipArea: 0.008, // Diện tích tiết diện xà (≈ vuông cạnh 0.089)
  hipLen: 1, // Chiều dài xà = full sống
  cornerSeg: 12, // Số đốt lưới góc đao tại D + lấy mẫu xà góc
  cornerCurve: 0.6, // Độ cong xà góc (rafter đao)
  tipSeg: 1, // Tầng 2: đốt con vùng chóp (1 = không thêm)
  tipCurl: 0.05, // Tầng 2: độ cuộn mũi lý tưởng (NgQuan chốt 2026-06-08)
  rafterSeg: 24, // Xà góc: số đốt riêng (gấp đôi cornerSeg)
  rafterCurve: 0.6, // Xà góc: độ cong riêng
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

// ── MÁI CONG (loft đao) — thay 4 slope phẳng bằng lưới Coons bám 4 biên (hiên cong + nóc + 2 hip cong). ──
// 4 SLOPE: eave 2 góc (c1,c2) + 2 điểm O–V chặn vùng góc (i1,i2 = [vertX,vertZ], y=0) + 2 góc nóc (n1,n2).
const SLOPE_DEFS = [
  { c1: 0, c2: 1, i1: [4, 0], i2: [5, 0], n1: 4, n2: 5 }, // trước A-B / nóc E-F
  { c1: 1, c2: 2, i1: [1, 4], i2: [1, 6], n1: 5, n2: 7 }, // phải  B-C / nóc F-H
  { c1: 2, c2: 3, i1: [5, 2], i2: [4, 2], n1: 7, n2: 6 }, // sau   C-D / nóc H-G
  { c1: 3, c2: 0, i1: [0, 6], i2: [0, 4], n1: 6, n2: 4 }, // trái  D-A / nóc G-E
] as const
type SlopeDef = (typeof SLOPE_DEFS)[number]

const cornerVec = (v: LabeledPoint[], k: number): THREE.Vector3 =>
  new THREE.Vector3(v[k].x, v[k].y, v[k].z)
const midVec = (a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 =>
  a.clone().add(b).multiplyScalar(0.5)
// Điểm Bézier bậc 2 (P0,P1,P2) tại t.
function qbez(P0: THREE.Vector3, P1: THREE.Vector3, P2: THREE.Vector3, t: number): THREE.Vector3 {
  const u = 1 - t
  return new THREE.Vector3()
    .addScaledVector(P0, u * u)
    .addScaledVector(P1, 2 * u * t)
    .addScaledVector(P2, t * t)
}

// Biên HIÊN của 1 slope: cung góc(tip1→i1) + ĐOẠN PHẲNG i1→i2 (y=0) + cung góc(i2→tip2). 3n+1 điểm. Khớp setEave.
function eaveBoundary(
  v: LabeledPoint[],
  h: number[],
  s: SlopeDef,
  n: number,
  curve: number
): THREE.Vector3[] {
  const tip1 = cornerVec(v, s.c1)
  tip1.y += h[s.c1]
  const tip2 = cornerVec(v, s.c2)
  tip2.y += h[s.c2]
  const in1 = new THREE.Vector3(v[s.i1[0]].x, 0, v[s.i1[1]].z)
  const in2 = new THREE.Vector3(v[s.i2[0]].x, 0, v[s.i2[1]].z)
  const ctrl1 = midVec(in1, tip1).lerp(cornerVec(v, s.c1), curve)
  const ctrl2 = midVec(in2, tip2).lerp(cornerVec(v, s.c2), curve)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) pts.push(qbez(tip1, ctrl1, in1, i / n)) // cung góc 1
  for (let i = 1; i <= n; i++) pts.push(new THREE.Vector3().lerpVectors(in1, in2, i / n)) // phẳng
  for (let i = 1; i <= n; i++) pts.push(qbez(in2, ctrl2, tip2, i / n)) // cung góc 2
  return pts
}

// Biên NÓC (thẳng n1→n2) lấy `count` điểm khớp số cột biên hiên.
function nocBoundary(v: LabeledPoint[], s: SlopeDef, count: number): THREE.Vector3[] {
  const a = cornerVec(v, s.n1)
  const b = cornerVec(v, s.n2)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < count; i++) pts.push(new THREE.Vector3().lerpVectors(a, b, i / (count - 1)))
  return pts
}

// Biên HIP cong: tip (eave, v=0) → noc (v=1), control kéo về góc đáy `ground` theo curve (bám xà góc). n+1 điểm.
function hipBoundary(
  tip: THREE.Vector3,
  noc: THREE.Vector3,
  ground: THREE.Vector3,
  n: number,
  curve: number
): THREE.Vector3[] {
  const ctrl = midVec(tip, noc).lerp(ground, curve)
  const pts: THREE.Vector3[] = []
  for (let j = 0; j <= n; j++) pts.push(qbez(tip, ctrl, noc, j / n))
  return pts
}

// Coons: nội suy 4 biên (b=hiên,t=nóc,l/r=hip) tại (u,v); c = 4 góc [P00,P10,P01,P11]. Suy về biên tại mép.
function coonsAt(
  b: THREE.Vector3,
  t: THREE.Vector3,
  l: THREE.Vector3,
  r: THREE.Vector3,
  c: THREE.Vector3[],
  u: number,
  v: number
): THREE.Vector3 {
  return new THREE.Vector3()
    .addScaledVector(b, 1 - v)
    .addScaledVector(t, v)
    .addScaledVector(l, 1 - u)
    .addScaledVector(r, u)
    .addScaledVector(c[0], -(1 - u) * (1 - v))
    .addScaledVector(c[1], -u * (1 - v))
    .addScaledVector(c[2], -(1 - u) * v)
    .addScaledVector(c[3], -u * v)
}

// Tam giác lưới cols×rows (đỉnh xếp theo cột: i*rows + j) từ chỉ số base.
function pushGrid(idx: number[], base: number, cols: number, rows: number): void {
  for (let i = 0; i < cols - 1; i++)
    for (let j = 0; j < rows - 1; j++) {
      const a = base + i * rows + j
      const d = base + (i + 1) * rows + j
      idx.push(a, d, d + 1, a, d + 1, a + 1)
    }
}

// Cộng CUỘN MŨI 1 góc: f = trọng số (1 ở mũi → 0 ở biên ô chóp). Vào trong (ngang về tâm) + lên (+Y), độ lớn curl·f.
function addCornerCurl(
  off: THREE.Vector3,
  corner: THREE.Vector3,
  center: THREE.Vector3,
  f: number,
  curl: number
): void {
  if (f <= 0) return
  const inward = new THREE.Vector3(center.x - corner.x, 0, center.z - corner.z)
  if (inward.lengthSq() > 0) inward.normalize()
  off.addScaledVector(inward, curl * f) // quặp VÀO TRONG
  off.y += curl * f // và LÊN
}

// CUỘN MŨI (tầng 2): dịch đỉnh ở vùng CHÓP (u→0 hoặc u→1, v→0) quặp vào trong + lên; tắt dần tới X1(u≈1/6)/I1(v=0.5).
function tipCurlOffset(
  u: number,
  v: number,
  c1: THREE.Vector3,
  c2: THREE.Vector3,
  tip: { center: THREE.Vector3; curl: number }
): THREE.Vector3 {
  const off = new THREE.Vector3()
  if (tip.curl <= 0 || v >= 0.5) return off
  const fv = 1 - v / 0.5 // 1 ở mép hiên (v=0) → 0 ở I1 (v=0.5)
  const uMid = 1 / 6 // X1 ≈ giữa cung góc
  addCornerCurl(off, c1, tip.center, Math.max(0, 1 - u / uMid) * fv, tip.curl)
  addCornerCurl(off, c2, tip.center, Math.max(0, 1 - (1 - u) / uMid) * fv, tip.curl)
  return off
}

// Dựng 1 slope: lấy 4 biên → Coons lưới (3n+1)×(n+1) + CUỘN MŨI (tip) → ghi pos + tam giác. Thu cạnh HIÊN (j=0) để bịt.
function buildSlope(
  pos: number[],
  idx: number[],
  eave: number[][],
  v: LabeledPoint[],
  h: number[],
  s: SlopeDef,
  n: number,
  curve: number,
  tip: { center: THREE.Vector3; curl: number }
): void {
  const bottom = eaveBoundary(v, h, s, n, curve)
  const top = nocBoundary(v, s, bottom.length)
  const g1 = cornerVec(v, s.c1)
  const g2 = cornerVec(v, s.c2)
  const left = hipBoundary(bottom[0], cornerVec(v, s.n1), g1, n, curve)
  const right = hipBoundary(bottom[bottom.length - 1], cornerVec(v, s.n2), g2, n, curve)
  const cols = bottom.length
  const rows = left.length
  const base = pos.length / 3
  const corners = [bottom[0], bottom[cols - 1], top[0], top[cols - 1]]
  for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1)
    for (let j = 0; j < rows; j++) {
      const vv = j / (rows - 1)
      const p = coonsAt(bottom[i], top[i], left[j], right[j], corners, u, vv)
      p.add(tipCurlOffset(u, vv, bottom[0], bottom[cols - 1], tip)) // cuộn mũi tầng 2
      pos.push(p.x, p.y, p.z)
    }
  }
  pushGrid(idx, base, cols, rows)
  for (let i = 0; i < cols - 1; i++) eave.push([base + i * rows, base + (i + 1) * rows]) // cạnh hiên j=0
}

// Nóc top phẳng (quad E-F-H-G).
function pushNoc(pos: number[], idx: number[], v: LabeledPoint[]): void {
  const base = pos.length / 3
  for (const k of [4, 5, 7, 6]) pos.push(v[k].x, v[k].y, v[k].z)
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

// Pháp tuyến đỉnh GỘP THEO VỊ TRÍ: đỉnh trùng vị trí (seam hip/nóc) → normal chung → solidify không nứt ở seam.
function vertexNormalsByPosition(pos: number[], idx: number[]): THREE.Vector3[] {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(), 3))
  geo.setIndex(idx.slice())
  geo.computeVertexNormals()
  const na = geo.getAttribute('normal') as THREE.BufferAttribute
  const count = pos.length / 3
  const key = (i: number): string =>
    `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`
  const map = new Map<string, THREE.Vector3>()
  for (let v = 0; v < count; v++) {
    const acc = map.get(key(v)) ?? new THREE.Vector3()
    map.set(key(v), acc.add(new THREE.Vector3(na.getX(v), na.getY(v), na.getZ(v))))
  }
  const out: THREE.Vector3[] = []
  let sumY = 0
  for (let v = 0; v < count; v++) {
    const acc = map.get(key(v))
    const nn = acc ? acc.clone().normalize() : new THREE.Vector3(0, 1, 0)
    out.push(nn)
    sumY += nn.y
  }
  // Lật TOÀN BỘ (không per-vertex) nếu mặt chủ yếu hướng xuống → bề dày VÀO TRONG, GIỮ tính nhất quán hướng theo mặt
  // cong (per-vertex ép n.y≥0 sẽ lật sai chỗ mũi cuộn overhang → 2 lớp xoắn vỡ vào nhau).
  if (sumY < 0) for (const nn of out) nn.negate()
  geo.dispose()
  return out
}

// Hệ số ĐỘ DÀY theo vị trí: càng gần 1 trong 4 đỉnh góc `tips` càng MỎNG (minF tại góc → 1 ngoài bán kính R).
function nearTipFactor(px: number, py: number, pz: number, tips: THREE.Vector3[]): number {
  let d2 = Infinity
  for (const tp of tips) {
    const dx = px - tp.x
    const dy = py - tp.y
    const dz = pz - tp.z
    d2 = Math.min(d2, dx * dx + dy * dy + dz * dz)
  }
  const minF = 0.2 // độ dày tại mũi = 20% · R = bán kính thuôn (m)
  const R = 1.0
  return minF + (1 - minF) * Math.min(1, Math.sqrt(d2) / R)
}

// SOLIDIFY mặt cong: lớp TRONG = đỉnh ngoài đẩy vào ⊥ mặt đoạn t·(mỏng dần về góc) — normal gộp theo vị trí (kín seam)
// + đảo winding; bịt VÀNH HIÊN (cạnh hở) nối ngoài↔trong. Nóc/hip tự kín (đỉnh trùng → lớp trong cũng trùng).
function solidify(
  pos: number[],
  idx: number[],
  eave: number[][],
  t: number,
  tips: THREE.Vector3[]
): void {
  const outer = pos.length / 3
  const nrm = vertexNormalsByPosition(pos, idx)
  for (let v = 0; v < outer; v++) {
    const i = v * 3
    const tt = t * nearTipFactor(pos[i], pos[i + 1], pos[i + 2], tips) // độ dày MỎNG DẦN về góc mái
    pos.push(pos[i] - nrm[v].x * tt, pos[i + 1] - nrm[v].y * tt, pos[i + 2] - nrm[v].z * tt)
  }
  const triLen = idx.length
  for (let k = 0; k < triLen; k += 3)
    idx.push(idx[k] + outer, idx[k + 2] + outer, idx[k + 1] + outer)
  for (const [a, b] of eave) idx.push(a, b, b + outer, a, b + outer, a + outer) // tường mép hiên
}

// MÁI CONG hoàn chỉnh: 4 slope loft (cong theo góc nhấc h + độ cong) + CUỘN MŨI tầng 2 + nóc phẳng. Cao góc=0 → frustum phẳng.
// tipSeg → tăng mật độ lưới (mịn vùng chóp); tipCurl → mũi quặp vào trong.
export function buildRoofSkin(
  v: LabeledPoint[],
  heights: number[],
  seg: number,
  curve: number,
  thickness = 0,
  tipSeg = 1,
  tipCurl = 0
): THREE.BufferGeometry {
  const n = clampVal(Math.round(seg) + (Math.round(tipSeg) - 1) * 2, 1, MAX_CORNER_SEG + 14)
  const cx = (v[0].x + v[1].x + v[2].x + v[3].x) / 4 // tâm xz mái (hướng "vào trong")
  const cz = (v[0].z + v[1].z + v[2].z + v[3].z) / 4
  const tip = { center: new THREE.Vector3(cx, 0, cz), curl: tipCurl }
  const pos: number[] = []
  const idx: number[] = []
  const eave: number[][] = []
  for (const s of SLOPE_DEFS) buildSlope(pos, idx, eave, v, heights, s, n, curve, tip)
  pushNoc(pos, idx, v)
  const outerIdx = idx.length // mặt NGOÀI (4 slope + nóc) = group 0
  // 4 đỉnh góc (đã nhấc) → tham chiếu cho độ dày MỎNG DẦN về góc
  const tips = [0, 1, 2, 3].map((c) => new THREE.Vector3(v[c].x, v[c].y + heights[c], v[c].z))
  if (thickness > 0) solidify(pos, idx, eave, thickness, tips) // lớp dày (trong + tường hiên) = group 1
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.addGroup(0, outerIdx, 0) // mặt ngoài → material 0 (nâu mái)
  if (idx.length > outerIdx) geo.addGroup(outerIdx, idx.length - outerIdx, 1) // lớp dày → material 1 (vàng nhạt)
  geo.computeVertexNormals()
  return geo
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
    'Trục: Dài=X Rộng=Z Cao=Y · Base chân: ABCD · Nóc base ≡ chân peak: EFGH · Sống: AE BF CH DG · Chiếu↓đáy: KLMN · KLMN cắt biên: O–V · Đỉnh peak: WX · Trung điểm hip: I1–I4 · Trung điểm xà góc: J1–J4 · Trung điểm cung hiên góc A: X1 Y1 · Góc đao(D): lưới đốt DTG/DUG · Khung gỗ: KLMNEFGH · Xà góc cong: K→A L→B N→C M→D · Hiên cong nối 4 góc nhấc (起翘)'
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
// 2 toggle hiển thị (đưa RA NGOÀI thay vì trong ⚙): Nhãn chữ A–H… + Đường dựng (đứt quãng). Mặc định bật.
function buildViewToggles(preview: RoofPreview): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ap-roof-2col' // 2 ô tick cạnh nhau
  row.append(
    checkRow('Nhãn', true, (v) => preview.setLabelsVisible(v)),
    checkRow('Đường dựng', true, (v) => preview.setGuides(v))
  )
  return row
}

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
    buildViewToggles(preview), // bật/tắt Nhãn chữ + Đường dựng (đưa ra ngoài, không nằm trong ⚙ settings)
    sliderRow('Độ mờ', 0, 1, 0.05, 0.7, (v) => preview.setOpacity(v)), // độ đục base + peak
    build2Col(buildBaseRows(params, regen), buildHipRows(params, regen)), // Base | Xà sống cạnh nhau
    buildSharedRows(params, regen),
    buildPeakRows(params, regen),
    buildApexRows(apex, updateApex),
    buildCornerRows(params, regen)
  )
  return col
}

// GÓC ĐAO (Tầng 1 — chia đốt): lưới đốt ô góc tại D = 2 tam giác slope DTG (mặt sau) + DUG (mặt trái), gặp ở sống DG.
// Số đốt = mật độ chia (1 = chỉ viền 2 tam giác · cao hơn = lưới mịn). CHƯA cong — chỉ thấy cấu trúc lưới.
function buildCornerRows(params: RoofLabParams, regen: () => void): HTMLElement {
  const box = document.createElement('div')
  box.append(
    mkColTitle('🪝 Góc đao'),
    sliderRow('Số đốt', 1, 12, 1, params.cornerSeg, (v) => {
      params.cornerSeg = v
      regen()
    }),
    sliderRow('Độ cong', 0, 1, 0.05, params.cornerCurve, (v) => {
      params.cornerCurve = v
      regen()
    }),
    sliderRow('Đốt mũi', 1, 8, 1, params.tipSeg, (v) => {
      params.tipSeg = v
      regen()
    }),
    sliderRow('Cuộn mũi', 0, 1, 0.05, params.tipCurl, (v) => {
      params.tipCurl = v
      regen()
    }),
    sliderRow('Đốt xà', 1, MAX_RAFTER_SEG, 1, params.rafterSeg, (v) => {
      params.rafterSeg = v
      regen()
    }),
    sliderRow('Cong xà', 0, 1, 0.05, params.rafterCurve, (v) => {
      params.rafterCurve = v
      regen()
    })
  )
  return box
}

// 2 cột bo viền cạnh nhau (vd Base | Xà sống) trong cột controls hẹp.
function build2Col(left: HTMLElement, right: HTMLElement): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ap-roof-2col'
  left.classList.add('ap-roof-subframe')
  right.classList.add('ap-roof-subframe')
  row.append(left, right)
  return row
}

// XÀ SỐNG (khung riêng cạnh Base — sẽ thêm slide): 4 hộp dọc sống EA/FB/HC/GD, 2 cạnh đáy luôn dính 2 mặt.
// Diện tích = tiết diện vuông (√area) · Chiều dài = × độ dài sống (từ đáy).
function buildHipRows(params: RoofLabParams, regen: () => void): HTMLElement {
  const box = document.createElement('div')
  box.append(
    mkColTitle('🪵 Xà sống'),
    sliderRow('Diện tích', 0, 0.05, 0.001, params.hipArea, (v) => {
      params.hipArea = v
      regen()
    }),
    sliderRow('Chiều dài', 0, 1, 0.02, params.hipLen, (v) => {
      params.hipLen = v
      regen()
    })
  )
  return box
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

const DEFAULT_APEX: ApexState = { hA: 0.5, hB: 0.5, hC: 0.5, hD: 0.5 }

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

// Cập nhật phần phụ thuộc CAO A'B'C'D': 4 marker + 4 xà góc cong + đường hiên cong (chung Số đốt + Độ cong).
function updateApexDecor(
  preview: RoofPreview,
  verts: LabeledPoint[],
  apex: ApexState,
  p: RoofLabParams
): void {
  const hs = [apex.hA, apex.hB, apex.hC, apex.hD]
  preview.setApex(verts, hs, p.tipCurl) // 4 marker A'B'C'D' tại ĐỈNH ĐÃ CUỘN (chạm đỉnh mái)
  preview.setCornerBeams(verts, hs, p.rafterSeg, p.rafterCurve, p.tipCurl) // 4 xà góc: đốt + cong RIÊNG → đỉnh cuộn
  preview.setEave(verts, hs, p.cornerSeg, p.cornerCurve) // đường hiên cong nối A'B'C'D' (起翘)
  preview.setHipBeams(verts, hs, p.hipArea, p.hipLen, p.cornerSeg, p.cornerCurve) // I1–I4 (trung điểm hip; hộp đã ẩn)
  preview.setJMids(verts, hs, p.rafterCurve, p.tipCurl) // J1–J4 = trung điểm xà góc (cong xà riêng, đỉnh cuộn)
  preview.setArcMids(verts, hs, p.cornerCurve) // X1/Y1 = trung điểm 2 cung hiên góc A (OA'/VA')
  preview.setGeometry(
    buildRoofSkin(verts, hs, p.cornerSeg, p.cornerCurve, p.thickness, p.tipSeg, p.tipCurl)
  ) // MẶT mái CONG + solidify + cuộn mũi tầng 2
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
  const updateApex = (): void => updateApexDecor(preview, verts, apex, params)

  const docHead = docHost?.previousElementSibling // khung trên headless → chỉ đặt nhãn khung dưới
  if (docHead) docHead.textContent = '🔪 Lưỡi dao'

  const applyBlade = (): void => preview.setBlade(bladeMatrix(blade), blade.enabled)
  const rebuild = (): void => {
    preview.setLabels(verts) // MẶT mái cong do updateApex() dựng (setGeometry) — phụ thuộc cao góc
    preview.setNormals(verts) // 4 pháp tuyến dựng từ đỉnh đáy ABCD
    updateApex() // 4 điểm A'B'C'D' bám đỉnh đáy theo cao hiện tại
    preview.setProjection(verts) // KLMN = chiếu nóc EFGH xuống đáy
    preview.setExtension(verts) // O–V = cạnh KLMN kéo dài cắt biên đáy
    preview.setCapBlock(verts, params.capHeight) // peak GEFHWX (chân = nóc base) + cạnh đỉnh WX
    preview.setCornerGrid(verts, params.cornerSeg) // lưới đốt góc đao tại D (Tầng 1)
    preview.setFrame(verts) // khung gỗ KLMNEFGH (lăng trụ dưới nóc)
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
