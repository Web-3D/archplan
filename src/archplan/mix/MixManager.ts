/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/mix/MixManager.ts
 * VAI TRÒ  — Hệ MIX NỀN (PhotoGroundMix) tách khỏi ArchPlanLab (Mảnh −1 plan palette):
 *            cache material per-params (8 đích: G0/zone/đáy-vách hồ/fence/tường building/sàn/móng),
 *            cọ vẽ mask, rule trọng lực, prune theo state.
 * LIÊN HỆ  — ArchPlanLab giữ thin delegate: deps bơm qua constructor (1 CHIỀU — manager KHÔNG
 *            import Lab). GUI board (gui/site.ts) gọi qua APGuiCtx callbacks → Lab → manager.
 *            Palette/preset/bucket (mảnh 0-4) sẽ cấy VÀO đây, không vào Lab.
 *
 * CÁCH DÙNG: const mix = new MixManager(deps)
 *   - matFor(target) — material mix cho 1 target (gọi từ _siteTexOpts + callbacks building render)
 *   - prune() — dọn cache mỗi lần gom opts (params rời state)
 *   - strokeStart/Move/End(e) — pointer handlers cọ vẽ (Lab dispatch khi paintOn/stroking)
 *   - setPaint/paintOff/clearPaint/tuneLive/getPaint/getBrush/setBrush/registerSync — GUI ctx
 * DISPOSE: dispose() — gmix material + PaintMask DataTexture của mọi entry cache.
 */

import * as THREE from 'three'
import type { PhotoGroundMaps } from 'threejs-modules/shaders/ground/PhotoGround'
import { PhotoGroundMix } from 'threejs-modules/shaders/ground/PhotoGroundMix'
import { pondWorldXZ } from 'threejs-modules/site/render/fromState'
import { shapeToLocalPolygon } from 'threejs-modules/site/shapes'
import {
  type GroundLayer,
  type GroundMaterialKey,
  type GroundMixParams,
  isGroundTexKey,
  type SiteState,
  type WaterConfig,
} from 'threejs-modules/site/state'

import type { MixPaintTarget } from '../gui/ctx'
import { PaintMask } from '../gui/ground-paint'
import type { BuildingState, ShapeInstance } from '../state/state'

/** 1 entry cache mix: material + sig structural + mask vẽ tay (sống qua rebuild material). */
type MixEntry = { gmix: PhotoGroundMix; sig: string; pm: PaintMask }

/**
 * Deps Lab bơm vào — closures lazy (chỉ chạy khi gọi), nên Lab khởi tạo manager ở field
 * initializer được dù site/state/controls gán sau. site()/state() là GETTER vì Lab REASSIGN
 * 2 object này khi load/undo/redo — giữ ref cũ là đọc state chết.
 */
export interface MixManagerDeps {
  site(): SiteState
  state(): BuildingState
  /** Maps texture ĐÃ LOAD của key — chưa load: kick-off async (re-render khi xong) + trả null. */
  mapsOf(key: GroundMaterialKey): PhotoGroundMaps | null
  /** tileSizeMeters theo GROUND_TEX_SPEC của Lab (manager không giữ bảng spec). */
  tileOf(key: GroundMaterialKey): number
  /** Raycast từ camera qua điểm chuột vào siteGroup (recursive) — manager tự filter mesh target. */
  raycastHits(e: PointerEvent): THREE.Intersection[]
  /** Persist state+site (buông nét cọ / xóa nét). */
  autosave(): void
  /** Tắt 3 mode loại trừ (pick/move/paint) khi bật mode vẽ mix / 🪣. */
  offOtherModes(): void
  /** Khóa/mở orbit theo mode vẽ (true = khóa). */
  lockOrbit(locked: boolean): void
  /** 🪣 Raycast pick-box BUILDING (ud: instId + segIdx tường / key 'found'|'slab'|'roof'|'stairs'). */
  buildingHits(e: PointerEvent): THREE.Intersection[]
  /** 🪣 Raycast group RÀO (mesh con — walk-up cha tìm userData.fenceIdx). */
  fenceHits(e: PointerEvent): THREE.Intersection[]
  /** 🪣 Commit hệ SITE sau khi áp (G0/zone/hồ/rào) — applySite(true). */
  commitSite(): void
  /** 🪣 Commit hệ BUILDING sau khi áp (tường/móng/sàn) — ctx.build (history + persist + render). */
  commitBuilding(): void
  /** 🪣 Cursor hint trên canvas khi mode xô bật ('copy') / tắt (''). */
  bucketCursor(on: boolean): void
}

