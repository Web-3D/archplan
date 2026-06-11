/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/gui/tex-palette.ts
 * VAI TRÒ  — Palette TEXTURE SWATCH (Mảnh 0 plan mix-palette-bucket): popup lưới swatch thumb
 *            ảnh thật thay <select> 17 mục (dropdown vượt ngưỡng đọc — NgQuan 2026-06-11).
 *            Thumb 64² từ production/thumb.jpg (Factory make-thumbs.ps1, PROTOCOL §2 field thumb)
 *            — <img> load thẳng ~1.3KB, KHÔNG decode ktx2. Key không có thumb (màu phẳng
 *            soil/gravel, 'none'/'tile' hồ, procedural grass) → ô màu GROUND_PRESETS/EXTRA.
 * LIÊN HỆ  — gui/site.ts thay selectRow ở: G0 Surface · zone Surface · mix Nền chính · mix slot
 *            (+ ✕ Xóa lớp = hàng danger) · đáy/vách hồ · fence Wall mat. CSS inject id-guard
 *            (KHÔNG sửa archplan-lab.css — Factory-owned).
 *
 * CÁCH DÙNG: texPaletteRow('Surface', GROUND_OPTS, cur, (v) => {...}, { groups: GROUND_TEX_GROUPS,
 *            onOpen: prefetch }) — drop-in thay selectRow (layout label 64px + control flex:1).
 * DISPOSE:   popup tự gỡ khỏi body khi đóng (pick/outside/ESC); chỉ 1 popup sống tại 1 thời điểm.
 */

import turfThumb from 'assets/textures/ground/artificial_turf/production/thumb.jpg?url'
import bgravelThumb from 'assets/textures/ground/beach_gravel/production/thumb.jpg?url'
import cobbleThumb from 'assets/textures/ground/cobblestone/production/thumb.jpg?url'
import cgravelThumb from 'assets/textures/ground/construction_grave/production/thumb.jpg?url'
import grassoThumb from 'assets/textures/ground/grass_o/production/thumb.jpg?url'
import sandThumb from 'assets/textures/ground/rippled_sand/production/thumb.jpg?url'
import romanThumb from 'assets/textures/ground/roman_stone_floor/production/thumb.jpg?url'
import asphaltThumb from 'assets/textures/ground/rough_asphalt/production/thumb.jpg?url'
import sand2kThumb from 'assets/textures/ground/thai_beach_sand2k/production/thumb.jpg?url'
import sand4kThumb from 'assets/textures/ground/thai_beach_sand4k/production/thumb.jpg?url'
import grassThumb from 'assets/textures/ground/uncut-grass/production/thumb.jpg?url'
import pavementThumb from 'assets/textures/ground/worn_pavement/production/thumb.jpg?url'
import cinderThumb from 'assets/textures/wall/cinder-blocks-wall/production/thumb.jpg?url'
import stoneThumb from 'assets/textures/wall/stone-wall/production/thumb.jpg?url'
import { GROUND_PRESETS } from 'threejs-modules/site/state'

// key → thumb url. Gồm GroundMaterialKey texture + alias fence ('cinder'/'stone' của f.wallTex —
// cùng bộ texture wall trong kho) + key hồ trùng chuỗi ground (thai sand/grass-o tự khớp).
const THUMBS: Record<string, string> = {
  'grass-tex': grassThumb,
  'rippled-sand': sandThumb,
  'construction-gravel': cgravelThumb,
  'beach-gravel': bgravelThumb,
  'rough-asphalt': asphaltThumb,
  'worn-pavement': pavementThumb,
  'roman-stone-floor': romanThumb,
  'artificial-turf': turfThumb,
  'grass-o': grassoThumb,
  'thai-beach-sand-2k': sand2kThumb,
  'thai-beach-sand-4k': sand4kThumb,
  cobblestone: cobbleThumb,
  'cinder-blocks-wall': cinderThumb,
  'stone-wall': stoneThumb,
  cinder: cinderThumb, // fence f.wallTex
  stone: stoneThumb, // fence f.wallTex
}

// Màu ô swatch cho key KHÔNG có thumb và không nằm trong GROUND_PRESETS ('none'/'tile' hồ, 'plain' fence).
const EXTRA_COLOR: Record<string, number> = { none: 0x7a7a7a, tile: 0x7fb3c8, plain: 0x9a9690 }

// Nhóm hiển thị kho nền (lọc theo opts thực — key thiếu tự rơi nhóm "Khác").
export const GROUND_TEX_GROUPS: [string, readonly string[]][] = [
  ['Cỏ', ['grass', 'grass-tex', 'grass-o', 'artificial-turf']],
  ['Cát · đất', ['soil', 'rippled-sand', 'thai-beach-sand-2k', 'thai-beach-sand-4k']],
  ['Sỏi', ['gravel', 'construction-gravel', 'beach-gravel']],
  ['Đá lát · đường', ['cobblestone', 'roman-stone-floor', 'worn-pavement', 'rough-asphalt']],
  ['Tường', ['cinder-blocks-wall', 'stone-wall']],
]

