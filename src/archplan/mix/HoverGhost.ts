/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/mix/HoverGhost.ts
 * VAI TRÒ  — VIỀN MỜ SÁNG vật thể dưới con trỏ khi đang cầm xô 🪣/🧽/🎯 (NgQuan 2026-06-11 "trỏ vào
 *            đâu cũng không biết — rê tới đâu tạo viền mờ sáng ở vật thể đó"): phủ ghost mesh
 *            TRANSPARENT lên đúng object resolver xô sẽ trúng — biết trước click sẽ ăn gì.
 * LIÊN HỆ  — Lab tạo + bơm vào MixManager qua deps.hoverGhost; manager gọi show(obj)/show(null)
 *            theo _resolveAt mỗi pointermove (chỉ khi đổi đích). Toggle ✨ ở khay (PresetPanel).
 *
 * CÁCH DÙNG: const g = new HoverGhost(scene); g.show(obj | null); g.dispose()
 *            Ghost SHARE geometry với mesh gốc (zero cost dựng) — chỉ tạo Mesh wrapper + matrixWorld.
 * DISPOSE: dispose() — clear() gỡ group (KHÔNG dispose geometry — của mesh gốc) + dispose material chung.
 */

import * as THREE from 'three'

export class HoverGhost {
  private group: THREE.Group | null = null
  // Vàng nhạt, depthTest OFF → thấy cả khi đích sau vật khác (mục đích = BIẾT đang trỏ gì, như
  // wireframe HighlightOverlay); depthWrite off + additive nhẹ qua opacity thấp — không cháy texture.
  private readonly mat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8,
    transparent: true,
    opacity: 0.16,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  constructor(private readonly scene: THREE.Scene) {}

  /** Phủ ghost lên mọi Mesh dưới root (root = mesh đơn / group rào / pick-box segment). null = tắt. */
  show(root: THREE.Object3D | null): void {
    this.clear()
    if (!root) return
    const group = new THREE.Group()
    group.matrixAutoUpdate = false // con mang SẴN matrixWorld — group giữ identity
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const m = new THREE.Mesh(o.geometry, this.mat) // SHARE geometry — không copy, không dispose
      m.matrixAutoUpdate = false
      m.matrix.copy(o.matrixWorld) // scene render mỗi frame → matrixWorld của nguồn luôn tươi
      m.renderOrder = 998 // dưới wireframe highlight (999), trên mọi mesh thường
      group.add(m)
    })
    this.scene.add(group)
    this.group = group
  }

  clear(): void {
    if (!this.group) return
    this.scene.remove(this.group) // geometry của mesh gốc — KHÔNG dispose ở đây
    this.group = null
  }

  dispose(): void {
    this.clear()
    this.mat.dispose()
  }
}
