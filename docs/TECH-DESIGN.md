# X GIF Saver 技术方案

> 状态：已定稿（2026-11-11）。改动方案请同步更新本文与 [ROADMAP](./ROADMAP.md)，并在文末「决策记录」追加一条。

## 1. 背景与目标

X 会把用户上传的 GIF 转成 MP4 存储和播放，服务器上没有原始 GIF，所以网页上「另存为」拿不到 GIF。本插件在本地把 MP4 转回 GIF，一键保存，方便当表情包使用。

**目标**

- 推文带 GIF 时，操作栏出现「存 GIF」按钮，点一下即下载 `.gif`
- 转换过程有进度，可取消，失败可重试
- 用户可通过预设控制尺寸、帧率、画质、目标体积，以及文件名和保存目录
- 架构可扩展：新站点、新编码器（gifski / WebP）、新输出方式（历史记录等）只需新增模块

**不做**

| 不做的事                                         | 原因                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| GIF 上的浮层按钮                                 | 用户确认会影响正常使用（2026-11-11）；入口只放在操作栏和右键菜单 |
| 透明背景                                         | X 转 MP4 时已丢失透明信息，无法恢复                              |
| 复制 GIF 到剪贴板                                | Chrome 写入系统剪贴板只支持 PNG，复制出去就成了静态图            |
| 普通视频下载、移动端                             | 不在本插件定位内                                                 |
| 设置页实时预览、下载历史、裁剪片段、循环次数设置 | 暂无需求，见 ROADMAP「待定」                                     |

## 2. 关键事实（已核实）

| 事实                                                                                                                                                                      | 核实方式              | 影响                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| GIF 视频地址为 `video.twimg.com/tweet_video/<mediaId>.mp4`，封面为 `pbs.twimg.com/tweet_video_thumb/<mediaId>.jpg`；普通视频为 `blob:` / `amplify_video` / `ext_tw_video` | 用户提供的 DOM        | 按媒体地址识别 GIF，不依赖样式类名                             |
| 样本 MP4：H.264，480×480，15fps，65 帧，109KB；容器（mvhd/mdhd/elst）时长 434cs，ffprobe 显示 4.33s；时间单位 1/100 秒，带 edit list                                      | ffprobe + mp4box      | 估算性能与体积；验收基准以容器时长为准                         |
| offscreen 创建的 Worker 里 `fetch(video.twimg.com)` 不受 CORS 限制（扩展 origin + host_permissions）                                                                      | 2026-11-12 端到端实测 | 取源放在 Worker 里，不需要经 offscreen 主线程中转              |
| `video.twimg.com` 返回 `access-control-allow-origin: https://x.com`                                                                                                       | curl                  | 转码放在扩展 origin，靠 host_permissions 绕过 CORS，与该头无关 |
| x.com CSP：`worker-src 'self' blob: https://*.twimg.com …`                                                                                                                | curl                  | **content script 里起不了扩展 Worker** → 转码放 offscreen 文档 |
| gifenc 不支持抖动，README 自述不适合视频                                                                                                                                  | README                | 自实现有序抖动；编码器可插拔，后续可接 gifski                  |
| gifski-wasm 2.2.0 为 AGPL-3.0                                                                                                                                             | npm                   | 自用无碍，上架商店须开源 → 暂缓                                |

## 3. 交互设计

### 3.1 入口

1. **推文操作栏按钮（主入口）**：仅当推文**自己**带 GIF 时，在回复/转发/点赞/书签那一排末尾追加一个按钮。引用推文里的 GIF 不算（它属于被引用的那条推文）。覆盖时间线、详情页和大图浏览弹窗（弹窗挂在其底部操作栏）；私信已迁到 XChat，没有推文操作栏，由右键菜单兜底。
2. **右键菜单「保存为 GIF」（兜底，M2-5）**：X 改版导致按钮注入失效时仍可用。

### 3.2 按钮行为

| 操作                          | 结果                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| 左键 / Enter / Space          | 用默认预设下载本推文所有 GIF（多个时文件名追加 `_1`、`_2`）    |
| 右键 / ContextMenu 键（M2-3） | 弹出预设菜单，选中后用该预设下载一次（不改默认）               |
| 悬停                          | 提示「保存为 GIF（右键选择预设）」，状态变化时提示内容同步更新 |

