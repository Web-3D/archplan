/**
 * VỊ TRÍ   — archplan/src/site-viewer.ts
 * VAI TRÒ  — Entry PRODUCTION (viewer thứ 3): nạp design (building + site) đã lưu → render SITE ĐẦY ĐỦ
 *            (ground-mix + nước + cá + rào + cỏ + đèn-vỏ) + building, KHÔNG editor/GUI/live-edit. DevHud đọc
 *            renderer.info → đo draw/tri/fps = cost THẬT đem lên production (Vercel). Tiền đề deploy.
 * LIÊN HỆ  — reuse leaf modules: renderSiteState (site-kit) · MixManager (material PhotoGroundMix) ·
 *            loadSurfaceTextureSet · PhotoGround/TexturedSurface · BuildingRenderer · BaseWorld · DesignStore.
 *            Manifest texture = ./archplan/scene/texture-specs (bản sao editor — KHÔNG kéo ArchPlanLab vào bundle).
 *
 * NGUỒN STATE: localStorage autosave (same-origin dev = scene đang dựng trong editor). Vercel (khác origin) →
 *              v2 đổi sang fetch('/scene.json'). v1 HẠN CHẾ (đo cost SITE là chính): building = BuildingRenderer
 *              đơn (KHÔNG mix tường / walnut-slab / found-wood), KHÔNG bridges, KHÔNG terrain-flatten dưới nhà,
 *              KHÔNG lamp real-light (chỉ vỏ đèn). Ground/nước/rào MIX = full-fidelity qua MixManager.
 * DISPOSE: ctx (geos/mats/shaders) + building + mix + PhotoGround/TexturedSurface + envRT + controls + hud.
 */

import { type BuildRenderCtx, renderBuildingState } from 'building-kit/render/fromState'
import { defaultBuildingState } from 'building-kit/state'
import { WallMaterialCache } from 'building-kit/wallMaterials'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { PMREMGenerator } from 'three/webgpu'
import { PondPredation } from 'threejs-modules/components/PondFish/PondPredation'
import { Precipitation, type PrecipitationOptions } from 'threejs-modules/effects/Precipitation'
import { PhotoGround, type PhotoGroundMaps } from 'threejs-modules/shaders/ground/PhotoGround'
import { TexturedSurface } from 'threejs-modules/shaders/surface/TexturedSurface'
import {
  renderSiteState,
  type SiteHandle,
  type SiteRenderCtx,
  type SiteRenderOpts,
} from 'threejs-modules/site/render/fromState'
import { buildFishSchool } from 'threejs-modules/site/render/water'
import {
  defaultSiteState,
  type GroundLayer,
  type GroundMaterialKey,
  type GroundMixParams,
  isGroundTexKey,
  makeFishSchool,
  parseSite,
  renderPuddles,
  renderWaters,
  type SiteState,
  type WaterConfig,
} from 'threejs-modules/site/state'
import { BaseWorld } from 'threejs-modules/utils/core/BaseWorld'

import { DevHud } from './archplan/gui/devhud'
import { MixManager } from './archplan/mix/MixManager'
import { loadSurfaceTextureSet } from './archplan/scene/texture-set'
import {
  BORDER_TEX_SPEC,
  BORDER_TILE,
  type BorderTexKey,
  GROUND_TEX_SPEC,
} from './archplan/scene/texture-specs'
import { DesignStore, type LoadedDesign } from './archplan/state/persistence'
import { type BuildingState, parseDesign } from './archplan/state/state'
import { gpuLimits } from './gpu-limits'
import { SiteViewerPanel, type WeatherMode } from './site-viewer-panel'

// 🌧️❄️ Preset Precipitation theo mode (radius/height bơm theo scale scene lúc setWeather). Rút gọn từ editor.
const PRECIP: Record<'rain' | 'snow', PrecipitationOptions> = {
  rain: { mode: 'rain', count: 6000, size: 3.2 },
  snow: { mode: 'snow', count: 2500, size: 8 },
}
const UP = new THREE.Vector3(0, 1, 0)
const MOVE_KEYS = 'wasdqe' // WASD ngang + Q/E xuống/lên

type GroundMapStore = Map<GroundMaterialKey, PhotoGroundMaps>
type BorderMapStore = Map<BorderTexKey, PhotoGroundMaps>
interface TexMaps {
  ground: GroundMapStore
  border: BorderMapStore
}

