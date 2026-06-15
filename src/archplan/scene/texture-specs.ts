/**
 * VỊ TRÍ   — archplan/src/archplan/scene/texture-specs.ts
 * VAI TRÒ  — MANIFEST texture GROUND + BORDER (key → tile + URL map theo PROTOCOL assets/textures). DATA THUẦN
 *            (chỉ ?url import + manifest meta.json) — KHÔNG logic. Tách để site-viewer (production) dùng CHUNG
 *            manifest mà KHÔNG kéo cả ArchPlanLab (editor) vào bundle.
 * LIÊN HỆ  — Consumer: `site-viewer.ts` (loadSurfaceTextureSet + PhotoGround/MixManager). loader = ./texture-set.
 *
 * ⚠️ SOURCE-OF-TRUTH hiện vẫn là `ArchPlanLab.ts` (GROUND_TEX_SPEC/BORDER_TEX_SPEC bản editor) — file này là
 *    BẢN SAO có chủ đích (editor dùng URL chung cho cả editor-preview/wood/fence nên KHÔNG trích an toàn được
 *    mà không gỡ-nối ~50 import xuyên monolith → rủi ro vỡ editor). THÊM TEXTURE GROUND MỚI ở editor → đồng bộ
 *    1 dòng vào đây, KẺO viewer render texture đó PHẲNG (drift TỰ LỘ khi soi, không âm thầm). Hợp nhất DRY = deferred.
 */

