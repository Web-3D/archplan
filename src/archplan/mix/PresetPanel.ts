/**
 * VỊ TRÍ   — 01-Doraemon/src/sandbox/archplan/mix/PresetPanel.ts
 * VAI TRÒ  — Khay PRESET MIX float (Mảnh 2 plan mix-palette-bucket): danh sách preset
 *            (swatch thumb base + tên), click = CẦM (active — nguồn cho 🪣 áp Mảnh 3),
 *            ✎ = mở bảng trộn sửa tại chỗ (commit = save localStorage, KHÔNG đụng scene),
 *            dblclick tên = đổi tên, ＋/🗑, ⬇⬆ = export/import JSON (localStorage per-origin
 *            — file JSON là đường chuyển máy).
 * LIÊN HỆ  — Kho: ./presets (archplan.mixPresets.v1). Editor: buildMixBoard (gui/site.ts,
 *            target {wallMix: p.mix} → hiện cả Quy luật/Trọng lực — preset mang rule sẵn,
 *            mặt nằm tự bỏ qua khi render). Lab mount như PalettePanel (float trên canvas,
 *            instance persist qua _rebuildGUI — build() gọi lại mỗi lần).
 *
 * CÁCH DÙNG: const p = new MixPresetPanel(); p.build(wrap, ctx) mỗi _rebuildGUI;
 *            p.activePreset() → preset đang cầm (🪣 Mảnh 3). p.dispose() khi Lab dispose.
 * DISPOSE:   DOM do wrap.remove() của Lab dọn; không giữ listener document.
 */

import { makeGroundMixParams } from 'threejs-modules/site/state'

import type { APGuiCtx } from '../gui/ctx'
import { buildMixBoard } from '../gui/site'
import { texPreviewEl } from '../gui/tex-palette'
import {
  exportMixPresetsJson,
  importMixPresetsJson,
  loadMixPresets,
  type MixPreset,
  newPresetId,
  saveMixPresets,
} from './presets'

function ensurePresetCss(): void {
  if (document.getElementById('ap-mixpre-css')) return
  const s = document.createElement('style')
  s.id = 'ap-mixpre-css'
  s.textContent =
    `.ap-mixpre-float{position:absolute;top:6px;left:470px;z-index:30}` +
    `.ap-mixpre{width:196px;background:#3e2f1c;border:1px solid #b58a3c;border-radius:6px;` +
    `color:#f5ead2;font:10px/1.3 'Segoe UI',system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.45)}` +
    `.ap-mixpre-hd{display:flex;align-items:center;gap:4px;padding:3px 6px;cursor:pointer;font-weight:600}` +
    `.ap-mixpre-body{padding:2px 6px 4px;display:flex;flex-direction:column;gap:2px;` +
    `max-height:46vh;overflow-y:auto}` +
    `.ap-mixpre-row{display:flex;align-items:center;gap:5px;padding:2px 3px;border:1px solid transparent;` +
    `border-radius:4px;cursor:pointer}` +
    `.ap-mixpre-row.on{border-color:#b5532a;background:rgba(181,83,42,.18)}` +
    `.ap-mixpre-row img,.ap-mixpre-row .ap-texpal-color{width:18px;height:18px;border-radius:3px;flex-shrink:0}` +
    `.ap-mixpre-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` +
    `.ap-mixpre-name input{width:100%;font:inherit;background:#2c2114;color:inherit;` +
    `border:1px solid #b58a3c;border-radius:2px}` +
    `.ap-mixpre-ic{flex-shrink:0;background:none;border:none;color:#e0b860;cursor:pointer;` +
    `font:inherit;padding:0 2px}` +
    `.ap-mixpre-ic:hover{color:#fff}` +
    `.ap-mixpre-ft{display:flex;gap:4px;padding:0 6px 6px}` +
    `.ap-mixpre-btn{flex:1;background:#5c4423;border:1px solid #b58a3c;color:#f5ead2;border-radius:4px;` +
    `cursor:pointer;font:inherit;padding:2px 0}` +
    `.ap-mixpre-btn:hover{background:#6a4a24}` +
    `.ap-mixpre-btn.on{background:#b5532a;border-color:#e0b860}` +
    `.ap-mixpre-status{padding:0 6px 4px;font-size:8px;opacity:.75;min-height:10px}` +
    `.ap-mixpre-board{margin:2px 0 4px;padding:3px 4px;border:1px solid #8a6a2f;border-radius:4px;` +
    `background:rgba(0,0,0,.14)}` +
    `.ap-mixpre-empty{opacity:.6;font-style:italic;padding:2px 3px}`
  document.head.appendChild(s)
}