export class MixManager {
  // 🎨 PhotoGroundMix CACHE — key = chính OBJECT GroundMixParams (stage 4: target nhân ra zone/'base'/hồ
  // floor+wall/fence → wrapper target không stable, nhưng params object SỐNG TẠI CHỖ trong state qua rebuild).
  // sig = CHỈ keys texture + rule (stage 3: bias/seed/paint-rect = uniform live) — đổi sig = dựng lại material
  // (pm GIỮ). pm = PaintMask 128² mask vẽ tay — sống cùng entry, dispose khi params rời state (prune)/dispose.
  private readonly _cache = new Map<GroundMixParams, MixEntry>()
  // 🖌 Mode VẼ MASK mix: target + slot đang vẽ (null = tắt); _stroking = đang giữ chuột kéo nét.
  // Bật = orbit khóa (như paintMode SPIKE); pointer raycast mesh target → uv bbox → pm.stamp. Buông = persist.
  private _paint: { target: MixPaintTarget; slot: number } | null = null
  private _stroking = false
  private readonly _brush = { size: 0.6, erase: false } // cọ: bán kính m world + chế độ tẩy (UI board đẩy vào)
  private _syncPaint: (() => void) | null = null // UI đăng ký — bỏ highlight 🖌 khi mode bị tắt từ ngoài
  // 🪣 Mode XÔ ÁP preset (Mảnh 3 plan palette): cầm mix NGUỒN (ref preset sống — sửa ✎ xong áp lấy bản mới)
  // → click 3D = structuredClone vào field mix của đích (chốt: CLONE — file save tự chứa). KHÔNG khóa
  // orbit (click đơn <5px qua _maybeClickFocus; kéo = orbit như thường). null = tắt.
  private _bucket: GroundMixParams | null = null
  private _syncBucket: (() => void) | null = null // PresetPanel đăng ký — sync nút 🪣 khi tắt từ ngoài

  constructor(private readonly deps: MixManagerDeps) {}

  // ── 🎨 MATERIAL — cache per-params, build/uniform live ─────────────────────────────────────────────

  // Gom maps đã-load cho base + slots của 1 mix — key màu phẳng hoặc maps chưa load (kick-off async) → null.
  private _mapSets(keys: GroundMaterialKey[]): PhotoGroundMaps[] | null {
    const sets: PhotoGroundMaps[] = []
    for (const k of keys) {
      if (!isGroundTexKey(k)) return null // key màu phẳng (soil/gravel…) — mix chỉ nhận texture
      const maps = this.deps.mapsOf(k) // chưa load: deps kick-off → re-render → lượt sau đủ maps
      if (!maps) return null
      sets.push(maps)
    }
    return sets
  }

  // 🖌 Params mix của 1 target — zone: layer.mix · 'base': site.groundMix · hồ: floorMix/wallMix · rào: f.mix.
  // undefined = mix tắt.
  private _paramsOf(target: MixPaintTarget): GroundMixParams | undefined {
    if (target === 'base') return this.deps.site().groundMix
    if ('water' in target)
      return target.face === 'floor' ? target.water.floorMix : target.water.wallMix
    if ('fence' in target) return target.fence.mix
    if ('wallMix' in target) return target.wallMix // generic mặt đứng (tường building seg.mix, foundMix…)
    if ('flatMix' in target) return target.flatMix // generic mặt nằm (slabMix sàn building…)
    return target.mix
  }

  // 🖌 Entry cache mix của target. undefined = mix tắt / chưa dựng.
  private _hitOf(target: MixPaintTarget): MixEntry | undefined {
    const p = this._paramsOf(target)
    return p ? this._cache.get(p) : undefined
  }

