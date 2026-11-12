# Changelog

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [Unreleased]

## [0.0.2] - 2026-11-12

### 新增

- 推文操作栏「存 GIF」按钮：时间线、详情页、大图浏览弹窗中，推文自己带 GIF 时出现；引用推文里的 GIF 不算；样式跟随 X 原生按钮，与 Media Harvest 共存
- 点击按钮即可下载 GIF：取源与拆封装（mp4box）、解码与变换（WebCodecs 逐帧解码，按预设缩放、抽帧并计算每帧延迟）、编码（全局调色板 + Bayer 有序抖动 + 帧间差分，179 帧 480×480 约 1.7MB），保存为 `X-GIF/作者_推文ID.gif`
- 开发依赖 happy-dom，用于 DOM 识别逻辑的单元测试
- 项目骨架：WXT + TypeScript + React（设置页）+ Biome + Vitest
- 消息协议、background 调度与下载、offscreen 任务队列与 Worker、带版本的设置存储
- GIF 媒体地址解析、文件名模板渲染、GIF 帧延迟计算，均有单元测试
- 技术方案、路线图、README 文档
- MIT 许可证
- 项目级 `.npmrc` 固定使用 npm 官方源，锁文件按官方源生成
- GitHub Actions 持续集成：PR 与 main 上自动运行 `pnpm check` 和 `pnpm build`

### 文档

- README 当前状态与功能表按实际进度更新；TECH-DESIGN 目录补充 `ui/button.ts`、`pipeline/demux.ts`
