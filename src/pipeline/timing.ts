// GIF 帧延迟的单位是 1/100 秒（厘秒）。逐帧四舍五入会累积误差（15fps 每帧 6.67cs → 7cs，整体慢 5%），
// 所以按「累计时间点」取整再做差：每帧 cs = round(结束时刻) - round(开始时刻)，总时长误差 ≤ 0.5cs。
//
// 浏览器会把 < 2cs 的延迟当成 10cs 播放（明显变慢），所以下限钳到 2cs（即最高 50fps）。

export const MIN_DELAY_CS = 2;

/**
 * @param timestampsUs 每帧的显示时间戳（微秒，来自 VideoFrame.timestamp），升序
 * @param durationUs 视频总时长（微秒），用作最后一帧的结束时刻
 * @returns 每帧延迟（厘秒）
 */
export const delaysFromTimestamps = (timestampsUs: number[], durationUs: number): number[] => {
  const toCs = (us: number) => Math.round(us / 10_000);
  const delays: number[] = [];
  let debt = 0; // 因钳到下限而多占的厘秒，从后续帧里扣回
  for (let i = 0; i < timestampsUs.length; i++) {
    const start = timestampsUs[i] as number;
    const end = i + 1 < timestampsUs.length ? (timestampsUs[i + 1] as number) : durationUs;
    let cs = toCs(end) - toCs(start) - debt;
    debt = 0;
    if (cs < MIN_DELAY_CS) {
      debt = MIN_DELAY_CS - cs;
      cs = MIN_DELAY_CS;
    }
    delays.push(cs);
  }
  return delays;
};