export class MixPresetPanel {
  private presets: MixPreset[] = loadMixPresets()
  private activeId: string | null = null
  private editId: string | null = null // preset đang mở bảng trộn ✎ (giữ qua render list)
  private collapsed = false
  private ctx: APGuiCtx | null = null
  private listEl: HTMLElement | null = null
  private statusEl: HTMLElement | null = null
  private fileInput: HTMLInputElement | null = null
  private bucketBtn: HTMLButtonElement | null = null // 🪣 — sync class .on theo mode (tắt từ ngoài cũng cập nhật)

  /** Preset đang CẦM (active) — nguồn CLONE cho 🪣 áp (Mảnh 3). */
  activePreset(): MixPreset | null {
    return this.presets.find((p) => p.id === this.activeId) ?? null
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
    const caret = document.createElement('span')
    const ttl = document.createElement('span')
    ttl.textContent = '🧪 Mix presets'
    hd.append(caret, ttl)
    const body = document.createElement('div')
    body.className = 'ap-mixpre-body'
    const syncCollapse = (): void => {
      caret.textContent = this.collapsed ? '▸' : '▾'
      body.style.display = this.collapsed ? 'none' : ''
      ft.style.display = this.collapsed ? 'none' : ''
      st.style.display = this.collapsed ? 'none' : ''
    }
    hd.addEventListener('click', () => {
      this.collapsed = !this.collapsed
      syncCollapse()
    })
    this.listEl = body
    const st = document.createElement('div')
    st.className = 'ap-mixpre-status'
    this.statusEl = st
    const ft = this._footer()
    panel.append(hd, body, st, ft)
    wrap.appendChild(panel)
    syncCollapse()
    ctx.registerMixBucketSync?.(() => this._syncBucketBtn()) // 🪣 tắt từ ngoài (Move/Pick/ESC) → bỏ highlight
    this._renderList()
    this._syncPreview() // 🧪 _rebuildGUI giữ editor mở → dựng lại tấm preview
  }

  dispose(): void {
    this.ctx?.setMixPreview?.(null) // 🧪 gỡ tấm preview trước khi buông ctx
    this.fileInput?.remove()
    this.fileInput = null
    this.listEl = null
    this.statusEl = null
    this.ctx = null
  }

  private _flash(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg
  }

  private _save(): void {
    saveMixPresets(this.presets)
  }

  // 🧪 Đồng bộ tấm preview 3D theo editor đang mở (✎): mở = preview CHÍNH preset.mix (slider live);
  // đóng/xóa = gỡ tấm. Gọi lại sau commit board (đổi texture/rule = structural → tấm rebuild material).
  private _syncPreview(): void {
    const p = this.presets.find((q) => q.id === this.editId) ?? null
    this.ctx?.setMixPreview?.(p ? p.mix : null)
  }

  private _renderList(): void {
    const list = this.listEl
    if (!list) return
    list.replaceChildren()
    if (this.presets.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'ap-mixpre-empty'
      empty.textContent = 'Chưa có preset — bấm ＋'
      list.appendChild(empty)
      return
    }
    for (const p of this.presets) {
      list.appendChild(this._row(p))
      if (this.editId === p.id) list.appendChild(this._editBoard(p))
    }
  }

