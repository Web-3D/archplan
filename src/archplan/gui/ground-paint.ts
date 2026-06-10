/**
 * VỊ TRÍ   — archplan/src/archplan/gui/ground-paint.ts
 * VAI TRÒ  — PAINTED MASK cho bảng trộn nền: 1 DataTexture RGBA size² — MỖI KÊNH R/G/B/A = mask VẼ TAY
 *            của 1 slot lớp (tối đa 4 slot khớp MAX_MIX). Cọ mềm falloff smoothstep (ELLIPSE rU/rV — zone
 *            chữ nhật không méo cọ), tẩy = hạ giá trị. Đây là mảnh "chủ đích" còn thiếu so với splat-paint
 *            của UE/Unity Landscape (mask fbm chỉ cho chất loang ngẫu nhiên — không đặt được "lối mòn chỗ
 *            này"). NgQuan duyệt 2026-06-10. Stage 3: + base64 (persist vào GroundMixParams.paint).
 * LIÊN HỆ  — ground-lab.ts: GroundPreview giữ 1 PaintMask 256² (uniform uMaskPaint). ArchPlanLab: 1 PaintMask
 *            128² per-zone (PhotoGroundMix.paint — nhẹ + base64 ~87KB). Catalog: houdini-algorithms.md mục 8.
 *
 * CÁCH DÙNG: const pm = new PaintMask() // Lab 256² — hoặc new PaintMask(128) per-zone
 *            pm.stamp(uv.x, uv.y, 0.06, 0.06, slot, false) // vẽ kênh slot tại uv, cọ 6% mỗi trục
 *            mix.paint = pm.toBase64() ?? undefined // persist; pm.loadBase64(s) khi tạo lại
 * DISPOSE: dispose() — DataTexture.
 */

import * as THREE from 'three'

export class PaintMask {
  private readonly size: number // px cạnh — Lab 256 (12m → ~4.7cm/px); per-zone 128 (đủ vạt/lối mòn, base64 nhẹ)
  private readonly data: Uint8Array
  readonly texture: THREE.DataTexture

  constructor(size = 256) {
    this.size = size
    this.data = new Uint8Array(size * size * 4)
    this.texture = new THREE.DataTexture(this.data, size, size)
    this.texture.magFilter = THREE.LinearFilter // mặc định Nearest → răng cưa biên vẽ
    this.texture.minFilter = THREE.LinearFilter
    this.texture.needsUpdate = true
  }

  // Đóng 1 DẤU CỌ ellipse mềm vào kênh `ch` tại (u,v) [0..1]: tâm đậm 255, mép falloff smoothstep về 0.
  // rU/rV = bán kính theo TỪNG trục uv (zone chữ nhật: cọ tròn world → ellipse uv — caller chia size mỗi trục).
  // erase = hạ giá trị thay vì nâng (tẩy đúng vùng đã vẽ, không đụng kênh khác).
  stamp(u: number, v: number, rU: number, rV: number, ch: number, erase: boolean): void {
    const S = this.size
    const rx = Math.max(1, rU * S)
    const ry = Math.max(1, rV * S)
    const cx = u * S
    const cy = v * S
    const x0 = Math.max(0, Math.floor(cx - rx))
    const x1 = Math.min(S - 1, Math.ceil(cx + rx))
    const y0 = Math.max(0, Math.floor(cy - ry))
    const y1 = Math.min(S - 1, Math.ceil(cy + ry))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry) // chuẩn hoá ellipse → 1 tại mép cọ
        if (d >= 1) continue
        const t = 1 - d * d * (3 - 2 * d) // 1 - smoothstep — tâm 1, mép 0
        const i = (y * S + x) * 4 + ch
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

  /** Serialize raw RGBA → base64 cho state JSON; null nếu mask TRẮNG (chưa vẽ gì → đừng phình save). */
  toBase64(): string | null {
    if (this.data.every((b) => b === 0)) return null
    let s = ''
    for (let i = 0; i < this.data.length; i += 8192) {
      s += String.fromCharCode(...this.data.subarray(i, i + 8192)) // chunk — né stack overflow spread lớn
    }
    return btoa(s)
  }

  /** Nạp lại mask từ base64 (state load). Length lệch (đổi size giữa 2 version) → bỏ qua, giữ trắng. */
  loadBase64(b64: string): void {
    let raw: string
    try {
      raw = atob(b64)
    } catch {
      return // chuỗi hỏng → giữ mask trắng, không throw vỡ load state
    }
    if (raw.length !== this.data.length) return
    for (let i = 0; i < raw.length; i++) this.data[i] = raw.charCodeAt(i)
    this.texture.needsUpdate = true
  }

  dispose(): void {
    this.texture.dispose()
  }
}
