/**
 * VỊ TRÍ   — archplan/src/archplan/scene/texture-set.ts
 * VAI TRÒ  — Loader texture set bề-mặt (PBR) theo PROTOCOL assets/textures: chọn loader theo ĐUÔI FILE
 *            (.ktx2→KTX2Loader, .jpg/.png→TextureLoader) → 0 code change khi đổi format. Set wrap=Repeat +
 *            colorSpace (srgb/linear theo manifest) + anisotropy → trả PhotoGroundMaps cho lõi PhotoGround.
 * LIÊN HỆ  — Dùng bởi ArchPlanLab (ground 'grass-tex'). Spec = url + colorSpace mỗi map (lấy từ meta.json).
 *
 * ⚠️ KTX2: cần transcoder (basis, serve local từ public/basis/) + renderer.detectSupport. Asset production/ =
 *    .ktx2 (toktx v4.4: basecolor ETC1S sRGB, normal UASTC RDO linear, rough/ao ETC1S linear, genmipmap).
 *    JPG path vẫn giữ (loadOne chọn loader theo đuôi) cho consumer khác / fallback.
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
  // Transcoder basis serve LOCAL từ public/basis/ (copy từ three/examples/jsm/libs/basis — khớp version 0.174).
  // KHÔNG dùng CDN: deploy không phụ thuộc mạng ngoài + offline-safe. detectSupport: WebGPURenderer ok (cast type examples).
  _ktx2 = new KTX2Loader()
    .setTranscoderPath('/basis/')
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

// 📏 Đếm TẬP TRUNG số texture-set đang load. MỌI caller (ground/mix-via-mapsOf/border/sand/slab/wood) đều qua hàm
// NÀY → gate "đã load hết texture chưa?" robust, KHÔNG cần liệt kê từng cờ *Loading (dễ SÓT — đã sót border/sand/mix).
// 0 = mọi texture qua loader này xong. Dùng: ArchPlanLab._tickWaterReveal (chờ mới bật mặt nước).
let _pending = 0
let _lastActivity = 0 // performance.now() lần texture-set GẦN NHẤT start HOẶC xong → đo "cascade IM hẳn" cho reveal nước
export function texturesPending(): number {
  return _pending
}
// ms kể từ texture-set gần nhất start/xong. Lớn = không còn ai động tĩnh (cascade tắt). Dùng: gate reveal mặt nước.
export function textureIdleMs(): number {
  return performance.now() - _lastActivity
}

// Load đủ map (baseColor bắt buộc; normal/roughness/ao tùy). Trả PhotoGroundMaps cho PhotoGround.
export async function loadSurfaceTextureSet(
  spec: SurfaceTextureSpec,
  renderer: WebGPURenderer
): Promise<PhotoGroundMaps> {
  const anis = spec.anisotropy ?? 8
  const t0 = performance.now()
  _pending++
  _lastActivity = t0 // 📏 hoạt động: BẮT ĐẦU load → reset đồng-hồ-im
  try {
    // 🚀 Load SONG SONG mọi map (trước await TUẦN TỰ = 4× latency/set). Promise.all = fetch+decode+upload ĐỒNG THỜI.
    const [baseColor, normal, roughness, ao] = await Promise.all([
      loadOne(spec.baseColor, anis, renderer),
      spec.normal ? loadOne(spec.normal, anis, renderer) : Promise.resolve(undefined),
      spec.roughness ? loadOne(spec.roughness, anis, renderer) : Promise.resolve(undefined),
      spec.ao ? loadOne(spec.ao, anis, renderer) : Promise.resolve(undefined),
    ])
    const maps: PhotoGroundMaps = { baseColor }
    if (normal) maps.normal = normal
    if (roughness) maps.roughness = roughness
    if (ao) maps.ao = ao
    if (import.meta.env.DEV)
      console.info(
        `[tex] ${spec.baseColor.url.split('/').slice(-3).join('/')} ${(performance.now() - t0).toFixed(0)}ms` // 📏 per-set
      )
    return maps
  } finally {
    _pending--
    _lastActivity = performance.now() // 📏 hoạt động: XONG load (kể cả lỗi) → reset đồng-hồ-im
  }
}

// Dispose 1 texture set (caller sở hữu — PhotoGround.dispose KHÔNG đụng texture).
export function disposeSurfaceTextureSet(maps: PhotoGroundMaps | null): void {
  if (!maps) return
  maps.baseColor.dispose()
  maps.normal?.dispose()
  maps.roughness?.dispose()
  maps.ao?.dispose()
}
