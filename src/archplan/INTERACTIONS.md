# ArchPlanLab — Khung tương tác chuẩn (đủ bộ 4)

> **LUẬT:** MỖI lần thêm element mới / tab GUI mới / vật liệu mới vào ArchPlanLab → chạy HẾT
> checklist dưới. Bỏ sót 1 mục = element "câm": click không bắt được / không sơn được / không
> kéo được / GUI không nhảy tới. Cả 4 tương tác dùng CHUNG 1 lớp pick vô hình.
>
> File code: `ArchPlanLab.ts`, `archplan-gui-sections.ts`, `archplan-gui-ctx.ts`, `archplan-state.ts`.

---

## 0. Nền móng — lớp pick vô hình (đã có sẵn, không dựng lại)

`pickGroup` chứa box `BoxGeometry` `visible=false` (Raycaster vẫn hit) ôm mỗi element, mang
`userData` định danh. 4 tương tác đều raycast nhóm này → đọc `userData` → biết element nào.

**`PickUD` = `{ instId?, segIdx?, key?, opIdx? }`** (type trong `ArchPlanLab.ts`):
- Tường: `{ instId, segIdx }` — Cửa/cửa sổ: `{ instId, segIdx, opIdx }`
- Structure (KHÔNG merge): `{ instId, key }`, `key ∈ roof | found | slab | stairs | col:<i> | bal:<i>`

Box thêm bằng `_addPick(cx, cy, cz, sx, sy, sz, rotDeg, userData)` — dùng đúng world-transform
của element (mọi công thức world đã có trong hàm `_build*ForInstance` tương ứng → chiếu lại).

---

## 1. Thêm 1 ELEMENT mới (vd: cổng, hàng rào, ống khói, lan can rời…)

Làm đủ 4 — thiếu cái nào element thiếu tương tác đó:

| # | Tương tác | Sửa ở đâu | Làm gì |
|---|---|---|---|
| **P** Pick | bắt raycast | `_buildFloor` (gắn tường) **hoặc** `_build<Element>ForInstance` (structure) | `_addPick(...world..., { instId, key: '<type>:<i>' })` tại transform element |
| **🎨** Paint | cọ sơn | merge→`_applyBrush` + cache key; không-merge→`_pushPainted(r, inst, '<type>:<i>')` | structure: bọc PartResult qua `_pushPainted` để recolor theo `inst.paint[key]` (optional field, không bump schema) |
| **🤚** Move | kéo | `DragSession` union + `_makeDragSession` (dispatch) + `_dragMove` (chiếu) | thêm `kind`; chọn mặt chiếu `_horizPlane` (XZ) / `_wallPlane` (mặt tường); ghi field vị trí; clamp nếu "không rời cha" |
| **👆** Focus | click→GUI | builder folder (`archplan-gui-sections.ts`) + `_focusKey` | `ctx.registerFocus('<type>:<id>[:<i>]', folder)` ngay sau `addFolder` + thêm nhánh map key trong `_focusKey` |

**Mặt chiếu Move (chọn 1 theo ràng buộc element):**
- Tự do trên sàn → `_horizPlane` + ghi `posX/posZ` (world) hoặc `x/z` local (un-rotate `rotY` như `_localDrag`).
- Gắn 1 tường, trượt dọc → `_wallPlane` + chiếu tiếp tuyến (`dx·cosθ − dz·sinθ`), clamp `[0, len−w]`.
- Trên mặt tường 2D (cửa) → `_wallPlane` + tiếp tuyến (x) + thẳng đứng (yOffset), clamp trong khung.

---

## 2. Thêm 1 TAB / section GUI mới

Tối thiểu chỉ cần **👆 Focus**:
```ts
const f = parent.addFolder('Tên tab')
ctx.registerFocus(`<key>:${inst.id}`, f)   // 1 dòng — xong
```
`_focusGuiFor` tự lo phần còn lại: mở folder + mọi folder cha (`.open()`), kích hoạt mọi Tabs
chứa nó qua `aria-controls`, cuộn vào tầm nhìn, flash `.ap-focus-flash`. **KHÔNG cần đụng Tabs.**

Nếu tab đại diện 1 element kéo/sơn được → làm thêm **P / 🎨 / 🤚** ở mục 1.

---

