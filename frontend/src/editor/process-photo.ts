import { photoFileError } from '@/domain/editor';

const uploadTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
type UploadType = (typeof uploadTypes)[number];

export async function prepareUpload(file: File): Promise<{ blob: Blob; contentType: UploadType; width: number; height: number } | { error: string }> {
  const invalid = photoFileError(file);
  if (invalid) return { error: invalid };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const heic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    return { error: heic ? '이 브라우저에서는 HEIC를 열 수 없어요. JPG나 PNG로 바꿔 주세요' : '사진을 열지 못했어요' };
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return { error: '사진을 열지 못했어요' };
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = await canvasBlob(canvas, 'image/webp');
  const blob = webp ?? (await canvasBlob(canvas, 'image/jpeg'));
  if (!blob) return { error: '사진을 열지 못했어요' };
  const contentType: UploadType = blob.type === 'image/webp' && uploadTypes.includes('image/webp') ? 'image/webp' : 'image/jpeg';
  return { blob, contentType, width, height };
}

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, 0.82));
}
