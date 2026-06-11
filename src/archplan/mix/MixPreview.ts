/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/mix/MixPreview.ts
 * VAI TRÒ  — Ô PREVIEW LIVE preset mix TRONG khay 🧪 (cột bên phải panel — feedback NgQuan 2026-06-11
 *            "tích hợp vào bên phải của gui, đừng để ra ngoài"): canvas WebGPU RIÊNG render tấm đứng
 *            2×2m mapping 'wall', material RIÊNG (không mượn cache MixManager — material 'wall' dán
 *            theo positionWorld nên tấm phải ĐỨNG YÊN trong scene riêng, và né lẫn space với bề mặt thật).
 * LIÊN HỆ  — Lab tạo 1 lần (lazy trong _setMixPreview) + mount lại vào mixPreWrap mỗi _rebuildGUI.
 *            sync(mix) ← ctx.setMixPreview (PresetPanel ✎ mở/đóng/commit); tune() ← tuneMixLive
 *            (slider live); resync() ← cuối _siteTexOpts (texture async load xong). Uniform dùng chung
 *            applyMixUniforms (./MixManager — 1 nguồn). Pattern canvas riêng: gui/grass-preview.ts
 *            ("TSL/NodeMaterial bắt buộc WebGPU; không hook được vào loop BaseWorld để vẽ inset").
 *
 * CÁCH DÙNG: const p = new MixPreview({ mapsOf, tileOf }); void p.init(); p.mount(wrap)
 *            p.sync(mix | null) — hiện/ẩn + rebuild material khi structural (texture/rule đổi)
 * DISPOSE: dispose() — setAnimationLoop(null) + gmix/fallback/geometry/renderer.dispose() + gỡ panel.
 */

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import type { PhotoGroundMaps } from 'threejs-modules/shaders/ground/PhotoGround'
import { PhotoGroundMix } from 'threejs-modules/shaders/ground/PhotoGroundMix'
import {
  GROUND_PRESETS,
  type GroundMaterialKey,
  type GroundMixParams,
  isGroundTexKey,
} from 'threejs-modules/site/state'

import { applyMixUniforms } from './MixManager'

const SIZE = 148 // px — canvas vuông trong cột preview (panel khay 196px, cột này gọn hơn)

/** Deps Lab bơm — CÙNG dạng lambdas của MixManagerDeps (mapsOf kick-off async khi chưa load). */
export interface MixPreviewDeps {
  mapsOf(key: GroundMaterialKey): PhotoGroundMaps | null
  tileOf(key: GroundMaterialKey): number
}

function ensurePreviewCss(): void {
  if (document.getElementById('ap-mixprev-css')) return
  const s = document.createElement('style')
  s.id = 'ap-mixprev-css'
  s.textContent =
    // cột dính mép PHẢI panel khay (trong .ap-mixpre-float) — kéo khay = preview đi theo
    `.ap-mixprev{position:absolute;left:100%;top:0;margin-left:4px;padding:4px;background:#3e2f1c;` +
    `border:1px solid #b58a3c;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.45)}` +
    `.ap-mixprev-ttl{font:600 10px/1.3 'Segoe UI',system-ui,sans-serif;color:#f5ead2;margin:0 0 3px 2px}` +
    `.ap-mixprev canvas{display:block;width:${SIZE}px;height:${SIZE}px;border-radius:4px}`
  document.head.appendChild(s)
}

export class MixPreview {
  private readonly panel: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private renderer: WebGPURenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly mesh: THREE.Mesh
  private gmix: PhotoGroundMix | null = null // material mix RIÊNG của preview (không thuộc cache manager)
  private fallback: THREE.MeshStandardMaterial | null = null // texture chưa load → màu preset base tạm
  private mix: GroundMixParams | null = null // preset đang preview (REF — board sửa tại chỗ, tune() đọc lại)
  private sig = '' // chữ ký structural (keys + rules) — đổi = dựng lại gmix; '' = đang fallback
  private isDisposed = false