  // 🎨 Hệ tọa độ trải mix của target: mặt NẰM (zone/'base'/đáy hồ) = 'xz' world; vách hồ = 'uv' (chu-vi×cao
  // mét baked); tường rào = 'wall' (planar đứng theo normal — KHÔNG cọ vẽ).
  private _spaceOf(target: MixPaintTarget): 'xz' | 'uv' | 'wall' {
    if (typeof target === 'string') return 'xz'
    if ('water' in target) return target.face === 'wall' ? 'uv' : 'xz'
    if ('fence' in target || 'wallMix' in target) return 'wall'
    return 'xz'
  }

  // 🎨 Material MIX cho 1 target (zone Z1+ · 'base' · đáy/vách hồ · tường rào): maps đủ (base + slots, đều
  // phải key TEXTURE) → PhotoGroundMix cache theo params; thiếu maps → kick-off load + null (rơi material đơn tạm).
  matFor(target: MixPaintTarget): THREE.Material | null {
    const mix = this._paramsOf(target)
    if (!mix) return null
    const keys = [mix.base, ...mix.slots.map((s) => s.key)]
    const sets = this._mapSets(keys)
    if (!sets) return null
    // Stage 3: sig keys texture + 🧱 rule per-slot (rule bake vào graph — đổi = structural như đổi texture);
    // bias/seed/gravity/paint-rect/wall-range = uniform live → kéo slider KHÔNG dựng lại material.
    const sig = JSON.stringify([keys, mix.slots.map((s) => s.rule ?? null)])
    let hit = this._cache.get(mix)
    if (!hit || hit.sig !== sig) hit = this._buildEntry(target, mix, sets, sig, hit)
    this._applyUniforms(hit.gmix, mix)
    this._applyPaintRect(hit.gmix, target)
    this._applyWallRange(hit.gmix, target) // 🧱 dải cao tường cho rule trọng lực (mặt đứng)
    return hit.gmix.getMaterial()
  }

  // Dựng entry cache mix mới (texture/slot đổi hoặc lần đầu) — pm SỐNG qua rebuild (đổi texture không mất nét vẽ).
  private _buildEntry(
    target: MixPaintTarget,
    mix: GroundMixParams,
    sets: PhotoGroundMaps[],
    sig: string,
    old: MixEntry | undefined
  ): MixEntry {
    const pm = old?.pm ?? this._makePaint(mix)
    old?.gmix.dispose()
    const space = this._spaceOf(target)
    const gmix = new PhotoGroundMix({
      base: sets[0],
      slots: mix.slots.map((s, i) => ({
        maps: sets[i + 1],
        bias: s.bias,
        seed: s.seed,
        rule: s.rule, // 🧱 rule trọng lực per-slot (chỉ ăn mặt đứng)
      })),
      paint: pm.texture,
      tileSizeMeters: this.deps.tileOf(mix.base),
      mapping: space, // stage 4: 'xz' nằm · 'uv' vách hồ · 'wall' tường rào
    })
    if (space === 'uv') gmix.getMaterial().side = THREE.DoubleSide // vách hồ nhìn cả 2 phía (như basinMaterial)
    const hit = { gmix, sig, pm }
    this._cache.set(mix, hit)
    return hit
  }

  // 🖌 PaintMask 128² cho 1 target mới vào cache — có base64 trong state (load/reload) → nạp lại nét vẽ.
  private _makePaint(mix: GroundMixParams): PaintMask {
    const pm = new PaintMask(128) // 128² đủ vạt/lối mòn per-target, base64 ~87KB (Lab giữ 256² cho sàn 12m)
    if (mix.paint) pm.loadBase64(mix.paint)
    return pm
  }

