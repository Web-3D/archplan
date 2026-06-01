/**
 * VỊ TRÍ   — archplan/src/archplan/interaction/highlight.ts
 * VAI TRÒ  — Flash viền wireframe vàng NHẠT quanh phần đang chỉnh (click tab GUI) ~0.6s.
 *            Box xoay đúng heading (computeWallConfigs); section = footprint band. Đọc state hiện
 *            tại → khớp geometry đang hiện (KHÔNG đụng merge của building).
 * LIÊN HỆ  — Tách từ ArchPlanLab. Host cấp: scene + locateInst + instWallBase (3 locator dùng chung
 *            với build/paint nên ở lại host). computeWallConfigs/footprintXZ lấy từ build/build.
 *
 * CÁCH DÙNG:
 *   const hi = new HighlightOverlay(host)
 *   hi.show({ kind: 'wall', instId, segIdx })   // ctx.highlightPart delegate vào đây
 *   hi.clear()
 *   hi.dispose()                                 // onDispose
 *
 * DISPOSE: clear() gỡ group + dispose geo line; dispose() thêm dispose material chung.
 */

import * as THREE from 'three'

import { computeWallConfigs, footprintXZ } from '../build/build'
import type { HighlightTarget } from '../gui/gui'
import type { ShapeInstance, WallConfig } from '../state/state'

export interface HighlightHost {
  readonly scene: THREE.Scene
  locateInst(instId: string): { inst: ShapeInstance; fi: number } | null
  instWallBase(inst: ShapeInstance, fi: number): number
}

export class HighlightOverlay {
  private group: THREE.Group | null = null
  private mat: THREE.LineBasicMaterial | null = null
  private timers: number[] = []
  private isDisposed = false

  constructor(private readonly host: HighlightHost) {}

  // Click tab Wall i / open / col / Struct / Roof / Foundation / Slab / Stairs / Balcony / Walls.
  show(t: HighlightTarget): void {
    const loc = this.host.locateInst(t.instId)
    if (!loc) return
    const lines = this._wires(t, loc.inst, loc.fi)
    this.clear()
    if (lines.length === 0) return
    const group = new THREE.Group()
    for (const l of lines) group.add(l)
    this.host.scene.add(group)
    this.group = group
    this._blink()
  }

  clear(): void {
    for (const id of this.timers) {
      window.clearTimeout(id)
      window.clearInterval(id)
    }
    this.timers = []
    if (!this.group) return
    this.host.scene.remove(this.group)
    this.group.traverse((o) => {
      if (o instanceof THREE.LineSegments) o.geometry.dispose()
    })
    this.group = null
  }

  dispose(): void {
    if (this.isDisposed) return
    this.clear()
    this.mat?.dispose()
    this.mat = null
    this.isDisposed = true
  }

  private _wires(t: HighlightTarget, inst: ShapeInstance, fi: number): THREE.Object3D[] {
    const base = this.host.instWallBase(inst, fi)
    const configs = computeWallConfigs(inst, base)
    if (t.kind === 'wall') return this._wireBox(configs[t.segIdx])
    if (t.kind === 'walls') return configs.flatMap((c) => this._wireBox(c))
    if (t.kind === 'open') return this._wireOpen(configs[t.segIdx], inst, t.segIdx, t.opIdx)
    if (t.kind === 'col') return this._wireCol(inst, base, t.colIdx)
    if (t.kind === 'stairs') return this._wireStairs(inst, base)
    if (t.kind === 'balcony') return this._wireBalcony(configs, inst, base, t.balconyIdx)
    return this._wireFootprint(t.kind, configs, inst, base) // struct/roof/foundation/slab
  }

  // Nhấp nháy NHẠT ~0.6s: opacity 0.5↔0.16 mỗi 150ms (không tắt hẳn → dịu), rồi tự dọn.
  private _blink(): void {
    const mat = this._material()
    mat.opacity = 0.5
    this.timers.push(
      window.setInterval(() => {
        mat.opacity = mat.opacity > 0.34 ? 0.16 : 0.5
      }, 150)
    )
    this.timers.push(window.setTimeout(() => this.clear(), 600))
  }

  private _material(): THREE.LineBasicMaterial {
    if (!this.mat) {
      // Vàng, NHẠT (opacity thấp) + depthTest off → luôn thấy dù phần đó sau tường khác.
      this.mat = new THREE.LineBasicMaterial({
        color: 0xffd54a,
        depthTest: false,
        transparent: true,
        opacity: 0.5,
      })
    }
    return this.mat
  }

  // Viền box XOAY quanh tâm (cx,cy,cz) cỡ (sx,sy,sz), xoay rotDeg quanh Y. Helper chung mọi phần.
  private _oriented(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    rotDeg: number
  ): THREE.LineSegments {
    const box = new THREE.BoxGeometry(sx, sy, sz)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    const line = new THREE.LineSegments(edges, this._material())
    line.position.set(cx, cy, cz)
    line.rotation.y = (rotDeg * Math.PI) / 180
    line.renderOrder = 999
    return line
  }

