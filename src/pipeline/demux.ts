// 取源 + 拆封装（ROADMAP M1-2）：下载 X 的 GIF 视频（MP4），用 mp4box 取出视频轨信息、
// 解码器配置（avcC）和全部样本，交给 M1-3 的 VideoDecoder。纯函数，不依赖 DOM，可在 Worker 和 Node 里跑。

import { createFile, DataStream, Endianness, MP4BoxBuffer, type Sample } from 'mp4box';

export type DemuxedSample = {
  data: Uint8Array;
  /** 显示时间（微秒），已减去首帧偏移，首帧为 0 */
  timestampUs: number;
  durationUs: number;
  isKey: boolean;
};

export type Demuxed = {
  /** WebCodecs codec 字符串，如 avc1.64001e */
  codec: string;
  width: number;
  height: number;
  /** VideoDecoder 的 description：avcC 盒去掉 8 字节盒头后的内容 */
  description: Uint8Array;
  /** 总时长（微秒），= 最后一帧显示结束时刻 */
  durationUs: number;
  /** 解码顺序（dts），喂 VideoDecoder 必须按这个顺序 */
  samples: DemuxedSample[];
};

/** 下载 MP4。offscreen/Worker 有 host_permissions，不受 video.twimg.com 的 CORS 限制 */
export const fetchMp4 = async (url: string, signal: AbortSignal): Promise<ArrayBuffer> => {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    // 取消要原样抛出，Worker 据此判「已取消」
    if (signal.aborted) throw err;
    throw new Error(`下载 GIF 视频失败：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new Error(`下载 GIF 视频失败：HTTP ${res.status}`);
  return res.arrayBuffer();
};

type AvcCBox = { size: number; write: (stream: DataStream) => void };

/** avcC 盒序列化后去掉 8 字节盒头（size + type），即 AVCDecoderConfigurationRecord */
const avcDescription = (avcC: AvcCBox): Uint8Array => {
  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  avcC.write(stream);
  return new Uint8Array(stream.buffer, 8, stream.byteLength - 8).slice();
};

/** 解析整个 MP4（moov 在头在尾都行），只取第一条视频轨 */
export const demuxMp4 = (buffer: ArrayBuffer): Promise<Demuxed> =>
  new Promise((resolve, reject) => {
    const file = createFile();
    const collected: Sample[] = [];
    let expected = 0;
    // 用类型断言初始化：header 只在回调里赋值，避免 TS 把它收窄成 null
    let header = null as Omit<Demuxed, 'samples' | 'durationUs'> | null;
    let failed = false;
    const fail = (message: string) => {
      failed = true;
      reject(new Error(message));
    };

    file.onError = (_module: string, message: string) => fail(`视频解析失败：${message}`);
    file.onReady = (info) => {
      const track = info.videoTracks[0];
      if (!track) return fail('不是有效的视频文件');
      const entry = file.getTrackById(track.id)?.mdia?.minf?.stbl?.stsd?.entries?.[0] as
        | { avcC?: AvcCBox }
        | undefined;
      if (!entry?.avcC) return fail(`不支持的视频编码：${track.codec}`);
      header = {
        codec: track.codec,
        width: track.video?.width ?? 0,
        height: track.video?.height ?? 0,
        description: avcDescription(entry.avcC),
      };
      expected = track.nb_samples;
      // 必须在 onReady 里设置并 start，appendBuffer 随后的 processSamples 才会回调 onSamples
      file.setExtractionOptions(track.id, null, { nbSamples: expected });
      file.start();
    };
    file.onSamples = (_id, _user, samples) => {
      collected.push(...samples);
    };

    try {
      file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, 0), true);
      file.flush();
    } catch (err) {
      if (!failed) fail(`不是有效的视频文件：${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (failed) return;
    if (!header) return fail('不是有效的视频文件');
    if (expected === 0 || collected.length !== expected) {
      return fail(`视频解析不完整：${collected.length}/${expected} 帧`);
    }

    // mp4box 的 cts 未应用 edit list：带 B 帧时首帧 cts 常偏移约 2 帧，统一减去最小值让首帧从 0 开始
    const minCts = Math.min(...collected.map((s) => s.cts));
    const toUs = (t: number, timescale: number) => Math.round((t * 1_000_000) / timescale);
    let endUs = 0;
    const samples: DemuxedSample[] = collected.map((s) => {
      const timestampUs = toUs(s.cts - minCts, s.timescale);
      const durationUs = toUs(s.duration, s.timescale);
      endUs = Math.max(endUs, timestampUs + durationUs);
      if (!s.data) throw new Error('视频样本缺少数据');
      return { data: s.data, timestampUs, durationUs, isKey: s.is_sync };
    });
    // 真实样本实测与容器的 mvhd/mdhd/elst 时长一致（434cs）；ffprobe 显示 4.33s 是它自己的换算
    resolve({ ...header, durationUs: endUs, samples });
  });
