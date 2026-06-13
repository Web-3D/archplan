/**
 * VỊ TRÍ   — archplan/src/archplan/gui/weather-lab.ts
 * VAI TRÒ  — Gắn thí nghiệm 🌧️ THỜI TIẾT vào 🧪 Lab (cạnh Mái/Particles/Nền/Thác): chip Mưa/Tuyết (rebuild)
 *            + slider live (tốc/bán kính/cao/cỡ/mờ/gió/drift); khung DƯỚI = doc field-paradigm; ⚙ = nền.
 * LIÊN HỆ  — lab-experiments.ts gọi setupWeatherLab(hosts). Preview = WeatherPreview (weather-preview.ts,
 *            WebGPU). Module: threejs-modules/effects/Precipitation.
 *
 * DISPOSE: dispose() — preview.dispose() (loop + renderer + precip + panel).
 */

import { sliderRow } from './tweak'
import { WeatherPreview } from './weather-preview'

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

// Chip Mưa/Tuyết — đổi = rebuild Precipitation với defaults mode đó. Slider live áp lại trên instance mới.
function modeChips(pv: WeatherPreview): HTMLElement {
  const chips = document.createElement('div')
  chips.className = 'ap-sdf-presets'
  const modes: [string, 'rain' | 'snow'][] = [
    ['🌧️ Mưa', 'rain'],
    ['❄️ Tuyết', 'snow'],
  ]
  const mark = (on: 'rain' | 'snow'): void => {
    Array.from(chips.children).forEach((el, i) => {
      ;(el as HTMLElement).style.boxShadow = modes[i][1] === on ? 'inset 0 0 0 1px #7fd4ff' : ''
    })
  }
  for (const [label, mode] of modes) {
    const b = document.createElement('button')
    b.className = 'ap-sdf-chip'
    b.textContent = label
    b.addEventListener('click', () => {
      pv.setMode(mode)
      mark(mode)
    })
    chips.appendChild(b)
  }
  mark('rain')
  return chips
}

// Khung TRÊN: chip mode + slider live (mọi prop trừ count/mode = uniform, kéo thoải mái 0 rebuild).
function buildParams(host: Element | null, pv: WeatherPreview): void {
  const area = document.createElement('div')
  area.append(
    colTitle('Kiểu (rebuild)'),
    modeChips(pv),
    colTitle('Thông số (live)'),
    sliderRow('Tốc rơi', 0.5, 30, 0.5, 17, (v) => pv.tune('speed', (p) => p.setSpeed(v))),
    sliderRow('Bán kính', 4, 40, 1, 18, (v) => pv.tune('radius', (p) => p.setRadius(v))),
    sliderRow('Cao cột', 6, 40, 1, 22, (v) => pv.tune('height', (p) => p.setHeight(v))),
    sliderRow('Cỡ hạt', 0.5, 8, 0.1, 1.6, (v) => pv.tune('size', (p) => p.setSize(v))),
    sliderRow('Độ mờ', 0, 1, 0.02, 0.35, (v) => pv.tune('opacity', (p) => p.setOpacity(v))),
    sliderRow('Gió ngang', -8, 8, 0.2, 2.4, (v) => pv.tune('wind', (p) => p.setWind(v, 0))),
    sliderRow('Drift lắc', 0, 2, 0.05, 0, (v) => pv.tune('drift', (p) => p.setDrift(v)))
  )
  host?.replaceChildren(area)
}

// Khung DƯỚI: doc ngắn — field-paradigm + giới hạn Phase A (đối chiếu khi tune).
function buildDoc(host: Element | null): void {
  const items: [string, string][] = [
    [
      'Field-paradigm',
      'Hạt rải đều thể tích, rơi cùng hướng (KHÁC emitter GPUParticleSystem phát từ 1 điểm). Spawn = vị trí trong trụ, không phải hướng.',
    ],
    [
      'Trụ bám camera',
      'XZ = cameraPosition (uniform three auto) + offset baked → hạt luôn quanh người xem, tịnh tiến cứng theo cam (không trượt trong khung).',
    ],
    [
      'Rơi GPU',
      'tFall = fract(time·speed/height + phase) → y wrap vô hạn, 0 CPU/frame ngoài 1 uniform. Fade 2 đầu né pop khi wrap.',
    ],
    [
      'Mưa↔Tuyết',
      'Phân biệt = tốc + drift + cỡ + màu. Mưa nghiêng theo gió; tuyết drift sin lắc lư.',
    ],
    [
      'Giới hạn A',
      'Mưa = chấm Points (CHƯA streak kéo dài — Points không stretch → Phase C). Chưa: tuyết đọng mái, mưa gợn hồ, sét.',
    ],
    [
      'Phase B',
      'Ráp archplan: 1 instance/scene, preset 🌧️❄️⛈️ liên động overcast SkyGradient (bão = overcast 1 + mưa dày + gió mạnh).',
    ],
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

// ⚙ Settings: độ sáng nền (xem hạt trên trời tối/sáng).
function buildSettings(host: Element | null, pv: WeatherPreview): void {
  if (!host) return
  const title = document.createElement('div')
  title.className = 'ap-lab-settings-title'
  title.textContent = '⚙ Cài đặt preview'
  host.replaceChildren(
    title,
    sliderRow('Nền sáng', 0, 1, 0.05, 0.5, (v) => pv.setBackground(v))
  )
}

// Gắn thí nghiệm thời tiết vào Lab. Trả { dispose }.
export function setupWeatherLab(
  previewHost: Element | null,
  paramHost: Element | null,
  docHost: Element | null,
  settingsHost: Element | null
): { dispose: () => void } {
  const preview = new WeatherPreview(previewHost)
  setHead(paramHost, '🌧️ Thời tiết · 🎚️ Thông số')
  setHead(docHost, '📚 Field-paradigm')
  buildParams(paramHost, preview)
  buildDoc(docHost)
  buildSettings(settingsHost, preview)
  return { dispose: (): void => preview.dispose() }
}
