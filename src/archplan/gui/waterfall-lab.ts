/**
 * VỊ TRÍ   — archplan/src/archplan/gui/waterfall-lab.ts
 * VAI TRÒ  — Gắn thí nghiệm 🌊 THÁC NƯỚC vào 🧪 Lab (cạnh Mái/Particles/Nền): khung TRÊN = slider
 *            structural (rebuild) + live (uniform); khung DƯỚI = doc công thức màn nước; ⚙ = màu + nền.
 * LIÊN HỆ  — lab-experiments.ts gọi setupWaterfallLab(hosts). Preview = WaterfallPreview
 *            (waterfall-preview.ts, WebGPU). Module: threejs-modules/components/Waterfall (Phase A2).
 *
 * DISPOSE: dispose() — preview.dispose() (loop + renderer + waterfall + panel).
 */

import type { FallSample, FlowSample } from 'threejs-modules/components/Waterfall'

import { sliderRow } from './tweak'
import { DEFAULT_STRUCTURAL, WaterfallPreview } from './waterfall-preview'

function setHead(host: Element | null, text: string): void {
  const head = host?.previousElementSibling
  if (head) head.textContent = text
}

function colTitle(text: string): HTMLElement {
  const t = document.createElement('div')
  t.className = 'ap-roof-col-title'
  t.textContent = text
  return t
}

// Structural (đổi = dựng lại thác, throttle rAF) — liveDrag=false: REBUILD (dispose + new NodeMaterial/
// texture) CHỈ commit khi BUÔNG. Kéo-rebuild mỗi frame = bão dispose-in-flight WebGPU + recompile storm.
function structuralRows(pv: WaterfallPreview): HTMLElement[] {
  const s = { ...DEFAULT_STRUCTURAL }
  return [
    colTitle('Khung (rebuild khi buông)'),
    sliderRow('Ngang (m)', 0.5, 6, 0.1, s.width, (v) => pv.setStructural({ width: v }), false),
    sliderRow('Cao (m)', 0.5, 5, 0.1, s.height, (v) => pv.setStructural({ height: v }), false),
    sliderRow('Vọt mép (m)', 0, 0.8, 0.01, s.arc, (v) => pv.setStructural({ arc: v }), false),
    sliderRow(
      'Hạt mist',
      0,
      600,
      10,
      s.mistCount,
      (v) => pv.setStructural({ mistCount: v }),
      false
    ),
    sliderRow(
      'Mặt ngang (m)',
      0,
      3,
      0.05,
      s.crestLength,
      (v) => pv.setStructural({ crestLength: v }),
      false
    ),
    sliderRow(
      'Sâu dòng (m)',
      0,
      0.3,
      0.01,
      s.crestDepth,
      (v) => pv.setStructural({ crestDepth: v }),
      false
    ),
  ]
}

// Mặt ngang đỉnh (crest) — 3 uniform live của đoạn nước nằm ngang trước khi đổ.
function crestRows(pv: WaterfallPreview): HTMLElement[] {
  return [
    colTitle('Mặt ngang đỉnh (live)'),
    sliderRow('Tốc mặt', 0, 2, 0.05, 0.6, (v) => pv.tune('crestSpeed', (w) => w.setCrestSpeed(v))),
    sliderRow('Gợn mặt', 0, 1, 0.05, 0.5, (v) =>
      pv.tune('crestRipple', (w) => w.setCrestRipple(v))
    ),
    sliderRow('Trong mặt', 0, 1, 0.02, 0.55, (v) =>
      pv.tune('crestAlpha', (w) => w.setCrestAlpha(v))
    ),
  ]
}