import turfManifest from 'assets/textures/ground/artificial_turf/meta.json'
import turfAoUrl from 'assets/textures/ground/artificial_turf/production/ao.ktx2?url'
import turfBaseColorUrl from 'assets/textures/ground/artificial_turf/production/basecolor.ktx2?url'
import turfNormalUrl from 'assets/textures/ground/artificial_turf/production/normal.ktx2?url'
import turfRoughnessUrl from 'assets/textures/ground/artificial_turf/production/roughness.ktx2?url'
import bgravelManifest from 'assets/textures/ground/beach_gravel/meta.json'
import bgravelAoUrl from 'assets/textures/ground/beach_gravel/production/ao.ktx2?url'
import bgravelBaseColorUrl from 'assets/textures/ground/beach_gravel/production/basecolor.ktx2?url'
import bgravelNormalUrl from 'assets/textures/ground/beach_gravel/production/normal.ktx2?url'
import bgravelRoughnessUrl from 'assets/textures/ground/beach_gravel/production/roughness.ktx2?url'
import cobbleManifest from 'assets/textures/ground/cobblestone/meta.json'
import cobbleAoUrl from 'assets/textures/ground/cobblestone/production/ao.ktx2?url'
import cobbleBaseColorUrl from 'assets/textures/ground/cobblestone/production/basecolor.ktx2?url'
import cobbleNormalUrl from 'assets/textures/ground/cobblestone/production/normal.ktx2?url'
import cobbleRoughnessUrl from 'assets/textures/ground/cobblestone/production/roughness.ktx2?url'
import cgravelManifest from 'assets/textures/ground/construction_grave/meta.json'
import cgravelAoUrl from 'assets/textures/ground/construction_grave/production/ao.ktx2?url'
import cgravelBaseColorUrl from 'assets/textures/ground/construction_grave/production/basecolor.ktx2?url'
import cgravelNormalUrl from 'assets/textures/ground/construction_grave/production/normal.ktx2?url'
import cgravelRoughnessUrl from 'assets/textures/ground/construction_grave/production/roughness.ktx2?url'
import grassoManifest from 'assets/textures/ground/grass_o/meta.json'
import grassoAoUrl from 'assets/textures/ground/grass_o/production/ao.ktx2?url'
import grassoBaseColorUrl from 'assets/textures/ground/grass_o/production/basecolor.ktx2?url'
import grassoNormalUrl from 'assets/textures/ground/grass_o/production/normal.ktx2?url'
import grassoRoughnessUrl from 'assets/textures/ground/grass_o/production/roughness.ktx2?url'
import sandManifest from 'assets/textures/ground/rippled_sand/meta.json'
import sandAoUrl from 'assets/textures/ground/rippled_sand/production/ao.ktx2?url'
import sandBaseColorUrl from 'assets/textures/ground/rippled_sand/production/basecolor.ktx2?url'
import sandNormalUrl from 'assets/textures/ground/rippled_sand/production/normal.ktx2?url'
import sandRoughnessUrl from 'assets/textures/ground/rippled_sand/production/roughness.ktx2?url'
import romanManifest from 'assets/textures/ground/roman_stone_floor/meta.json'
import romanAoUrl from 'assets/textures/ground/roman_stone_floor/production/ao.ktx2?url'
import romanBaseColorUrl from 'assets/textures/ground/roman_stone_floor/production/basecolor.ktx2?url'
import romanNormalUrl from 'assets/textures/ground/roman_stone_floor/production/normal.ktx2?url'
import romanRoughnessUrl from 'assets/textures/ground/roman_stone_floor/production/roughness.ktx2?url'
import asphaltManifest from 'assets/textures/ground/rough_asphalt/meta.json'
import asphaltAoUrl from 'assets/textures/ground/rough_asphalt/production/ao.ktx2?url'
import asphaltBaseColorUrl from 'assets/textures/ground/rough_asphalt/production/basecolor.ktx2?url'
import asphaltNormalUrl from 'assets/textures/ground/rough_asphalt/production/normal.ktx2?url'
import asphaltRoughnessUrl from 'assets/textures/ground/rough_asphalt/production/roughness.ktx2?url'
import sand2kManifest from 'assets/textures/ground/thai_beach_sand2k/meta.json'
import sand2kAoUrl from 'assets/textures/ground/thai_beach_sand2k/production/ao.ktx2?url'
import sand2kBaseColorUrl from 'assets/textures/ground/thai_beach_sand2k/production/basecolor.ktx2?url'
import sand2kNormalUrl from 'assets/textures/ground/thai_beach_sand2k/production/normal.ktx2?url'
import sand2kRoughnessUrl from 'assets/textures/ground/thai_beach_sand2k/production/roughness.ktx2?url'
import sand4kManifest from 'assets/textures/ground/thai_beach_sand4k/meta.json'
import sand4kAoUrl from 'assets/textures/ground/thai_beach_sand4k/production/ao.ktx2?url'
import sand4kBaseColorUrl from 'assets/textures/ground/thai_beach_sand4k/production/basecolor.ktx2?url'
import sand4kNormalUrl from 'assets/textures/ground/thai_beach_sand4k/production/normal.ktx2?url'
import sand4kRoughnessUrl from 'assets/textures/ground/thai_beach_sand4k/production/roughness.ktx2?url'
import grassManifest from 'assets/textures/ground/uncut-grass/meta.json'
import grassAoUrl from 'assets/textures/ground/uncut-grass/production/ao.ktx2?url'
import grassBaseColorUrl from 'assets/textures/ground/uncut-grass/production/basecolor.ktx2?url'
import grassNormalUrl from 'assets/textures/ground/uncut-grass/production/normal.ktx2?url'
import grassRoughnessUrl from 'assets/textures/ground/uncut-grass/production/roughness.ktx2?url'
import pavementManifest from 'assets/textures/ground/worn_pavement/meta.json'
import pavementAoUrl from 'assets/textures/ground/worn_pavement/production/ao.ktx2?url'
import pavementBaseColorUrl from 'assets/textures/ground/worn_pavement/production/basecolor.ktx2?url'
import pavementNormalUrl from 'assets/textures/ground/worn_pavement/production/normal.ktx2?url'
import pavementRoughnessUrl from 'assets/textures/ground/worn_pavement/production/roughness.ktx2?url'
import coalAoUrl from 'assets/textures/stone/coal_stone/production/ao.ktx2?url'
import coalBaseColorUrl from 'assets/textures/stone/coal_stone/production/basecolor.ktx2?url'
import coalNormalUrl from 'assets/textures/stone/coal_stone/production/normal.ktx2?url'
import coalRoughnessUrl from 'assets/textures/stone/coal_stone/production/roughness.ktx2?url'
import icelandicBaseColorUrl from 'assets/textures/stone/icelandic_jagged/production/basecolor.ktx2?url'
import icelandicNormalUrl from 'assets/textures/stone/icelandic_jagged/production/normal.ktx2?url'
import icelandicRoughnessUrl from 'assets/textures/stone/icelandic_jagged/production/roughness.ktx2?url'
import rockAoUrl from 'assets/textures/stone/rock_rough/production/ao.ktx2?url'
import rockBaseColorUrl from 'assets/textures/stone/rock_rough/production/basecolor.ktx2?url'
import rockNormalUrl from 'assets/textures/stone/rock_rough/production/normal.ktx2?url'
import rockRoughnessUrl from 'assets/textures/stone/rock_rough/production/roughness.ktx2?url'
import cinderManifest from 'assets/textures/wall/cinder-blocks-wall/meta.json'
import cinderAoUrl from 'assets/textures/wall/cinder-blocks-wall/production/ao.ktx2?url'
import cinderBaseColorUrl from 'assets/textures/wall/cinder-blocks-wall/production/basecolor.ktx2?url'
import cinderNormalUrl from 'assets/textures/wall/cinder-blocks-wall/production/normal.ktx2?url'
import cinderRoughnessUrl from 'assets/textures/wall/cinder-blocks-wall/production/roughness.ktx2?url'
import stoneManifest from 'assets/textures/wall/stone-wall/meta.json'
import stoneAoUrl from 'assets/textures/wall/stone-wall/production/ao.ktx2?url'
import stoneBaseColorUrl from 'assets/textures/wall/stone-wall/production/basecolor.ktx2?url'
import stoneNormalUrl from 'assets/textures/wall/stone-wall/production/normal.ktx2?url'
import stoneRoughnessUrl from 'assets/textures/wall/stone-wall/production/roughness.ktx2?url'
import type { GroundMaterialKey } from 'threejs-modules/site/state'
import type { BorderMaterialKey } from 'threejs-modules/site/state'

