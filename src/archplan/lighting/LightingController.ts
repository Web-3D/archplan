/**
 * VỊ TRÍ   — archplan/src/archplan/lighting/LightingController.ts
 * VAI TRÒ  — Orchestrator hệ đèn (vỏ): gắn lõi SiteLightingSystem + LightPanel (GUI riêng) + UplightDrag
 *            (Move/Focus) + store (persist 'archplan:lighting'). ArchPlanLab CHỈ tạo cái này + delegate
 *            (group/dayFactor/pointer/dispose) — KHÔNG cấy logic đèn vào god-module (pattern tách riêng).
 * LIÊN HỆ  — host bơm scene/camera/canvas/container/setOrbit. Mai sau (Phase 3) nuốt nốt pool point cũ.
 *
 * CÁCH DÙNG: this._lighting = new LightingController({scene,camera,canvas,container,setOrbit})
 *            // _applySunToLamps: this._lighting.update(night)
 *            // pointer: down→pointerDown, move→pointerMove, up→pointerUp, right→pointerCancel, click→clickFocus
 * DISPOSE: dispose() — system + panel.
 */

import type * as THREE from 'three'
import {
  defaultUplight,
  SiteLightingSystem,
  type UplightConfig,
} from 'threejs-modules/site/lighting/SiteLightingSystem'

import { LightPanel } from './LightPanel'
import { loadUplights, saveUplights } from './store'
import { UplightDrag } from './UplightDrag'

export interface LightingControllerHost {
  scene: THREE.Scene
  camera: THREE.Camera
  canvas: HTMLCanvasElement
  container: Element
  setOrbit: (on: boolean) => void
}

export class LightingController {
  private readonly system = new SiteLightingSystem()
  private readonly configs: UplightConfig[] = loadUplights()
  private readonly panel: LightPanel
  private readonly _drag: UplightDrag
  private isDisposed = false

  constructor(host: LightingControllerHost) {
    host.scene.add(this.system.getGroup())
    this.system.setUplights(this.configs)
    this.panel = new LightPanel(host.container, {
      configs: this.configs,
      changed: (commit) => this._changed(commit),
      structural: () => this._structural(),
      add: () => this.configs.push(defaultUplight(0, 0)),
    })
    this._drag = new UplightDrag({
      camera: host.camera,
      canvas: host.canvas,
      system: this.system,
      setOrbit: host.setOrbit,
      onMoved: (i, x, z) => this._onMoved(i, x, z),
      onFocus: (i) => this.panel.focus(i),
    })
  }

  /** Đêm: đèn sáng dần khi tối (gọi từ _applySunToLamps cascade). */
  update(night: number): void {
    this.system.update(night)
  }

  // ── Pointer delegation (ArchPlanLab hook) ───────────────────────────────────
  pointerDown(e: PointerEvent): boolean {
    return this._drag.tryStartDrag(e)
  }
  pointerMove(e: PointerEvent): void {
    this._drag.drag(e)
  }
  pointerUp(): void {
    this._drag.endDrag()
  }
  pointerCancel(): void {
    this._drag.cancelDrag()
  }
  clickFocus(e: PointerEvent): boolean {
    return this._drag.tryClickFocus(e)
  }
  isDragging(): boolean {
    return this._drag.isDragging()
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.panel.dispose()
    this.system.dispose()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  // Slider sửa: live = đẩy vào lõi; commit = thêm persist.
  private _changed(commit: boolean): void {
    this.system.setUplights(this.configs)
    if (commit) saveUplights(this.configs)
  }

  // Thêm/xoá đèn: đẩy lõi + persist (panel tự rebuild).
  private _structural(): void {
    this.system.setUplights(this.configs)
    saveUplights(this.configs)
  }

  // Buông kéo: gập vị trí mới vào config + persist + đồng bộ slider panel.
  private _onMoved(i: number, x: number, z: number): void {
    const c = this.configs[i]
    if (!c) return
    c.x = x
    c.z = z
    saveUplights(this.configs)
    this.panel.rebuild()
  }
}