  // Đẩy bộ uniform LIVE của mix vào material (mỗi lần build site / kéo slider — rẻ, không recompile).
  private _applyUniforms(g: PhotoGroundMix, m: NonNullable<GroundLayer['mix']>): void {
    g.set('maskScale', m.maskScale)
    g.set('maskSoft', m.maskSoft)
    g.set('heightK', m.heightK)
    g.set('macro', m.macro)
    g.set('tint', m.tint)
    g.set('bomb', m.bomb)
    g.set('rotFree', m.rotFree)
    g.set('seed', m.seed)
    g.set('scaleJit', m.scaleJit)
    g.set('margin', m.margin)
    g.set('farOn', m.farOn)
    g.set('farRange', m.farRange)
    g.set('gravity', m.gravity) // 🧱 cường độ rule trọng lực (uniform live — mặt nằm không có rule → no-op)
    m.slots.forEach((s, i) => g.setSlot(i, s.bias, s.seed)) // 🖌 stage 3: per-slot uniform (Ngưỡng live)
  }

  // 🧱 Dải cao tường cho rule trọng lực: vách hồ = (yBot, depth) — khớp _waterRect; rào = (mặt nền, height).
  // Mặt nằm ('xz') không có rule → bỏ qua. Tường building set range ở wallMixMat (assembler biết yBase/h).
  private _applyWallRange(g: PhotoGroundMix, target: MixPaintTarget): void {
    if (typeof target === 'string') return
    if ('water' in target && target.face === 'wall') {
      const rimY = this.deps.site().groundThick / 1000
      g.setWallRange(rimY - target.water.depthY / 1000, target.water.depthY / 1000)
    } else if ('fence' in target) {
      g.setWallRange(this.deps.site().groundThick / 1000, target.fence.height / 1000)
    }
  }

  // 🎨 Material MIX cho 1 TƯỜNG BUILDING (callback từ wallAssembly — nhận params + dải cao tường thật
  // của place). Target generic { wallMix } → cache/space/prune đi đường chung; range set tại đây
  // (assembler biết yBase/h — Lab không phải tự suy floor stacking).
  wallMixMat(mix: GroundMixParams, range: { footY: number; h: number }): THREE.Material | null {
    const mat = this.matFor({ wallMix: mix })
    if (mat) this._cache.get(mix)?.gmix.setWallRange(range.footY, range.h)
    return mat
  }

  // ── 🖌 RECT MASK — hệ quy chiếu mask vẽ per-target ─────────────────────────────────────────────────