import type { SurfaceTextureSpec } from './texture-set'

// 🌱🏜️ Bảng texture GROUND (key → tile + spec URL). PhotoGround (UV world-XZ, lát theo tileSizeMeters).
export const GROUND_TEX_SPEC: Partial<
  Record<GroundMaterialKey, { tile: number; spec: SurfaceTextureSpec }>
> = {
  'grass-tex': {
    tile: grassManifest.tileSizeMeters,
    spec: {
      baseColor: { url: grassBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: grassNormalUrl, colorSpace: 'linear' },
      roughness: { url: grassRoughnessUrl, colorSpace: 'linear' },
      ao: { url: grassAoUrl, colorSpace: 'linear' },
    },
  },
  'rippled-sand': {
    tile: sandManifest.tileSizeMeters,
    spec: {
      baseColor: { url: sandBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: sandNormalUrl, colorSpace: 'linear' },
      roughness: { url: sandRoughnessUrl, colorSpace: 'linear' },
      ao: { url: sandAoUrl, colorSpace: 'linear' },
    },
  },
  'construction-gravel': {
    tile: cgravelManifest.tileSizeMeters,
    spec: {
      baseColor: { url: cgravelBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: cgravelNormalUrl, colorSpace: 'linear' },
      roughness: { url: cgravelRoughnessUrl, colorSpace: 'linear' },
      ao: { url: cgravelAoUrl, colorSpace: 'linear' },
    },
  },
  'beach-gravel': {
    tile: bgravelManifest.tileSizeMeters,
    spec: {
      baseColor: { url: bgravelBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: bgravelNormalUrl, colorSpace: 'linear' },
      roughness: { url: bgravelRoughnessUrl, colorSpace: 'linear' },
      ao: { url: bgravelAoUrl, colorSpace: 'linear' },
    },
  },
  'rough-asphalt': {
    tile: asphaltManifest.tileSizeMeters,
    spec: {
      baseColor: { url: asphaltBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: asphaltNormalUrl, colorSpace: 'linear' },
      roughness: { url: asphaltRoughnessUrl, colorSpace: 'linear' },
      ao: { url: asphaltAoUrl, colorSpace: 'linear' },
    },
  },
  'worn-pavement': {
    tile: pavementManifest.tileSizeMeters,
    spec: {
      baseColor: { url: pavementBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: pavementNormalUrl, colorSpace: 'linear' },
      roughness: { url: pavementRoughnessUrl, colorSpace: 'linear' },
      ao: { url: pavementAoUrl, colorSpace: 'linear' },
    },
  },
  'roman-stone-floor': {
    tile: romanManifest.tileSizeMeters,
    spec: {
      baseColor: { url: romanBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: romanNormalUrl, colorSpace: 'linear' },
      roughness: { url: romanRoughnessUrl, colorSpace: 'linear' },
      ao: { url: romanAoUrl, colorSpace: 'linear' },
    },
  },
  'artificial-turf': {
    tile: turfManifest.tileSizeMeters,
    spec: {
      baseColor: { url: turfBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: turfNormalUrl, colorSpace: 'linear' },
      roughness: { url: turfRoughnessUrl, colorSpace: 'linear' },
      ao: { url: turfAoUrl, colorSpace: 'linear' },
    },
  },
  'grass-o': {
    tile: grassoManifest.tileSizeMeters,
    spec: {
      baseColor: { url: grassoBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: grassoNormalUrl, colorSpace: 'linear' },
      roughness: { url: grassoRoughnessUrl, colorSpace: 'linear' },
      ao: { url: grassoAoUrl, colorSpace: 'linear' },
    },
  },
  'thai-beach-sand-2k': {
    tile: sand2kManifest.tileSizeMeters,
    spec: {
      baseColor: { url: sand2kBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: sand2kNormalUrl, colorSpace: 'linear' },
      roughness: { url: sand2kRoughnessUrl, colorSpace: 'linear' },
      ao: { url: sand2kAoUrl, colorSpace: 'linear' },
    },
  },
  'thai-beach-sand-4k': {
    tile: sand4kManifest.tileSizeMeters,
    spec: {
      baseColor: { url: sand4kBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: sand4kNormalUrl, colorSpace: 'linear' },
      roughness: { url: sand4kRoughnessUrl, colorSpace: 'linear' },
      ao: { url: sand4kAoUrl, colorSpace: 'linear' },
    },
  },
  cobblestone: {
    tile: cobbleManifest.tileSizeMeters,
    spec: {
      baseColor: { url: cobbleBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: cobbleNormalUrl, colorSpace: 'linear' },
      roughness: { url: cobbleRoughnessUrl, colorSpace: 'linear' },
      ao: { url: cobbleAoUrl, colorSpace: 'linear' },
    },
  },
  'cinder-blocks-wall': {
    tile: cinderManifest.tileSizeMeters,
    spec: {
      baseColor: { url: cinderBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: cinderNormalUrl, colorSpace: 'linear' },
      roughness: { url: cinderRoughnessUrl, colorSpace: 'linear' },
      ao: { url: cinderAoUrl, colorSpace: 'linear' },
    },
  },
  'stone-wall': {
    tile: stoneManifest.tileSizeMeters,
    spec: {
      baseColor: { url: stoneBaseColorUrl, colorSpace: 'srgb' },
      normal: { url: stoneNormalUrl, colorSpace: 'linear' },
      roughness: { url: stoneRoughnessUrl, colorSpace: 'linear' },
      ao: { url: stoneAoUrl, colorSpace: 'linear' },
    },
  },
}

