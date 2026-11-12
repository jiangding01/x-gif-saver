// 抖动色样：用插件真实的量化 + 抖动算法渲染一小块渐变，让「颜色数 / 抖动」的差别一眼可见。
// 不是装饰：参数一变，色样就按实际输出的样子重画。

import { quantize } from 'gifenc';
import { useEffect, useRef } from 'react';
import type { DitherMode } from '../../core/types';
import { createPaletteLookup, ditherSpread, ditherToIndex } from '../../pipeline/dither';

/** X 自己的主题色：蓝、紫、粉、琥珀。渐变铺满整块色样，颜色少时的色带与抖动颗粒都一眼可见 */
const STOPS: [number, number, number][] = [
  [29, 155, 240],
  [120, 86, 255],
  [249, 24, 128],
  [255, 212, 0],
];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** 横向沿主题色渐变，纵向从亮到暗 */
const sourceImage = (size: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(size * size * 4);
  const last = STOPS.length - 1;
  for (let y = 0; y < size; y++) {
    const light = 1.08 - (y / (size - 1)) * 0.5;
    for (let x = 0; x < size; x++) {
      const pos = (x / (size - 1)) * last;
      const i = Math.min(last - 1, Math.floor(pos));
      const a = STOPS[i] as [number, number, number];
      const b = STOPS[i + 1] as [number, number, number];
      const t = pos - i;
      data.set(
        [mix(a[0], b[0], t) * light, mix(a[1], b[1], t) * light, mix(a[2], b[2], t) * light, 255],
        (y * size + x) * 4,
      );
    }
  }
  return data;
};

const cache = new Map<string, ImageData>();

/** 按尺寸与参数渲染（带缓存：组合很少），用的就是转换流水线里同一套量化与抖动 */
const render = (size: number, colors: number, dither: DitherMode): ImageData => {
  const key = `${size}:${colors}:${dither}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const source = sourceImage(size);
  const palette = quantize(source, colors, { format: 'rgb565' });
  const index = ditherToIndex(
    source,
    size,
    size,
    createPaletteLookup(palette),
    dither === 'bayer' ? ditherSpread(colors) : 0,
  );
  const image = new ImageData(size, size);
  index.forEach((i, p) => {
    const [r, g, b] = palette[i] as number[];
    image.data.set([r as number, g as number, b as number, 255], p * 4);
  });
  cache.set(key, image);
  return image;
};

type Props = {
  colors: number;
  dither: DitherMode;
  /** 渲染边长（像素），按 2 倍放大显示，让抖动颗粒看得清 */
  crop: number;
  className?: string;
};

export const DitherSwatch = ({ colors, dither, crop, className }: Props) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) ctx.putImageData(render(crop, colors, dither), 0, 0);
  }, [colors, dither, crop]);
  return (
    <span className={className} aria-hidden="true">
      <canvas ref={ref} width={crop} height={crop} style={{ width: crop * 2, height: crop * 2 }} />
    </span>
  );
};