// 🎨 Gom key texture của 1 mix-params (base + slots) — chỉ key TEXTURE (màu phẳng bỏ). Mix dùng GroundMaterialKey.
function mixKeysInto(p: GroundMixParams | undefined, out: Set<GroundMaterialKey>): void {
  if (!p) return
  if (isGroundTexKey(p.base)) out.add(p.base)
  for (const s of p.slots) if (isGroundTexKey(s.key)) out.add(s.key)
}

// Key ground (texture) của 1 hồ: đáy/vách material trực tiếp + mix đáy/vách. Tách giữ complexity ≤10.
function waterGroundKeys(w: WaterConfig, out: Set<GroundMaterialKey>): void {
  for (const m of [w.floorMaterial, w.wallMaterial])
    if (m !== 'none' && m !== 'tile' && isGroundTexKey(m)) out.add(m)
  mixKeysInto(w.floorMix, out)
  mixKeysInto(w.wallMix, out)
}

// Tập key ground (texture) site DÙNG = nền G0 + tầng zone + đáy/vách hồ (material trực tiếp) ∪ mọi mix
// (base+slots của groundMix/layer.mix/water floor-wall mix/fence mix). Mirror ArchPlanLab._usedGroundTexKeys + mix.
function usedGroundKeys(site: SiteState): GroundMaterialKey[] {
  const k = new Set<GroundMaterialKey>()
  if (isGroundTexKey(site.ground)) k.add(site.ground)
  mixKeysInto(site.groundMix, k)
  for (const l of site.groundLayers ?? []) {
    if (isGroundTexKey(l.material)) k.add(l.material)
    mixKeysInto(l.mix, k)
  }
  for (const w of renderWaters(site)) waterGroundKeys(w, k)
  for (const f of site.fences) mixKeysInto(f.mix, k)
  return [...k]
}

// Material đá BORDER của 1 zone theo loại (path/paving/wall) — undefined nếu không phải zone đá. Tách (complexity).
function zoneBorderMat(l: GroundLayer): BorderTexKey | 'none' | undefined {
  if (l.zoneKind === 'path') return l.path?.material
  if (l.zoneKind === 'paving') return l.paving?.material
  if (l.zoneKind === 'wall') return l.wall?.material
  return undefined
}

// Tập key đá BORDER site dùng = viền hồ (borderEnabled) ∪ path/paving/wall-zone material. Mirror _usedBorderTexKeys.
function usedBorderKeys(site: SiteState): BorderTexKey[] {
  const k = new Set<BorderTexKey>()
  for (const w of renderWaters(site))
    if (w.borderEnabled && w.borderMaterial !== 'none') k.add(w.borderMaterial)
  for (const l of site.groundLayers ?? []) {
    const m = zoneBorderMat(l)
    if (m && m !== 'none') k.add(m)
  }
  return [...k]
}

// 🏠 Key ground (texture) của MIX BUILDING (tường seg.mix + sàn slabMix + MÓNG foundMix) — preload để mix dựng
// đủ maps (BuildingRenderer cũ bỏ qua → móng/tường/sàn mix mất texture). Mirror MixManager._collectBuildingMix.
function buildingMixKeys(state: BuildingState, out: Set<GroundMaterialKey>): void {
  const insts = state.floors.flatMap((fl) => fl.instances)
  for (const inst of insts) {
    for (const seg of inst.segments) mixKeysInto(seg.mix, out)
    mixKeysInto(inst.structure.slabMix, out)
    mixKeysInto(inst.structure.foundMix, out)
  }
}