// Khung TRÊN: structural + live (uniform-cheap, kéo thoải mái) + điều dòng + theo đoạn rơi.
function buildParams(host: Element | null, pv: WaterfallPreview): void {
  const area = document.createElement('div')
  area.append(
    ...structuralRows(pv),
    colTitle('Nước (live)'),
    // master vật lý: 0 êm (đầu thác trong veo) ↔ 1 ồ ạt (phá cấu trúc — trắng xóa); 0.5 = trung tính
    sliderRow('Nguồn (êm→ào)', 0, 1, 0.02, 0.5, (v) => pv.tune('surge', (w) => w.setSurge(v))),
    sliderRow('Tốc chảy', 0, 4, 0.05, 1.1, (v) => pv.tune('flow', (w) => w.setFlow(v))),
    sliderRow('Vệt (tile)', 0.3, 6, 0.05, 1.6, (v) =>
      pv.tune('streak', (w) => w.setStreakScale(v))
    ),
    sliderRow('Ám màu', 0, 1, 0.02, 0.35, (v) => pv.tune('tint', (w) => w.setTint(v))),
    sliderRow('Khúc xạ', 0, 2, 0.05, 0.6, (v) => pv.tune('refract', (w) => w.setRefract(v))),
    sliderRow('Banding', 0, 1, 0.05, 0, (v) => pv.tune('poster', (w) => w.setPosterize(v))),
    sliderRow('Lắc mép', 0, 0.12, 0.005, 0.035, (v) => pv.tune('wobble', (w) => w.setWobble(v))),
    sliderRow('Phồng 3D', 0, 0.15, 0.005, 0.045, (v) => pv.tune('bulge', (w) => w.setBulge(v))),
    sliderRow('Mist đậm', 0, 1, 0.05, 0.7, (v) => pv.tune('mist', (w) => w.setMistIntensity(v))),
    sliderRow('Bọt chân', 0, 1, 0.05, 0.65, (v) => pv.tune('footFoam', (w) => w.setFootFoam(v))),
    sliderRow('Lấp lánh', 0, 1, 0.05, 0.5, (v) => pv.tune('glint', (w) => w.setGlint(v))),
    sliderRow('Alpha màn', 0.3, 1, 0.02, 0.95, (v) => pv.tune('alpha', (w) => w.setOpacity(v))),
    ...crestRows(pv),
    ...flowRows(pv),
    ...fallRows(pv)
  )
  host?.replaceChildren(area)
}

// ── Theo đoạn rơi (A3.1): 3 đoạn Đỉnh/Giữa/Chân — chip chọn đoạn, 5 slider áp cho đoạn đang chọn ──

type FallSeg = Required<FallSample>
const SEG_LABELS = ['Đỉnh', 'Giữa', 'Chân']

// 5 slider của 1 đoạn — render LẠI khi đổi đoạn (initial = giá trị đã lưu của đoạn đó).
function renderFallSliders(host: HTMLElement, s: FallSeg, apply: () => void): void {
  const bind = (k: keyof FallSeg) => (v: number) => {
    s[k] = v
    apply()
  }
  host.replaceChildren(
    sliderRow('Trong suốt', 0, 1, 0.02, s.opacity, bind('opacity')),
    sliderRow('Gương', 0, 1, 0.05, s.gloss, bind('gloss')),
    sliderRow('Bụi tán', 0, 1, 0.05, s.haze, bind('haze')),
    sliderRow('Nhiễu', 0, 1, 0.05, s.noise, bind('noise')),
    sliderRow('Vỡ hạt', 0, 1, 0.05, s.breakup, bind('breakup'))
  )
}

