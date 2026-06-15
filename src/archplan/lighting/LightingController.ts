/**
 * VỊ TRÍ   — archplan/src/archplan/lighting/LightingController.ts
 * VAI TRÒ  — Orchestrator hệ đèn fixture (vỏ): gắn 3 lõi (uplight/bollard/đèn-dây) + LightPanel (GUI riêng,
 *            3 mục) + 1 FixtureDrag/hệ (Move/Focus) + store (persist 'archplan:lighting'). ArchPlanLab CHỈ
 *            tạo cái này + delegate (dayFactor/pointer/dispose) — KHÔNG cấy logic đèn vào god-module.
 * LIÊN HỆ  — host bơm scene/camera/canvas/container/setOrbit. Mai sau (Phase 3) nuốt nốt pool point cũ.
 *
 * CÁCH DÙNG: this._lighting = new LightingController({scene,camera,canvas,container,setOrbit})
 *            // _applySunToLamps: this._lighting.update(night)
 *            // pointer: down→pointerDown, move→pointerMove, up→pointerUp, right→pointerCancel, click→clickFocus
 * DISPOSE: dispose() — 3 hệ + panel.
 */

import type * as THREE from 'three'
import { BollardLights, defaultBollard } from 'threejs-modules/site/lighting/BollardLights'
import {
  defaultUplight,
  SiteLightingSystem,
} from 'threejs-modules/site/lighting/SiteLightingSystem'
import { defaultString, StringLights } from 'threejs-modules/site/lighting/StringLights'

import { FixtureDrag, type FixtureSystem } from './FixtureDrag'
import { LightPanel, type LightRow, type PanelSection } from './LightPanel'
import { type LightingConfigs, loadLighting, saveLighting } from './store'

export interface LightingControllerHost {
  scene: THREE.Scene
  camera: THREE.Camera
  canvas: HTMLCanvasElement
  container: Element
  setOrbit: (on: boolean) => void
}

const DEG = 180 / Math.PI

export class LightingController {
  private readonly up = new SiteLightingSystem()
  private readonly bo = new BollardLights()
  private readonly st = new StringLights()
  private readonly cfg: LightingConfigs = loadLighting()
  private readonly panel: LightPanel
  private readonly drags: FixtureDrag[]
  private isDisposed = false

  constructor(private readonly host: LightingControllerHost) {
    host.scene.add(this.up.getGroup(), this.bo.getGroup(), this.st.getGroup())
    this._syncAll(false)
    this.panel = new LightPanel(host.container, [
      this._upSection(),
      this._boSection(),
      this._stSection(),
    ])
    this.drags = [
      this._mkDrag(
        {
          pick: (r) => this.up.pickUplight(r),
          getBase: (i) => this.up.getBase(i),
          moveBase: (i, x, z) => this.up.moveBase(i, x, z),
        },
        (i, x, z) => this._movedXZ(this.cfg.uplights[i], x, z),
        0
      ),
      this._mkDrag(
        {
          pick: (r) => this.bo.pickBollard(r),
          getBase: (i) => this.bo.getBase(i),
          moveBase: (i, x, z) => this.bo.moveBase(i, x, z),
        },
        (i, x, z) => this._movedXZ(this.cfg.bollards[i], x, z),
        1
      ),
      this._mkDrag(
        {
          pick: (r) => this.st.pickString(r),
          getBase: (i) => this.st.getBase(i),
          moveBase: (i, x, z) => this.st.moveBase(i, x, z),
        },
        (i, x, z) => this._movedString(i, x, z),
        2
      ),
    ]
  }

  /** Đêm: cả 3 hệ sáng dần khi tối (gọi từ _applySunToLamps cascade). */
  update(night: number): void {
    this.up.update(night)
    this.bo.update(night)
    this.st.update(night)
  }