class SiteViewer extends BaseWorld {
  private readonly store = new DesignStore()
  private readonly ctx: SiteRenderCtx = {
    group: new THREE.Group(),
    geos: [],
    mats: [],
    shaders: [],
  }
  private readonly grounds: PhotoGround[] = [] // PhotoGround cache (groundMatByKey) — dispose
  private readonly borders: TexturedSurface[] = [] // TexturedSurface cache (borderMatByKey) — dispose
  private readonly sun = new THREE.DirectionalLight(0xfff2d6, 2.4)
  private readonly _hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a4a38, 0.6)
  private readonly target = new THREE.Vector3()
  private readonly _center = new THREE.Vector3() // tâm bbox scene — sun-arc + WASD speed + reframe
  private _radius = 8 // bán kính bbox scene
  private _site: SiteState = defaultSiteState()
  private _state: BuildingState = defaultBuildingState()
  private mix: MixManager | null = null
  // 🏠 Building render = renderBuildingState (KHÔNG BuildingRenderer đơn) → bơm mix callbacks (móng/tường/sàn). Caller quản resource.
  private readonly buildingGroup = new THREE.Group()
  private readonly wallCache = new WallMaterialCache()
  private readonly buildGeos: THREE.BufferGeometry[] = []
  private readonly buildMats: THREE.Material[] = []
  private readonly brick3d: BuildRenderCtx['brick3d'] = []
  private readonly wood: BuildRenderCtx['wood'] = []
  private readonly strip: BuildRenderCtx['strip'] = []
  private siteHandle: SiteHandle | null = null
  private controls: OrbitControls | null = null
  private hud: DevHud | null = null
  private envRT: THREE.RenderTarget | null = null
  private panel: SiteViewerPanel | null = null
  private precip: Precipitation | null = null
  private _weather: WeatherMode = 'none'
  private _sunTime = 0.5 // 0=bình minh · 0.5=trưa · 1=hoàng hôn
  private predation: PondPredation | null = null // 🦈 bậc cao đớp bậc thấp (khi đói vàng)
  private _waters: { cfg: WaterConfig; surf: SiteHandle['waters'][number] }[] = [] // zip cfg↔surf (rain-cell + click)
  private _feedDrop = false // 🖱 mode thả mồi: click hồ rơi mồi tại chỗ
  private readonly _ray = new THREE.Raycaster()
  private readonly _ndc = new THREE.Vector2()
  private readonly _keys = new Set<string>() // WASD/QE đang giữ
  private readonly _onKeyDown = (e: KeyboardEvent): void => this._setKey(e, true)
  private readonly _onKeyUp = (e: KeyboardEvent): void => this._setKey(e, false)
  private readonly _onClick = (e: MouseEvent): void => this._tryFeedClick(e)

  protected async onInit(): Promise<void> {
    const d = await this._loadDesign()
    this._state = d.state
    this._site = d.site
    this.scene.background = new THREE.Color(0xaac4d8)
    this.renderer.shadowMap.enabled = true
    await this._setupEnv()
    this._addLights()
    const maps = await this._preloadTextures(this._site)
    this.mix = this._makeMix(maps.ground)
    this.siteHandle = renderSiteState(this._site, this.ctx, this._buildOpts(maps))
    this.scene.add(this.ctx.group)
    this._buildBuilding()
    this._zipWaters()
    this._rebuildPredation()
    this._frameScene()
    this._buildControls()
    this._buildHud()
    this._buildPanel()
    this._addInputListeners()
  }

  // ⚙️ CHUẨN NGÀNH — 1 build, nguồn scene theo môi trường: DEV (local) = autosave editor; build (staging/prod
  // Vercel) = fetch '/scene.json' (scene export đặt public/). Không có → fallback autosave/default.
  private async _loadDesign(): Promise<LoadedDesign> {
    const fallback = (): LoadedDesign =>
      this.store.loadAutosave() ?? { state: this._state, site: this._site }
    if (import.meta.env.DEV) return fallback()
    try {
      const res = await fetch('scene.json')
      if (res.ok) {
        const text = await res.text()
        const state = parseDesign(text)
        if (state) return { state, site: parseSite((JSON.parse(text) as { site?: unknown }).site) }
      }
    } catch {
      // không có scene.json trên deploy → fallback
    }
    return fallback()
  }

  // zip cfg↔surf theo ĐÚNG thứ tự lõi dựng ([...renderWaters, ...renderPuddles]) — rain-cell + click thả mồi.
  // + setCamera cho reflector mặt nước (BẮT BUỘC — như editor; thiếu = gương không render).
  private _zipWaters(): void {
    const cfgs = [...renderWaters(this._site), ...renderPuddles(this._site)]
    this._waters = (this.siteHandle?.waters ?? []).map((surf, i) => ({ cfg: cfgs[i], surf }))
    for (const w of this._waters) w.surf.setCamera(this.camera)
  }

  // 🦈 Dựng lại coordinator săn mồi từ mọi đàn hiện có (gọi sau spawn bậc 5). Cùng hồ + ≥2 bậc mới ăn nhau.
  private _rebuildPredation(): void {
    const fish = this.siteHandle?.fish ?? []
    this.predation = new PondPredation(
      fish.map((e) => ({ pond: e.water, fish: e.fish, tier: e.cfg.tier }))
    )
  }

  // HUD đo: hiện ở DEV (local) hoặc khi URL có ?hud (staging/prod opt-in để đo) — KHÔNG hiện prod thường.
  private _buildHud(): void {
    const show = import.meta.env.DEV || new URLSearchParams(location.search).has('hud')
    if (show) this.hud = new DevHud(this.canvas.parentElement ?? document.body)
  }

  private _buildPanel(): void {
    this.panel = new SiteViewerPanel(this.canvas.parentElement ?? document.body, {
      onWeather: (m) => this.setWeather(m),
      onSunTime: (t) => this.setSunTime(t),
      onForageT4: (on) => this._setForageT4(on),
      onFeedDrop: (on) => {
        this._feedDrop = on
      },
      onSpawnTier5: () => this._spawnTier5(),
      onFeed: () => this._feedFish(),
      onGrow: () => this._growFish(),
      onReset: () => this._resetAll(),
    })
  }

  private _addInputListeners(): void {
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    this.canvas.addEventListener('click', this._onClick)
  }

  // IBL: RoomEnvironment → PMREM → scene.environment (khớp editor — IBL = 1 sampler/material lit; intensity 0.3).
  private async _setupEnv(): Promise<void> {
    const pmrem = new PMREMGenerator(this.renderer)
    this.envRT = await pmrem.fromSceneAsync(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envRT.texture
    this.scene.environmentIntensity = 0.3
    pmrem.dispose()
  }

  // Hemi fill + 1 directional sun đổ bóng (autoUpdate=false: vẽ shadow-map 1 lần ở _applySunTime — đỡ depth-pass).
  private _addLights(): void {
    this.scene.add(this._hemi)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.autoUpdate = false
    this.scene.add(this.sun, this.sun.target)
  }

  // Preload TĨNH: load HẾT texture site dùng (ground + border) TRƯỚC khi build → matFor/groundMatByKey luôn đủ
  // maps (không pop-in / không cần rebuild khi load xong). Promise.all = fetch+decode+upload song song.
  private async _preloadTextures(site: SiteState): Promise<TexMaps> {
    const gKeys = new Set<GroundMaterialKey>(usedGroundKeys(site))
    buildingMixKeys(this._state, gKeys) // 🏠 + key mix móng/tường/sàn building (kẻo mix building mất texture)
    // flatMap {k, spec}: lọc key có trong manifest + giữ spec → khỏi non-null assert sau filter.
    const gEntries = [...gKeys].flatMap((k) => {
      const e = GROUND_TEX_SPEC[k]
      return e ? [{ k, spec: e.spec }] : []
    })
    const bKeys = usedBorderKeys(site)
    const [gMaps, bMaps] = await Promise.all([
      Promise.all(gEntries.map((x) => loadSurfaceTextureSet(x.spec, this.renderer))),
      Promise.all(bKeys.map((k) => loadSurfaceTextureSet(BORDER_TEX_SPEC[k], this.renderer))),
    ])
    const ground: GroundMapStore = new Map()
    gEntries.forEach((x, i) => ground.set(x.k, gMaps[i]))
    const border: BorderMapStore = new Map()
    bKeys.forEach((k, i) => border.set(k, bMaps[i]))
    return { ground, border }
  }

  // MixManager reuse: chỉ deps material (site/state/mapsOf/tileOf) thật; deps tương tác (raycast/paint…) = no-op.
  private _makeMix(ground: GroundMapStore): MixManager {
    const noop = (): void => {}
    return new MixManager({
      site: () => this._site,
      state: () => this._state,
      mapsOf: (k) => ground.get(k) ?? null,
      tileOf: (k) => GROUND_TEX_SPEC[k]?.tile ?? 2,
      raycastHits: () => [],
      buildingHits: () => [],
      fenceHits: () => [],
      bridgeHits: () => [],
      autosave: noop,
      offOtherModes: noop,
      lockOrbit: noop,
      commitSite: noop,
      commitBuilding: noop,
      bucketCursor: noop,
      hoverGhost: noop,
    })
  }

  // SiteRenderOpts bản TĨNH (mirror _siteTexOpts): material đơn theo key + mix callbacks qua MixManager.
  private _buildOpts(maps: TexMaps): SiteRenderOpts {
    const mix = this.mix as MixManager
    return {
      skipGrass: false,
      skipFence: false,
      groundMatByKey: this._groundMatByKey(maps.ground),
      borderMatByKey: this._borderMatByKey(maps.border),
      groundMixMat: (layer) => mix.matFor(layer),
      groundBaseMixMat: () => mix.matFor('base'),
      waterMixMat: (w, face) => mix.matFor({ water: w, face }),
      fenceMixMat: (f) => mix.matFor({ fence: f }),
    }
  }

  private _groundMatByKey(
    ground: GroundMapStore
  ): Partial<Record<GroundMaterialKey, THREE.Material>> {
    const by: Partial<Record<GroundMaterialKey, THREE.Material>> = {}
    for (const [k, m] of ground) {
      const photo = new PhotoGround({ maps: m, tileSizeMeters: GROUND_TEX_SPEC[k]?.tile ?? 2 })
      this.grounds.push(photo)
      by[k] = photo.getMaterial()
    }
    return by
  }

  private _borderMatByKey(border: BorderMapStore): Partial<Record<string, THREE.Material>> {
    const by: Partial<Record<string, THREE.Material>> = {}
    for (const [k, m] of border) {
      const surf = new TexturedSurface({ maps: m, tileSizeMeters: BORDER_TILE })
      this.borders.push(surf)
      by[k] = surf.getMaterial()
    }
    return by
  }

  // 🏠 Dựng building qua renderBuildingState (KHÔNG BuildingRenderer) → bơm mix móng/tường/sàn. Wood/groundDrops
  // bỏ qua (undefined → fallback concrete/toon — v1 chỉ lo MIX). placements (pick-box) bỏ (viewer không pick).
  private _buildBuilding(): void {
    const m = this.mix as MixManager
    renderBuildingState(this._state, {
      wallCache: this.wallCache,
      group: this.buildingGroup,
      geos: this.buildGeos,
      mats: this.buildMats,
      brick3d: this.brick3d,
      wood: this.wood,
      strip: this.strip,
      wallMixMat: (mix, range) => m.wallMixMat(mix, range), // 🎨 tường (seg.mix)
      slabMixMat: (mix) => m.matFor({ flatMix: mix }), // 🎨 sàn (mapping 'xz')
      foundMixMat: (mix, range) => m.wallMixMat(mix, range), // 🎨 MÓNG (mapping 'wall' + range)
    })
    this.scene.add(this.buildingGroup)
  }

  // Khung camera + sun theo bbox (site group + building) — robust mọi scale. Lưu _center/_radius cho sun-arc/WASD.
  private _frameScene(): void {
    const box = new THREE.Box3().setFromObject(this.ctx.group)
    box.expandByObject(this.buildingGroup)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    box.getCenter(this._center)
    this._radius = Math.max(size.x, size.y, size.z) || 8
    const r = this._radius
    this._applySunTime()
    this.camera.near = r / 100
    this.camera.far = r * 50
    this.camera.position.copy(this._center).add(new THREE.Vector3(r * 1.2, r * 0.9, r * 1.4))
    this.camera.lookAt(this._center)
    this.camera.updateProjectionMatrix()
    this.target.copy(this._center)
  }

  // Đặt mặt trời theo GIỜ (_sunTime) — cung ngày + cường độ/màu + hemi (× giảm-sáng thời tiết). Mirror demo._setTime.
  private _applySunTime(): void {
    const r = this._radius
    const ang = (0.12 + 0.76 * this._sunTime) * Math.PI
    const elev = Math.sin(ang) // 0 ở 2 đầu, 1 ở trưa
    const horiz = Math.cos(ang)
    this.sun.position.set(
      this._center.x + horiz * r * 1.6,
      this._center.y + elev * r * 1.8 + 0.2,
      this._center.z + r * 0.5
    )
    this.sun.target.position.copy(this._center)
    const dim = this._weather === 'none' ? 1 : 0.6 // 🌧️ mưa/tuyết → trời tối nhẹ
    this.sun.intensity = (1.0 + 1.8 * elev) * dim
    this.sun.color.setHSL(0.09 + 0.04 * elev, 0.7 - 0.3 * elev, 0.5 + 0.1 * elev)
    this._hemi.intensity = (0.5 + 0.5 * elev) * dim
    this._updateShadowCam(r)
    const p = this.sun.position
    for (const w of this.siteHandle?.waters ?? []) w.setSun(p.x, p.y, p.z)
    this.siteHandle?.grass?.setSun(p.x, p.y, p.z)
  }

  private _updateShadowCam(r: number): void {
    const cam = this.sun.shadow.camera
    cam.left = -r
    cam.right = r
    cam.top = r
    cam.bottom = -r
    cam.near = 0.1
    cam.far = r * 6
    cam.updateProjectionMatrix()
    this.sun.shadow.needsUpdate = true // autoUpdate=false → re-vẽ shadow-map 1 lần khi sun đổi
  }

  // ── Điều khiển (panel gọi) ──────────────────────────────────────────────────────────────────────────
  setWeather(mode: WeatherMode): void {
    if (mode === this._weather) return
    this.precip?.dispose() // tự gỡ object khỏi parent
    this.precip = null
    this._weather = mode
    if (mode !== 'none') {
      const r = Math.max(this._radius, 16)
      this.precip = new Precipitation({ ...PRECIP[mode], radius: r, height: r, groundY: 0 })
      this.scene.add(this.precip.getObject())
    }
    const wet = mode === 'rain' ? 0.85 : 0 // ☔ rain-cell ambient phủ mặt hồ CHỈ khi mưa (tuyết không gợn nước)
    for (const w of this._waters) w.surf.setRainWet(wet)
    this._applySunTime() // áp lại giảm-sáng theo thời tiết
  }

  setSunTime(t: number): void {
    this._sunTime = t
    this._applySunTime()
  }

  private _feedFish(): void {
    for (const f of this.siteHandle?.fish ?? []) f.fish.scatterFood()
  }

  private _growFish(): void {
    for (const f of this.siteHandle?.fish ?? []) f.fish.resetSchool()
  }

  // 🍴 Bật/tắt chế độ đói (forage) CHỈ cho cá bậc 4 (koi/chép) — bậc khác không đụng.
  private _setForageT4(on: boolean): void {
    for (const f of this.siteHandle?.fish ?? []) if (f.cfg.tier === 4) f.fish.setForage(on)
  }

  // 🐟＋ Tạo 1 đàn cá BẬC 5 trong hồ có cá bậc 4 (cùng hồ → predation) → mồi cho bậc 4 dí ăn (khi Đói vàng).
  private _spawnTier5(): void {
    const host = (this.siteHandle?.fish ?? []).find((e) => e.cfg.tier === 4)
    if (!host || !this.siteHandle) return // cần ≥1 đàn bậc 4 làm hồ chủ
    const fs = makeFishSchool(5)
    const fish = buildFishSchool(host.water, fs, this._site, this.ctx) // tự add mesh vào ctx.group + shaders
    this.siteHandle.fish.push({ cfg: fs, water: host.water, fish })
    this._rebuildPredation() // 🦈 gồm đàn mới → bậc 4 phát hiện + dí
  }

  // 🖱 Click hồ (mode Thả mồi) → rơi 1 viên mồi tại điểm click + gợn sóng. Raycast mặt nước → đàn cùng hồ.
  private _tryFeedClick(e: MouseEvent): void {
    if (!this._feedDrop) return
    const fish = this.siteHandle?.fish ?? []
    if (fish.length === 0) return
    this._setNdc(e)
    this._ray.setFromCamera(this._ndc, this.camera)
    const hit = this._ray.intersectObjects(
      this._waters.map((w) => w.surf.getMesh()),
      false
    )[0]
    const entry = hit && this._waters.find((w) => w.surf.getMesh() === hit.object)
    if (!entry) return
    for (const f of fish)
      if (f.water === entry.cfg) {
        const c = f.fish.getMesh().position
        f.fish.scatterFoodAt(hit.point.x - c.x, hit.point.z - c.z, 1)
      }
    entry.surf.emitRipple(hit.point.x, hit.point.z, 0.5) // 🌊 gợn nơi thả (toạ độ world)
  }

  private _setNdc(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect()
    this._ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    )
  }

  // ↺ Reset cả cảnh về mặc định: tạnh + nắng trưa + đói-b4 tắt + hồi đàn + camera khung lại.
  private _resetAll(): void {
    this.setWeather('none')
    this.setSunTime(0.5)
    this._setForageT4(false)
    this._growFish()
    this._frameScene()
    this.controls?.target.copy(this.target)
    this.controls?.update()
  }

  // ⌨️ WASD/QE: ghi phím đang giữ (bỏ qua khi focus input panel — né nuốt phím lúc kéo slider).
  private _setKey(e: KeyboardEvent, down: boolean): void {
    if (e.target instanceof HTMLInputElement) return
    const k = e.key.toLowerCase()
    if (!MOVE_KEYS.includes(k)) return
    if (down) this._keys.add(k)
    else this._keys.delete(k)
  }

  // Di chuyển camera+pivot theo hướng nhìn (chiếu XZ) — W/S tiến lùi, A/D trái phải, Q/E xuống lên. Speed ~bán kính.
  private _moveCamera(dt: number): void {
    if (this._keys.size === 0 || !this.controls) return
    const fwd = this.camera.getWorldDirection(new THREE.Vector3())
    fwd.y = 0
    if (fwd.lengthSq() < 1e-6) return
    fwd.normalize()
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize()
    const move = new THREE.Vector3()
    const dirs: [string, THREE.Vector3][] = [
      ['w', fwd],
      ['s', fwd.clone().negate()],
      ['d', right],
      ['a', right.clone().negate()],
      ['e', UP],
      ['q', UP.clone().negate()],
    ]
    for (const [key, v] of dirs) if (this._keys.has(key)) move.add(v)
    if (move.lengthSq() === 0) return
    move.normalize().multiplyScalar(this._radius * 0.9 * dt)
    this.camera.position.add(move)
    this.controls.target.add(move)
  }

  private _buildControls(): void {
    const c = new OrbitControls(this.camera, this.canvas)
    c.enableDamping = true
    c.target.copy(this.target)
    c.update()
    this.controls = c
  }

  protected onUpdate(time: number, deltaTime: number): void {
    this._moveCamera(deltaTime) // ⌨️ WASD trước controls.update (đẩy target/camera rồi mới orient)
    this.controls?.update()
    for (const s of this.ctx.shaders) (s as { setTime?(t: number): void }).setTime?.(time) // 🌿 gió cỏ
    for (const f of this.siteHandle?.fish ?? []) f.fish.update(deltaTime) // 🐟 vẫy + dời đàn
    this.predation?.update(deltaTime) // 🦈 SAU fish.update: bậc 4 dí đớp bậc 5 ở gần (khi Đói vàng)
    this.precip?.update(deltaTime) // 🌧️ mưa/tuyết rơi (1 uniform time)
    this.hud?.update(this.renderer.info, deltaTime)
  }

  protected onDispose(): void {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    this.canvas.removeEventListener('click', this._onClick)
    this.controls?.dispose()
    this.hud?.dispose()
    this.panel?.dispose()
    this.precip?.dispose()
    this.mix?.dispose()
    this.envRT?.dispose()
    this._disposeBuilding()
    this._disposeCaches()
  }

  private _disposeBuilding(): void {
    for (const g of this.buildGeos) g.dispose()
    for (const m of this.buildMats) m.dispose()
    for (const w of this.brick3d) w.dispose()
    for (const w of this.wood) w.dispose()
    for (const w of this.strip) w.dispose()
    this.wallCache.dispose()
  }

  // Dispose mọi GPU resource caller-sở-hữu (PhotoGround/TexturedSurface cache + ctx geos/mats/shaders). Tách (complexity).
  private _disposeCaches(): void {
    for (const g of this.grounds) g.dispose()
    for (const b of this.borders) b.dispose()
    for (const g of this.ctx.geos) g.dispose()
    for (const m of this.ctx.mats) m.dispose()
    for (const s of this.ctx.shaders) s.dispose()
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#app')
if (!canvas) throw new Error('SiteViewer: không tìm thấy canvas #app')

async function boot(c: HTMLCanvasElement): Promise<void> {
  const viewer = new SiteViewer(c, { antialias: false, requiredLimits: await gpuLimits() })
  await viewer.init()
}

void boot(canvas)