// Mỗi slider ghi vào đoạn đang chọn → setFallProfile([đỉnh, giữa, chân]) — module nội suy 64 texel
// dọc chiều rơi (chuyển tiếp mượt giữa đoạn). LIVE 0-rebuild như điều dòng ngang.
function fallRows(pv: WaterfallPreview): HTMLElement[] {
  const segs: FallSeg[] = SEG_LABELS.map(() => ({
    opacity: 1,
    gloss: 0,
    haze: 0,
    noise: 0,
    breakup: 0,
  }))
  let cur = 0
  const apply = (): void => {
    pv.tune('fallProfile', (w) => w.setFallProfile(segs))
  }
  const sliderHost = document.createElement('div')
  const chips = document.createElement('div')
  chips.className = 'ap-sdf-presets'
  const mark = (): void => {
    Array.from(chips.children).forEach((el, i) => {
      ;(el as HTMLElement).style.boxShadow = i === cur ? 'inset 0 0 0 1px #7fd4ff' : ''
    })
  }
  SEG_LABELS.forEach((label, i) => {
    const b = document.createElement('button')
    b.className = 'ap-sdf-chip'
    b.textContent = label
    b.addEventListener('click', () => {
      cur = i
      mark()
      renderFallSliders(sliderHost, segs[cur], apply)
    })
    chips.appendChild(b)
  })
  mark()
  renderFallSliders(sliderHost, segs[cur], apply)
  return [colTitle('Theo đoạn rơi (đỉnh → chân, live)'), chips, sliderHost]
}

interface FlowParams {
  streams: number // số dải nước chia đều theo bề ngang
  gap: number // tỉ lệ khe hở mỗi dải (0 = liền màn, tách dòng khi >0)
  churn: number // cuộn xiết — mạnh ở RANH dòng (nước cọ mép khe = sủi)
  varSpeed: number // lệch tốc — dải lẻ nhanh hơn dải chẵn (vệt "xé" tự nhiên ở ranh)
}

// Sinh profile điều dòng từ 4 tham số trực quan (mẫu 48 điểm — module nội suy lên strip 64×1).
function flowPattern(p: FlowParams): FlowSample[] {
  const out: FlowSample[] = []
  for (let i = 0; i < 48; i++) {
    const u = i / 47
    const x = Math.min(u * p.streams, p.streams - 0.001)
    const ph = x - Math.floor(x) // pha trong dải [0..1)
    const half = p.gap / 2
    const inside = ph >= half && ph <= 1 - half
    // core: 0 ở mép dòng → 1 ở tâm dòng (xiết tập trung tại mép — chỗ nước cọ khe)
    const core = inside ? Math.min(ph - half, 1 - half - ph) / Math.max(0.001, 0.5 - half) : 0
    out.push({
      density: inside ? 1 : 0,
      churn: inside ? p.churn * (1 - core * 0.6) : 0,
      speed: inside ? 1 + p.varSpeed * (Math.floor(x) % 2 ? 0.6 : -0.25) : 1,
    })
  }
  return out
}

// Điều dòng (A3): 4 slider → setFlowProfile (ghi strip 64×1) — LIVE, 0 rebuild 0 recompile.
function flowRows(pv: WaterfallPreview): HTMLElement[] {
  const p: FlowParams = { streams: 1, gap: 0, churn: 0, varSpeed: 0 }
  const apply = (): void => {
    const prof = flowPattern(p)
    pv.tune('flowProfile', (w) => w.setFlowProfile(prof))
  }
  const bind = (k: keyof FlowParams) => (v: number) => {
    p[k] = v
    apply()
  }
  return [
    colTitle('Điều dòng (live — tách & xiết)'),
    sliderRow('Số dòng', 1, 5, 1, p.streams, bind('streams')),
    sliderRow('Hở khe', 0, 0.7, 0.02, p.gap, bind('gap')),
    sliderRow('Xiết', 0, 1, 0.05, p.churn, bind('churn')),
    sliderRow('Lệch tốc', 0, 1, 0.05, p.varSpeed, bind('varSpeed')),
  ]
}

