// e2e 里在扩展 service worker 中执行的代码用到的 chrome API（只声明用到的部分）。
// 测试文件本身跑在 Node 里，类型检查不带扩展的全局类型。

type E2EDownloadItem = { filename: string };

declare const chrome: {
  downloads: { search(query: object): Promise<E2EDownloadItem[]> };
  i18n: {
    getMessage(name: string, substitutions?: string[]): string;
    getUILanguage(): string;
  };
  tabs: {
    query(query: object): Promise<{ id?: number }[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
};