### 3.3 按钮状态

| 状态   | 图标                | 点击     | 提示                           |
| ------ | ------------------- | -------- | ------------------------------ |
| 空闲   | GIF 下载图标        | 开始下载 | 保存为 GIF（右键选择预设）     |
| 排队   | 时钟                | 取消     | 排队中                         |
| 转换中 | 进度环              | 取消     | 转换中 42%（解码/编码阶段）    |
| 完成   | ✓（3 秒后回到空闲） | 再次下载 | 已保存 812KB · 320×320 · 12fps |
| 失败   | 红色 !              | 重试     | 失败原因                       |

多个 GIF 时进度取平均，全部完成才显示 ✓，任一失败显示失败并可重试失败项。

### 3.4 视觉

- 按钮放在 Shadow DOM 里（WXT `createShadowRootUi`），样式不受 X 影响、也不污染 X
- 尺寸、颜色、悬停圆形背景模仿 X 原生操作按钮：挂载时读同一排点赞图标的尺寸与颜色（时间线 18.75px 灰、详情页 22.5px 灰、弹窗 22.5px 白），悬停变 X 蓝；灰色在浅色/深色主题下相同
- WXT 给 shadow 宿主设了 `all: initial !important`，宿主自身的布局样式必须写在 shadow 样式表的 `:host` 里
- 与已有的 Media Harvest 按钮共存，各自追加，互不影响

## 4. 架构

```
x.com 页面                      扩展后台                         offscreen 文档（扩展 origin）
┌──────────────────┐ job:start ┌───────────────────┐ job:run    ┌──────────────────────────────┐
│ content script   │──────────▶│ background (SW)   │───────────▶│ 任务队列（并发 1，可取消）      │
│ adapters/x.ts    │ job:cancel│ ·读设置/生成 Job   │ job:cancel │  └▶ Worker: pipeline/run.ts   │
│ ·识别 GIF 推文    │           │ ·按需创建 offscreen │ blob:revoke│   取源 → 拆封装 → 解码          │
│ ·操作栏按钮/菜单  │◀──────────│ ·转发进度/结果      │◀───────────│   → 缩放/抽帧 → 编码           │
│ ·状态展示        │ progress/ │ ·chrome.downloads │ progress/  │  生成 blob URL                │
└──────────────────┘ done/error└───────────────────┘ done/error └──────────────────────────────┘
          ▲ 读设置（M2）                ▲ 读设置
          └──── chrome.storage.sync: settings（带 version，见 core/settings.ts）────┘
```

- 数据单向流动，进度沿原路返回，无循环依赖
- offscreen 只能用 runtime 消息，且 `runtime.sendMessage` 是广播 → 每条消息带 `target` 字段（`core/messages.ts`）
- offscreen 不能调用 `chrome.downloads` → 生成 blob URL 交给 background 下载，下载结束（complete/interrupted）后通知 offscreen `revokeObjectURL`

### 4.1 目录

```
src/
  adapters/x.ts            站点适配：识别推文自己的 GIF、取作者与推文 ID
  core/types.ts            领域类型（Preset / Settings / GifSource / Job / FinalParams）
  core/messages.ts         三方消息协议
  core/settings.ts         默认预设与设置存储（带版本迁移）
  core/filename.ts         文件名模板渲染
  pipeline/run.ts          转换流水线主流程（Worker 内运行）
  pipeline/demux.ts        取源 + 拆封装：fetch MP4，mp4box 取轨道信息、avcC 与样本
  pipeline/worker.ts       Worker 入口：接任务、转发进度、可取消
  pipeline/timing.ts       帧延迟计算（厘秒，累计取整）
  pipeline/dither.ts       有序抖动（M1-4 新增）
  pipeline/encoders/       编码器注册表与实现
  ui/button.ts             操作栏「存 GIF」按钮（Shadow DOM）
  entrypoints/background.ts
  entrypoints/x.content.ts
  entrypoints/offscreen/   offscreen 文档
  entrypoints/options/     设置页（React）
  types/gifenc.d.ts        gifenc 类型声明
```

### 4.2 扩展点

