import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT = new Set(['.html', '.txt', '.js', '.css', '.json', '.map']);

/** `[slug]` 청크 폴더는 정적 호스트가 404 로 거절하는 경우가 있다. 그러면 HTML 은 뜨고 클릭만 죽는다. */
export function rewriteBracketChunks(outDir: string): string[] {
  const dirs = bracketDirs(outDir).sort((a, b) => b.length - a.length);
  const renamed: string[] = [];
  for (const dir of dirs) {
    const name = basename(dir);
    if (!/^\[[^/\]]+\]$/.test(name)) continue;
    const bare = name.slice(1, -1);
    replaceInTree(outDir, encodeURIComponent(name), bare);
    const target = join(dirname(dir), bare);
    if (existsSync(target)) throw new Error(`chunk path already exists: ${target}`);
    renameSync(dir, target);
    renamed.push(`${name} -> ${bare}`);
  }
  return renamed;
}

function bracketDirs(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (!statSync(path).isDirectory()) continue;
      if (entry.includes('[') || entry.includes(']')) found.push(path);
      walk(path);
    }
  };
  walk(root);
  return found;
}

function replaceInTree(root: string, from: string, to: string) {
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!TEXT.has(extname(path))) continue;
      const source = readFileSync(path, 'utf8');
      if (!source.includes(from)) continue;
      writeFileSync(path, source.replaceAll(from, to));
    }
  };
  walk(root);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const outDir = join(process.cwd(), 'out');
  console.log(rewriteBracketChunks(outDir).join('\n') || 'no bracket chunks');
}
