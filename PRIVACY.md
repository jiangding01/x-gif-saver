# Privacy Policy

English | [简体中文](#隐私政策)

Last updated: 2026-11-12

X GIF Saver ("the extension") is an open-source Chrome extension that saves GIFs from X (Twitter) as `.gif` files. It is not affiliated with or endorsed by X Corp.

## Summary

The extension does not collect, transmit, sell or share any personal data. All conversion happens locally in your browser. There are no accounts, analytics, ads or servers run by the developer.

## What the extension accesses and why

| What                                                      | Why                                                                                              | Where it goes                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Page content on `x.com` / `twitter.com`                   | Find tweets that contain a GIF, add the Save GIF button, and read the tweet ID and author handle | Used only in your browser, to build the file name. Never sent anywhere                                              |
| GIF video files on `video.twimg.com`                      | Download the MP4 that X serves for the GIF and convert it to a `.gif`                            | The request goes to X's media server, just like when you watch the GIF on the site. The file is converted in memory |
| Downloads (`downloads` permission)                        | Save the converted `.gif` to your downloads folder                                               | Your local disk                                                                                                     |
| Settings (`storage` permission)                           | Remember your presets, save folder and file name template                                        | `chrome.storage.sync`. If Chrome Sync is on, Google syncs it between your own browsers. The developer never sees it |
| Temporary task state (`storage` permission, session area) | Keep conversion progress if the background worker restarts                                       | Kept in memory and cleared when the browser closes                                                                  |

The extension also uses the `offscreen` permission (to run the converter in a background page) and the `contextMenus` permission (to add "Save as GIF" to the right-click menu). Neither involves any data leaving your device.

## What the extension does not do

- No analytics, telemetry, crash reporting or tracking of any kind
- No remote code: all code ships inside the extension package
- No access to sites other than `x.com`, `twitter.com` and `video.twimg.com`
- No reading of your X account, messages, cookies or browsing history

## Changes

Any change to this policy will be published in this file, and the date above will be updated. The full history is in the [GitHub repository](https://github.com/jiangding01/x-gif-saver/commits/main/PRIVACY.md).

## Contact

Open an issue at <https://github.com/jiangding01/x-gif-saver/issues>.

---

# 隐私政策

[English](#privacy-policy) | 简体中文

最后更新：2026-11-12

X GIF Saver（以下简称「本插件」）是一个开源的 Chrome 插件，用于把 X（Twitter）上的 GIF 保存为 `.gif` 文件。本插件与 X Corp. 无关，也未获其认可。

## 概述

本插件不收集、不上传、不出售、不分享任何个人数据。所有转换都在你的浏览器里完成。开发者没有账号系统、统计分析、广告，也不运行任何服务器。

## 本插件访问什么、为什么

| 访问内容                                   | 用途                                                          | 数据去向                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `x.com` / `twitter.com` 的页面内容         | 找到带 GIF 的推文、加上「存 GIF」按钮，读取推文 ID 和作者账号 | 只在浏览器里用于生成文件名，不发往任何地方                                                |
| `video.twimg.com` 上的 GIF 视频文件        | 下载 X 为该 GIF 提供的 MP4，转成 `.gif`                       | 请求发往 X 的媒体服务器，和你在网页上观看这个 GIF 时一样；文件在内存中转换                |
| 下载（`downloads` 权限）                   | 把转换好的 `.gif` 存到下载文件夹                              | 你的本地磁盘                                                                              |
| 设置（`storage` 权限）                     | 记住你的预设、保存文件夹和文件名模板                          | `chrome.storage.sync`；开启 Chrome 同步时由 Google 在你自己的浏览器之间同步，开发者看不到 |
| 临时任务状态（`storage` 权限，session 区） | 后台进程重启时保留转换进度                                    | 只在内存中，关闭浏览器即清除                                                              |

本插件还用到 `offscreen` 权限（在后台页面里运行转换器）和 `contextMenus` 权限（在右键菜单里加「保存为 GIF」），都不涉及数据离开你的设备。

## 本插件不做什么

- 不做任何统计分析、遥测、崩溃上报或追踪
- 不加载远程代码：所有代码都打包在插件内
- 不访问 `x.com`、`twitter.com`、`video.twimg.com` 以外的网站
- 不读取你的 X 账号、私信、Cookie 或浏览记录

## 变更

本政策的任何改动都会发布在本文件中，并更新上方日期；完整历史见 [GitHub 仓库](https://github.com/jiangding01/x-gif-saver/commits/main/PRIVACY.md)。

## 联系方式

在 <https://github.com/jiangding01/x-gif-saver/issues> 提交 issue。
