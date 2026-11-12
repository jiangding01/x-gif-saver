// 注入到 X 页面里的界面（预设菜单、提示条）用的字体：与 X 自己的字体栈一致，Chirp 是 X 页面加载的网页字体，
// Shadow DOM 里也能用。不能取 document.body 的字体：X 没在 body 上设，取到的是浏览器默认字体
// （英文界面的 Chrome 默认是 Times，菜单会变成衬线体）。
export const X_FONT =
  'TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
