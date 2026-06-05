/**
 * VỊ TRÍ   — archplan/src/archplan/gui/roof-lab.ts
 * VAI TRÒ  — Thí nghiệm MÁI trong 🧪 Lab. BƯỚC 1: mái HIP (4 mặt) cắt nóc — dựng geometry từ thông số + bộ
 *            slider chỉnh. Mỗi lần đổi → dựng lại geo → đẩy vào RoofPreview. Xong sẽ "tốt nghiệp" sang building-kit.
 * LIÊN HỆ  — setupRoofLab gọi từ ArchPlanLab._setupLabFloat (paramHost = khung 🎛️ Thông số · previewHost = cột phải).
 *            Slider tái dùng sliderRow của tweak.ts. Sau bước này: thêm độ cong đầu đao bằng slider mới.
 */

import * as THREE from 'three'

import { RoofPreview } from './roof-preview'
import { sliderRow } from './tweak'

// Thông số mái — BƯỚC 1 (mái hip cắt nóc). Đơn vị: mét.
export interface RoofLabParams {
  width: number // bề ngang đáy (trục X)
  depth: number // bề sâu đáy (trục Z)
  height: number // chiều cao nóc so với đáy (rise)
  ridge: number // chiều dài nóc (0 = chóp nhọn kim-tự-tháp · = width → mái dốc 2 mái/gable)
}

export const DEFAULT_ROOF: RoofLabParams = {
  width: 4,
  depth: 3,
  height: 1.6,
  ridge: 1.5,
}

// Dựng geometry mái HIP: 2 mặt thang (trước/sau, dọc trục X) + 2 mặt tam giác (đầu hồi, dọc trục Z).
// 6 đỉnh: 4 góc đáy (y=0) + 2 đầu nóc R0/R1 (y=H, z=0). ridge = đoạn nóc giữa, clamp ≤ width.
// ridge→0: R0≡R1 = chóp nhọn (kim tự tháp). ridge→width: nóc chạm 2 đầu hồi = mái dốc 2 mái.
export function buildRoofGeometry(p: RoofLabParams): THREE.BufferGeometry {
  const hw = p.width / 2
  const hd = p.depth / 2
  const rl = Math.min(Math.max(p.ridge, 0), p.width) / 2 // nửa chiều dài nóc, kẹp trong [0, width]
  const H = p.height

  // prettier-ignore
  const pos = [
    -hw, 0, -hd, //  0 A — góc đáy trước-trái
     hw, 0, -hd, //  1 B — góc đáy trước-phải
     hw, 0,  hd, //  2 C — góc đáy sau-phải
    -hw, 0,  hd, //  3 D — góc đáy sau-trái
    -rl, H,  0,  //  4 R0 — đầu nóc trái
     rl, H,  0,  //  5 R1 — đầu nóc phải
  ]
  // prettier-ignore
  const idx = [
    0, 1, 5, 0, 5, 4, // mặt trước (-z): thang A-B-R1-R0
    2, 3, 4, 2, 4, 5, // mặt sau  (+z): thang C-D-R0-R1
    0, 4, 3,          // hồi trái  (-x): tam giác A-R0-D
    1, 2, 5,          // hồi phải  (+x): tam giác B-C-R1
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals() // DoubleSide nên hướng pháp tuyến không tới hạn
  return geo
}

// Gắn thí nghiệm mái vào Lab: tạo RoofPreview (cột phải) + slider thông số (khung 🎛️ trái). Trả { dispose }.
export function setupRoofLab(
  previewHost: Element | null,
  paramHost: Element | null
): { dispose: () => void } {
  const params: RoofLabParams = { ...DEFAULT_ROOF }
  const preview = new RoofPreview(previewHost)

  const rebuild = (): void => {
    preview.setGeometry(buildRoofGeometry(params))
  }
  rebuild() // dựng khối đầu tiên

  // Slider structural (dựng lại geo) — liveDrag để kéo thấy hình đổi ngay (geo 6 đỉnh, không lag).
  const rows = [
    sliderRow('Ngang (m)', 1, 12, 0.1, params.width, (v) => {
      params.width = v
      rebuild()
    }),
    sliderRow('Sâu (m)', 1, 12, 0.1, params.depth, (v) => {
      params.depth = v
      rebuild()
    }),
    sliderRow('Cao (m)', 0.2, 6, 0.1, params.height, (v) => {
      params.height = v
      rebuild()
    }),
    sliderRow('Nóc (m)', 0, 12, 0.1, params.ridge, (v) => {
      params.ridge = v
      rebuild()
    }),
  ]
  paramHost?.replaceChildren(...rows) // xóa placeholder gợi ý → gắn slider thật

  return {
    dispose: (): void => preview.dispose(),
  }
}