// 🪨 Texture đá cho RÀO/VIỀN hồ (TexturedSurface triplanar). tile 0.5m. icelandic KHÔNG có ao map.
export type BorderTexKey = Exclude<BorderMaterialKey, 'none'>
export const BORDER_TILE = 0.5

export const BORDER_TEX_SPEC: Record<BorderTexKey, SurfaceTextureSpec> = {
  'icelandic-jagged': {
    baseColor: { url: icelandicBaseColorUrl, colorSpace: 'srgb' },
    normal: { url: icelandicNormalUrl, colorSpace: 'linear' },
    roughness: { url: icelandicRoughnessUrl, colorSpace: 'linear' },
  },
  'coal-stone': {
    baseColor: { url: coalBaseColorUrl, colorSpace: 'srgb' },
    normal: { url: coalNormalUrl, colorSpace: 'linear' },
    roughness: { url: coalRoughnessUrl, colorSpace: 'linear' },
    ao: { url: coalAoUrl, colorSpace: 'linear' },
  },
  'rock-rough': {
    baseColor: { url: rockBaseColorUrl, colorSpace: 'srgb' },
    normal: { url: rockNormalUrl, colorSpace: 'linear' },
    roughness: { url: rockRoughnessUrl, colorSpace: 'linear' },
    ao: { url: rockAoUrl, colorSpace: 'linear' },
  },
}