  // 1 hàng preset: [thumb base][tên (dblclick = đổi)][✎][🗑]. Click hàng = CẦM (active).
  private _row(p: MixPreset): HTMLElement {
    const row = document.createElement('div')
    row.className = p.id === this.activeId ? 'ap-mixpre-row on' : 'ap-mixpre-row'
    row.addEventListener('click', () => {
      this.activeId = p.id
      this._renderList()
    })
    const name = document.createElement('span')
    name.className = 'ap-mixpre-name'
    name.textContent = p.name
    name.title = `${p.name} — dblclick đổi tên`
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      this._renameInline(p, name)
    })
    const edit = this._icon(
      '✎',
      'Sửa preset (bảng trộn — tấm preview hiện trước lô, lưu thẳng kho)',
      () => {
        this.editId = this.editId === p.id ? null : p.id
        this._renderList()
        this._syncPreview() // 🧪 mở = dựng tấm, đóng = gỡ
      }
    )
    const del = this._icon('🗑', 'Xóa preset (đối tượng đã áp giữ nguyên — CLONE)', () => {
      this.presets = this.presets.filter((q) => q.id !== p.id)
      if (this.activeId === p.id) this.activeId = null
      if (this.editId === p.id) this.editId = null
      this._save()
      this._renderList()
      this._syncPreview() // 🧪 xóa preset đang ✎ → gỡ tấm
    })
    row.append(texPreviewEl(p.mix.base), name, edit, del)
    return row
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
      this._renderList()
    })
    name.replaceChildren(inp)
    inp.focus()
    inp.select()
  }

  // Bảng trộn sửa preset — target {wallMix} để hiện CẢ Quy luật/Trọng lực (preset mang rule sẵn;
  // mặt nằm tự bỏ qua rule khi render). paintable=false (preset không có mặt 3D để cọ).
  // commit = save kho + vẽ lại hàng (thumb base đổi) — KHÔNG đụng scene (CLONE: đối tượng đã áp giữ nguyên).
  private _editBoard(p: MixPreset): HTMLElement {
    const box = document.createElement('div')
    box.className = 'ap-mixpre-board'
    if (this.ctx)
      buildMixBoard(box, this.ctx, { wallMix: p.mix }, p.mix, false, () => {
        this._save()
        this._renderList()
        this._syncPreview() // 🧪 structural (đổi texture/rule) → tấm rebuild material; slider thường = live sẵn
      })
    return box
  }

  private _footer(): HTMLElement {
    const ft = document.createElement('div')
    ft.className = 'ap-mixpre-ft'
    const add = this._btn('＋ Mới', 'Tạo preset mới (sửa bằng ✎)', () => {
      const p: MixPreset = {
        id: newPresetId(),
        name: `Preset ${this.presets.length + 1}`,
        mix: makeGroundMixParams('grass-o'),
      }
      this.presets.push(p)
      this.activeId = p.id
      this.editId = p.id
      this._save()
      this._renderList()
      this._syncPreview() // 🧪 preset mới mở editor luôn → tấm hiện ngay
    })
    const exp = this._btn(
      '⬇',
      'Export JSON (localStorage per-origin — file là đường chuyển máy)',
      () => this._export()
    )
    const imp = this._btn('⬆', 'Import JSON (merge vào kho — id trùng tự cấp mới)', () =>
      this._ensureFileInput().click()
    )
    const bucket = this._btn(
      '🪣',
      'Áp preset đang chọn: click tường/rào/hồ/zone/nền/móng/sàn trong 3D (CLONE). ESC/chuột phải = thoát',
      () => this._toggleBucket()
    )
    this.bucketBtn = bucket
    this._syncBucketBtn()
    ft.append(add, exp, imp, bucket)
    return ft
  }

  // 🪣 Bật/tắt xô áp: cầm REF mix preset active (manager CLONE mỗi cú áp — sửa ✎ xong áp lấy bản mới).
  private _toggleBucket(): void {
    if (this.ctx?.getMixBucketOn?.()) {
      this.ctx.setMixBucket?.(null)
    } else {
      const p = this.activePreset()
      if (!p) {
        this._flash('Chọn 1 preset trước (click hàng) rồi mới 🪣')
        return
      }
      this.ctx?.setMixBucket?.(p.mix)
      this._flash(`🪣 ${p.name} — click vào đích trong 3D`)
    }
    this._syncBucketBtn()
  }

  private _syncBucketBtn(): void {
    this.bucketBtn?.classList.toggle('on', this.ctx?.getMixBucketOn?.() === true)
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
      inp.value = '' // chọn lại cùng file lần sau vẫn bắn change
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
      this._renderList()
      this._flash(`Import ${got.length} preset từ ${f.name}`)
    } catch (e) {
      this._flash(`Import lỗi: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
