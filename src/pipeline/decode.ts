// 解码（ROADMAP M1-3）：用 WebCodecs VideoDecoder 把拆封装得到的样本解成 VideoFrame。
// 只管解码器的生命周期与背压，不碰画布；缩放、取像素在 run.ts 里做。
//
// 关键约束：硬件解码器的输出帧池很小，产出的 VideoFrame 不及时 close 解码器就会停住。所以：
//   - 不保留的帧在 output 回调里立即 close
//   - 待取的帧最多攒 MAX_READY 个，攒满就不再喂数据
//   - flush() 不能先 await 再取帧（帧池被占满时 flush 永远不会完成），要边取边等

import { jobError, wrapError } from '../core/errors';
import type { Demuxed } from './demux';

/** 待调用方取走的帧上限 */
const MAX_READY = 2;
/** 已提交但解码器尚未接手的样本上限 */
const MAX_DECODE_QUEUE = 4;

/** 解码器需要的最小接口：WebCodecs 的 VideoDecoder 满足它，测试可传普通对象 */
export type DecoderLike = {
  readonly state: CodecState;
  readonly decodeQueueSize: number;
  configure: (config: VideoDecoderConfig) => void;
  decode: (chunk: EncodedVideoChunk) => void;
  flush: () => Promise<void>;
  close: () => void;
  addEventListener: (type: 'dequeue', listener: () => void) => void;
};

export type DecoderDeps = {
  isConfigSupported: (config: VideoDecoderConfig) => Promise<VideoDecoderSupport>;
  createDecoder: (init: VideoDecoderInit) => DecoderLike;
  createChunk: (init: EncodedVideoChunkInit) => EncodedVideoChunk;
};

const webCodecs: DecoderDeps = {
  isConfigSupported: (config) => VideoDecoder.isConfigSupported(config),
  createDecoder: (init) => new VideoDecoder(init),
  createChunk: (init) => new EncodedVideoChunk(init),
};

/**
 * 按显示顺序产出 VideoFrame，**调用方负责 close**。每次调用新建解码器，可重复调用（两遍解码）。
 * 调用方提前 break、抛错或 signal 中止时，未取走的帧和解码器都会在 finally 里释放。
 *
 * @param keep 是否保留该时间戳的帧（抽帧计划）；不保留的帧在解码器输出时立即 close
 */
export async function* decodeFrames(
  video: Demuxed,
  signal: AbortSignal,
  keep: (timestampUs: number) => boolean,
  deps: DecoderDeps = webCodecs,
): AsyncGenerator<VideoFrame> {
  const config: VideoDecoderConfig = { codec: video.codec, description: video.description };
  const support = await deps.isConfigSupported(config);
  if (!support.supported) throw jobError('noH264', video.codec);
  signal.throwIfAborted();

  const ready: VideoFrame[] = [];
  let failure: Error | null = null;
  let closed = false;
  let flushDone = false;
  // 唤醒：output / dequeue / error / abort / flush 结算都会调用。JS 单线程，回调只会在 await 期间触发，
  // 而「检查条件 → 设置 wake → await」在同一段同步代码里完成，所以不会丢唤醒；没人等时的唤醒由循环重查兜住
  let wake: (() => void) | null = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };

  const decoder = deps.createDecoder({
    output: (frame) => {
      if (closed || !keep(frame.timestamp)) {
        frame.close();
        return;
      }
      ready.push(frame);
      notify();
    },
    error: (err) => {
      failure = jobError('decodeFailed', err.message);
      notify();
    },
  });
  decoder.addEventListener('dequeue', notify);
  signal.addEventListener('abort', notify, { once: true });

  try {
    decoder.configure(config);
    let next = 0;
    let flushing = false;
    while (true) {
      signal.throwIfAborted();
      if (failure) throw failure;

      const frame = ready.shift();
      if (frame) {
        yield frame;
        continue;
      }
      if (flushDone) return;

      while (
        next < video.samples.length &&
        ready.length < MAX_READY &&
        decoder.decodeQueueSize < MAX_DECODE_QUEUE
      ) {
        const s = video.samples[next++] as Demuxed['samples'][number];
        decoder.decode(
          deps.createChunk({
            type: s.isKey ? 'key' : 'delta',
            timestamp: s.timestampUs,
            duration: s.durationUs,
            data: s.data,
          }),
        );
      }
      if (next === video.samples.length && !flushing) {
        flushing = true;
        // 不 await：边取帧边等它完成。finally 里 close() 会让它以 AbortError 结束，必须接住
        decoder.flush().then(
          () => {
            flushDone = true;
            notify();
          },
          (err: unknown) => {
            // 不是我们自己 close 引起的拒绝就是解码失败；不记下的话循环会当成「正常结束」，静默少帧
            if (!closed && !failure) {
              failure = wrapError('decodeFailed', err);
            }
            flushDone = true;
            notify();
          },
        );
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    closed = true;
    wake = null;
    signal.removeEventListener('abort', notify);
    for (const f of ready.splice(0)) f.close();
    if (decoder.state !== 'closed') decoder.close();
  }
}