## 3. Thêm 1 VẬT LIỆU mới (`WallMaterial`)

P + 👆 đã có sẵn — tường dùng CHUNG pick box + focus theo `segIdx`, KHÔNG thêm box.
Chỉ phải đảm bảo:
- Màu đi qua **`wallColor(seg)`** (để brush `paintColor` override được).
- **Cache key vật liệu PHẢI gồm `color`** (`_matKey`) — nếu thiếu, 2 tường khác màu sơn sẽ
  merge nhầm thành 1. (Đây là nguồn lỗi tái diễn → `THREEJS/known-issues`.)
- Vật liệu render KHÔNG merge (geometry thật, vd `brick-3d`) → tự recolor riêng (kiểu `_pushPainted`).

---

## 4. Smoke test (bắt buộc trước commit)

1. 🎨 chọn swatch → click element mới → đổi màu? *(Paint)*
2. 🤚 Move → kéo element mới → bám ràng buộc + số GUI tự đổi khi thả? *(Move)*
3. Click element mới (mode thường) → GUI nhảy + flash đúng folder? *(Focus)*
4. `npx tsc --noEmit` + `npx eslint src/sandbox/archplan/` (complexity ≤10) + prettier — sạch.

---

## 5. Ngoại lệ — SITE element (hồ nước 💧) KHÔNG theo lớp pick chung

Hồ (`WaterSurface`) là **site element rời** (ở `siteGroup`, không có `instId`/pick box, không merge).
Tương tác làm KHÁC khung 4-bộ trên:

| Tương tác | Hồ nước làm sao |
|---|---|
| **🤚 Move (thân)** | Raycast **THẲNG mesh hồ** (không qua `pickGroup`) trong `_tryStartWaterDrag`; so distance với pick-box, gần hơn thì nhường building. Kéo `_horizPlane` → ghi `offsetX/offsetZ` + **dời mesh live** (reflector.target con → theo cùng). Thả → `_applySite(true)` (cỏ né lại + autosave). Anchor: `_tryStartWaterDrag`, `_waterDragBody`, `_moveModeMove`. |
| **🤚 Move (đỉnh, form=free)** | `WaterConfig.shape='free'` → polygon `points[]`. `_rebuildWaterHandles` dựng chấm vàng (sphere) tại mỗi đỉnh trong group `_waterHandles` (scene, chỉ khi free+moveMode). `_tryStartVertexDrag` raycast handle TRƯỚC thân → kéo `points[idx]` (world−tâm) + `water.setShape(...)` **dựng lại geometry live** (giữ reflector, KHÔNG tốn RTT). Thả → `_applySite(true)`. Geo/mat handle dùng chung (`_disposeWaterHandles`). Đổi Rect→Free: GUI `seedWaterRectPoints` seed 4 góc. |
| **👆 Focus / 🎨 Paint / P Pick** | KHÔNG có — chỉnh qua **GUI sub-tab Water** (toggle/size/pos/màu/gương/sóng) thay vì click 3D. |

> ⚠ Slider Pos X/Z trong tab Water KHÔNG tự cập nhật số sau khi kéo hồ trong 3D (state đúng + đã lưu,
> chỉ phần hiển thị slider chờ panel dựng lại). Nâng cấp: registerWaterReadout nếu cần đồng bộ tức thì.

---

## Phím tắt

- **Alt** (trái/phải) — bật/tắt Move tool 🤚 (toggle, `!e.repeat` chống nhấp nháy; `_onKeyDown`).
- **`** (backquote) — ẩn/hiện DevHud perf. **Chuột phải** — thoát Move/Paint/Pick.

---

## Tham chiếu nhanh (anchor code)

| Cần | Hàm/định danh |
|---|---|
| Pick box | `_addPick`, `_addWallPickBox`, `_addOpeningPickBox` |
| Paint | `_applyBrush` (merge), `_pushPainted` (structure), `wallColor`, `_matKey` |
| Move | `PickUD`, `DragSession`, `_makeDragSession`, `_dragMove`, `_horizPlane`, `_wallPlane`, `_localDrag` |
| Focus | `ctx.registerFocus` (ctx), `_focusAnchors`, `_focusKey`, `_focusGuiFor` |
| Mode | `_setMoveMode`/`_setPaintMode`/`_setPickMode` (loại trừ nhau) |