  // 🖌 BBox world-XZ của zone (m) — rect uv cho mask vẽ: shader + stamp dùng CÙNG công thức (world−o)/s.
  private _zoneRect(layer: GroundLayer): { ox: number; oz: number; sx: number; sz: number } {
    const local = shapeToLocalPolygon({
      shape: layer.shape ?? 'rect',
      width: layer.length,
      depth: layer.width,
      points: layer.points ?? [],
    })
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of local) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
    return {
      ox: layer.offsetX / 1000 + minX,
      oz: layer.offsetZ / 1000 + minZ,
      sx: maxX - minX,
      sz: maxZ - minZ,
    }
  }

  // 🖌 Rect mask của hồ: floor = bbox world-XZ outline; wall = KHÔNG-GIAN UV mét (u: 0..chu-vi, v: yBot..rim —
  // khớp uv baked basinWallsGeometry, stamp dùng isect.uv cùng hệ).
  private _waterRect(t: { water: WaterConfig; face: 'floor' | 'wall' }): {
    ox: number
    oz: number
    sx: number
    sz: number
  } {
    const pts = pondWorldXZ(t.water)
    if (t.face === 'floor') {
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (const p of pts) {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minZ = Math.min(minZ, p.z)
        maxZ = Math.max(maxZ, p.z)
      }
      return { ox: minX, oz: minZ, sx: maxX - minX, sz: maxZ - minZ }
    }
    let perim = 0
    for (let i = 0; i < pts.length; i++) {
      const b = pts[(i + 1) % pts.length]
      perim += Math.hypot(b.x - pts[i].x, b.z - pts[i].z)
    }
    const rimY = this.deps.site().groundThick / 1000 // khớp buildBasin (đỉnh vách = mặt nền)
    const yBot = rimY - t.water.depthY / 1000
    return { ox: 0, oz: yBot, sx: perim, sz: rimY - yBot }
  }

  // 🖌 Rect mask của target: zone = bbox shape; 'base' = NGUYÊN LÔ; hồ = _waterRect; rào = đơn vị (không
  // cọ vẽ — mapping 'wall' bỏ qua paint, rect chỉ để setPaintRect không chia 0).
  private _rectOf(target: MixPaintTarget): { ox: number; oz: number; sx: number; sz: number } {
    if (target === 'base') {
      const sx = this.deps.site().lotWidth / 1000
      const sz = this.deps.site().lotDepth / 1000
      return { ox: -sx / 2, oz: -sz / 2, sx, sz }
    }
    if ('water' in target) return this._waterRect(target)
    if ('fence' in target || 'wallMix' in target || 'flatMix' in target)
      return { ox: 0, oz: 0, sx: 1, sz: 1 }
    return this._zoneRect(target)
  }

  private _applyPaintRect(g: PhotoGroundMix, target: MixPaintTarget): void {
    const r = this._rectOf(target)
    g.setPaintRect(r.ox, r.oz, r.sx, r.sz) // uniform live — zone dời/resize/lô đổi cỡ chỉ set lại, không recompile
  }

  // ── 🎨 PRUNE — dọn cache theo state sống ───────────────────────────────────────────────────────────

  // 🎨 Tập GroundMixParams đang SỐNG trong state (mọi nguồn: G0 + zones + hồ floor/wall + rào) — chuẩn prune.
  private _liveParams(): Set<GroundMixParams> {
    const site = this.deps.site()
    const live = new Set<GroundMixParams>()
    if (site.groundMix) live.add(site.groundMix)
    for (const l of site.groundLayers ?? []) if (l.mix) live.add(l.mix)
    for (const w of site.waters) {
      if (w.floorMix) live.add(w.floorMix)
      if (w.wallMix) live.add(w.wallMix)
    }
    for (const f of site.fences) if (f.mix) live.add(f.mix)
    this._collectBuildingMix(live) // 🎨 tường building (seg.mix) — tách hàm (complexity)
    return live
  }

  // 🎨 Gom mix params tường BUILDING (mọi floor → instance → segment) vào set sống.
  private _collectBuildingMix(live: Set<GroundMixParams>): void {
    const insts = this.deps.state().floors.flatMap((fl) => fl.instances)
    for (const inst of insts) {
      for (const seg of inst.segments) if (seg.mix) live.add(seg.mix)
      if (inst.structure.slabMix) live.add(inst.structure.slabMix) // 🎨 sàn
      if (inst.structure.foundMix) live.add(inst.structure.foundMix) // 🎨 móng concrete
    }
  }

  // Dọn cache mix có params đã RỜI state (zone xóa / mix tắt / hồ-rào xóa) — gọi mỗi lần gom opts.
  // Đang vẽ đúng target vừa rời → thoát mode (UI bỏ highlight qua sync).
  prune(): void {
    const live = this._liveParams()
    for (const k of [...this._cache.keys()]) {
      if (live.has(k)) continue
      const v = this._cache.get(k)
      v?.gmix.dispose()
      v?.pm.dispose() // 🖌 DataTexture mask vẽ của target xóa
      this._cache.delete(k)
    }
    const cur = this._paint && this._paramsOf(this._paint.target)
    if (this._paint && (!cur || !live.has(cur))) this.paintOff()
  }

  // ── 🖌 VẼ MASK MIX per-target — mode + cọ + persist ────────────────────────────────────────────────

  /** Mode vẽ đang bật (pointer-down sẽ bắt nét). */
  get paintOn(): boolean {
    return this._paint !== null
  }

  /** Đang giữ chuột kéo nét (pointer-move stamp tiếp, pointer-up commit). */
  get stroking(): boolean {
    return this._stroking
  }

  /** Target+slot đang vẽ (GUI ctx getMixPaint — board highlight nút 🖌). */
  getPaint(): { target: MixPaintTarget; slot: number } | null {
    return this._paint
  }

  getBrush(): { size: number; erase: boolean } {
    return { ...this._brush }
  }

  setBrush(sizeM: number, erase: boolean): void {
    this._brush.size = sizeM
    this._brush.erase = erase
  }

  /** UI đăng ký callback đồng bộ highlight 🖌 khi mode bị tắt từ ngoài (mode khác bật / target xóa). */
  registerSync(fn: () => void): void {
    this._syncPaint = fn
  }

  // Bật/tắt mode vẽ: target ≠ null = vẽ slot đó (orbit khóa, tắt 3 mode kia + 🪣); null = thoát (orbit lại).
  setPaint(target: MixPaintTarget | null, slot: number): void {
    if (target) {
      this.deps.offOtherModes() // các setter mode bật lại orbit — khóa lại ngay dưới
      this.bucketOff() // 🪣 loại trừ với cọ
    }
    this._paint = target ? { target, slot } : null
    this._stroking = false
    this.deps.lockOrbit(!!target)
  }

  // Thoát mode vẽ từ NGOÀI (Move/Pick/Paint bật, zone xóa) — báo UI bỏ highlight 🖌. Không đụng orbit
  // (caller tự quản controls.enabled theo mode của nó).
  paintOff(): void {
    if (!this._paint) return
    this._paint = null
    this._stroking = false
    this._syncPaint?.()
  }

  /** Nhấn chuột khi paintOn: bắt đầu nét kéo + stamp dấu đầu (Lab đã setPointerCapture). */
  strokeStart(e: PointerEvent): void {
    this._stroking = true
    this._stampAt(e)
  }

  /** Kéo chuột đang stroking: stamp tiếp dọc nét. */
  strokeMove(e: PointerEvent): void {
    this._stampAt(e)
  }

  /** Buông nét → serialize mask vào state (base64) + autosave (mode vẫn bật, vẽ tiếp được). */
  strokeEnd(): void {
    this._stroking = false
    this._commitPaint()
  }

  // 🖌 Mesh có thuộc target đang vẽ không (raycast filter): 'base' = isBaseGround · zone = groundLayerIdx ·
  // hồ = ref WaterConfig + face (addBasinMesh tag) · rào = false (mapping 'wall' không cọ vẽ).
  private _meshMatch(t: MixPaintTarget, o: THREE.Object3D): boolean {
    if (t === 'base') return o.userData.isBaseGround === true
    if ('water' in t)
      return o.userData.waterMixRef === t.water && o.userData.waterMixFace === t.face
    if ('fence' in t || 'wallMix' in t || 'flatMix' in t) return false // generic không cọ vẽ
    const idx = (this.deps.site().groundLayers ?? []).indexOf(t)
    return o.userData.groundLayerIdx === idx
  }

  // 1 dấu cọ: raycast mesh ĐÚNG target đang vẽ → tọa độ theo SPACE ('xz' = world point · 'uv' = isect.uv mét
  // vách hồ) → normalize qua rect → stamp ellipse (bán kính m / size mỗi trục — không méo cọ).
  // Trượt ra ngoài target = không vẽ.
  private _stampAt(e: PointerEvent): void {
    const t = this._paint
    const hit = t ? this._hitOf(t.target) : undefined
    if (!t || !hit) return
    const isect = this.deps.raycastHits(e).find((h) => this._meshMatch(t.target, h.object))
    if (!isect) return
    const sp = this._spaceOf(t.target)
    if (sp === 'uv' && !isect.uv) return // vách thiếu uv (không xảy ra — basinWallsGeometry luôn bake)
    const cu = sp === 'uv' ? (isect.uv as THREE.Vector2).x : isect.point.x
    const cv = sp === 'uv' ? (isect.uv as THREE.Vector2).y : isect.point.z
    const r = this._rectOf(t.target)
    const b = this._brush
    hit.pm.stamp(
      (cu - r.ox) / Math.max(1e-6, r.sx),
      (cv - r.oz) / Math.max(1e-6, r.sz),
      b.size / Math.max(1e-6, r.sx),
      b.size / Math.max(1e-6, r.sz),
      t.slot,
      b.erase
    )
  }

  // Buông nét cọ → serialize mask vào state (base64, null nếu trắng → bỏ field) + autosave (reload còn nét).
  private _commitPaint(): void {
    const t = this._paint
    const hit = t ? this._hitOf(t.target) : undefined
    const mix = t ? this._paramsOf(t.target) : undefined
    if (!mix || !hit) return
    mix.paint = hit.pm.toBase64() ?? undefined
    this.deps.autosave()
  }

  // Nút "Xóa nét" của board: xóa kênh slot trong mask target + persist ngay (texture live, không cần rebuild).
  clearPaint(target: MixPaintTarget, slot: number): void {
    const hit = this._hitOf(target)
    const mix = this._paramsOf(target)
    if (!hit || !mix) return
    hit.pm.clear(slot)
    mix.paint = hit.pm.toBase64() ?? undefined
    this.deps.autosave()
  }

  // Kéo slider mix (Ngưỡng/Macro/…) → đẩy thẳng uniform vào material đang sống — KHÔNG rebuild site.
  tuneLive(target: MixPaintTarget): void {
    const hit = this._hitOf(target)
    const mix = this._paramsOf(target)
    if (hit && mix) this._applyUniforms(hit.gmix, mix)
  }

  // ── 🪣 XÔ ÁP PRESET — cầm mix nguồn, click 3D = CLONE vào đích (Mảnh 3-4) ──────────────────────────

  /** Mode 🪣 đang bật (click qua _maybeClickFocus sẽ áp thay vì focus GUI). */
  get bucketOn(): boolean {
    return this._bucket !== null
  }

  /** PresetPanel đăng ký sync nút 🪣 (mode tắt từ ngoài: Move/Pick/Paint/cọ bật, ESC, chuột phải). */
  registerBucketSync(fn: () => void): void {
    this._syncBucket = fn
  }

  // Bật 🪣 với mix nguồn (REF preset sống — sửa preset xong áp lấy bản mới) / null = tắt.
  // Bật = tắt 3 mode kia + cọ; KHÔNG khóa orbit (click đơn — kéo vẫn xoay được quanh nhà).
  setBucket(src: GroundMixParams | null): void {
    if (src) {
      this.deps.offOtherModes()
      this.paintOff()
    }
    this._bucket = src
    this.deps.bucketCursor(src !== null)
    this._syncBucket?.()
  }

  /** Thoát 🪣 từ NGOÀI (mode khác bật / ESC / chuột phải) — mirror paintOff, báo panel sync nút. */
  bucketOff(): void {
    if (!this._bucket) return
    this._bucket = null
    this.deps.bucketCursor(false)
    this._syncBucket?.()
  }

  // Click 3D khi 🪣 bật: ứng viên 3 lớp (pick-box building / rào / site) → lấy hit GẦN NHẤT map được
  // → CLONE preset vào field mix của đích + commit đúng hệ. false = click hụt (không áp gì).
  bucketApplyAt(e: PointerEvent): boolean {
    const src = this._bucket
    if (!src) return false
    const cands = [
      this._bucketBuilding(e, src),
      this._bucketFence(e, src),
      this._bucketSite(e, src),
    ]
      .filter((c): c is { dist: number; apply: () => void } => c !== null)
      .sort((a, b) => a.dist - b.dist) // stable: dist bằng → building > rào > site (thứ tự mảng)
    if (cands.length === 0) return false
    cands[0].apply()
    return true
  }

  // 🏠 Pick-box building: segIdx = tường (seg.mix) · key 'found'/'slab' = móng/sàn (structure).
  // 'roof'/'stairs' không nhận mix → null (nhường rào/site phía sau nếu gần hơn... thực tế mái che = không áp).
  private _bucketBuilding(
    e: PointerEvent,
    src: GroundMixParams
  ): { dist: number; apply: () => void } | null {
    const hit = this.deps.buildingHits(e)[0]
    if (!hit) return null
    const ud = hit.object.userData as { instId?: string; segIdx?: number; key?: string }
    const inst = typeof ud.instId === 'string' ? this._findInst(ud.instId) : null
    if (!inst) return null
    const set = this._bucketBuildingSet(inst, ud, src)
    if (!set) return null
    return {
      dist: hit.distance,
      apply: () => {
        set()
        this.deps.commitBuilding()
      },
    }
  }

  // Setter field mix theo ud — null nếu phần không nhận mix (roof/stairs). Tách (complexity).
  private _bucketBuildingSet(
    inst: ShapeInstance,
    ud: { segIdx?: number; key?: string },
    src: GroundMixParams
  ): (() => void) | null {
    if (typeof ud.segIdx === 'number' && inst.segments[ud.segIdx])
      return () => (inst.segments[ud.segIdx as number].mix = structuredClone(src))
    if (ud.key === 'found') return () => (inst.structure.foundMix = structuredClone(src))
    if (ud.key === 'slab') return () => (inst.structure.slabMix = structuredClone(src))
    return null
  }

  private _findInst(id: string): ShapeInstance | null {
    for (const fl of this.deps.state().floors)
      for (const inst of fl.instances) if (inst.id === id) return inst
    return null
  }

  // Walk-up cha tìm userData.fenceIdx (mesh con của fence group). −1 = không thuộc rào. Tách (max-depth).
  private _walkFenceIdx(obj: THREE.Object3D): number {
    let o: THREE.Object3D | null = obj
    while (o) {
      if (typeof o.userData.fenceIdx === 'number') return o.userData.fenceIdx as number
      o = o.parent
    }
    return -1
  }

  // 🧱 Rào: hit đầu thuộc rào → f.mix.
  private _bucketFence(
    e: PointerEvent,
    src: GroundMixParams
  ): { dist: number; apply: () => void } | null {
    for (const hit of this.deps.fenceHits(e)) {
      const idx = this._walkFenceIdx(hit.object)
      if (idx < 0) continue
      const f = this.deps.site().fences[idx]
      if (!f) return null
      return {
        dist: hit.distance,
        apply: () => {
          f.mix = structuredClone(src)
          this.deps.commitSite()
        },
      }
    }
    return null
  }

  // 🌳 Site: hit đầu tiên map được — đáy/vách hồ (waterMixRef/Face) > tầng zone (groundLayerIdx,
  // walk-up Group paving/wall) > nền lô G0 (isBaseGround). Mặt nước/cỏ không map → thử hit kế.
  private _bucketSite(
    e: PointerEvent,
    src: GroundMixParams
  ): { dist: number; apply: () => void } | null {
    for (const hit of this.deps.raycastHits(e)) {
      const set = this._bucketSiteSet(hit.object, src)
      if (set)
        return {
          dist: hit.distance,
          apply: () => {
            set()
            this.deps.commitSite()
          },
        }
    }
    return null
  }

  // Setter field mix của 1 object site (walk-up cha) — null nếu mesh không thuộc đích nhận mix.
  private _bucketSiteSet(obj: THREE.Object3D, src: GroundMixParams): (() => void) | null {
    let o: THREE.Object3D | null = obj
    while (o) {
      const ud = o.userData
      if (ud.waterMixRef) {
        const w = ud.waterMixRef as { floorMix?: GroundMixParams; wallMix?: GroundMixParams }
        return ud.waterMixFace === 'wall'
          ? () => (w.wallMix = structuredClone(src))
          : () => (w.floorMix = structuredClone(src))
      }
      if (typeof ud.groundLayerIdx === 'number') {
        const layer = (this.deps.site().groundLayers ?? [])[ud.groundLayerIdx]
        // CHỈ zone surface nhận mix (path/paving/wall đi builder viên riêng — addKindZone return sớm,
        // groundMixMat không được gọi → set field cũng không render gì, gây "click không thấy đổi").
        if (layer && (!layer.zoneKind || layer.zoneKind === 'surface'))
          return () => (layer.mix = structuredClone(src))
      }
      if (ud.isBaseGround === true) {
        const site = this.deps.site()
        return () => (site.groundMix = structuredClone(src))
      }
      o = o.parent
    }
    return null
  }

  // ── DISPOSE ────────────────────────────────────────────────────────────────────────────────────────

  /** Teardown toàn bộ cache: gmix material + PaintMask DataTexture. Gọi từ Lab _disposeSurfaceTextures. */
  dispose(): void {
    for (const v of this._cache.values()) {
      v.gmix.dispose() // 🎨 mix per-target
      v.pm.dispose() // 🖌 DataTexture mask vẽ
    }
    this._cache.clear()
  }
}
