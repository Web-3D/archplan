/**
 * VỊ TRÍ   — archplan/src/archplan/gui/particle-lab.ts
 * VAI TRÒ  — Gắn thí nghiệm PARTICLES vào 🧪 Lab, CHIA 3 MỨC (tier) tùy chọn: Mức 1 CPU Points (chạy thật) ·
 *            Mức 2 Shader Points · Mức 3 GPGPU (đang dựng). Khung trên = chọn mức + slider mức đang chọn;
 *            khung dưới = tài liệu phân loại 3 mức.
 * LIÊN HỆ  — lab-experiments.ts gọi setupParticleLab(hosts). Mức 1 lái ParticlePreview (particle-preview.ts).
 *
 * DISPOSE: dispose() — preview.dispose() (loop + buffer + renderer).
 */

import { DEFAULT_PARTICLE, type ParticleParams, ParticlePreview } from './particle-preview'
import { sliderRow } from './tweak'

// 1 mức = cách dựng nội dung khung THÔNG SỐ cho mức đó (Mức 1 có slider thật; 2/3 là stub mô tả).
interface Tier {
  id: number
  chip: string
  fill: (area: HTMLElement) => void
}

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

// Slider Mức 1 — đổi trực tiếp ParticlePreview (CPU đài phun).
function buildTier1(area: HTMLElement, preview: ParticlePreview, p: ParticleParams): void {
  area.replaceChildren(
    colTitle('Mức 1 · CPU Points — đài phun'),
    sliderRow('Số hạt', 0, 8000, 50, p.count, (v) => preview.setCount(v)),
    sliderRow('Tốc độ', 0, 12, 0.1, p.speed, (v) => preview.setSpeed(v)),
    sliderRow('Tản ngang', 0, 5, 0.05, p.spread, (v) => preview.setSpread(v)),
    sliderRow('Trọng lực', 0, 20, 0.1, p.gravity, (v) => preview.setGravity(v)),
    sliderRow('Đời (s)', 0.3, 6, 0.1, p.lifetime, (v) => preview.setLifetime(v)),
    sliderRow('Cỡ hạt', 0.01, 0.4, 0.005, p.size, (v) => preview.setSize(v))
  )
}

// Stub mức chưa dựng — mô tả sẽ làm gì (đặt kỳ vọng, không giả vờ chạy).
function buildStub(area: HTMLElement, title: string, desc: string): void {
  const note = document.createElement('div')
  note.className = 'ap-ptier-stub'
  note.textContent = desc
  area.replaceChildren(colTitle(title), note)
}

const STUB2 =
  'Vị trí hạt tính TRONG vertex shader theo uTime — GPU lo, không update CPU mỗi frame. ' +
  'Hàng trăm nghìn hạt, chuyển động xác định (mưa, lá rơi). Đang dựng.'
const STUB3 =
  'GPUComputationRenderer ping-pong FBO: mô phỏng vận tốc/va chạm thật, tới hàng triệu hạt — ' +
  'có thể cho hạt va vào SDF lưỡi dao. Nối hướng iq Shadertoy. Đang dựng.'

// Khung TRÊN: hàng chip chọn Mức + vùng thông số (thay theo mức chọn).
function buildTierSelector(
  host: Element | null,
  preview: ParticlePreview,
  p: ParticleParams
): void {
  const tiers: Tier[] = [
    { id: 1, chip: 'Mức 1 · CPU', fill: (a) => buildTier1(a, preview, p) },
    { id: 2, chip: 'Mức 2 · Shader', fill: (a) => buildStub(a, 'Mức 2 · Shader Points', STUB2) },
    { id: 3, chip: 'Mức 3 · GPGPU', fill: (a) => buildStub(a, 'Mức 3 · GPGPU', STUB3) },
  ]
  const bar = document.createElement('div')
  bar.className = 'ap-ptier-bar'
  const area = document.createElement('div')
  area.className = 'ap-ptier-area'
  const chips: HTMLButtonElement[] = []
  const pick = (t: Tier, btn: HTMLButtonElement): void => {
    for (const c of chips) c.classList.toggle('ap-ptier-on', c === btn)
    t.fill(area)
  }
  for (const t of tiers) {
    const b = document.createElement('button')
    b.className = 'ap-ptier-chip'
    b.textContent = t.chip
    b.addEventListener('click', () => pick(t, b))
    chips.push(b)
    bar.appendChild(b)
  }
  host?.replaceChildren(bar, area)
  pick(tiers[0], chips[0]) // mặc định: Mức 1
}

// Khung DƯỚI: tài liệu phân loại 3 mức (tĩnh) — để biết chọn mức nào khi nào.
function buildTierDoc(host: Element | null): void {
  const items: [string, string][] = [
    [
      'Mức 1 · CPU Points',
      'Update vị trí trên CPU. Dễ debug, ≤ vài nghìn hạt. Học nền: emit · đời · buffer.',
    ],
    [
      'Mức 2 · Shader Points',
      'Vị trí tính trong vertex shader theo uTime. Trăm nghìn hạt, chuyển động xác định.',
    ],
    [
      'Mức 3 · GPGPU',
      'Ping-pong FBO mô phỏng thật (vận tốc/va chạm). Triệu hạt + va SDF. Hướng iq.',
    ],
  ]
  const wrap = document.createElement('div')
  for (const [name, desc] of items) {
    const it = document.createElement('div')
    it.className = 'ap-ptier-doc'
    const b = document.createElement('b')
    b.textContent = name
    const s = document.createElement('span')
    s.textContent = ' — ' + desc
    it.append(b, s)
    wrap.appendChild(it)
  }
  host?.replaceChildren(wrap)
}

// ⚙ Settings preview: độ đậm lưới + màu hạt (vài preset).
function buildParticleSettings(host: Element | null, preview: ParticlePreview): void {
  if (!host) return
  const title = document.createElement('div')
  title.className = 'ap-lab-settings-title'
  title.textContent = '⚙ Cài đặt preview'
  const colors = document.createElement('div')
  colors.className = 'ap-sdf-presets'
  for (const [label, hex] of [
    ['Lam', 0x59c2ff],
    ['Cam', 0xff8a3d],
    ['Lục', 0x6ee06e],
    ['Trắng', 0xffffff],
  ] as [string, number][]) {
    const b = document.createElement('button')
    b.className = 'ap-sdf-chip'
    b.textContent = label
    b.addEventListener('click', () => preview.setColor(hex))
    colors.appendChild(b)
  }
  host.replaceChildren(
    title,
    sliderRow('Lưới', 0, 1, 0.05, 0.5, (v) => preview.setGridOpacity(v)),
    colors
  )
}

// Gắn thí nghiệm particles vào Lab. Trả { dispose }.
export function setupParticleLab(
  previewHost: Element | null,
  paramHost: Element | null,
  docHost: Element | null,
  settingsHost: Element | null
): { dispose: () => void } {
  const params: ParticleParams = { ...DEFAULT_PARTICLE }
  const preview = new ParticlePreview(previewHost)
  buildParticleSettings(settingsHost, preview)

  setHead(paramHost, '✨ Particles · 🎚️ Mức')
  setHead(docHost, '📚 Phân loại 3 mức')
  buildTierSelector(paramHost, preview, params)
  buildTierDoc(docHost)

  return { dispose: (): void => preview.dispose() }
}