  constructor(private readonly deps: MixPreviewDeps) {
    ensurePreviewCss()
    this.panel = document.createElement('div')
    this.panel.className = 'ap-mixprev'
    this.panel.style.display = 'none' // ẩn tới khi sync(mix) đầu tiên
    const ttl = document.createElement('div')
    ttl.className = 'ap-mixprev-ttl'
    ttl.textContent = '🔎 Preview'
    this.canvas = document.createElement('canvas')
    this.panel.append(ttl, this.canvas)
    // Tấm đứng 2×2m tâm gốc (XY, normal +Z → mapping 'wall' lấy (x,y) world — tấm ĐỨNG YÊN nên không trôi)
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    this.scene.add(this.mesh)
    this.scene.background = new THREE.Color(0x2c2114) // nâu nền khay — tấm nổi trên panel
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10)
    this.camera.position.set(0, 0, 2.6) // khít tấm 2×2 (fov 45 @2.6 → nửa cao ~1.08)
    this.scene.add(new THREE.HemisphereLight(0xf3efe6, 0x4a3b26, 1.4))
    const dir = new THREE.DirectionalLight(0xffffff, 1.7)
    dir.position.set(1.4, 1.8, 2.6) // chéo trên-phải → normal map nổi khối
    this.scene.add(dir)
  }

  /** Khởi tạo renderer WebGPU (async, 1 lần). Loop chỉ render khi panel đang hiện + đã mount. */
  async init(): Promise<void> {
    const r = new WebGPURenderer({ canvas: this.canvas, antialias: true })
    r.setPixelRatio(Math.min(2, window.devicePixelRatio))
    r.setSize(SIZE, SIZE, false) // updateStyle=false — CSS giữ kích thước hiển thị
    await r.init()
    if (this.isDisposed) {
      r.dispose()
      return
    }
    this.renderer = r
    r.setAnimationLoop(() => {
      if (this.panel.style.display === 'none' || !this.panel.isConnected) return
      this.renderer?.render(this.scene, this.camera)
    })
  }

  /** Gắn (lại) cột preview vào wrap khay — mỗi _rebuildGUI wrap mới; dời node giữ nguyên WebGPU context. */
  mount(host: HTMLElement): void {
    host.appendChild(this.panel)
  }

  /** Mở/đóng + đổi preset preview (ctx.setMixPreview). null = ẩn (giữ material — mở lại tức thì). */
  sync(mix: GroundMixParams | null): void {
    this.mix = mix
    this.panel.style.display = mix ? '' : 'none'
    if (mix) this._refresh()
  }

  /** Slider board kéo (tuneMixLive) → uniform live; structural đi đường sync() (commit gọi lại). */
  tune(): void {
    if (this.mix && this.gmix && this.sig !== '') applyMixUniforms(this.gmix, this.mix)
  }

  /** Texture async load xong (_siteTexOpts) → thử thay fallback màu bằng material mix thật. */
  resync(): void {
    if (this.mix && this.panel.style.display !== 'none') this._refresh()
  }

  // Dựng/cập nhật material theo mix hiện tại: đủ maps → PhotoGroundMix 'wall' (sig đổi mới rebuild);
  // thiếu maps (đang load async — mapsOf đã kick-off) / key màu phẳng → fallback màu preset base.
  private _refresh(): void {
    const mix = this.mix
    if (!mix || this.isDisposed) return
    const keys = [mix.base, ...mix.slots.map((s) => s.key)]
    const sets: PhotoGroundMaps[] = []
    for (const k of keys) {
      const maps = isGroundTexKey(k) ? this.deps.mapsOf(k) : null
      if (!maps) {
        this._applyFallback(mix)
        return
      }
      sets.push(maps)
    }
    const sig = JSON.stringify([keys, mix.slots.map((s) => s.rule ?? null)])
    if (!this.gmix || sig !== this.sig) {
      this.gmix?.dispose()
      this.gmix = new PhotoGroundMix({
        base: sets[0],
        slots: mix.slots.map((s, i) => ({
          maps: sets[i + 1],
          bias: s.bias,
          seed: s.seed,
          rule: s.rule,
        })),
        tileSizeMeters: this.deps.tileOf(mix.base),
        mapping: 'wall', // tấm đứng — rule trọng lực (foot/streak/moss) hiện như tường thật
      })
      this.gmix.setWallRange(-1, 2) // chân tấm y=−1, cao 2m (plane 2×2 tâm gốc)
      this.sig = sig
      this.mesh.material = this.gmix.getMaterial()
    }
    applyMixUniforms(this.gmix, mix)
  }

  private _applyFallback(mix: GroundMixParams): void {
    this.fallback ??= new THREE.MeshStandardMaterial()
    this.fallback.color.setHex(GROUND_PRESETS[mix.base]?.color ?? 0x8a8680)
    this.mesh.material = this.fallback
    this.sig = '' // load xong → resync() thấy sig rỗng → dựng material thật
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.renderer?.setAnimationLoop(null)
    this.gmix?.dispose()
    this.gmix = null
    this.fallback?.dispose()
    this.fallback = null
    this.mesh.geometry.dispose()
    this.renderer?.dispose()
    this.renderer = null
    this.panel.remove()
  }
}
