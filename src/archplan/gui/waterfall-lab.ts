/**
 * VỊ TRÍ   — archplan/src/archplan/gui/waterfall-lab.ts
 * VAI TRÒ  — Gắn thí nghiệm 🌊 THÁC NƯỚC vào 🧪 Lab (cạnh Mái/Particles/Nền): khung TRÊN = slider
 *            structural (rebuild) + live (uniform); khung DƯỚI = doc công thức màn nước; ⚙ = màu + nền.
 * LIÊN HỆ  — lab-experiments.ts gọi setupWaterfallLab(hosts). Preview = WaterfallPreview
 *            (waterfall-preview.ts, WebGPU). Module: threejs-modules/components/Waterfall (Phase A2).
 *
 * DISPOSE: dispose() — preview.dispose() (loop + renderer + waterfall + panel).
 */

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

// Khung TRÊN: structural (đổi = dựng lại thác, throttle rAF) + live (uniform-cheap, kéo thoải mái).
function buildParams(host: Element | null, pv: WaterfallPreview): void {
  const s = { ...DEFAULT_STRUCTURAL }
  const area = document.createElement('div')
  area.append(
    // liveDrag=false: structural = REBUILD (dispose + new NodeMaterial/texture) → CHỈ commit khi BUÔNG.
    // Kéo-rebuild mỗi frame = bão dispose-in-flight trên WebGPU (thác biến mất) + recompile storm (perf).
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
    colTitle('Nước (live)'),
    sliderRow('Tốc chảy', 0, 4, 0.05, 1.1, (v) => pv.tune('flow', (w) => w.setFlow(v))),
    sliderRow('Vệt (tile)', 0.3, 6, 0.05, 1.6, (v) =>
      pv.tune('streak', (w) => w.setStreakScale(v))
    ),
    sliderRow('Ám màu', 0, 1, 0.02, 0.35, (v) => pv.tune('tint', (w) => w.setTint(v))),
    sliderRow('Khúc xạ', 0, 2, 0.05, 0.6, (v) => pv.tune('refract', (w) => w.setRefract(v))),
    sliderRow('Banding', 0, 1, 0.05, 0, (v) => pv.tune('poster', (w) => w.setPosterize(v))),
    sliderRow('Lắc mép', 0, 0.12, 0.005, 0.035, (v) => pv.tune('wobble', (w) => w.setWobble(v))),
    sliderRow('Mist đậm', 0, 1, 0.05, 0.7, (v) => pv.tune('mist', (w) => w.setMistIntensity(v))),
    sliderRow('Alpha màn', 0.3, 1, 0.02, 0.95, (v) => pv.tune('alpha', (w) => w.setOpacity(v)))
  )
  host?.replaceChildren(area)
}

// Khung DƯỚI: doc ngắn — công thức màn nước (đối chiếu khi tune).
function buildDoc(host: Element | null): void {
  const items: [string, string][] = [
    [
      'Màn nước',
      'Texture VỆT (canvas 1 lần) cuộn xuống 3 lớp ×1/×0.72(đảo U)/×1.5 — lớp nhanh làm méo UV.',
    ],
    [
      'Trong/đặc',
      'Khúc xạ backbuffer (méo theo vệt) + Ám màu; trắng = vệt + sủi-dần-về-chân + fresnel.',
    ],
    ['Band', 'Lip trắng ở mép tràn · foot sủi ở chân · Banding >0 = nấc màu kiểu RiME.'],
    ['Chân thác', 'Mist bốc lên chậm + Splash bắn ngang (sprite tròn mềm, NormalBlending).'],
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
