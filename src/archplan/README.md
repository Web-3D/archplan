# archplan/ — ArchPlan Lab

Editor mặt bằng kiến trúc multi-floor, render 3D real-time (WebGPU). **App standalone** (port 3002):
`main.ts` → `new ArchPlanLab(canvas)`. (Trước nhúng overlay trong Doraemon; đã tách thành tool riêng 2026-06-01.)

---

## Cấu trúc module (sau khi rã monolith)

`ArchPlanLab.ts` là **host mỏng** (lifecycle + orchestrate + undo/redo + pointer dispatch + build
pipeline). Mỗi mối quan tâm tách vào 1 folder concern:

| Folder | File | Vai trò |
| --- | --- | --- |
| *(root)* | [ArchPlanLab.ts](ArchPlanLab.ts) | Host: lifecycle, orchestrate, undo/redo, pointer/paint/move dispatch, build pipeline |
| `state/` | [state.ts](state/state.ts) | Types + factory + serialize/parse + AP4 export (`BuildingState`) |
| | [persistence.ts](state/persistence.ts) | `DesignStore` — autosave localStorage + Save/Load file + export AP4 (I/O thuần) |
| `build/` | [build.ts](build/build.ts) | Pure math: turtle (→ `building-kit/turtle`), bbox, footprint, stair-footprint |
| `gui/` | [gui.ts](gui/gui.ts) · [sections.ts](gui/sections.ts) · [ctx.ts](gui/ctx.ts) | Panel lil-gui + `APGuiCtx` context |
| | [devhud.ts](gui/devhud.ts) | `DevHud` — perf HUD dev (fps/budget/leak), phím \` |
| `scene/` | [scene.ts](scene/scene.ts) | HeightGridSystem (laser grid + labels) + HumanFigure (scale ref) |
| `interaction/` | [palette.ts](interaction/palette.ts) | `PalettePanel` — khay swatch atelier + cọ sơn 3D |
| | [manipulate.ts](interaction/manipulate.ts) | `ManipulateTool` — 🤚 Move + 🎯 Focus (kéo-thả) |
| | [highlight.ts](interaction/highlight.ts) | `HighlightOverlay` — flash viền phần đang chỉnh |

> CSS: [../archplan-lab.css](../archplan-lab.css) (dark panel, pill button, tab bar, perf HUD…).

### Thêm "mục tương tự" sau này — 2 pattern (KHÔNG cần template file)

Các module trên CHÍNH là template — copy file gần nhất. Có 2 khuôn:

**A. Host-interface** — sub-component cần scene/state/callback của Lab (vd `palette.ts`,
`manipulate.ts`, `highlight.ts`):
- Class `Xxx` + interface `XxxHost` khai báo đúng thứ Lab phải cấp (scene refs + getter + callback).
- Lab giữ method `_xxxHost(): XxxHost`, tạo `new Xxx(this._xxxHost())` trong onInit.
- Lý do: method body bê NGUYÊN từ Lab, chỉ đổi `this.scene`→`host.scene`, `this._locateInst`→
  `host.locateInst`. Không drift hành vi. Locator dùng-CHUNG ở lại Lab, cấp qua host.

**B. Pure service** — tự chứa, chỉ I/O hoặc DOM (vd `devhud.ts`, `persistence.ts`):
- Class thường, KHÔNG host. Lab gọi method + truyền data (`store.autosave(state)`,
  `hud.update(info, dt)`). Decouple khỏi type nặng bằng interface tối thiểu (vd `RenderInfo`).

**Quyết định bỏ vào đâu:**

| Thứ mới là gì | Folder | Pattern |
| --- | --- | --- |
| Tool/overlay tương tác 3D (pick, drag, flash) | `interaction/` | A (host) |
| Panel GUI / widget DOM | `gui/` | A nếu cần state · B nếu thuần DOM |
| Tài nguyên scene (light/grid/helper) | `scene/` | A (host) |
| Toán hình học thuần (no Three/DOM) | `build/` | free function |
| Data model / I/O / serialize | `state/` | B |
| **Engine sinh-hình tái dùng** (cả Doraemon) | **→ building-kit** (threejs-modules) | — |

> **Chunk còn trong host:** build pipeline (`_buildScene`/`_assemble*`/`_build*ForInstance`, ~650 dòng)
> — to nhất, để tách RIÊNG vì nó sẽ **hợp nhất với headless `building-kit/BuildingFromPlan`** (xem
> `threejs-modules/building/README.md`), không rã kiểu A/B vội.

---

## Kiến trúc

```
ArchPlanLab (extends BaseWorld)
  │
  ├── state: BuildingState        ← floors[] → instances[] → segments[]
  │
  ├── 🗄️ Drawer PHẢI (.ap-drawer) ← shell bền qua rebuild; cobalt trong suốt; Tabs ngang:
  │     ├── 🏠 Building            ← lil-gui (floors → instances → structure/roof/dims/walls)
  │     ├── 🌳 Ground (Sân vườn)   ← nền lô + cỏ 3D + rào (bộ màu NÂU đất; tab nút cũng nâu)
  │     └── 🎛️ Tinh chỉnh          ← cỏ B0 (Cao/Rộng/Số đốt + màu) + 🔎 preview 1 lá
  │
  ├── 🗄️ Drawer TRÁI (.ap-ldrawer)← ẩn mép trái, kéo nhô; gui Tools:
  │     ├── Surface               ← symbol 🔲/🧱/🛣️ (none/stone/asphalt) — viền sáng khi chọn
  │     ├── Grid X/Y/Z            ← laser grid tọa độ
  │     └── Pick + 🤚 Move        ← cùng hàng (ô stick + symbol)
  │
  ├── ☀ Sun GIZMO (3D)            ← quả cầu kéo trên vòm → đổi hướng nắng; trục Y dây-dọi + bóng chân
  │     └── dock panel cố định    ← toggle ☀/🌙 + slider sáng DỌC + ô màu (KHÔNG bám sun)
  │
  ├── 🎨 Palette                  ← tool TỰ DO float (khay swatch atelier + cọ sơn 3D)
  │
  └── Undo/Redo stacks            ← JSON snapshot trước mỗi build, max 50
