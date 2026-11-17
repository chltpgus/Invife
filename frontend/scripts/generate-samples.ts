import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sampleDir = path.join(root, 'public/samples');
const publicDir = path.join(root, 'public');

const palettes = [
  ['#E4D3C4', '#8C6A58', '#F7F1EA'],
  ['#D5DDD4', '#4E6A57', '#F4F7F2'],
  ['#D5D8E0', '#3E5678', '#F6F7F8'],
  ['#E7D7C8', '#6E4A42', '#FBF6F0'],
  ['#D9E0D8', '#5C6B58', '#F7F8F4'],
  ['#E8D9CE', '#7A624E', '#F8F3EE'],
  ['#D7DCE4', '#2C466A', '#F5F6F8'],
  ['#E2D5C6', '#5E463C', '#F6F1EB'],
  ['#DCE3DC', '#3D5A45', '#F3F6F2'],
  ['#E6D8CC', '#6A5348', '#FBF7F3'],
];

const focals = [
  { x: 0.5, y: 0.38 },
  { x: 0.42, y: 0.46 },
  { x: 0.62, y: 0.4 },
  { x: 0.48, y: 0.55 },
  { x: 0.36, y: 0.42 },
  { x: 0.58, y: 0.5 },
  { x: 0.5, y: 0.33 },
  { x: 0.44, y: 0.6 },
  { x: 0.66, y: 0.44 },
  { x: 0.4, y: 0.36 },
];

function svg(width: number, height: number, colors: string[], focal: { x: number; y: number }, index: number): string {
  const [from, to, light] = colors;
  const cx = Math.round(focal.x * width);
  const cy = Math.round(focal.y * height);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <circle cx="${cx}" cy="${cy}" r="${Math.round(width * 0.22)}" fill="${light}" fill-opacity="0.45"/>
  <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.84)}" height="${Math.round(height * 0.84)}" fill="none" stroke="${light}" stroke-opacity="0.55" stroke-width="${Math.max(1, Math.round(width / 400))}"/>
  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${light}" fill-opacity="0.8" font-family="Georgia, serif" font-size="${Math.round(width * 0.08)}">${String(index + 1).padStart(2, '0')}</text>
</svg>`;
}

const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#F4EFE6"/>
  <rect x="14" y="6" width="4" height="4" rx="0.4" fill="#7A2E2E"/>
  <path d="M13 12h6v1.6h-2.1V26h-1.8V13.6H13V12z" fill="#7A2E2E"/>
</svg>`;

async function writeIcon(size: number, file: string) {
  await sharp(Buffer.from(iconSvg)).resize(size, size).png().toFile(path.join(publicDir, file));
}

async function main() {
  await mkdir(sampleDir, { recursive: true });
  const photos: Array<Record<string, unknown>> = [];

  for (let index = 0; index < palettes.length; index += 1) {
    const id = `photo-${String(index + 1).padStart(2, '0')}`;
    const colors = palettes[index] ?? palettes[0];
    const focal = focals[index] ?? { x: 0.5, y: 0.4 };
    const widths = [800, 1200, 1600] as const;
    for (const width of widths) {
      const height = Math.round(width * 1.25);
      const image = sharp(Buffer.from(svg(width, height, colors, focal, index))).webp({ quality: 72 });
      await image.toFile(path.join(sampleDir, `${id}-${width}.webp`));
    }
    const lqipBuffer = await sharp(Buffer.from(svg(48, 60, colors, focal, index)))
      .resize(24, 30)
      .webp({ quality: 40 })
      .toBuffer();
    photos.push({
      id,
      width: 1600,
      height: 2000,
      focal,
      src: {
        w800: `samples/${id}-800.webp`,
        w1200: `samples/${id}-1200.webp`,
        w1600: `samples/${id}-1600.webp`,
      },
      lqip: `data:image/webp;base64,${lqipBuffer.toString('base64')}`,
    });
  }

  const body = `import type { Photo } from '@/domain/types';\n\nexport const samplePhotos: Photo[] = ${JSON.stringify(photos, null, 2)};\n`;
  await writeFile(path.join(root, 'src/data/generated-photos.ts'), body, 'utf8');

  await writeFile(path.join(publicDir, 'icon.svg'), iconSvg, 'utf8');
  await writeIcon(32, 'favicon-32.png');
  await writeIcon(180, 'apple-touch-icon.png');
  await writeIcon(192, 'icon-192.png');
  await writeIcon(512, 'icon-512.png');
  const png32 = await sharp(Buffer.from(iconSvg)).resize(32, 32).png().toBuffer();
  const ico = pngIco(png32);
  await writeFile(path.join(publicDir, 'favicon.ico'), ico);
}

function pngIco(png: Buffer): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 32;
  header[7] = 32;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
