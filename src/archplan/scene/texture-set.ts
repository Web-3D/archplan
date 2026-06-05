/**
 * VỊ TRÍ   — archplan/src/archplan/scene/texture-set.ts
 * VAI TRÒ  — Loader texture set bề-mặt (PBR) theo PROTOCOL assets/textures: chọn loader theo ĐUÔI FILE
 *            (.ktx2→KTX2Loader, .jpg/.png→TextureLoader) → 0 code change khi đổi format. Set wrap=Repeat +
 *            colorSpace (srgb/linear theo manifest) + anisotropy → trả PhotoGroundMaps cho lõi PhotoGround.
 * LIÊN HỆ  — Dùng bởi ArchPlanLab (ground 'grass-tex'). Spec = url + colorSpace mỗi map (lấy từ meta.json).
 *
 * ⚠️ KTX2: cần transcoder (basis) + renderer.detectSupport. Hiện asset là JPG nên nhánh KTX2 CHƯA chạy
 *    thực tế (toktx chưa cài) — đã đặt sẵn, finalize + test khi có .ktx2. JPG path đầy đủ.
 */

import { NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture, TextureLoader } from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type { WebGPURenderer } from 'three/webgpu'
import type { PhotoGroundMaps } from 'threejs-modules/shaders/ground/PhotoGround'

export type ColorSpaceTag = 'srgb' | 'linear'
export interface MapSpec {
  url: string
  colorSpace: ColorSpaceTag
}
export interface SurfaceTextureSpec {
  baseColor: MapSpec
  normal?: MapSpec
  roughness?: MapSpec
  ao?: MapSpec
  /** Anisotropy filtering. Default 8. */
  anisotropy?: number
}

let _ktx2: KTX2Loader | null = null
function ktx2Loader(renderer: WebGPURenderer): KTX2Loader {
  if (_ktx2) return _ktx2
  // Transcoder basis từ CDN three 0.174 (khớp version). detectSupport: WebGPURenderer ok (cast type examples).
  _ktx2 = new KTX2Loader()
    .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/libs/basis/')
    .detectSupport(renderer as unknown as Parameters<KTX2Loader['detectSupport']>[0])
  return _ktx2
}

function loadOne(spec: MapSpec, anis: number, renderer: WebGPURenderer): Promise<Texture> {
  const isKtx2 = spec.url.toLowerCase().includes('.ktx2')
  const loader = isKtx2 ? ktx2Loader(renderer) : new TextureLoader()
  return new Promise<Texture>((res, rej) => {
    loader.load(
      spec.url,
      (tex: Texture) => {
        tex.wrapS = tex.wrapT = RepeatWrapping
        tex.colorSpace = spec.colorSpace === 'srgb' ? SRGBColorSpace : NoColorSpace
        tex.anisotropy = anis
        tex.needsUpdate = true
        res(tex)
      },
      undefined,
      rej
    )
  })
}

// Load đủ map (baseColor bắt buộc; normal/roughness/ao tùy). Trả PhotoGroundMaps cho PhotoGround.
export async function loadSurfaceTextureSet(
  spec: SurfaceTextureSpec,
  renderer: WebGPURenderer
): Promise<PhotoGroundMaps> {
  const anis = spec.anisotropy ?? 8
  const maps: PhotoGroundMaps = { baseColor: await loadOne(spec.baseColor, anis, renderer) }
  if (spec.normal) maps.normal = await loadOne(spec.normal, anis, renderer)
  if (spec.roughness) maps.roughness = await loadOne(spec.roughness, anis, renderer)
  if (spec.ao) maps.ao = await loadOne(spec.ao, anis, renderer)
  return maps
}

// Dispose 1 texture set (caller sở hữu — PhotoGround.dispose KHÔNG đụng texture).
export function disposeSurfaceTextureSet(maps: PhotoGroundMaps | null): void {
  if (!maps) return
  maps.baseColor.dispose()
  maps.normal?.dispose()
  maps.roughness?.dispose()
  maps.ao?.dispose()
}
