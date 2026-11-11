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

- 每个 ROADMAP 任务：从 main 切 `feat/` 分支 → 先出技术方案并评审 → 开发 → `pnpm check` + `pnpm build` + 按「完成标准」手动验收 → 代码审查修到无阻塞问题 → 勾选 ROADMAP、更新 CHANGELOG、方案变动追加到 TECH-DESIGN「决策记录」→ 提交推送、开 PR → 问用户是否合并（用户手动合并，合并后切回 main 拉取并清理本地分支）
- commit message 用简体中文多行：做了什么 / 如何验证 / 如何回滚
- 仓库公开：推送前确认没有本机路径、内网地址、密钥

## 坑与注意事项

- `.npmrc` 固定 npm 官方源，不要改成其他源；锁文件按官方源生成
- Biome 也会格式化 Markdown（含表格），改文档后跑 `pnpm lint:fix`
- `mp4box`、`gifenc` 已声明但 M1-2 ~ M1-4 才用，不是冗余依赖
- WXT 的 shadow 宿主带 `all: initial !important`：宿主自身的布局样式必须写在 shadow 样式表的 `:host { … !important }` 里，写在宿主内联样式上无效
- x.com 未启用 Trusted Types，content script 可用 `innerHTML` 写静态 SVG
- X 的 DOM（2026-11-11 实测，详见 TECH-DESIGN 风险 R2 与决策记录）：引用卡片是 article 内 `div[role="link"]`；操作栏是含 `[data-testid="reply"]` 的 `[role="group"]`；大图弹窗 `[role="dialog"][aria-modal="true"]` 的 GIF 不在任何 article 里，且弹窗最外层还有一个包住一切的 group，找操作栏时要排除含 article 的 group；外层推文「复用」别人的 GIF 时它在引用卡片外，算外层自己的
- 手动验收需要已登录 X 的 Chrome：加载 `.output/chrome-mv3`，每次重新构建后在 `chrome://extensions` 点重新加载并刷新 x.com。找样例：搜索 `gif filter:media` / `gif filter:quote`（Latest），推文地址后加 `/video/1` 打开大图弹窗
