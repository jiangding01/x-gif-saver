# X GIF Saver

一键把 X（Twitter）上的 GIF 保存成真正的 `.gif` 文件，方便当表情包用。

X 会把上传的 GIF 转成 MP4 播放，网页上没法直接另存为 GIF。这个 Chrome 插件在推文操作栏加一个「存 GIF」按钮，点一下就在本地把 MP4 转回 GIF 并下载，不经过任何服务器。

> 当前状态：**开发中（M1，版本 0.0.3，尚未发布）**。点击按钮即可下载 GIF（存到下载目录的 `X-GIF/作者_推文ID.gif`），按钮上显示排队、进度、完成与失败，转换中再点可取消。剩余验收与发版见 [路线图](docs/ROADMAP.md)。

## 功能

| 功能                                                                                       | 状态          |
| ------------------------------------------------------------------------------------------ | ------------- |
| 时间线、详情页、大图弹窗中，推文自己带 GIF 时在操作栏显示按钮；引用推文里的 GIF 不会被误下 | ✅ 已完成     |
| 本地转换：WebCodecs 精确逐帧解码，全局调色板 + 有序抖动 + 帧间差分，帧时长与原视频一致     | ✅ 已完成     |
| 转换进度、取消、失败重试，防重复点击                                                       | ✅ 已完成     |
| 预设：原画 / 均衡 / 表情包，可自定义尺寸、帧率、颜色数、目标体积                           | 📋 计划（M2） |
| 文件名模板与保存子目录                                                                     | 📋 计划（M2） |
| 右键菜单「保存为 GIF」（操作栏按钮失效时兜底）                                             | 📋 计划（M2） |

私信（XChat）里没有推文操作栏，不显示按钮。

## 安装（开发版）

需要 Node.js 22+（WXT 0.21 的要求，CI 使用 Node 24）和 pnpm 12。项目根目录的 `.npmrc` 已固定使用 npm 官方源，不受全局源配置影响。

```bash
pnpm install
```

```bash
pnpm build
```

打开 `chrome://extensions`，开启「开发者模式」，点「加载已解压的扩展程序」，选择 `.output/chrome-mv3` 目录。

## 开发

| 命令                          | 作用                                           |
| ----------------------------- | ---------------------------------------------- |
| `pnpm dev`                    | 启动开发模式，自动打开带插件的 Chrome 并热更新 |
| `pnpm build`                  | 生产构建到 `.output/chrome-mv3`                |
| `pnpm zip`                    | 打包 zip                                       |
| `pnpm compile`                | 生成 WXT 类型并做 TypeScript 类型检查          |
| `pnpm test`                   | 单元测试（Vitest）                             |
| `pnpm lint` / `pnpm lint:fix` | Biome 检查 / 自动修复                          |
| `pnpm check`                  | 类型检查 + lint + 测试，提交前必须通过         |

CI（GitHub Actions）在每个 PR 和 main 上运行 `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm build`。

## 目录

```
src/
  adapters/      站点适配（识别 GIF、作者、推文 ID）
  core/          类型、消息协议、设置、文件名
  pipeline/      转换流水线（Worker 内运行）与编码器；__fixtures__/ 为合成测试样本
  ui/            操作栏按钮（Shadow DOM）
  entrypoints/   background / content script / offscreen / 设置页
docs/
  TECH-DESIGN.md 技术方案
  ROADMAP.md     路线图
```

## 文档

- [技术方案](docs/TECH-DESIGN.md)：架构、流水线、设置结构、权限、风险、决策记录
- [路线图](docs/ROADMAP.md)：里程碑与任务完成标准
- [CHANGELOG](CHANGELOG.md)

## 隐私

只申请 `downloads`、`offscreen`、`storage` 权限，以及 `x.com`、`twitter.com`、`video.twimg.com` 的访问权限。所有转换都在浏览器本地完成，不上传任何数据。

## 许可证

[MIT](LICENSE)。若将来接入 gifski 高质量编码器（AGPL-3.0，见路线图 M3），分发时需另行评估许可证兼容性。
