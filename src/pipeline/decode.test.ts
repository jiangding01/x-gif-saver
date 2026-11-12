import { describe, expect, it, vi } from 'vitest';
import { type DecoderDeps, type DecoderLike, decodeFrames } from './decode';
import type { Demuxed } from './demux';

type FakeFrame = { timestamp: number; close: () => void; closed: boolean };

/** 每个样本 100ms，解码顺序即显示顺序（重排是真解码器的事，这里只测我们的生命周期逻辑） */
const video = (count: number): Demuxed => ({
  codec: 'avc1.64001e',
  width: 480,
  height: 480,
  description: new Uint8Array([1]),
  durationUs: count * 100_000,
  samples: Array.from({ length: count }, (_, i) => ({
    data: new Uint8Array([i]),
    timestampUs: i * 100_000,
    durationUs: 100_000,
    isKey: i === 0,
  })),
});

/**
 * 假解码器，模拟硬件解码器的三个约束：
 *   - 帧池：未 close 的帧达到 poolSize 时停止输出（实现里若先 await flush 再取帧，会在这里卡死）
 *   - 重排攒帧：内部攒满 lag 帧后才开始输出，flush 时吐出剩余（模拟 B 帧；喂数据逻辑停早了会卡死）
 *   - decodeQueueSize 只计「已提交、尚未被解码器接手」的样本，接手时触发 dequeue
 * 出错时关闭并拒绝挂起的 flush；flushRejectFirst 控制「拒绝 flush」与「error 回调」谁先发生。
 */
const fakeDeps = (
  opts: {
    poolSize?: number;
    lag?: number;
    supported?: boolean;
    failAt?: number;
    flushRejectFirst?: boolean;
  } = {},
) => {
  const poolSize = opts.poolSize ?? 2;
  const lag = opts.lag ?? 0;
  const frames: FakeFrame[] = [];
  const state = { decoder: null as (DecoderLike & { closeCalls: number }) | null };
  const createDecoder: DecoderDeps['createDecoder'] = (init) => {
    const queued: number[] = [];
    const internal: number[] = [];
    const dequeue: (() => void)[] = [];
    let outstanding = 0;
    let flush: { resolve: () => void; reject: (e: unknown) => void } | null = null;
    let current: CodecState = 'unconfigured';
    const fail = () => {
      current = 'closed';
      const err = new DOMException('模拟解码错误', 'EncodingError');
      const pending = flush;
      flush = null;
      if (opts.flushRejectFirst) {
        pending?.reject(err);
        setTimeout(() => init.error(err), 0);
      } else {
        init.error(err);
        pending?.reject(err);
      }
    };
    const pump = () => {
      setTimeout(() => {
        if (current === 'closed') return;
        if (queued.length > 0) {
          internal.push(...queued.splice(0));
          for (const l of dequeue) l();
        }
        while (internal.length > (flush ? 0 : lag) && outstanding < poolSize) {
          const ts = internal.shift() as number;
          if (opts.failAt === ts) return fail();
          outstanding++;
          const frame: FakeFrame = {
            timestamp: ts,
            closed: false,
            close() {
              if (frame.closed) return;
              frame.closed = true;
              outstanding--;
              pump();
            },
          };
          frames.push(frame);
          init.output(frame as unknown as VideoFrame);
        }
        if (flush && queued.length === 0 && internal.length === 0) {
          flush.resolve();
          flush = null;
        }
      }, 0);
    };
    const decoder = {
      closeCalls: 0,
      get state() {
        return current;
      },
      get decodeQueueSize() {
        return queued.length;
      },
      configure: () => {
        current = 'configured';
      },
      decode: (chunk: EncodedVideoChunk) => {
        queued.push(chunk.timestamp);
        pump();
      },
      flush: () =>
        new Promise<void>((resolve, reject) => {
          if (current === 'closed') return reject(new DOMException('closed', 'InvalidStateError'));
          flush = { resolve, reject };
          pump();
        }),
      close: () => {
        decoder.closeCalls++;
        current = 'closed';
        const pending = flush;
        flush = null;
        pending?.reject(new DOMException('closed', 'AbortError'));
      },
      addEventListener: (_type: 'dequeue', l: () => void) => {
        dequeue.push(l);
      },
    };
    state.decoder = decoder;
    return decoder;
  };
  const deps: DecoderDeps = {
    isConfigSupported: async (config) => ({ supported: opts.supported ?? true, config }),
    createDecoder,
    createChunk: (init) => ({ timestamp: init.timestamp }) as EncodedVideoChunk,
  };
  return { deps, frames, state };
};