  // 1 tường: box ôm sát đúng vị trí/heading từ WallConfig.
  private _wireBox(cfg: WallConfig | undefined): THREE.Object3D[] {
    if (!cfg) return []
    return [
      this._oriented(
        cfg.xOffset,
        cfg.yBase + cfg.h / 2,
        cfg.zOffset,
        cfg.w,
        cfg.h,
        cfg.depth,
        cfg.rotationY
      ),
    ]
  }

  // 1 cửa/sổ: box tại đúng vị trí lỗ trên tường (local x dọc tường → world qua heading).
  private _wireOpen(
    cfg: WallConfig | undefined,
    inst: ShapeInstance,
    segIdx: number,
    opIdx: number
  ): THREE.Object3D[] {
    const op = inst.segments[segIdx]?.openings[opIdx]
    if (!cfg || !op) return []
    const lx = (op.x + op.w / 2) / 1000 - cfg.w / 2
    const th = (cfg.rotationY * Math.PI) / 180
    const wx = cfg.xOffset + lx * Math.cos(th)
    const wz = cfg.zOffset - lx * Math.sin(th)
    const wy = cfg.yBase + (op.yOffset + op.h / 2) / 1000
    return [this._oriented(wx, wy, wz, op.w / 1000, op.h / 1000, cfg.depth + 0.06, cfg.rotationY)]
  }

  // 1 cột (col 1/2/3): box tại world pos cột (khớp _buildColumnsForInstance).
  private _wireCol(inst: ShapeInstance, base: number, colIdx: number): THREE.Object3D[] {
    const col = inst.structure.columns[colIdx]
    if (!col) return []
    const th = (inst.rotY * Math.PI) / 180
    const cosR = Math.cos(th)
    const sinR = Math.sin(th)
    const cx = (col.x / 1000) * cosR - (col.z / 1000) * sinR + inst.posX / 1000
    const cz = (col.x / 1000) * sinR + (col.z / 1000) * cosR + inst.posZ / 1000
    const sz = (col.type === 'round' ? col.r * 2 : col.size) / 1000
    return [this._oriented(cx, base + col.h / 2000, cz, sz, col.h / 1000, sz, 0)]
  }

  private _wireStairs(inst: ShapeInstance, base: number): THREE.Object3D[] {
    const s = inst.structure.stairs
    const th = (inst.rotY * Math.PI) / 180
    const cx = (s.x / 1000) * Math.cos(th) - (s.z / 1000) * Math.sin(th) + inst.posX / 1000
    const cz = (s.x / 1000) * Math.sin(th) + (s.z / 1000) * Math.cos(th) + inst.posZ / 1000
    const hm = inst.segments.length ? Math.max(...inst.segments.map((g) => g.wallH)) / 1000 : 3
    return [
      this._oriented(
        cx,
        base + hm / 2,
        cz,
        s.runL / 1000,
        hm,
        s.width / 1000,
        inst.rotY + s.rotDeg
      ),
    ]
  }

  // Ban công: box ôm sàn+lan can, đặt ngoài mặt tường (khớp makePositionedBalcony).
  private _wireBalcony(
    configs: WallConfig[],
    inst: ShapeInstance,
    base: number,
    balconyIdx: number
  ): THREE.Object3D[] {
    const b = inst.structure.balconies[balconyIdx]
    const cfg = configs[b?.wallIdx ?? 0]
    if (!b || !cfg) return []
    const lx = (b.x + b.width / 2) / 1000 - cfg.w / 2
    const lz = cfg.depth / 2 + b.depth / 2000
    const th = (cfg.rotationY * Math.PI) / 180
    const wx = cfg.xOffset + lx * Math.cos(th) + lz * Math.sin(th)
    const wz = cfg.zOffset - lx * Math.sin(th) + lz * Math.cos(th)
    const wy = base + b.y / 1000 + (b.railH - b.slabT) / 2000
    const sy = (b.railH + b.slabT) / 1000
    return [this._oriented(wx, wy, wz, b.width / 1000, sy, b.depth / 1000, cfg.rotationY)]
  }

  // Section footprint band ở cao độ tương ứng: roof=đỉnh, foundation=dưới base, slab=tại base,
  // struct=full chiều cao tường (toàn kết cấu).
  private _wireFootprint(
    kind: 'struct' | 'roof' | 'foundation' | 'slab',
    configs: WallConfig[],
    inst: ShapeInstance,
    base: number
  ): THREE.Object3D[] {
    const fp = footprintXZ(configs)
    const maxH = configs.length ? Math.max(...configs.map((c) => c.h)) : 3
    if (kind === 'roof') {
      const rh = inst.roof.show ? 1.5 : 0.4
      return [this._oriented(fp.cx, base + maxH + rh / 2, fp.cz, fp.sx, rh, fp.sz, 0)]
    }
    if (kind === 'foundation') {
      const fh = inst.structure.foundH / 1000
      return [this._oriented(fp.cx, base - fh / 2, fp.cz, fp.sx, fh, fp.sz, 0)]
    }
    if (kind === 'slab') {
      const st = inst.structure.slabThick / 1000
      return [this._oriented(fp.cx, base + st / 2, fp.cz, fp.sx, st, fp.sz, 0)]
    }
    return [this._oriented(fp.cx, base + maxH / 2, fp.cz, fp.sx, maxH, fp.sz, 0)] // struct
  }
}
