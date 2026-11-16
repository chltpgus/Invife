import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import { fixtures } from '@/data/fixtures';
import { formatMonthDay, ogDescription } from '@/domain/dates';
import type { Invitation, ThemeId } from '@/domain/types';

const themeColor: Record<ThemeId, { bg: string; text: string; text2: string; accent: string }> = {
  ivory: { bg: '#F4EFE6', text: '#1F1B16', text2: '#5F574C', accent: '#7A2E2E' },
  sage: { bg: '#ECEEE7', text: '#1A1F1B', text2: '#525B53', accent: '#3D5A45' },
  mist: { bg: '#ECEDEF', text: '#1A1D24', text2: '#535862', accent: '#2C466A' },
};

async function coverDataUri(invitation: Invitation): Promise<string | null> {
  const photo = invitation.photos[0];
  if (!photo) return null;
  const file = path.join(process.cwd(), 'public', photo.src.w1600);
  const image = sharp(file);
  const meta = await image.metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const size = Math.min(width, height);
  const left = Math.max(0, Math.min(Math.round(photo.focal.x * width - size / 2), width - size));
  const top = Math.max(0, Math.min(Math.round(photo.focal.y * height - size / 2), height - size));
  const png = await image.extract({ left, top, width: size, height: size }).resize(600, 600).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function main() {
  const fontDir = path.join(process.cwd(), 'fonts-og');
  const fonts = await Promise.all(
    [
      ['Noto Serif KR', 'noto-serif-kr-300.ttf', 300],
      ['Noto Serif KR', 'noto-serif-kr-400.ttf', 400],
      ['Noto Sans KR', 'noto-sans-kr-400.ttf', 400],
      ['Noto Sans KR', 'noto-sans-kr-500.ttf', 500],
    ].map(async ([name, file, weight]) => ({
      name: String(name),
      data: await readFile(path.join(fontDir, String(file))),
      weight: Number(weight) as 300 | 400 | 500,
      style: 'normal' as const,
    })),
  );
  const outDir = path.join(process.cwd(), 'public/og');
  await mkdir(outDir, { recursive: true });

  for (const record of fixtures) {
    const invitation = record.invitation;
    const color = themeColor[invitation.theme];
    const image = await coverDataUri(invitation);
    const svg = await satori(
      {
        type: 'div',
        props: {
          style: { width: 1200, height: 600, display: 'flex', background: color.bg, color: color.text },
          children: [
            image
              ? { type: 'img', props: { src: image, width: 600, height: 600, style: { width: 600, height: 600, objectFit: 'cover' } } }
              : null,
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  width: image ? 600 : 1200,
                  padding: 48,
                  gap: 16,
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', color: color.accent, fontSize: 22, fontFamily: 'Noto Sans KR', fontWeight: 500, letterSpacing: 4 },
                      children: 'THE WEDDING OF',
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', fontSize: 56, fontFamily: 'Noto Serif KR', fontWeight: 400 },
                      children: `${invitation.groom.name} · ${invitation.bride.name}`,
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', fontSize: 96, fontFamily: 'Noto Serif KR', fontWeight: 300, letterSpacing: -1 },
                      children: formatMonthDay(invitation.ceremony.date),
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', color: color.text2, fontSize: 28, fontFamily: 'Noto Sans KR', fontWeight: 400 },
                      children: ogDescription(invitation),
                    },
                  },
                ],
              },
            },
          ].filter(Boolean),
        },
      },
      { width: 1200, height: 600, fonts },
    );
    const png = new Resvg(svg).render().asPng();
    const jpeg = await sharp(png).jpeg({ quality: 80 }).toBuffer();
    await writeFile(path.join(outDir, `${invitation.slug}.jpg`), jpeg);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
