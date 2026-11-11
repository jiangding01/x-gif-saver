// x.com 内容脚本：找出带 GIF 的推文，在其底部操作栏注入「存 GIF」按钮。
// 只在推文自己带 GIF 时注入；引用推文里的 GIF 不算（见 adapters/x.ts）。
//
// 当前骨架只做识别并打标记，按钮 UI 由 M1-1 实现：
//   - 每条推文一个 createShadowRootUi，anchor = 操作栏，append = 'last'，样式隔离
//   - 左键：默认预设下载；右键：弹出预设菜单（M2-3）
//   - 状态：空闲 / 排队 / 转换中(进度，点击取消) / 完成 ✓(体积) / 失败(原因，点击重试)

import { defineContentScript } from '#imports';
import { findOwnGifs, TWEET_SELECTOR } from '../adapters/x';

const MARK = 'data-xgs';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const scan = () => {
      for (const article of document.querySelectorAll(TWEET_SELECTOR)) {
        if (article.hasAttribute(MARK)) continue;
        const gifs = findOwnGifs(article);
        // 推文可能先渲染文字后渲染媒体：没找到 GIF 时不打标记，下次变更再扫
        if (gifs.length === 0) continue;
        article.setAttribute(MARK, String(gifs.length));
        console.debug('[x-gif-saver] 发现 GIF 推文', gifs);
      }
    };

    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scan();
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'poster'],
    });
    scan();
    ctx.onInvalidated(() => observer.disconnect());
  },
});
