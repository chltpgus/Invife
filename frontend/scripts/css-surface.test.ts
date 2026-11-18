import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skip = new Set(['node_modules', '.next', 'out', 'coverage']);

function cssFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...cssFiles(full));
    else if (entry.endsWith('.css')) found.push(relative(root, full));
  }
  return found;
}

describe('스타일 파일', () => {
  it('CSS는 globals.css 하나만 둔다', () => {
    expect(
      cssFiles(root).sort(),
      'CSS 파일을 새로 만들지 마세요. Tailwind와 src/app/globals.css만 씁니다. 폰트 선언이 필요하면 globals.css에 넣으세요.',
    ).toEqual(['src/app/globals.css']);
  });
});
