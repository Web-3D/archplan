/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/mix/PresetPanel.ts
 * VAI TRÒ  — Khay MIX DI ĐỘNG rộng (NgQuan 2026-06-11 redesign): KHUNG PRESET ô vuông (1 mặc định + 7 ô
 *            + để thêm — tên trên, thumb giữa, ✎/🗑 dưới; bấm = chọn → nạp thẳng vào editor dưới) →
 *            EDITOR RỘNG (khung lớp 4 ô + cột slider trái | ô preview phải, buildMixPresetEditor) →
 *            3 MODE click-3D 🪣 Áp / 🧽 Gỡ / 🎯 Chỉnh + ⬇⬆ JSON. Bỏ dropdown — V/nút 🧱 ẩn/hiện cả khay.
 * LIÊN HỆ  — Kho: ./presets (archplan.mixPresets.v1). Editor: buildMixPresetEditor + board 🎯: buildMixBoard
 *            (gui/site.ts). Mode/resolve/bake: MixManager (qua APGuiCtx). Preview: Lab mount MixPreview vào
 *            previewHostEl(). Lab mount như PalettePanel (float trên canvas, instance persist qua _rebuildGUI).
 *
 * CÁCH DÙNG: const p = new MixPresetPanel(); p.build(wrap, ctx) mỗi _rebuildGUI; p.previewHostEl() cho Lab
 *            mount canvas preview; p.activePreset() → preset đang chọn (🪣). p.dispose() khi Lab dispose.
 * DISPOSE:   DOM do wrap.remove() của Lab dọn; không giữ listener document (chỉ fileInput ẩn ở body).
 */

import { makeGroundMixParams } from 'threejs-modules/site/state'

import type { APGuiCtx, MixEditSel, MixPaintTarget } from '../gui/ctx'
import { buildMixBoard, buildMixPresetEditor } from '../gui/site'
import { texPreviewEl } from '../gui/tex-palette'
import {
  exportMixPresetsJson,
  importMixPresetsJson,
  loadMixPresets,
  type MixPreset,
  newPresetId,
  saveMixPresets,
} from './presets'

const PRESET_MIN_SLOTS = 8 // 1 mặc định + 7 ô + (NgQuan); phình thêm khi preset > 7

