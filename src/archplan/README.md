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
  ├── 🗄️ Drawer PHẢI (.ap-drawer) ← shell bền; cobalt trong suốt; Tabs ngang (mở tab nào cũng PHỦ KÍN drawer):
  │     ├── 🏠 Building            ← lil-gui (floors → instances → structure/roof/dims/walls)
  │     ├── 🌳 Ground              ← BẬC TAB con Ground|Fence|Garden|Water folder-style (English; Ground/Fence tông NÂU,
  │     │                            Garden tông XANH curated --gd-* + Water tông XANH NƯỚC --wt-* tách riêng); Ground=SURFACE vật liệu(grass/soil/gravel)+lô ·
  │     │                            Garden=🌿 THỰC VẬT 3D, LỒNG BẬC 2 (Grass|Tree, palette --gd-* OKLCH green ramp bg-1→bg-5): Grass = ô on/off
  │     │                            cỏ-3D (mọc nền bất kỳ) + SLIDER chi tiết cỏ (CHUYỂN từ Lab) → TAB cấp1 Lá đơn|Bụi cỏ; Lá đơn có cấp2 Số đo|Độ cong|Bóng đổ
  │     │                            (Số đo=mật độ/cao/thon/thân/gốc/đốt · Độ cong=T→P/dọc+cụp 1 chiều/fold · Bóng đổ=đậm/cao bóng+màu 2 mặt+Vệt) +
  │     │                            Bụi cỏ=Lá/bụi+Xòe+Nghiêng (🔎 preview Ở LẠI tab Lab, KHÔNG ở đây); Tree=placeholder cây sắp có ·
  │     │                            Water=💧 LỒNG NHIỀU BẬC (English): bậc2 Pool|Pond|Puddle ▸ bậc3 instance Pl/Pd/Pe + ＋ (đa-hồ site.waters[], instance mới enabled=false) ▸
  │     │                            bậc4 (mỗi Pl/Pd) Pool edge|Surface|Bottom ▸ bậc5 (Bottom) Floor|Walls. Pool edge=Form/W/D/PosX/PosZ+Edge width(coping 500mm)+Edge mat ·
  │     │                            Surface=Water color/Mirror/Wave/Ripple/Murk · Floor=Floor color+Floor mat · Walls=Wall depth+Wall mat (mat=placeholder 'None').
  │     │                            Pond=render Y NHƯ Pool (renderWaters; đổi param sau) · Puddle=placeholder. Coping = rect-frame quanh hồ (buildPoolEdge).
  │     │                            (bg-1→bg-4 lồng cấp, l5 về bg-3 cho chữ/track trắng đọc được). bảng Lot/House/Coverage/Garden ĐÁY tab Ground.
  │     ├── 🧪 Lab (FLOAT)          ← BÀN THÍ NGHIỆM riêng (FULL màn × full cao, nền trắng α0.5; nút 🧪 góc trái-dưới + phím R, đóng cũng R/🧪).
  │     │                            Cột trái controls hẹp ~25%: hàng đầu = ⚙ settings + chip 🏛 Mái | ✨ Particles (CÙNG HÀNG); khung TRÊN headless mặc định FULL · khung DƯỚI 🔪 lưỡi dao/tài liệu GẬP ĐƯỢC (mặc định ẩn, click header mở ½). Cột phải 🔎 preview ~75% (xoay/pan/zoom).
  │     │                            Switcher thí nghiệm (lab-experiments.ts/setupLabExperiments): 🏛 Mái | ✨ Particles — đổi chip = dispose cũ + mount mới vào cùng khung.
  │     │                            • 🏛 Mái = MÁI CHUẨN frustum chia tọa độ A–X (roof-lab + roof-preview WebGL; gốc bắt đầu mọi dạng mái — memory canonical-roof-base):
  │     │                              [QUY ƯỚC TRỤC: Dài=X · Rộng=Z · Cao=Y] 2 KHỐI: BASE (phần dưới = frustum: chân ABCD Dài×Rộng + Cao base + Độ dày solidify) ⊕ PEAK (chóp trên).
  │     │                              MẶT PHẲNG CHUNG = nóc base EFGH ≡ chân peak (dính liền, Dài/Rộng dùng chung; Nóc rộng=0→hip). PEAK chỉ có Cao riêng → vuốt lên cạnh đỉnh WX; đổi Dài/Rộng chung KHÔNG đổi cao base/peak. A'B'C'D' (4 pháp tuyến) →
  │     │                              KLMN (chiếu nóc↓đáy) → O–V (KLMN kéo dài cắt biên đáy) → XÀ SỐNG (4 hộp gỗ dọc sống EA/FB/HC/GD: 2 cạnh đáy LUÔN nằm trên 2 mặt tạo sống; khung riêng 2-cột cạnh Base, slider Diện tích=tiết diện vuông + Chiều dài=×sống) → I1–I4 (trung điểm/tâm 4 xà). Peak xanh dương nhạt, base solidify (lớp trong đẩy pháp tuyến + bo mép hiên; Độ dày=0→mặt mỏng).
  │     │                              Mặt BÁN TRONG SUỐT (slider Độ mờ, mặc định 0.7 cho cả khối mái + nêm) + đường khuất NÉT ĐỨT (depthFunc GreaterDepth) kiểu hình-không-gian.
  │     │                              Ô số tọa độ 8 đỉnh A–H. 🔪 lưỡi dao cắt SHADER SDF (bladeSDF hot-swap=cắm iq) + mini raymarch (sdf-preview.ts). Thanh BLUEPRINT (chỉ symbol + title): ↺ chuẩn · [tên+💾] gộp · dropdown "blueprint" · 🗑 (popup confirm) · 📤/📥 JSON (localStorage).
  │     │                            • ✨ Particles (particle-lab + particle-preview): 3 MỨC tùy chọn — Mức 1 CPU Points (đài phun, CHẠY) · Mức 2 Shader · Mức 3 GPGPU (đang dựng).
  │     │                            ⚙ settings: lưới/đèn (Particles thêm màu hạt). Cỏ đã tốt nghiệp→Garden▸Grass. (setupLabBench: hàng ⚙+selector, khung TRÊN headless + khung DƯỚI gập mkLabFrame(collapsible/headless); sliderRow export. 2026-06-07)
  │     └── ⬇ Footer DÙNG CHUNG    ← `_buildDrawerFooter` (ngoài body cuộn, MỌI tab thấy): undo/redo + Build/Reset/Save/Load/JSON
  │                                  (trước nằm trong panel Building → đã lôi ra drawer vì là dòng chung; wire thẳng method, bền qua _rebuildGUI)
  │
  ├── 🗄️ Drawer TRÁI (.ap-ldrawer)← ẩn mép trái, kéo nhô; gui Tools:
  │     ├── Surface               ← symbol 🔲/🧱/🛣️ (none/stone/asphalt) — viền sáng khi chọn
  │     ├── Grid X/Y/Z            ← laser grid tọa độ
  │     └── Pick 📍               ← ô stick + symbol (🤚 Move đã LÔI RA float — xem ☀ Sun dock)
  │
  ├── ☀ Sun GIZMO (3D)            ← quả cầu kéo trên vòm → đổi hướng nắng; trục Y dây-dọi + bóng chân
  │     ├── dock panel cố định    ← toggle ☀/🌙 + slider sáng DỌC + ô màu (KHÔNG bám sun)
  │     └── 🤚 Move FLOAT         ← nút vuông cách slider sáng 2px (góc trái-dưới); toggle Move = phím F (Z/C = xoay camera trái/phải)
  │
  ├── 🎨 Palette                  ← tool TỰ DO float (khay swatch atelier + cọ sơn 3D)
  │
  └── Undo/Redo stacks            ← JSON snapshot trước mỗi build, max 50
