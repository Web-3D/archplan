/**
 * VỊ TRÍ   — archplan/src/archplan/gui/lab-experiments.ts
 * VAI TRÒ  — SWITCHER thí nghiệm trong 🧪 Lab: chọn 🏛 Mái | ✨ Particles… Mỗi experiment đổ nội dung vào CÙNG
 *            bộ khung bench (preview + 2 panel + settings). Đổi → dispose cái cũ, mount cái mới.
 * LIÊN HỆ  — ArchPlanLab._setupLabFloat gọi setupLabExperiments(bench). bench = setupLabBench (tweak.ts).
 *            Experiment hiện có: setupRoofLab (roof-lab.ts) · setupParticleLab (particle-lab.ts).
 *
 * DISPOSE: dispose() — dispose experiment đang active.
 */

import { setupParticleLab } from './particle-lab'
import { setupRoofLab } from './roof-lab'

// 4 host 1 experiment cần để dựng nội dung (khung bench tái dùng cho mọi experiment).
export interface LabHosts {
  previewHost: Element | null
  paramHost: Element | null
  docHost: Element | null
  settingsHost: Element | null
}

interface LabExperiment {
  id: string
  label: string
  mount: (h: LabHosts) => { dispose: () => void }
}

const EXPERIMENTS: LabExperiment[] = [
  {
    id: 'roof',
    label: '🏛 Mái',
    mount: (h) => setupRoofLab(h.previewHost, h.paramHost, h.docHost, h.settingsHost),
  },
  {
    id: 'particles',
    label: '✨ Particles',
    mount: (h) => setupParticleLab(h.previewHost, h.paramHost, h.docHost, h.settingsHost),
  },
]

interface Bench extends LabHosts {
  experimentHost: Element | null
}

// Dựng selector + mount experiment mặc định (Mái). Đổi chip → dispose active, mount mới.
export function setupLabExperiments(bench: Bench): { dispose: () => void } {
  const hosts: LabHosts = {
    previewHost: bench.previewHost,
    paramHost: bench.paramHost,
    docHost: bench.docHost,
    settingsHost: bench.settingsHost,
  }
  let active: { dispose: () => void } | null = null
  const chips: HTMLButtonElement[] = []
  const select = (exp: LabExperiment, btn: HTMLButtonElement): void => {
    active?.dispose() // teardown preview/loop cũ trước khi mount mới
    for (const c of chips) c.classList.toggle('ap-lab-exp-on', c === btn)
    active = exp.mount(hosts)
  }
  for (const exp of EXPERIMENTS) {
    const b = document.createElement('button')
    b.className = 'ap-lab-exp-chip'
    b.textContent = exp.label
    b.addEventListener('click', () => select(exp, b))
    chips.push(b)
    bench.experimentHost?.appendChild(b)
  }
  select(EXPERIMENTS[0], chips[0]) // mặc định: Mái

  return { dispose: (): void => active?.dispose() }
}