const keepAll = () => true;

describe('decodeFrames', () => {
  it('产出全部帧；帧池很小时也能边 flush 边取帧，不卡死', async () => {
    const { deps, frames } = fakeDeps({ poolSize: 1 });
    const got: number[] = [];
    for await (const frame of decodeFrames(
      video(20),
      new AbortController().signal,
      keepAll,
      deps,
    )) {
      got.push(frame.timestamp);
      frame.close();
    }
    expect(got).toEqual(Array.from({ length: 20 }, (_, i) => i * 100_000));
    expect(frames.every((f) => f.closed)).toBe(true);
  });

  it('解码器内部攒帧（B 帧重排）时持续喂数据，不卡死', async () => {
    const { deps, frames } = fakeDeps({ poolSize: 2, lag: 6 });
    let count = 0;
    for await (const frame of decodeFrames(
      video(12),
      new AbortController().signal,
      keepAll,
      deps,
    )) {
      count++;
      frame.close();
    }
    expect(count).toBe(12);
    expect(frames.every((f) => f.closed)).toBe(true);
  });

  it('flush 的拒绝早于 error 回调到达：仍然报解码失败，不静默少帧', async () => {
    const { deps } = fakeDeps({ failAt: 500_000, flushRejectFirst: true, lag: 10 });
    const run = async () => {
      for await (const frame of decodeFrames(
        video(6),
        new AbortController().signal,
        keepAll,
        deps,
      )) {
        frame.close();
      }
    };
    await expect(run()).rejects.toMatchObject({ code: 'decodeFailed', detail: '模拟解码错误' });
  });

  it('不保留的帧在输出时立即 close，不交给调用方', async () => {
    const { deps, frames } = fakeDeps();
    const keepEven = (ts: number) => (ts / 100_000) % 2 === 0;
    const got: number[] = [];
    for await (const frame of decodeFrames(
      video(6),
      new AbortController().signal,
      keepEven,
      deps,
    )) {
      got.push(frame.timestamp);
      frame.close();
    }
    expect(got).toEqual([0, 200_000, 400_000]);
    expect(frames.every((f) => f.closed)).toBe(true);
  });

  it('调用方提前 break：未取走的帧与解码器都被释放', async () => {
    const { deps, frames, state } = fakeDeps({ poolSize: 3 });
    for await (const frame of decodeFrames(
      video(10),
      new AbortController().signal,
      keepAll,
      deps,
    )) {
      frame.close();
      break;
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.closed)).toBe(true);
    expect(state.decoder?.closeCalls).toBe(1);
  });

  it('解码出错报 decodeFailed（带原始信息），并释放资源', async () => {
    const { deps, frames } = fakeDeps({ failAt: 300_000 });
    const run = async () => {
      for await (const frame of decodeFrames(
        video(6),
        new AbortController().signal,
        keepAll,
        deps,
      )) {
        frame.close();
      }
    };
    await expect(run()).rejects.toMatchObject({ code: 'decodeFailed', detail: '模拟解码错误' });
    expect(frames.every((f) => f.closed)).toBe(true);
  });

  it('浏览器不支持该编码时直接报错，不创建解码器', async () => {
    const { deps, state } = fakeDeps({ supported: false });
    const spy = vi.spyOn(deps, 'createDecoder');
    const gen = decodeFrames(video(3), new AbortController().signal, keepAll, deps);
    await expect(gen.next()).rejects.toMatchObject({ code: 'noH264', detail: 'avc1.64001e' });
    expect(spy).not.toHaveBeenCalled();
    expect(state.decoder).toBeNull();
  });

  it('等待中被取消：抛 AbortError 并释放资源', async () => {
    const { deps, frames, state } = fakeDeps({ poolSize: 2 });
    const abort = new AbortController();
    const run = async () => {
      for await (const frame of decodeFrames(video(10), abort.signal, keepAll, deps)) {
        // 不 close：帧池被占满后解码器停住，只能靠 abort 唤醒
        void frame;
        if (frames.length >= 2) abort.abort();
      }
    };
    await expect(run()).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.decoder?.closeCalls).toBe(1);
    // 调用方拿走但没 close 的帧由调用方负责；留在队列里的帧必须已释放
    expect(frames.filter((f) => !f.closed).length).toBeLessThanOrEqual(2);
  });
});