function ensurePresetCss(): void {
  if (document.getElementById('ap-mixpre-css')) return
  const s = document.createElement('style')
  s.id = 'ap-mixpre-css'
  s.textContent =
    // góc trên-trái DƯỚI khay tiện ích 🧰 (top:40). 🎨 Palette OKLCH NgQuan (Atelier) — vars --mp-* tại float
    // root (khay + editor + preview cùng ăn). Width GẤP ĐÔI (392) + cao tối đa 2/3 màn hình (scroll trong).
    `.ap-mixpre-float{position:absolute;top:40px;left:6px;z-index:155;` +
    `--mp-bg-1:#3a1e0c;--mp-bg-2:#5e3110;--mp-bg-3:#924c16;--mp-bg-4:#c8741f;` +
    `--mp-bg-5:#f2a93b;--mp-accent:#e8c547;--mp-text:#fbebcf}` +
    // editor buildMixPresetEditor BÊN TRONG khay (.ap-mix-host khai --gr-* trên chính nó) → đè cùng palette
    `.ap-mixpre-float .ap-mix-host{--gr-bg-1:#3a1e0c;--gr-bg-2:#5e3110;--gr-bg-3:#924c16;` +
    `--gr-bg-4:#c8741f;--gr-bg-5:#f2a93b;--gr-accent:#e8c547;--gr-text:#fbebcf}` +
    `.ap-mixpre{width:392px;max-height:67vh;overflow-y:auto;background:var(--mp-bg-1);` +
    `border:1px solid var(--mp-bg-4);border-radius:6px;color:var(--mp-text);` +
    `font:10px/1.3 'Segoe UI',system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.45)}` +
    // header DÍNH ĐỈNH khi cuộn (NgQuan: symbol 🧱 luôn cố định) — nền bg-1 che nội dung chạy dưới
    `.ap-mixpre-hd{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:4px;` +
    `padding:4px 6px;cursor:grab;font-weight:600;font-size:13px;background:var(--mp-bg-1);` +
    `border-bottom:1px solid var(--mp-bg-3)}` +
    // KHUNG PRESET — ô VUÔNG NHỎ (NgQuan "nhỏ đi phân nửa + hình vuông"): 6 cột, aspect-ratio 1
    // (tên trên · thumb giữa · ✎🗑 dưới); ô + thêm preset
    `.ap-mixP-frame{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:6px}` +
    `.ap-mixP-card{aspect-ratio:1;display:flex;flex-direction:column;gap:1px;padding:2px;` +
    `border:1px solid var(--mp-bg-4);border-radius:5px;background:var(--mp-bg-2);color:var(--mp-text);` +
    `cursor:pointer;overflow:hidden}` +
    `.ap-mixP-card.on{border-color:var(--mp-accent);box-shadow:0 0 0 1px var(--mp-accent) inset}` +
    `.ap-mixP-name{font-size:7px;font-weight:600;text-align:center;overflow:hidden;` +
    `text-overflow:ellipsis;white-space:nowrap}` +
    `.ap-mixP-name input{width:100%;box-sizing:border-box;font:inherit;background:var(--mp-bg-1);color:inherit;` +
    `border:1px solid var(--mp-bg-4);border-radius:2px;text-align:center}` +
    `.ap-mixP-thumb{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:2px}` +
    `.ap-mixP-thumb img,.ap-mixP-thumb .ap-texpal-color{width:100%;height:100%;object-fit:cover;border-radius:2px}` +
    `.ap-mixP-syms{display:flex;justify-content:center;gap:4px}` +
    `.ap-mixP-syms .ap-mixpre-ic{font-size:9px;padding:0}` +
    `.ap-mixP-add{align-items:center;justify-content:center;font-size:18px;color:var(--mp-bg-5);` +
    `background:rgba(0,0,0,.14);border-style:dashed}` +
    `.ap-mixpre-ic{flex-shrink:0;background:none;border:none;color:var(--mp-bg-5);cursor:pointer;font:inherit;padding:0 2px}` +
    `.ap-mixpre-ic:hover{color:#fff}` +
    `.ap-mixpre-editor{padding:0 6px 4px}` +
    `.ap-mixpre-hint{padding:8px 6px;opacity:.65;font-style:italic;text-align:center}` +
    `.ap-mixpre-ft{display:flex;gap:4px;padding:0 6px 6px}` +
    `.ap-mixpre-btn{flex:1;background:var(--mp-bg-2);border:1px solid var(--mp-bg-4);color:var(--mp-text);` +
    `border-radius:4px;cursor:pointer;font:inherit;padding:2px 0}` +
    `.ap-mixpre-btn:hover{background:var(--mp-bg-3)}` +
    `.ap-mixpre-btn.on{background:var(--mp-bg-4);border-color:var(--mp-accent)}` +
    `.ap-mixpre-status{padding:0 6px 4px;font-size:8px;opacity:.75;min-height:10px}` +
    // 🎯 board ĐỐI TƯỢNG (mode edit chọn từ 3D) — khung highlight cam (bg-5)
    `.ap-mixpre-edit{margin:2px 6px 4px;padding:3px 4px;border:1px solid var(--mp-bg-5);border-radius:4px;` +
    `background:rgba(242,169,59,.10)}` +
    `.ap-mixpre-edithd{display:flex;align-items:center;gap:4px;font-weight:600;margin-bottom:2px}` +
    `.ap-mixpre-edithd span{flex:1}`
  document.head.appendChild(s)
}

// Vị trí khay ĐÃ KÉO (px, theo offset-parent) — MODULE-LEVEL: instance panel dispose/new mỗi _rebuildGUI,
// biến module sống trọn session. null = chưa kéo (CSS góc trên-trái). UI-only (reset khi reload).
let floatPos: { left: number; top: number } | null = null