  // ── Pointer delegation (ArchPlanLab hook) — thử cả 3 drag, chỉ cái active hành động ────────────
  pointerDown(e: PointerEvent): boolean {
    return this.drags.some((d) => d.tryStartDrag(e))
  }
  pointerMove(e: PointerEvent): void {
    for (const d of this.drags) d.drag(e)
  }
  pointerUp(): void {
    for (const d of this.drags) d.endDrag()
  }
  pointerCancel(): void {
    for (const d of this.drags) d.cancelDrag()
  }
  clickFocus(e: PointerEvent): boolean {
    return this.drags.some((d) => d.tryClickFocus(e))
  }
  isDragging(): boolean {
    return this.drags.some((d) => d.isDragging())
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.panel.dispose()
    this.up.dispose()
    this.bo.dispose()
    this.st.dispose()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _mkDrag(
    system: FixtureSystem,
    onMoved: (i: number, x: number, z: number) => void,
    sIdx: number
  ): FixtureDrag {
    return new FixtureDrag({
      camera: this.host.camera,
      canvas: this.host.canvas,
      system,
      setOrbit: this.host.setOrbit,
      onMoved,
      onFocus: (i) => this.panel.focus(sIdx, i),
    })
  }

  private _syncAll(save: boolean): void {
    this.up.setUplights(this.cfg.uplights)
    this.bo.setBollards(this.cfg.bollards)
    this.st.setStrings(this.cfg.strings)
    if (save) saveLighting(this.cfg)
  }

  // Drag commit uplight/bollard: gập vị trí mới vào config (x,z) + persist + đồng bộ slider panel.
  private _movedXZ(c: { x: number; z: number } | undefined, x: number, z: number): void {
    if (!c) return
    c.x = x
    c.z = z
    saveLighting(this.cfg)
    this.panel.rebuild()
  }

  // Drag commit đèn dây: (x,z) = trung điểm mới → dịch CẢ 2 đầu cùng delta + rebuild + persist.
  private _movedString(i: number, x: number, z: number): void {
    const s = this.cfg.strings[i]
    if (!s) return
    const dx = x - (s.ax + s.bx) / 2
    const dz = z - (s.az + s.bz) / 2
    s.ax += dx
    s.bx += dx
    s.az += dz
    s.bz += dz
    saveLighting(this.cfg)
    this.st.setStrings(this.cfg.strings)
    this.panel.rebuild()
  }

  // ── Section specs (đóng kín config typed theo index) ─────────────────────────

  private _upSection(): PanelSection {
    const u = this.cfg.uplights
    return {
      icon: '🔦',
      name: 'Đèn pha',
      hint: 'Chưa có đèn pha. Bấm ＋ — rọi gốc cây / tường / tượng.',
      focusColor: '#ffd9a0',
      liveDrag: true,
      count: () => u.length,
      rows: (i) => this._upRows(u[i]),
      colorOf: (i) => u[i].color,
      setColor: (i, hex, commit) => this._setColor(u[i], hex, () => this._upChanged(commit)),
      add: () => this._add(u, defaultUplight(0, 0), () => this.up.setUplights(u)),
      remove: (i) => this._remove(u, i, () => this.up.setUplights(u)),
      changed: (commit) => this._upChanged(commit),
    }
  }

  private _boSection(): PanelSection {
    const b = this.cfg.bollards
    return {
      icon: '🟡',
      name: 'Bollard',
      hint: 'Chưa có bollard. Bấm ＋ — trụ thấp rọi xuống lối đi.',
      focusColor: '#fff0d0',
      liveDrag: true,
      count: () => b.length,
      rows: (i) => this._boRows(b[i]),
      colorOf: (i) => b[i].color,
      setColor: (i, hex, commit) => this._setColor(b[i], hex, () => this._boChanged(commit)),
      add: () => this._add(b, defaultBollard(0, 0), () => this.bo.setBollards(b)),
      remove: (i) => this._remove(b, i, () => this.bo.setBollards(b)),
      changed: (commit) => this._boChanged(commit),
    }
  }

  private _stSection(): PanelSection {
    const s = this.cfg.strings
    return {
      icon: '🎏',
      name: 'Đèn dây',
      hint: 'Chưa có đèn dây. Bấm ＋ — chuỗi bóng võng giữa 2 cọc.',
      focusColor: '#ffd27a',
      liveDrag: false, // rebuild geometry → chỉ cập nhật lúc buông
      count: () => s.length,
      rows: (i) => this._stRows(s[i]),
      colorOf: (i) => s[i].color,
      setColor: (i, hex, commit) => this._setColor(s[i], hex, () => this._stChanged(commit)),
      add: () => this._add(s, defaultString(0, 0), () => this.st.setStrings(s)),
      remove: (i) => this._remove(s, i, () => this.st.setStrings(s)),
      changed: (commit) => this._stChanged(commit),
    }
  }

  // ── Section helpers ──────────────────────────────────────────────────────────

  private _upChanged(commit: boolean): void {
    this.up.setUplights(this.cfg.uplights)
    if (commit) saveLighting(this.cfg)
  }
  private _boChanged(commit: boolean): void {
    this.bo.setBollards(this.cfg.bollards)
    if (commit) saveLighting(this.cfg)
  }
  private _stChanged(commit: boolean): void {
    if (!commit) return // string: bỏ live, rebuild geometry chỉ lúc buông
    this.st.setStrings(this.cfg.strings)
    saveLighting(this.cfg)
  }

  private _setColor(c: { color: number }, hex: number, after: () => void): void {
    c.color = hex
    after()
  }

  private _add<T>(list: T[], item: T, sync: () => void): void {
    list.push(item)
    sync()
    saveLighting(this.cfg)
  }

  private _remove<T>(list: T[], i: number, sync: () => void): void {
    list.splice(i, 1)
    sync()
    saveLighting(this.cfg)
  }

  private _upRows(c: LightingConfigs['uplights'][number]): LightRow[] {
    return [
      ['X m', -20, 20, 0.1, () => c.x, (v) => (c.x = v)],
      ['Z m', -20, 20, 0.1, () => c.z, (v) => (c.z = v)],
      ['Ngắm X', -20, 20, 0.1, () => c.aimX, (v) => (c.aimX = v)],
      ['Ngắm Z', -20, 20, 0.1, () => c.aimZ, (v) => (c.aimZ = v)],
      ['Cao chiếu', 0, 6, 0.1, () => c.aimY, (v) => (c.aimY = v)],
      ['Sáng', 0, 30, 0.5, () => c.intensity, (v) => (c.intensity = v)],
      ['Góc °', 5, 80, 1, () => c.angle * DEG, (v) => (c.angle = v / DEG)],
      ['Mềm %', 0, 100, 5, () => c.penumbra * 100, (v) => (c.penumbra = v / 100)],
      ['Tầm m', 0, 30, 0.5, () => c.range, (v) => (c.range = v)],
    ]
  }

  private _boRows(c: LightingConfigs['bollards'][number]): LightRow[] {
    return [
      ['X m', -20, 20, 0.1, () => c.x, (v) => (c.x = v)],
      ['Z m', -20, 20, 0.1, () => c.z, (v) => (c.z = v)],
      ['Cao m', 0.3, 2, 0.05, () => c.height, (v) => (c.height = v)],
      ['Sáng', 0, 30, 0.5, () => c.intensity, (v) => (c.intensity = v)],
      ['Góc °', 20, 80, 1, () => c.angle * DEG, (v) => (c.angle = v / DEG)],
      ['Tầm m', 0, 20, 0.5, () => c.range, (v) => (c.range = v)],
    ]
  }

  private _stRows(c: LightingConfigs['strings'][number]): LightRow[] {
    return [
      ['A · X', -20, 20, 0.1, () => c.ax, (v) => (c.ax = v)],
      ['A · Z', -20, 20, 0.1, () => c.az, (v) => (c.az = v)],
      ['B · X', -20, 20, 0.1, () => c.bx, (v) => (c.bx = v)],
      ['B · Z', -20, 20, 0.1, () => c.bz, (v) => (c.bz = v)],
      ['Cao A', 0.5, 6, 0.1, () => c.ay, (v) => (c.ay = v)],
      ['Cao B', 0.5, 6, 0.1, () => c.by, (v) => (c.by = v)],
      ['Võng m', 0, 3, 0.05, () => c.sag, (v) => (c.sag = v)],
      ['Sáng', 0, 20, 0.5, () => c.intensity, (v) => (c.intensity = v)],
      ['Số bóng', 2, 30, 1, () => c.bulbs, (v) => (c.bulbs = Math.round(v))],
    ]
  }
}
