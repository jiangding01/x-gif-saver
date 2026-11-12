# 测试素材

均为本地合成，不含 X 上的真实 GIF（版权属于上传者，仓库公开）。

- `testsrc-480-15fps-65f.mp4`：参数对齐真实样本（480×480、15fps、65 帧、4.33s），High profile、带 B 帧（覆盖 cts ≠ dts 与 edit list 偏移）

```bash
ffmpeg -f lavfi -i testsrc=size=480x480:rate=15 -frames:v 65 -c:v libx264 -pix_fmt yuv420p \
  -movflags +faststart -map_metadata -1 -fflags +bitexact -flags:v +bitexact testsrc-480-15fps-65f.mp4
```

- `testsrc-vfr-160.mp4`：可变帧率 + B 帧（前 5 帧间隔 30ms、之后 250ms，时间单位 1/100 秒），覆盖「总时长取容器 edit list」

```bash
ffmpeg -f lavfi -i testsrc=size=160x160:rate=100 \
  -vf "select='lt(n,5)+not(mod(n-5,25))*gte(n,5)',setpts='if(lt(N,5),N*3,15+(N-5)*25)/100/TB'" \
  -frames:v 20 -fps_mode passthrough -c:v libx264 -pix_fmt yuv420p -video_track_timescale 100 \
  -movflags +faststart -map_metadata -1 -fflags +bitexact -flags:v +bitexact testsrc-vfr-160.mp4
```
