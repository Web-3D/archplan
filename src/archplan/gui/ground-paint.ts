/**
 * VỊ TRÍ   — archplan/src/archplan/gui/ground-lab phụ trợ (ground-paint.ts)
 * VAI TRÒ  — PAINTED MASK cho bảng trộn nền: 1 DataTexture RGBA 256² — MỖI KÊNH R/G/B/A = mask VẼ TAY
 *            của 1 slot lớp (tối đa 4 slot khớp MAX_MIX). Cọ mềm falloff smoothstep, tẩy = hạ giá trị.
 *            Đây là mảnh "chủ đích" còn thiếu so với splat-paint của UE/Unity Landscape (mask fbm chỉ
 *            cho chất loang ngẫu nhiên — không đặt được "lối mòn chỗ này"). NgQuan duyệt 2026-06-10.
 * LIÊN HỆ  — ground-lab.ts: GroundPreview giữ 1 PaintMask (uniform uMaskPaint), pointer vẽ qua raycast
 *            UV plane; shader đọc kênh slot: max(mask fbm, mask vẽ). Catalog: houdini-algorithms.md mục 8.
 *
 * CÁCH DÙNG: const pm = new PaintMask(); mat.uniforms.uMaskPaint = { value: pm.texture }
 *            pm.stamp(uv.x, uv.y, 0.06, slot, false) // vẽ kênh slot tại uv, cọ 6% bề mặt
 * DISPOSE: dispose() — DataTexture.
 */

import * as THREE from 'three'

const SIZE = 256 // px cạnh mask — 12m sàn → ~4.7cm/px, đủ cho vạt đất/lối mòn (không phải decal chi tiết)

export class PaintMask {
  private readonly data = new Uint8Array(SIZE * SIZE * 4)
  readonly texture: THREE.DataTexture

  constructor() {
    this.texture = new THREE.DataTexture(this.data, SIZE, SIZE)
    this.texture.magFilter = THREE.LinearFilter // mặc định Nearest → răng cưa biên vẽ
    this.texture.minFilter = THREE.LinearFilter
    this.texture.needsUpdate = true
  }

  // Đóng 1 DẤU CỌ tròn mềm vào kênh `ch` tại (u,v) [0..1]: tâm đậm 255, mép falloff smoothstep về 0.
  // erase = hạ giá trị thay vì nâng (tẩy đúng vùng đã vẽ, không đụng kênh khác).
  stamp(u: number, v: number, radius: number, ch: number, erase: boolean): void {
    const r = Math.max(1, radius * SIZE)
    const cx = u * SIZE
    const cy = v * SIZE
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(SIZE - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(SIZE - 1, Math.ceil(cy + r))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r
        if (d >= 1) continue
        const t = 1 - d * d * (3 - 2 * d) // 1 - smoothstep — tâm 1, mép 0
        const i = (y * SIZE + x) * 4 + ch
        const a = Math.round(t * 255)
        this.data[i] = erase ? Math.min(this.data[i], 255 - a) : Math.max(this.data[i], a)
      }
    }
    this.texture.needsUpdate = true
  }

  // Xóa sạch 1 kênh (nút "Xóa nét" của slot) — kênh khác giữ nguyên.
  clear(ch: number): void {
    for (let i = ch; i < this.data.length; i += 4) this.data[i] = 0
    this.texture.needsUpdate = true
  }

  dispose(): void {
    this.texture.dispose()
  }
}
