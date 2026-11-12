# 端到端测试

用 Playwright 加载 `pnpm build` 产出的扩展（`.output/chrome-mv3`），在样本推文页上走完整链路：content script → background → offscreen → Worker → `chrome.downloads`。

```bash
pnpm exec playwright install chromium   # 首次运行前装浏览器
pnpm test:e2e                           # 先构建再跑测试
```

## 不访问真实网络

- **x.com 页面**：Playwright 的 `route` 返回 `fixtures/tweet.html`（按实测 X DOM 裁剪，`?no-bar` 去掉操作栏模拟按钮注入失效）；其他页面请求一律拒绝。
- **GIF 视频**：由 offscreen 里的 Worker 下载，`route` 拦不到 Worker 的请求。测试启动时用 `openssl` 临时生成自签证书，起一个本地 HTTPS 服务返回 `src/pipeline/__fixtures__` 的合成样本，再用 `--host-resolver-rules` 把 `video.twimg.com` 解析到它。证书只在临时目录里，不进仓库。

## 下载与文件名

Playwright 默认接管下载并改成随机文件名，会绕过扩展的 `onDeterminingFilename`。测试在临时浏览器配置里写好默认下载目录，再把下载行为恢复成 Chrome 默认，然后通过扩展的 service worker 查 `chrome.downloads`，核对文件名与 GIF 文件头、宽高。

## 覆盖与限制

- 覆盖：左键默认预设下载与文件名；右键预设菜单选「表情包」（尺寸与 1MB 体积上限）；按钮注入失效时的右键菜单兜底与提示条；插件重新加载后，没刷新页面里的旧脚本立即停止、不再报错（`chrome.runtime.reload()` 模拟，用 CDP `Runtime.exceptionThrown` 收内容脚本的异常，`pageerror` 收不到 isolated world 的报错）。按 en-US、zh-CN 两种界面语言各跑一遍。
- 浏览器原生右键菜单无法自动化点击：测试先真实右键 GIF，再由 service worker 发出菜单项被点击时的同一条 `context:save` 消息。
- 只验证扩展自身逻辑；X 真实 DOM 的变化仍靠手动验收（见 TECH-DESIGN 风险 R2）。