// Khung DƯỚI: doc ngắn — công thức màn nước (đối chiếu khi tune).
function buildDoc(host: Element | null): void {
  const items: [string, string][] = [
    [
      'Màn nước',
      'Texture VORONOI SỢI + FBM distort (canvas 1 lần — A4) cuộn 3 lớp ×1/×0.72(đảo U)/×1.5; Phồng 3D = WPO noise cuộn xuống, silhouette gồ ghề.',
    ],
    [
      'Trong/đặc',
      'Khúc xạ backbuffer (méo theo vệt) + Ám màu; trắng = vệt + sủi-dần-về-chân + fresnel.',
    ],
    [
      'Nguồn',
      'Master vật lý đan 7 điểm shader: êm = laminar trong veo không gợn · ồ ạt = phá cấu trúc, bọt trắng xóa bốc cao + tự vỡ hạt + mù mist.',
    ],
    ['Band', 'Lip trắng ở mép tràn · foot sủi ở chân · Banding >0 = nấc màu kiểu RiME.'],
    [
      'Chân thác',
      'Mist bốc chậm + Splash bắn ngang + VÒNG BỌT loang (A5 — đốm tròn blur cuộn ra ngoài, gate theo khe cắt dòng).',
    ],
    [
      'Điều dòng',
      'Strip 64×1 (R tốc cột · G mật độ · B xiết) sample theo bề ngang — tách dòng/cuộn xiết LIVE, 0 rebuild.',
    ],
    [
      'Theo đoạn rơi',
      'Strip dọc 64×2: chọn chip Đỉnh/Giữa/Chân rồi chỉnh Trong suốt/Gương/Bụi tán/Nhiễu/Vỡ hạt — nội suy mượt giữa đoạn.',
    ],
    ['Phase B', 'Ráp archplan: đổ vào pond (renderOrder sau mặt hồ) · vách đá = Houdini bake.'],
  ]
  const wrap = document.createElement('div')
  for (const [name, desc] of items) {
    const it = document.createElement('div')
    it.className = 'ap-ptier-doc'
    const b = document.createElement('b')
    b.textContent = name
    const sp = document.createElement('span')
    sp.textContent = ' — ' + desc
    it.append(b, sp)
    wrap.appendChild(it)
  }
  host?.replaceChildren(wrap)
}

// ⚙ Settings: preset màu nước/foam + độ sáng nền (xem thác trên nền tối/sáng).
function buildSettings(host: Element | null, pv: WaterfallPreview): void {
  if (!host) return
  const title = document.createElement('div')
  title.className = 'ap-lab-settings-title'
  title.textContent = '⚙ Cài đặt preview'
  const chips = document.createElement('div')
  chips.className = 'ap-sdf-presets'
  const presets: [string, number, number][] = [
    ['Lam nhạt', 0x9fc6d8, 0xf2fbff],
    ['Ngọc', 0x7fc4b2, 0xeffff8],
    ['Xanh sâu', 0x4f7f9a, 0xdef2fb],
    ['Suối đá', 0xb9c8c4, 0xffffff],
  ]
  for (const [label, water, foam] of presets) {
    const b = document.createElement('button')
    b.className = 'ap-sdf-chip'
    b.textContent = label
    b.addEventListener('click', () =>
      pv.tune('colors', (w) => {
        w.setWaterColor(water)
        w.setFoamColor(foam)
      })
    )
    chips.appendChild(b)
  }
  host.replaceChildren(
    title,
    sliderRow('Nền sáng', 0, 1, 0.05, 0.75, (v) => pv.setBackground(v)),
    chips
  )
}

// Gắn thí nghiệm thác nước vào Lab. Trả { dispose }.
export function setupWaterfallLab(
  previewHost: Element | null,
  paramHost: Element | null,
  docHost: Element | null,
  settingsHost: Element | null
): { dispose: () => void } {
  const preview = new WaterfallPreview(previewHost)
  setHead(paramHost, '🌊 Thác nước · 🎚️ Thông số')
  setHead(docHost, '📚 Công thức màn nước')
  buildParams(paramHost, preview)
  buildDoc(docHost)
  buildSettings(settingsHost, preview)
  return { dispose: (): void => preview.dispose() }
}