```

> **Cỏ né foundation:** nền cỏ (Ground=grass) KHÔNG mọc trong footprint foundation — `_foundationRects()`
> gom rect (bbox + overhang `foundOh`) các instance tầng trệt có `showFoundation`, truyền qua
> `renderSiteState(…, { exclude })` → `GrassBlades` bỏ lá rơi trong rect. "Nơi có foundation thì không đặt nền cỏ."

---

## Shapes

| Key         | Label     | Segments   | Dims                                   |
| ----------- | --------- | ---------- | -------------------------------------- |
| `rectangle` | Rectangle | 4          | `totalW`, `totalD`                     |
| `l-shape`   | L-Shape   | 6          | `totalW`, `totalD`, `notchW`, `notchH` |
| `t-shape`   | T-Shape   | 8          | `totalW`, `topD`, `stemW`, `stemD`     |
| `u-shape`   | U-Shape   | 8          | `totalW`, `totalD`, `wingW`, `notchD`  |
| `null`      | Custom    | N (turtle) | —                                      |

---

## Materials (AP5)

Mỗi mặt tường (`SegmentState.material`) chọn vật liệu surface shader từ
`threejs-modules/shaders/fragment/`. Màu lấy từ `colorIndex` (dùng chung), kích thước pattern
từ `matScale` (0.3–3, cao = pattern to).

> Engine vật liệu + wall-assembler nằm ở **building-kit** (`wallMaterials.ts` + `wallAssembly.ts`) — editor
> gọi CHUNG với headless `BuildingFromPlan` (Gap 1 đóng 2026-06-01). Editor chỉ convert mm→m rồi `assembleWall`.

| material   | shader         | màu chính ← colorIndex | matScale map       |
| ---------- | -------------- | ---------------------- | ------------------ |
| `none`     | MeshToon phẳng | `color`                | — (giữ như trước)  |
| `brick`    | BrickWall      | `brickColor`           | `brickW/H × scale` |
| `concrete` | ConcretePanel  | `baseColor`            | `panelW/H × scale` |
| `wood`     | WoodPlank      | `woodColor`            | `scale = 1/scale`  |
| `metal`    | MetalPanel     | `metalColor`           | `scale = 1/scale`  |

**Brick — chỉnh rãnh vữa:** khi `material === 'brick'`, GUI hiện thêm 2 control:
- **Mortar color** (`SegmentState.mortarColor`, hex) → `BrickWall.uMortarColor` — màu rãnh vữa.
- **Mortar relief** (`SegmentState.brickRelief`, 0–1) → `uBumpScale = relief × 1.5` — độ lõm rãnh
  (normal-relief: ánh sáng tạo cảm giác lõm, geometry vẫn phẳng; lõm-displacement-thật → deferred).
- Cả 2 vào `matKey` (`brick:${ci}:${scale}:${mortarColor}:${relief}`) → đổi = material mới, merge đúng.

- **Lit:** surface shader (unlit `colorNode`) được bọc trong `MeshStandardNodeMaterial` (reuse
  `.colorNode`) → tường vật liệu **nhận sáng + shadow** như MeshToon.
- **Merge + cache:** `WallMaterialCache` (building-kit) key `${material}:${colorIndex}:${matScale}`
  (none → `n:${color}`). Walls cùng key → merge 1 mesh (`mergeWalls`). Cuối mỗi build
  `cache.sweep(usedKeys)` dispose entry thừa; `onDispose` dispose toàn bộ.
- **World-space triplanar** → geometry bake-to-world rồi merge vẫn đúng.
- ✅ **BuildingFromPlan áp material** (Gap 1 đóng) — headless render đúng vật liệu như editor.
- Deferred: weathering overlay, advanced per-material params → `deferred/systems/archplan-ap5-extensions.md`.

---

## Decor panels (task A)

Mỗi tường có `SegmentState.panels: DecorPanel[]` — tấm trang trí khắc trên mặt NGOÀI tường
(+Z local). Geometry THẬT (BoxGeometry) → đổ bóng thật. Mỗi panel có vật liệu riêng.

| field        | ý nghĩa                                                          |
| ------------ | --------------------------------------------------------------- |
| `x` / `y`    | mép trái / mép dưới panel (mm, từ đầu trái + chân tường)         |
| `w` / `h`    | bề rộng / cao panel (mm)                                         |
| `depth`      | độ nhô (raised) / bề dày khung gờ (recessed) (mm)               |
| `mode`       | `raised` = ô nhô; `recessed` = khung gờ molding nổi quanh ô     |
| `material`   | vật liệu riêng (`none`/`brick`/`concrete`/`wood`/`metal`/`brick-tex`) |
| `colorIndex` | màu chính panel ← WALL_COLORS                                    |

- **Geometry:** `makePositionedWall({ panels })` → `_buildDecorPanels` (WallSingle.ts). raised =
  1 box; recessed = 4 thanh khung gờ nổi (tâm phẳng → nhìn như lõm; lõm-khoét-THẬT bằng CSG →
  `deferred/rendering/decor-panel-true-recess-csg.md`).
- **Material riêng + merge:** mỗi decor mesh gắn `userData.matKey`; bake-to-bucket (building-kit
  `wallAssembly`) route geometry về đúng bucket vật liệu → panel cùng material/màu **merge chung** mesh
  với tường cùng key (ít draw call). Cache material dùng chung `WallMaterialCache.{matKey,ensureMat}`.
- **GUI:** nút `＋ Decor panel` trong mỗi folder tường/segment → mỗi panel 1 sub-folder
  (mode/material/color/x/y/w/h/depth + Remove). Dropdown `Style` cũ (reveal/panel placeholder) ĐÃ GỠ.

---

## Undo / Redo

- `_prevState`: JSON snapshot trạng thái **trước** mỗi `_buildScene()`
- `_undoStack` / `_redoStack`: mảng JSON string, max 50 entries
- `_historyLock`: ngăn push trùng khi đang restore undo/redo
- Reset → clear cả hai stack

---

## Lưu / Khôi phục thiết kế

Round-trip **đầy đủ** `BuildingState` (lossless) — KHÁC JSON export AP4 bên dưới.

- **Autosave (localStorage):** I/O nằm trong `DesignStore` (`state/persistence.ts`). Mỗi `_buildScene`
  gọi `store.autosave(state)` → key `archplan:autosave`. `onInit` gọi `store.loadAutosave()` → reload/mở
  lại app là ra nguyên thiết kế. 1 thiết kế / trình duyệt. Nút **Reset** ghi đè autosave về mặc định.
- **💾 Save / 📁 Load (file):** ưu tiên **File System Access API** (`showSaveFilePicker` /
  `showOpenFilePicker`) → **chọn thư mục** + **nhớ handle**: Save lần đầu hỏi nơi lưu, các
  lần sau **đè thẳng** file đó không hỏi lại; Load cũng gắn handle để Save ghi đè đúng file
  vừa mở. **Reset** xóa handle (dự án mới). Trình duyệt không hỗ trợ (non-Chromium) →
  fallback: Save tải `archplan-<timestamp>.json` vào Downloads, Load mở `<input file>`.
  Ambient types cho 2 picker khai báo trong `ArchPlanLab.ts` (lib.dom TS 5.9 còn thiếu).
- **Versioned:** `DESIGN_SCHEMA_V`. Đổi schema → tăng version; file/autosave version cũ bị
  `parseDesign` bỏ qua (trả null) → fallback default, **không crash** (đánh đổi: mất autosave cũ
  khi bump version — migration để dành `deferred/` nếu cần).

## JSON export (AP4)

Nút **📄 JSON** — xuất **1 chiều** cho `BuildingFromPlan.ts` render trong World scene.
Lossy: kích thước mm→**mét**, chỉ một phần field. **Không nạp lại** được vào editor.  
Format: `{ name, floors: [{ index, floorH, instances: [...] }] }`