export interface TexPaletteOpts<T extends string> {
  groups?: [string, readonly string[]][]
  onOpen?: () => void // mousedown trigger (user sắp mở palette) → prefetch như select cũ
  danger?: [string, T] // hàng hành động cuối, style đỏ (vd '✕ Xóa lớp' sentinel slot mix)
}

const hexStr = (n: number): string => '#' + (n & 0xffffff).toString(16).padStart(6, '0')

// Chỉ 1 popup sống tại 1 thời điểm — mở cái mới = đóng cái cũ.
let closeOpenPopup: (() => void) | null = null

function ensureTexPaletteCss(): void {
  if (document.getElementById('ap-texpal-css')) return
  const s = document.createElement('style')
  s.id = 'ap-texpal-css'
  s.textContent =
    // popup trên body (z trên panel + lil-gui) — tông nâu Lab đồng bộ --gr-* của ensureMixCss
    `.ap-texpal-pop{position:fixed;z-index:10000;background:#3e2f1c;border:1px solid #b58a3c;` +
    `border-radius:6px;padding:6px;width:236px;max-height:340px;overflow-y:auto;` +
    `box-shadow:0 6px 18px rgba(0,0,0,.55);font:10px/1.3 'Segoe UI',system-ui,sans-serif;color:#f5ead2}` +
    `.ap-texpal-hd{margin:5px 2px 3px;font-size:9px;font-weight:600;opacity:.7;` +
    `text-transform:uppercase;letter-spacing:.4px}` +
    `.ap-texpal-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}` +
    `.ap-texpal-sw{display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px 2px;` +
    `background:#5c4423;border:1px solid transparent;border-radius:4px;cursor:pointer;color:inherit;font:inherit}` +
    `.ap-texpal-sw:hover{border-color:#b58a3c}` +
    `.ap-texpal-sw.on{border-color:#b5532a;background:#6a4a24}` +
    `.ap-texpal-sw img,.ap-texpal-color{width:40px;height:40px;border-radius:3px;` +
    `object-fit:cover;display:block;image-rendering:auto}` +
    `.ap-texpal-sw span{max-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;` +
    `font-size:8px;opacity:.9}` +
    `.ap-texpal-del{margin-top:6px;width:100%;padding:3px;background:#5c4423;color:#f0c9b0;` +
    `border:1px solid #b5532a;border-radius:4px;cursor:pointer;font:inherit}` +
    `.ap-texpal-del:hover{background:#6a4a24}` +
    // trigger (thay <select> trong hàng) — font inherit để hoà site panel (11px) lẫn mix board (9px)
    `.ap-texpal-cur{flex:1;min-width:0;display:flex;align-items:center;gap:5px;padding:2px 5px;` +
    `background:var(--gr-bg-1,#3e2f1c);color:var(--gr-text,#f5ead2);border:1px solid var(--gr-bg-4,#b58a3c);` +
    `border-radius:3px;cursor:pointer;font:inherit;text-align:left}` +
    `.ap-texpal-cur img,.ap-texpal-cur .ap-texpal-color{width:14px;height:14px;border-radius:2px;flex-shrink:0}` +
    `.ap-texpal-cur .ap-texpal-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` +
    `.ap-texpal-cur .ap-texpal-arr{opacity:.6;flex-shrink:0}`
  document.head.appendChild(s)
}

// Ô preview nhỏ của 1 key: <img thumb> nếu có, không thì ô màu (GROUND_PRESETS → EXTRA_COLOR → xám).
function previewEl(key: string): HTMLElement {
  const url = THUMBS[key]
  if (url) {
    const img = document.createElement('img')
    img.src = url
    img.draggable = false
    img.alt = ''
    return img
  }
  const c =
    (GROUND_PRESETS as Record<string, { color: number } | undefined>)[key]?.color ??
    EXTRA_COLOR[key] ??
    0x666666
  const div = document.createElement('div')
  div.className = 'ap-texpal-color'
  div.style.background = hexStr(c)
  return div
}

function swatchEl(label: string, key: string, on: boolean, pick: () => void): HTMLElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = on ? 'ap-texpal-sw on' : 'ap-texpal-sw'
  btn.title = label // hover = tên đầy đủ
  const name = document.createElement('span')
  name.textContent = label
  btn.append(previewEl(key), name)
  btn.addEventListener('click', pick)
  return btn
}

