# Chrome 应用商店上架资料

开发者后台各栏要填的内容，按后台页面顺序排列。代码块里的文字可以直接复制；商店的详细介绍不渲染 Markdown，所以用纯文本。

改了权限、功能或数据处理方式时，同步改这里和根目录的 [PRIVACY.md](../../PRIVACY.md)，再到后台更新。

> 插件名保持 `X GIF Saver`（2026-11-12 决定）。商标风险靠三点降低：介绍和隐私政策末尾都写明「与 X Corp. 无关」；图标不用 X 的 logo；名称和介绍里不出现「官方」之类的字眼。审核若因商标被拒，改名为 `GIF Saver for X`，要同时改这里、`wxt.config.ts`、README、PRIVACY.md。
> 首次上架在 i18n 合入、界面支持英文之后进行。

## 1. 商品详情（Store listing）

### 简短说明（manifest `description`，≤132 字符）

商店列表页的副标题取自 manifest，不在后台填。i18n 时放进 `_locales/*/messages.json`：

```text
一键把 X（Twitter）上的 GIF 保存为真正的 .gif 文件，在浏览器本地转换，不上传任何数据
```

```text
Save GIFs from X (Twitter) as real .gif files in one click. Converted locally in your browser, nothing is uploaded.
```

### 详细说明 · 简体中文

```text
X 会把上传的 GIF 转成 MP4 视频，网页上没有「保存为 GIF」。X GIF Saver 在推文操作栏加一个「存 GIF」按钮，点一下就在浏览器里把视频转回 GIF 并下载，可以直接当表情包用。

【主要功能】
• 一键保存：时间线、推文详情页、大图浏览里都有按钮，只在推文本身带 GIF 时出现，不会误存引用推文里的 GIF
• 本地转换：逐帧解码，帧时长与原片一致；全局调色板 + 有序抖动 + 帧间差分，画质和体积兼顾
• 转换预设：内置「原画 / 均衡 / 表情包」，可自定义尺寸、帧率、颜色数和体积上限
• 体积上限：超出时自动降低颜色数、帧率、尺寸重新转换，压不下来会明确告诉你
• 临时换预设：右键按钮弹出预设菜单，只对这一次生效，不改默认设置
• 文件名与文件夹：支持推文 ID、作者、日期变量和按作者分文件夹，输入时实时预览
• 兜底入口：按钮不见了时，在 GIF 上右键用浏览器菜单「保存为 GIF」
• 进度、取消、失败重试、防重复点击

【隐私】
所有转换都在你的浏览器里完成，不上传任何数据，没有统计、广告或账号。只访问 x.com、twitter.com 和 X 的媒体服务器 video.twimg.com。

【开源】
代码以 MIT 协议开源：https://github.com/jiangding01/x-gif-saver
问题与建议请提交 issue。

本插件与 X Corp. 无关，也未获其认可。
```

### 详细说明 · English

```text
X turns uploaded GIFs into MP4 videos, so there's no "Save as GIF" on the web. X GIF Saver adds a Save GIF button to the tweet action bar. One click converts the video back into a GIF right in your browser and downloads it, ready to use as a reaction GIF.

FEATURES
• One-click save on the timeline, tweet pages and the media viewer. The button only shows up when the tweet itself has a GIF, so GIFs inside quoted tweets are never picked up by mistake
• Local conversion: frame-accurate decoding with the original frame timing; global palette, ordered dithering and inter-frame diffing for a good balance of quality and size
• Presets: Original, Balanced and Sticker built in, plus your own size, frame rate, colors and size limit
• Size limit: if a GIF is too big, it is re-encoded with fewer colors, a lower frame rate and a smaller size. You're told if the limit still can't be met
• Use another preset once: right-click the button to pick a preset for this download only, without changing your default
• File names and folders: tweet ID, author and date variables, per-author folders, live preview while you type
• Fallback: if the button is missing, right-click the GIF and choose "Save as GIF" from the browser menu
• Progress, cancel, retry on failure, double-click protection

PRIVACY
Everything happens locally in your browser. Nothing is uploaded. No analytics, ads or accounts. The extension only accesses x.com, twitter.com and X's media server video.twimg.com.

OPEN SOURCE
MIT licensed: https://github.com/jiangding01/x-gif-saver
Bug reports and ideas are welcome as GitHub issues.

Not affiliated with or endorsed by X Corp.
```