// Target có cọ vẽ mask không (mirror _meshMatch manager): base/zone/đáy-vách hồ = có;
// fence/tường-building/sàn generic ({wallMix}/{flatMix}) = không (chưa bake uv chu-vi).
function paintableTarget(t: MixPaintTarget): boolean {
  if (typeof t === 'string') return true
  if ('water' in t) return true
  return !('fence' in t || 'wallMix' in t || 'flatMix' in t)
}

export class MixPresetPanel {
  private presets: MixPreset[] = loadMixPresets()
  private activeId: string | null = null
  private ctx: APGuiCtx | null = null
  private frameEl: HTMLElement | null = null // khung preset (ô vuông)
  private editorEl: HTMLElement | null = null // editor rộng (khung lớp + slider + preview)
  private readonly previewHost = document.createElement('div') // ô preview — Lab mount MixPreview vào (persist)
  private statusEl: HTMLElement | null = null
  private fileInput: HTMLInputElement | null = null
  private modeBtns: Partial<Record<'apply' | 'erase' | 'edit', HTMLButtonElement>> = {}
  private editSel: MixEditSel | null = null // 🎯 đối tượng đang chỉnh trong khay (board target thật)
  private editHost: HTMLElement | null = null
  private drag: { sx: number; sy: number; px: number; py: number; moved: boolean } | null = null

  /** Preset đang CHỌN (active) — nguồn 🪣 áp + đang sửa trong editor. */
  activePreset(): MixPreset | null {
    return this.presets.find((p) => p.id === this.activeId) ?? null
  }

  /** Ô preview (Lab mount MixPreview vào đây — element PERSIST qua select/_rebuildGUI). */
  previewHostEl(): HTMLElement {
    return this.previewHost
  }

  // Dựng DOM vào wrap (Lab gọi mỗi _rebuildGUI — wrap mới, instance + kho GIỮ).
  build(wrap: HTMLElement, ctx: APGuiCtx): void {
    ensurePresetCss()
    this.ctx = ctx
    wrap.replaceChildren()
    const panel = document.createElement('div')
    panel.className = 'ap-mixpre'
    const hd = document.createElement('div')
    hd.className = 'ap-mixpre-hd'
    const ttl = document.createElement('span')
    ttl.textContent = '🧱' // symbol-only (NgQuan; né trùng Lab 🧪 / palette 🎨 trong khay tiện ích)
    hd.append(ttl)
    this._wireDrag(hd, wrap)
    if (floatPos) {
      wrap.style.left = `${floatPos.left}px`
      wrap.style.top = `${floatPos.top}px`
    }
    this.frameEl = document.createElement('div')
    this.frameEl.className = 'ap-mixP-frame'
    this.editorEl = document.createElement('div')
    this.editorEl.className = 'ap-mixpre-editor'
    const editHost = document.createElement('div')
    this.editHost = editHost
    const st = document.createElement('div')
    st.className = 'ap-mixpre-status'
    this.statusEl = st
    panel.append(hd, this.frameEl, this.editorEl, this._footer(), st, editHost)
    wrap.appendChild(panel)
    ctx.registerMixBucketSync?.(() => this._syncModeBtns())
    ctx.registerMixEditOpen?.((sel) => this._openEditSel(sel))
    this._renderFrame()
    this._renderEditor()
    this._renderEdit()
  }

  dispose(): void {
    this.ctx?.setMixPreview?.(null)
    this.fileInput?.remove()
    this.fileInput = null
    this.frameEl = null
    this.editorEl = null
    this.statusEl = null
    this.editHost = null
    this.editSel = null
    this.ctx = null
  }

  private _flash(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg
  }

  private _save(): void {
    saveMixPresets(this.presets)
  }