| 扩展       | 做法                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| 新站点     | 新建 `adapters/<site>.ts`，返回 `GifTarget`（容器 + 操作栏 + GIF 列表），新增对应 content script      |
| 新编码器   | `core/types.ts` 的 `EncoderId` 加 ID → `pipeline/encoders/<id>.ts` 导出 `Encoder` → 注册到 `ENCODERS` |
| 新输出格式 | `Encoder` 已带 `mime` / `ext` 字段，文件名渲染改用 `ext` 即可                                         |
| 新设置项   | 改 `Settings` 类型 → `settingsItem` 的 `version` +1 并写 `migrations`，不得原地改字段含义             |

## 5. 转换流水线（pipeline/run.ts）

### 5.1 步骤

1. **取源**：offscreen 有 `host_permissions`，Worker 内 `fetch(mp4Url)` 拿 ArrayBuffer，不受 CORS 限制
2. **拆封装**：mp4box.js 解析出视频轨（codec、宽高、timescale、样本数、时长）和 `avcC` 作为 `VideoDecoder` 的 `description`。参考 W3C 官方示例 [webcodecs/samples/video-decode-display](https://github.com/w3c/webcodecs/tree/main/samples/video-decode-display) 的 mp4 demuxer 写法；mp4box 2.x 是 ESM 重写版，API 以其类型定义为准
3. **解码**：`VideoDecoder.isConfigSupported` 不通过直接报「当前浏览器不支持 H.264 解码」，不做降级（能播 X 视频的 Chrome 都支持）
4. **变换**：
   - 尺寸：最长边超过 `maxSide` 时等比缩小，宽高取偶数；`OffscreenCanvas.drawImage(frame, 0, 0, w, h)` 后 `getImageData`，**用完立即 `frame.close()`**
   - 帧率：`fpsCap` 低于原帧率时按时间戳抽帧（保留时间戳 ≥ 下一个目标时刻的帧）
   - 延迟：用保留帧的时间戳调用 `timing.ts` 的 `delaysFromTimestamps`
5. **编码**：`ENCODERS[preset.encoder].encode(input, opts)`
6. **目标体积**（M2-4）：超出 `targetBytes` 时按下表逐级降级重编码，最多 4 次；仍超出则保存最后一次结果并提示「未能压到 X 以内」

| 次序 | 调整                       |
| ---- | -------------------------- |
| 1    | 颜色数降到 min(当前, 128)  |
| 2    | 帧率上限降到 min(当前, 10) |
| 3    | 最长边 × 0.75              |
| 4    | 最长边再 × 0.75，颜色数 64 |

### 5.2 两遍解码与内存

`EncodeInput.frames()` 是工厂函数，每次调用从头解码一遍：

- 第一遍：均匀抽样最多 10 帧拼起来，`quantize(…, colors, { format: 'rgb565' })` 得到**全局调色板**（减少帧间闪烁，体积更小）
- 第二遍：逐帧抖动 + 映射调色板 + `writeFrame`，帧用完即弃

这样内存里同时只有一帧 RGBA，不受 GIF 时长影响。短视频解码很快，两遍的开销可以接受。

### 5.3 画质：有序抖动

- 使用 Bayer 8×8 有序抖动：每个像素加上 `(bayer[y%8][x%8] / 64 - 0.5) * spread` 后再找最近色，`spread` 随颜色数减少而增大（建议初值 `256 / cbrt(colors)`，以样本肉眼效果调整）
- 选有序抖动而不是 Floyd–Steinberg：有序抖动在帧间位置固定，不会出现噪点「爬动」；LZW 压缩率也更好
- 找最近色用 rgb565 → 调色板下标的 65536 项查找表缓存，避免逐像素遍历调色板
- `dither: 'none'` 时直接 `applyPalette`

### 5.4 帧延迟

GIF 延迟单位是厘秒，按累计时间点取整再做差，总时长误差 ≤ 0.5cs；小于 2cs 的延迟浏览器会按 10cs 播放，所以下限钳到 2cs 并从后续帧扣回（已实现并有单测）。

## 6. 设置

### 6.1 结构（core/types.ts）

```ts
Preset   = { id, name, builtin, maxSide|null, fpsCap|null, colors: 256|128|64,
             dither: 'bayer'|'none', encoder: 'gifenc', targetBytes|null }
Settings = { defaultPresetId, presets: Preset[], filenameTemplate, subfolder }
```

存在 `chrome.storage.sync` 的 `settings` 键，`version: 1`。sync 单项上限 8KB，自定义预设最多 10 个。

### 6.2 内置预设

| 预设         | 最长边 | 帧率 | 颜色 | 抖动 | 目标体积 | 说明                                             |
| ------------ | ------ | ---- | ---- | ---- | -------- | ------------------------------------------------ |
| 原画         | 原始   | 原始 | 256  | 有序 | 不限     | 最高画质，体积最大                               |
| 均衡（默认） | 480    | 原始 | 256  | 有序 | 不限     | 一期唯一生效的预设                               |
| 表情包       | 320    | 12   | 128  | 有序 | 1MB      | 1MB 只是默认值，不对应某个平台的硬限制，用户可改 |

### 6.3 配置项与里程碑

| #   | 配置                                                                | 里程碑               |
| --- | ------------------------------------------------------------------- | -------------------- |
| C1  | 预设方案（内置 + 自定义）                                           | M2-1                 |
| C2  | 最长边上限                                                          | M2-1                 |
| C3  | 帧率上限                                                            | M2-1                 |
| C4  | 颜色数 + 抖动开关                                                   | M2-1                 |
| C5  | 目标体积上限 + 自动降级                                             | M2-4                 |
| C6  | 文件名模板 `{author}` `{tweetId}` `{date}` + 子目录（默认 `X-GIF`） | M2-2                 |
| C7  | 右键按钮临时切换预设                                                | M2-3                 |
| C8  | 右键菜单「保存为 GIF」                                              | M2-5                 |
| C9  | gifski 高质量编码器                                                 | M3（视 M1 画质决定） |

## 7. 权限

| 权限                        | 用途                | 何时加 |
| --------------------------- | ------------------- | ------ |
| `downloads`                 | 保存文件            | 已加   |
| `offscreen`                 | 转码环境            | 已加   |
| `storage`                   | 设置                | 已加   |
| `contextMenus`              | 右键菜单兜底        | M2-5   |
| host `x.com`、`twitter.com` | 注入 content script | 已加   |
| host `video.twimg.com`      | 拉取 MP4            | 已加   |

不需要任何 API key、账号或后端服务，所有处理都在本地完成。

## 8. 风险与脆弱假设

| #   | 假设                                                                                                   | 不成立时                                                      | 何时验证                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| R1  | offscreen 创建的 blob URL 能被 background 的 `chrome.downloads` 下载（同属扩展 origin）                | offscreen 改为生成 data URL 交给 background；几 MB 文件无压力 | M1-5                                                                                            |
| R2  | 引用推文容器是 article 内带 `role="link"` 的 div；操作栏是 article 内不在引用卡片里的 `[role="group"]` | 改 `adapters/x.ts` 的 `isInsideQuote` 与操作栏定位，并补单测  | ✅ 2026-11-11 实测成立；大图弹窗的 GIF 不在 article 里，已单独适配（`modalTarget`），见决策记录 |
| R3  | SW 在转换期间因持续收到进度消息而保持存活                                                              | `jobs` 挪到 `storage.session`，SW 重启后从中恢复              | M1-5                                                                                            |
| R4  | 右键 X 的 GIF 时浏览器菜单的 `contexts: ['video']` 能命中（X 播放器上有覆盖层，可能拦截）              | 改用 `contexts: ['page']` + content script 定位鼠标下的推文   | M2-5                                                                                            |
| R5  | gifenc + 有序抖动的画质够用                                                                            | 进入 M3 接入 gifski（AGPL，自用无碍）                         | M1-6                                                                                            |
| R6  | X 的 `data-testid="tweet"` 保持不变                                                                    | 改 `TWEET_SELECTOR`；右键菜单仍可兜底                         | 持续                                                                                            |

## 9. 测试与验收

**单元测试（Vitest，`pnpm test`）**：帧延迟、文件名模板、媒体地址解析（已有）；抖动、抽帧、目标体积降级顺序、设置迁移（随功能补）。DOM 识别逻辑（`tweetTarget`、`modalTarget`）用 happy-dom 跑单测，测试片段按实测 DOM 裁剪（M1-1 起）。

**手动验收**（每个里程碑结束时过一遍）：

- 时间线、推文详情页、大图浏览弹窗：带 GIF 的推文出现按钮；纯文字、图片、普通视频推文不出现
- 引用推文：外层推文没有 GIF 时不出现按钮；外层有 GIF 时只下载外层的
- 输出 GIF 用 `ffprobe` 对比：帧数、总时长与原 MP4 一致（误差 ≤ 0.05s）
- 断网时显示失败并能重试；连点 3 条推文时正确排队；转换中点击能取消
- 样本：`https://video.twimg.com/tweet_video/HWz0LgxbUAEtAWN.mp4`

**回滚**：在 `chrome://extensions` 停用或移除即可；不涉及服务端和数据迁移。设置带版本号，降级时忽略不认识的字段。

**持续集成**（`.github/workflows/ci.yml`）：每个 PR 和推到 main 的提交，在 GitHub Actions 上用与本地相同的 pnpm 12.16.1 + Node 24 跑 `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm build`。手动验收项无法自动化，仍按上面的清单人工过。

## 10. 技术选型

| 选择                        | 理由                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------- |
| WXT 0.21.5                  | 成熟的 MV3 框架，文件即入口，自动生成 manifest，支持 offscreen 等非清单页面        |
| TypeScript 5.9.3            | npm 上的 latest 已是 7.x（原生移植版），与 Vite/WXT 工具链的兼容性未验证，先用 5.9 |
| React 19（仅设置页）        | 用户技术栈；content script 用原生 DOM，避免往 X 页面注入 React                     |
| mp4box.js 2.5.0 + WebCodecs | 精确逐帧解码，比 `<video>` seek 快且不丢帧                                         |
| gifenc 1.0.3                | 体积小、速度快；缺抖动自己补                                                       |
| Biome 2.6.6                 | 一个依赖同时完成 lint + format                                                     |
| Vitest 5.1.0                | 与 Vite 生态一致                                                                   |

## 11. 决策记录

| 日期       | 决策                                                                                  | 放弃的方案及原因                                                               |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2026-11-11 | 转码放 offscreen 文档 + Worker                                                        | content script 内转码：x.com CSP 拦扩展 Worker，且会卡页面                     |
| 2026-11-11 | mp4box.js + WebCodecs 解码                                                            | `<video>` seek 抽帧：落在关键帧附近，重帧丢帧且慢                              |
| 2026-11-11 | gifenc + 自实现有序抖动                                                               | ffmpeg.wasm：核心体积 30MB+；gif.js：慢且已停更                                |
| 2026-11-11 | gifski 暂缓到 M3                                                                      | AGPL-3.0，上架须开源；先看 M1 画质                                             |
| 2026-11-11 | 入口只放操作栏按钮 + 右键菜单                                                         | GIF 浮层按钮：用户确认会影响正常使用                                           |
| 2026-11-11 | 配置项 C1–C8 纳入，C9 暂缓，C10 不做                                                  | —                                                                              |
| 2026-11-11 | 大图弹窗单独识别：取弹窗内 article 外的 GIF，作者/ID 取自地址栏，按钮挂弹窗底部操作栏 | 只认 article：实测弹窗的 GIF 不在任何 article 里，弹窗内不会出按钮             |
| 2026-11-11 | 私信移出操作栏按钮的验收范围                                                          | 适配 XChat：私信已迁到 `/i/chat`，没有推文操作栏；由 M2-5 右键菜单兜底         |
| 2026-11-11 | 引入 happy-dom 给 DOM 识别逻辑写单测（仅开发依赖）                                    | 只靠手动验收：X 改版时回归成本高                                               |
| 2026-11-12 | 拆封装后把显示时间戳统一减去最小 cts，首帧从 0 开始                                   | 直接用 mp4box 的 cts：它不应用 edit list，带 B 帧时整体偏移约 2 帧，时长会多算 |
| 2026-11-12 | 单测用 ffmpeg 合成的样本（参数对齐真实样本），不提交 X 上的真实 GIF                   | 提交真实样本：版权属于上传者，仓库公开                                         |