```

> **Cỏ né foundation + hồ:** cỏ-3D KHÔNG mọc trong footprint foundation LẪN mặt hồ — `_foundationRects()`
> gom rect (bbox + overhang `foundOh`) các instance tầng trệt có `showFoundation`; `renderSiteState` tự thêm
> rect hồ+coping (`waterRect` = footprint + `edgeWidth`) vào `exclude` → `GrassBlades` bỏ lá rơi trong rect. "Nơi có nhà/nước thì không mọc cỏ."

> **Hồ nước (💧 Water, tier C) — ĐA-INSTANCE:** state `site.waters[]` (mỗi hồ có `kind`='pool'|'pond'|'puddle'); render
> khi `(pool||pond) && enabled` (`renderWaters()`) — **pond render Y NHƯ pool** (cùng WaterSurface, param phân hoá sau),
> puddle = placeholder. Mỗi hồ bật = 1 `WaterSurface` = `reflector()` gương thật → **+1 render pass/RTT MỖI hồ** (đắt;
> instance mới mặc định `enabled=false` để né tụt FPS). Glint theo sun (`_applySunToWater` loop mọi hồ); sóng `setTime` mỗi frame.
> **Coping** = dải mép quanh hồ (`buildPoolEdge`: rect-frame bbox+`edgeWidth` − lỗ polygon, ở mặt nền +3mm; màu đá mặc định,
> `edgeMaterial` placeholder). `floorMaterial`/`wallMaterial` cũng placeholder ('none') — basin vẫn 1 material (màu Floor tô cả tường) tới khi làm material thật.
> Khoét lỗ nền/lưới: 1 lỗ MỖI hồ bật (`waterPolygons` → `lotShape.holes[]` lõi + `_rebuildEditorGround`/`_buildGridGeo` vỏ).
> **Kéo-thả 3D (active):** GUI tab Pl chọn pool nào = pool ACTIVE (`setActiveWater`); bật Move 🤚 (nút float hoặc **phím F**)
> → nhấn-giữ mặt hồ kéo (raycast mọi mesh hồ, gần nhất → thành active; dời live, thả → cỏ né lại + autosave). Chỉnh
> số/màu/gương/sóng ở **Water▸Pool▸Pl_n**. Default: 1 Pl1 bật, hồ 4×3m ở +5m trước nhà (+ Pd1/Pe1 placeholder tắt).
> **Mặt nước LÕM** dưới vành nền (`baseY = rim − lip`, lip≤depthY) → lộ vành đất = đọc ra "lỗ cắt xuyên", không phẳng lì.
> **Form tự do:** GUI Water▸Pool▸Pl_n → `Form=Free` (seed 4 góc) → bật Move → **kéo chấm vàng ở góc** (handle của hồ active)
> nắn polygon (`ShapeGeometry` dựng lại live, cỏ né theo bbox). Thêm/bớt đỉnh = bước sau.

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