  // ── 🖐 Kéo khay (header) — dời WRAP float (editor + preview đi theo) ─────────────────────────────
  private _wireDrag(hd: HTMLElement, wrap: HTMLElement): void {
    hd.title = 'Mix presets (V hiện/ẩn) — kéo để dời khay'
    hd.addEventListener('pointerdown', (e) => this._dragStart(e, wrap, hd))
    hd.addEventListener('pointermove', (e) => this._dragMove(e, wrap))
    hd.addEventListener('pointerup', (e) => this._dragEnd(e, hd))
  }

  private _dragStart(e: PointerEvent, wrap: HTMLElement, hd: HTMLElement): void {
    if (e.button !== 0) return
    const host = wrap.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const wr = wrap.getBoundingClientRect()
    this.drag = {
      sx: e.clientX,
      sy: e.clientY,
      px: wr.left - host.left,
      py: wr.top - host.top,
      moved: false,
    }
    hd.setPointerCapture(e.pointerId)
  }

  private _dragMove(e: PointerEvent, wrap: HTMLElement): void {
    const d = this.drag
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && dx * dx + dy * dy < 16) return // <4px = chưa coi là kéo
    d.moved = true
    floatPos = { left: d.px + dx, top: d.py + dy }
    wrap.style.left = `${floatPos.left}px`
    wrap.style.top = `${floatPos.top}px`
  }

  private _dragEnd(e: PointerEvent, hd: HTMLElement): void {
    if (!this.drag) return
    this.drag = null
    if (hd.hasPointerCapture(e.pointerId)) hd.releasePointerCapture(e.pointerId)
  }

  // 🔎 Ô preview = mix của preset đang chọn (slider live). Không chọn = ẩn ô.
  private _syncPreview(): void {
    this.ctx?.setMixPreview?.(this.activePreset()?.mix ?? null)
  }

  // ── KHUNG PRESET — ô vuông (tên trên · thumb · ✎🗑 dưới); ô + thêm preset ───────────────────────
  private _renderFrame(): void {
    const frame = this.frameEl
    if (!frame) return
    frame.replaceChildren()
    const n = Math.max(PRESET_MIN_SLOTS, this.presets.length + 1)
    for (let i = 0; i < n; i++) {
      frame.appendChild(
        i < this.presets.length ? this._presetCard(this.presets[i]) : this._addCard()
      )
    }
  }

  // 1 ô preset: tên (dblclick đổi) trên · thumb base giữa · ✎(đổi tên)/🗑(xóa) dưới. Bấm ô = chọn → editor.
  private _presetCard(p: MixPreset): HTMLElement {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = p.id === this.activeId ? 'ap-mixP-card on' : 'ap-mixP-card'
    card.addEventListener('click', () => this._select(p))
    const name = document.createElement('div')
    name.className = 'ap-mixP-name'
    name.textContent = p.name
    name.title = `${p.name} — bấm chọn · dblclick đổi tên`
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      this._renameInline(p, name)
    })
    const thumb = document.createElement('div')
    thumb.className = 'ap-mixP-thumb'
    thumb.appendChild(texPreviewEl(p.mix.base))
    const syms = document.createElement('div')
    syms.className = 'ap-mixP-syms'
    syms.append(
      this._icon('✎', 'Đổi tên preset', () => this._renameInline(p, name)),
      this._icon('🗑', 'Xóa preset (bề mặt đã áp giữ nguyên — CLONE)', () => this._delete(p))
    )
    card.append(name, thumb, syms)
    return card
  }

  // Ô + thêm preset (như ô + của khung lớp). Tạo preset mới + chọn ngay.
  private _addCard(): HTMLElement {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'ap-mixP-card ap-mixP-add'
    card.textContent = '+'
    card.title = 'Tạo preset mới'
    card.addEventListener('click', () => {
      const p: MixPreset = {
        id: newPresetId(),
        name: `Preset ${this.presets.length + 1}`,
        mix: makeGroundMixParams('grass-o'),
      }
      this.presets.push(p)
      this._save()
      this._select(p)
    })
    return card
  }

  // Chọn preset → active + nạp vào editor + preview; đang cầm 🪣 thì đổi "đạn" sang preset mới.
  private _select(p: MixPreset): void {
    this.activeId = p.id
    if (this.ctx?.getMixBucketMode?.() === 'apply')
      this.ctx.setMixBucket?.({ mode: 'apply', src: p.mix })
    this._renderFrame()
    this._renderEditor()
    this._syncPreview()
  }

  private _delete(p: MixPreset): void {
    if (!window.confirm(`Xóa preset "${p.name}"? (bề mặt đã áp giữ nguyên — clone riêng)`)) return
    if (this.activeId === p.id && this.ctx?.getMixBucketMode?.() === 'apply')
      this.ctx.setMixBucket?.(null) // buông xô trước (manager bake refs về clone — không mồ côi)
    this.presets = this.presets.filter((q) => q.id !== p.id)
    if (this.activeId === p.id) this.activeId = null
    this._save()
    this._renderFrame()
    this._renderEditor()
    this._syncPreview()
  }

  // ── EDITOR rộng — khung lớp 4 ô + slider trái | preview phải (buildMixPresetEditor) ─────────────
  private _renderEditor(): void {
    const host = this.editorEl
    if (!host) return
    host.replaceChildren()
    const p = this.activePreset()
    const ctx = this.ctx
    if (!p || !ctx) {
      const hint = document.createElement('div')
      hint.className = 'ap-mixpre-hint'
      hint.textContent = 'Chọn 1 ô preset ở trên để sửa các lớp'
      host.appendChild(hint)
      return
    }
    buildMixPresetEditor(
      host,
      ctx,
      p.mix,
      () => {
        // commit (đổi lớp/texture/slider) = lưu kho + cập nhật thumb ô preset + preview. KHÔNG dựng lại
        // editor (slider đang kéo) — buildMixPresetEditor tự redraw nội bộ khi thêm/xóa/đổi texture.
        this._save()
        this._renderFrame()
        this._syncPreview()
      },
      this.previewHost
    )
  }

  private _icon(sym: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ap-mixpre-ic'
    b.textContent = sym
    b.title = title
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      onClick()
    })
    return b
  }

  // Đổi tên tại chỗ: span → input; Enter/blur = lưu, Esc = hủy.
  private _renameInline(p: MixPreset, name: HTMLElement): void {
    const inp = document.createElement('input')
    inp.value = p.name
    inp.addEventListener('click', (e) => e.stopPropagation())
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') inp.blur()
      if (e.key === 'Escape') {
        inp.value = p.name
        inp.blur()
      }
    })
    inp.addEventListener('blur', () => {
      p.name = inp.value.trim() || p.name
      this._save()
      this._renderFrame()
    })
    name.replaceChildren(inp)
    inp.focus()
    inp.select()
  }

  private _footer(): HTMLElement {
    const ft = document.createElement('div')
    ft.className = 'ap-mixpre-ft'
    const ap = this._btn(
      '🪣 Áp',
      'Cầm preset đang chọn — click đích 3D để áp (REF live trong phiên; buông xô = chốt clone riêng). ESC/chuột phải thoát',
      () => this._setMode('apply')
    )
    const er = this._btn('🧽 Gỡ', 'Click đích CÓ mix trong 3D để gỡ (về material thường)', () =>
      this._setMode('erase')
    )
    const ed = this._btn(
      '🎯 Chỉnh',
      'Click đích CÓ mix trong 3D → board của ĐỐI TƯỢNG hiện ở khay',
      () => this._setMode('edit')
    )
    this.modeBtns = { apply: ap, erase: er, edit: ed }
    this._syncModeBtns()
    const exp = this._btn(
      '⬇',
      'Export JSON (localStorage per-origin — file là đường chuyển máy)',
      () => this._export()
    )
    const imp = this._btn('⬆', 'Import JSON (merge vào kho — id trùng tự cấp mới)', () =>
      this._ensureFileInput().click()
    )
    ft.append(ap, er, ed, exp, imp)
    return ft
  }

  // 🪣🧽🎯 Bật/tắt 1 mode (bấm lại nút đang on = tắt). 'apply' cần preset active; manager tự bake phiên cũ.
  private _setMode(mode: 'apply' | 'erase' | 'edit'): void {
    if (this.ctx?.getMixBucketMode?.() === mode) {
      this.ctx.setMixBucket?.(null)
    } else if (mode === 'apply') {
      this._armApply()
    } else {
      this.ctx?.setMixBucket?.(mode === 'erase' ? { mode: 'erase' } : { mode: 'edit' })
      this._flash(mode === 'erase' ? '🧽 click đích có mix để gỡ' : '🎯 click đích có mix để chỉnh')
    }
    this._syncModeBtns()
  }

  private _armApply(): void {
    const p = this.activePreset()
    if (!p) {
      this._flash('Chọn 1 ô preset trước rồi mới 🪣')
      return
    }
    this.ctx?.setMixBucket?.({ mode: 'apply', src: p.mix })
    this._flash(`🪣 ${p.name} — click đích 3D (sửa lớp = live trên bề mặt; buông xô = chốt)`)
  }

  private _syncModeBtns(): void {
    const cur = this.ctx?.getMixBucketMode?.() ?? null
    for (const [m, b] of Object.entries(this.modeBtns)) b.classList.toggle('on', m === cur)
  }

  // 🎯 Click đích có mix (mode edit) → board ĐỐI TƯỢNG vào khay: target thật (zone/G0/hồ = CÓ cọ vẽ),
  // commit đúng hệ. Giữ buildMixBoard (board stack — đối tượng thật, có cọ; khác editor preset rộng).
  private _openEditSel(sel: MixEditSel): void {
    this.editSel = sel
    this._renderEdit()
  }

  private _renderEdit(): void {
    const host = this.editHost
    if (!host) return
    host.replaceChildren()
    const sel = this.editSel
    const ctx = this.ctx
    if (!sel || !ctx) return
    const box = document.createElement('div')
    box.className = 'ap-mixpre-edit'
    const hd = document.createElement('div')
    hd.className = 'ap-mixpre-edithd'
    const ttl = document.createElement('span')
    ttl.textContent = `🎯 ${sel.label}`
    hd.append(
      ttl,
      this._icon('✕', 'Đóng board đối tượng', () => {
        this.editSel = null
        this._renderEdit()
      })
    )
    box.appendChild(hd)
    buildMixBoard(box, ctx, sel.target, sel.params, paintableTarget(sel.target), () =>
      sel.kind === 'build' ? ctx.build() : ctx.applySite(true)
    )
    host.appendChild(box)
  }

  private _btn(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ap-mixpre-btn'
    b.textContent = text
    b.title = title
    b.addEventListener('click', onClick)
    return b
  }

  private _export(): void {
    const blob = new Blob([exportMixPresetsJson(this.presets)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'archplan-mix-presets.json'
    a.click()
    URL.revokeObjectURL(a.href)
    this._flash(`Đã export ${this.presets.length} preset`)
  }

  // <input file> ẨN tạo lazy 1 lần (sống ngoài wrap — không bị _rebuildGUI dọn giữa chừng chọn file).
  private _ensureFileInput(): HTMLInputElement {
    if (this.fileInput) return this.fileInput
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.json,application/json'
    inp.style.display = 'none'
    inp.addEventListener('change', () => {
      const f = inp.files?.[0]
      inp.value = ''
      if (f) void this._import(f)
    })
    document.body.appendChild(inp)
    this.fileInput = inp
    return inp
  }

  private async _import(f: File): Promise<void> {
    try {
      const got = importMixPresetsJson(await f.text(), this.presets)
      this.presets.push(...got)
      this._save()
      this._renderFrame()
      this._flash(`Import ${got.length} preset từ ${f.name}`)
    } catch (e) {
      this._flash(`Import lỗi: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