### 其他字段

| 字段     | 填写                                                  |
| -------- | ----------------------------------------------------- |
| 类别     | 工具（Tools）                                         |
| 语言     | 简体中文（i18n 合入后加 English，各填对应语言的介绍） |
| 官方网址 | 不填（需要先在 Search Console 验证域名）              |
| 主页网址 | `https://github.com/jiangding01/x-gif-saver`          |
| 支持网址 | `https://github.com/jiangding01/x-gif-saver/issues`   |
| 成人内容 | 否                                                    |

## 2. 隐私权（Privacy practices）

后台审核员看的是英文，下面各项用英文填。

### 单一用途（Single purpose）

```text
Save GIFs from X (Twitter) as .gif files. X serves GIFs as MP4 videos; the extension adds a Save GIF button to tweets, converts the MP4 to a GIF locally in the browser, and downloads it.
```

### 权限理由（Permission justification）

`contextMenus`

```text
Adds a "Save as GIF" item to the browser's right-click menu on x.com. It is a fallback for saving a GIF when the button in the tweet action bar is missing, for example after X changes its page layout.
```

`downloads`

```text
Saves the converted .gif file to the user's downloads folder, using the folder and file name the user set on the options page. Also listens to onDeterminingFilename so that the extension's own downloads keep that file name; other downloads are left untouched.
```

`offscreen`

```text
Runs the MP4-to-GIF converter in an offscreen document, because the service worker cannot run the Web Worker and create the blob URLs the conversion and download need (reasons: WORKERS, BLOBS). The document is created on the first conversion request.
```

`storage`

```text
Stores the user's settings (conversion presets, save folder, file name template) in chrome.storage.sync, and the state of running conversions in chrome.storage.session so they survive a service worker restart. Nothing is sent to the developer.
```

主机权限（Host permission）

```text
x.com and twitter.com: the content script finds tweets that contain a GIF, adds the Save GIF button and reads the tweet ID and author handle for the file name. video.twimg.com: downloads the MP4 file X serves for the GIF so it can be converted to a GIF locally. No other sites are accessed.
```

### 远程代码（Remote code）

选「否，我未使用远程代码」。所有 JS 都打在包内；从 `video.twimg.com` 下载的只是 MP4 视频数据，不执行。

### 数据使用（Data usage）

- 收集的用户数据类型：**全部不勾选**。页面内容和推文 ID、作者账号只在本地用于生成文件名，不传出设备，按商店的定义不算「收集」
- 三条声明全部勾选：
  - 不出于已获批准的用途之外的目的向第三方出售或转移用户数据
  - 不出于与商品的单一用途无关的目的使用或转移用户数据
  - 不为确定信用度或用于贷款目的而使用或转移用户数据

### 隐私权政策网址

```text
https://github.com/jiangding01/x-gif-saver/blob/main/PRIVACY.md
```

PR 合入 main 后这个链接才能打开，提交审核前先点一下确认。

## 3. 分发（Distribution）

| 字段     | 填写                                                     |
| -------- | -------------------------------------------------------- |
| 付费     | 免费                                                     |
| 可见范围 | 首发选「不公开」（Unlisted），自己装一遍验收后改「公开」 |
| 地区     | 所有地区                                                 |

## 4. 素材（待做）

| 素材     | 规格                        | 状态                            |
| -------- | --------------------------- | ------------------------------- |
| 商店图标 | 128×128 PNG                 | 已有 `public/icons/icon128.png` |
| 截图     | 1280×800 或 640×400，1–5 张 | 待做                            |
| 小宣传图 | 440×280                     | 待做                            |
| 大宣传图 | 1400×560                    | 可选                            |
