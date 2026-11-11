# X GIF Saver 项目约定

Chrome MV3 插件：把 X 上的 GIF（实为 MP4）在本地转成 .gif 下载。先读 `docs/TECH-DESIGN.md` 和 `docs/ROADMAP.md`。

## 命令

- `pnpm check`：类型检查 + Biome + Vitest，**每次改完代码必须通过**
- `pnpm build`：构建到 `.output/chrome-mv3`，在 `chrome://extensions` 加载已解压的扩展
- `pnpm dev`：开发模式（自动开 Chrome + 热更新）
- `.wxt/` 缺失导致类型报错时：`pnpm wxt prepare`（pnpm 12 下 postinstall 不一定执行，`pnpm compile` 已内置 prepare）

## 代码约定

- 不用 class，用普通对象 + 函数；具名导入（`import { x } from 'y'`）
- WXT API 从 `#imports` 导入（`browser`、`defineBackground`、`defineContentScript`、`storage` 等）
- 识别 X 的 DOM 只依赖 `data-testid`、`role` 和媒体地址，不依赖 `r-xxxx`/`css-xxxx` 样式类名
- 消息必须带 `target` 字段并用 `core/messages.ts` 里的类型守卫过滤
- 改 `Settings` 结构：`core/settings.ts` 的 `version` +1 并写 `migrations`
- 新增编码器/站点按 TECH-DESIGN §4.2 的扩展点做，不改流水线主流程
- 新增权限、配置项、用户可见功能前先问用户；GIF 浮层按钮已明确不做

## 流程

- 在 `feat/m1-xx` 之类的分支开发，完成一个 ROADMAP 任务就验证并提交
- commit message 用简体中文多行：做了什么 / 如何验证 / 如何回滚
- 完成任务后勾选 ROADMAP、更新 CHANGELOG；方案变动同步 TECH-DESIGN 的「决策记录」
