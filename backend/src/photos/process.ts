import sharp from 'sharp';

export type PhotoFilter = 'original' | 'warm' | 'mono';

export type NormalizedCrop = { x: number; y: number; width: number; height: number };

export const FULL_CROP: NormalizedCrop = { x: 0, y: 0, width: 1, height: 1 };

export type ProcessedImage = {
  master: Buffer;
  w800: Buffer;
  w1200: Buffer;
  w1600: Buffer;
  thumb: Buffer;
  lqip: string;
  width: number;
  height: number;
  lowQuality: boolean;
};

const WARM: [[number, number, number], [number, number, number], [number, number, number]] = [
  [1.12, 0.04, 0],
  [0.02, 1.02, 0],
  [0, 0, 0.9],
];

export async function processImage(
  input: Buffer,
  filter: PhotoFilter,
  crop: NormalizedCrop = FULL_CROP,
): Promise<ProcessedImage> {
  let master: Buffer;
  try {
    master = await sharp(input, { failOn: 'none', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2400, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new Error('unsupported_image');
  }
  const meta = await sharp(master).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('unsupported_image');

  const box = cropBox(width, height, crop);
  const framed =
    box.left === 0 && box.top === 0 && box.width === width && box.height === height
      ? master
      : await sharp(master).extract(box).toBuffer();
  const framedMeta = framed === master ? { width, height } : await sharp(framed).metadata();
  const framedWidth = framedMeta.width ?? width;
  const framedHeight = framedMeta.height ?? height;

  async function variant(target: number): Promise<Buffer> {
    let pipeline = sharp(framed).resize({ width: Math.min(target, framedWidth), withoutEnlargement: true });
    pipeline = applyFilter(pipeline, filter);
    return pipeline.webp({ quality: 80 }).toBuffer();
  }

  const lqipBuffer = await applyFilter(sharp(framed).resize({ width: 16 }), filter).webp({ quality: 20 }).toBuffer();
  return {
    master,
    w800: await variant(800),
    w1200: await variant(1200),
    w1600: await variant(1600),
    thumb: await variant(400),
    lqip: `data:image/webp;base64,${lqipBuffer.toString('base64')}`,
    width: framedWidth,
    height: framedHeight,
    lowQuality: Math.min(framedWidth, framedHeight) < 800,
  };
}

function cropBox(width: number, height: number, crop: NormalizedCrop) {
  let left = Math.round(crop.x * width);
  let top = Math.round(crop.y * height);
  let boxWidth = Math.round(crop.width * width);
  let boxHeight = Math.round(crop.height * height);
  if (left >= width) left = width - 1;
  if (top >= height) top = height - 1;
  if (left + boxWidth > width) boxWidth = width - left;
  if (top + boxHeight > height) boxHeight = height - top;
  return { left, top, width: Math.max(1, boxWidth), height: Math.max(1, boxHeight) };
}

function applyFilter(pipeline: sharp.Sharp, filter: PhotoFilter): sharp.Sharp {
  if (filter === 'mono') return pipeline.grayscale();
  if (filter === 'warm') return pipeline.recomb(WARM);
  return pipeline;
}
