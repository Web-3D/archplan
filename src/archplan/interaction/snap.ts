/**
 * VỊ TRÍ   — archplan/src/archplan/interaction/snap.ts
 * VAI TRÒ  — Snap nam-châm khi kéo khối shape (giữ Ctrl): hít MẶT NGOÀI khối vào khối kề cùng tầng +
 *            canh thẳng mép vuông góc — như Sims/Planet Coaster. Pure math (mét, world), KHÔNG Three/DOM.
 * LIÊN HỆ  — Dùng bởi ManipulateTool.dragMove (Move mode, nhánh kéo-cả-nhà). AABB từ computeLocalBbox (lõi).
 *
 * CÁCH DÙNG:
 *   const { dx, dz } = snapDelta(instAABB(drag), sibs.map(instAABB), FLUSH, ALIGN) // Δ mét → cộng vào posX/posZ
 */

import { computeLocalBbox } from 'building-kit/build'

import type { ShapeInstance } from '../state/state'

// AABB MẶT NGOÀI 1 khối trong world (mét). rotY ∈ {0,90,180,270} → luôn axis-aligned.
export interface AABB {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// World AABB MẶT NGOÀI: bbox tim-tường (computeLocalBbox) nới wallDepth/2 mỗi phía → 2 khối hít nhau = MẶT
// ngoài chạm (không z-fight, không chồng tường). 90/270 hoán w↔d. Tâm = posX/posZ.
export function instAABB(inst: ShapeInstance): AABB {
  const { w, d } = computeLocalBbox(inst)
  const t = inst.wallDepth / 1000
  const swap = inst.rotY === 90 || inst.rotY === 270
  const hw = (swap ? d : w) / 2 + t / 2
  const hd = (swap ? w : d) / 2 + t / 2
  const cx = inst.posX / 1000
  const cz = inst.posZ / 1000
  return { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd }
}

const overlap = (aLo: number, aHi: number, bLo: number, bHi: number): boolean =>
  aLo < bHi && aHi > bLo

// Δ (mét) hít khối `d` vào MẶT NGOÀI 1 khối kề + canh thẳng mép trục vuông góc. flush = ngưỡng hít mặt;
// align = ngưỡng canh mép. {0,0} nếu không khối nào trong tầm. Chọn flush cần dịch ÍT nhất (nam châm gần nhất).
export function snapDelta(
  d: AABB,
  others: AABB[],
  flush: number,
  align: number
): { dx: number; dz: number } {
  const cands: { axis: 'x' | 'z'; delta: number; o: AABB }[] = []
  for (const o of others) {
    if (overlap(d.minZ, d.maxZ, o.minZ, o.maxZ)) {
      cands.push({ axis: 'x', delta: o.minX - d.maxX, o }) // mặt phải d ↔ mặt trái o
      cands.push({ axis: 'x', delta: o.maxX - d.minX, o }) // mặt trái d ↔ mặt phải o
    }
    if (overlap(d.minX, d.maxX, o.minX, o.maxX)) {
      cands.push({ axis: 'z', delta: o.minZ - d.maxZ, o })
      cands.push({ axis: 'z', delta: o.maxZ - d.minZ, o })
    }
  }
  let best: { axis: 'x' | 'z'; delta: number; o: AABB } | null = null
  for (const c of cands) {
    if (Math.abs(c.delta) <= flush && (!best || Math.abs(c.delta) < Math.abs(best.delta))) best = c
  }
  if (!best) return { dx: 0, dz: 0 }
  if (best.axis === 'x') {
    return { dx: best.delta, dz: alignEdge(d.minZ, d.maxZ, best.o.minZ, best.o.maxZ, align) }
  }
  return { dx: alignEdge(d.minX, d.maxX, best.o.minX, best.o.maxX, align), dz: best.delta }
}

// Canh mép trục vuông góc: hít mép-thấp↔thấp HOẶC cao↔cao (cái gần hơn) trong ngưỡng → mặt trước 2 khối phẳng. 0 nếu xa.
function alignEdge(dLo: number, dHi: number, oLo: number, oHi: number, align: number): number {
  const lo = oLo - dLo
  const hi = oHi - dHi
  const best = Math.abs(lo) < Math.abs(hi) ? lo : hi
  return Math.abs(best) <= align ? best : 0
}
