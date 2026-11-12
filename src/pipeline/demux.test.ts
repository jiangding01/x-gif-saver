import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demuxMp4, fetchMp4 } from './demux';

/** Node 的 Buffer 可能来自共享内存池，必须按 byteOffset/byteLength 切出独立的 ArrayBuffer */
const loadFixture = (name: string): ArrayBuffer => {
  const buf = readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

// 合成样本参数对齐真实样本：480×480、15fps、65 帧、4.33s，带 B 帧（见 __fixtures__/README.md）
describe('demuxMp4', () => {
  const sample = () => demuxMp4(loadFixture('testsrc-480-15fps-65f.mp4'));

  it('解析出轨道信息：480×480、65 个样本、时长 4.33s', async () => {
    const d = await sample();
    expect(d.width).toBe(480);
    expect(d.height).toBe(480);
    expect(d.samples).toHaveLength(65);
    expect(Math.abs(d.durationUs - 4_333_333)).toBeLessThanOrEqual(50_000);
    expect(d.codec).toMatch(/^avc1\./);
  });

  it('时间戳去掉 B 帧偏移：首帧显示时间为 0，按显示顺序严格升序', async () => {
    const d = await sample();
    const shown = d.samples.map((s) => s.timestampUs).sort((a, b) => a - b);
    expect(shown[0]).toBe(0);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i]).toBeGreaterThan(shown[i - 1] as number);
    }
    const last = shown[shown.length - 1] as number;
    expect(d.durationUs).toBeGreaterThan(last);
  });

  it('样本保持解码顺序：首个是关键帧，且带 B 帧时解码顺序与显示顺序不同', async () => {
    const d = await sample();
    expect(d.samples[0]?.isKey).toBe(true);
    const decodeOrder = d.samples.map((s) => s.timestampUs);
    const displayOrder = [...decodeOrder].sort((a, b) => a - b);
    expect(decodeOrder).not.toEqual(displayOrder);
    expect(d.samples.every((s) => s.data.byteLength > 0)).toBe(true);
  });

  it('description 是去掉盒头的 avcC（configurationVersion = 1）', async () => {
    const d = await sample();
    expect(d.description.byteLength).toBeGreaterThan(6);
    expect(d.description[0]).toBe(1);
    // 第 2 字节是 AVCProfileIndication，与 codec 字符串里的 profile 一致（High = 0x64）
    expect(d.codec.slice(5, 7).toLowerCase()).toBe(
      (d.description[1] as number).toString(16).padStart(2, '0'),
    );
  });

  it('可变帧率 + B 帧：总时长取容器 edit list，不用「最后显示帧 + 解码顺序的样本时长」', async () => {
    // 前 5 帧间隔 30ms，之后 250ms；最后一帧在 3.65s 开始，edit list 记录 3.66s。
    // 旧算法会给最后显示的帧套上别的帧的 250ms，得到 3.90s（X 上的可变帧率 GIF 实测多算 0.2s）
    const d = await demuxMp4(loadFixture('testsrc-vfr-160.mp4'));
    const shown = d.samples.map((s) => s.timestampUs).sort((a, b) => a - b);
    expect(shown.at(-1)).toBe(3_650_000);
    expect(d.durationUs).toBe(3_660_000);
  });

  it('不是 MP4 时报错', async () => {
    const junk = new TextEncoder().encode('definitely not an mp4 file').buffer as ArrayBuffer;
    await expect(demuxMp4(junk)).rejects.toThrow(/不是有效的视频文件|视频解析/);
  });
});

describe('fetchMp4', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('HTTP 错误码转成中文报错', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 404 }));
    await expect(
      fetchMp4('https://video.twimg.com/x.mp4', new AbortController().signal),
    ).rejects.toThrow('下载 GIF 视频失败：HTTP 404');
  });

  it('网络异常带上原因', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      fetchMp4('https://video.twimg.com/x.mp4', new AbortController().signal),
    ).rejects.toThrow('下载 GIF 视频失败：Failed to fetch');
  });

  it('取消时原样抛出 AbortError，交给 Worker 判「已取消」', async () => {
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      init.signal?.throwIfAborted();
      return new Response('');
    });
    const abort = new AbortController();
    abort.abort();
    await expect(fetchMp4('https://video.twimg.com/x.mp4', abort.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('成功时返回 ArrayBuffer', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1, 2, 3])));
    const buf = await fetchMp4('https://video.twimg.com/x.mp4', new AbortController().signal);
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
