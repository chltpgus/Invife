import sharp from 'sharp';

export type PhotoFilter = 'original' | 'warm' | 'mono';

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

export async function processImage(input: Buffer, filter: PhotoFilter): Promise<ProcessedImage> {
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

  async function variant(target: number): Promise<Buffer> {
    let pipeline = sharp(master).resize({ width: Math.min(target, width), withoutEnlargement: true });
    pipeline = applyFilter(pipeline, filter);
    return pipeline.webp({ quality: 80 }).toBuffer();
  }

  const lqipBuffer = await applyFilter(sharp(master).resize({ width: 16 }), filter).webp({ quality: 20 }).toBuffer();
  return {
    master,
    w800: await variant(800),
    w1200: await variant(1200),
    w1600: await variant(1600),
    thumb: await variant(400),
    lqip: `data:image/webp;base64,${lqipBuffer.toString('base64')}`,
    width,
    height,
    lowQuality: Math.min(width, height) < 800,
  };
}

function applyFilter(pipeline: sharp.Sharp, filter: PhotoFilter): sharp.Sharp {
  if (filter === 'mono') return pipeline.grayscale();
  if (filter === 'warm') return pipeline.recomb(WARM);
  return pipeline;
}
