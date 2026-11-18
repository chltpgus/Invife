import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function bracketPaths(outDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry.includes('[') || entry.includes(']')) found.push(full);
      if (statSync(full).isDirectory()) walk(full);
    }
  };
  walk(outDir);
  return found;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const outDir = join(process.cwd(), 'out');
  if (!existsSync(outDir)) {
    console.error('out/ 이 없습니다. npm run build 뒤에 실행하세요.');
    process.exit(1);
  }
  const found = bracketPaths(outDir);
  if (found.length > 0) {
    console.error('정적 호스트는 폴더 이름의 대괄호를 404로 거절합니다. npm run build가 scripts/fix-export-chunks.ts를 실행해야 합니다.');
    for (const item of found) console.error(item);
    process.exit(1);
  }
  console.log('bracket folders 없음');
}