// Chia opts theo groups (giữ thứ tự nhóm); key ngoài mọi nhóm → cuối, nhóm 'Khác' (chỉ hiện khi có).
function groupItems<T extends string>(
  opts: [string, T][],
  groups: [string, readonly string[]][] | undefined
): [string, [string, T][]][] {
  if (!groups) return [['', opts]]
  const used = new Set<T>()
  const out: [string, [string, T][]][] = []
  for (const [g, keys] of groups) {
    const items = opts.filter(([, k]) => keys.includes(k))
    for (const [, k] of items) used.add(k)
    if (items.length > 0) out.push([g, items])
  }
  const rest = opts.filter(([, k]) => !used.has(k))
  if (rest.length > 0) out.push(['Khác', rest])
  return out
}

// Đặt popup cạnh anchor: ưu tiên DƯỚI, tràn đáy viewport → lật LÊN; kẹp ngang trong màn.
function placePopup(pop: HTMLElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect()
  const w = pop.offsetWidth
  const h = pop.offsetHeight
  const x = Math.max(4, Math.min(r.left, window.innerWidth - w - 4))
  let y = r.bottom + 4
  if (y + h > window.innerHeight - 4) y = Math.max(4, r.top - h - 4)
  pop.style.left = `${x}px`
  pop.style.top = `${y}px`
}

// Gắn cơ chế ĐÓNG popup (outside-click capture + ESC) → trả hàm close (pick cũng gọi). Listener gắn
// ngay được: 'click' mở popup bắn SAU pointerdown cùng cú nhấn → không tự đóng oan. Tách rule-50.
function armPopupClose(pop: HTMLElement): () => void {
  const close = (): void => {
    pop.remove()
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('keydown', onKey, true)
    closeOpenPopup = null
  }
  const onDown = (e: PointerEvent): void => {
    if (!pop.contains(e.target as Node)) close()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation() // ESC chỉ đóng palette — không rơi xuống thoát mode Lab
      close()
    }
  }
  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('keydown', onKey, true)
  closeOpenPopup = close
  return close
}

function openTexPopup<T extends string>(
  anchor: HTMLElement,
  opts: [string, T][],
  cur: T,
  o: TexPaletteOpts<T>,
  pick: (v: T) => void
): void {
  closeOpenPopup?.()
  const pop = document.createElement('div')
  pop.className = 'ap-texpal-pop'
  const close = armPopupClose(pop)
  for (const [g, items] of groupItems(opts, o.groups)) {
    if (g) {
      const hd = document.createElement('div')
      hd.className = 'ap-texpal-hd'
      hd.textContent = g
      pop.appendChild(hd)
    }
    const grid = document.createElement('div')
    grid.className = 'ap-texpal-grid'
    for (const [label, k] of items)
      grid.appendChild(swatchEl(label, k, k === cur, () => (close(), pick(k))))
    pop.appendChild(grid)
  }
  if (o.danger) {
    const [dl, dv] = o.danger
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'ap-texpal-del'
    del.textContent = dl
    del.addEventListener('click', () => (close(), pick(dv)))
    pop.appendChild(del)
  }
  document.body.appendChild(pop)
  placePopup(pop, anchor)
}

// Hàng "label + ô chọn texture" — drop-in thay selectRow (label 64px + control flex:1). Click ô →
// popup lưới swatch; pick = cập nhật trigger + onPick(v) (caller tự commit/redraw như onChange select).
export function texPaletteRow<T extends string>(
  label: string,
  opts: [string, T][],
  initial: T,
  onPick: (v: T) => void,
  o: TexPaletteOpts<T> = {}
): HTMLElement {
  ensureTexPaletteCss()
  let cur = initial
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px'
  if (label) {
    const lbl = document.createElement('span')
    lbl.textContent = label
    lbl.style.cssText = 'width:64px;flex-shrink:0'
    row.appendChild(lbl)
  }
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'ap-texpal-cur'
  const name = document.createElement('span')
  name.className = 'ap-texpal-name'
  const arr = document.createElement('span')
  arr.className = 'ap-texpal-arr'
  arr.textContent = '▾'
  const syncBtn = (): void => {
    name.textContent = opts.find(([, k]) => k === cur)?.[0] ?? cur
    btn.replaceChildren(previewEl(cur), name, arr)
  }
  syncBtn()
  if (o.onOpen) btn.addEventListener('mousedown', o.onOpen) // ⏳ prefetch như select cũ
  btn.addEventListener('click', () =>
    openTexPopup(btn, opts, cur, o, (v) => {
      if (opts.some(([, k]) => k === v)) {
        cur = v
        syncBtn() // sentinel danger (✕ Xóa lớp) không vào opts → không đổi trigger (row sắp bị redraw)
      }
      onPick(v)
    })
  )
  row.appendChild(btn)
  return row
}
