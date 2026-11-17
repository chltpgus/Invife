import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rewriteBracketChunks } from './fix-export-chunks';

describe('정적 청크 경로', () => {
  it('대괄호 폴더를 URL 에 안전한 이름으로 바꾸고 참조를 고친다', () => {
    const root = mkdtempSync(join(tmpdir(), 'invife-chunks-'));
    const chunkDir = join(root, '_next', 'static', 'chunks', 'app', 'i', '[slug]');
    mkdirSync(chunkDir, { recursive: true });
    writeFileSync(join(chunkDir, 'page.js'), 'page');
    const html = join(root, 'index.html');
    writeFileSync(html, '<script src="/_next/static/chunks/app/i/%5Bslug%5D/page.js"></script>');
    writeFileSync(join(root, 'route.js'), 'self.__SSG_MANIFEST=new Set(["\\u002Fi\\u002F[slug]"])');

    expect(rewriteBracketChunks(root)).toEqual(['[slug] -> slug']);
    expect(readFileSync(html, 'utf8')).toContain('/_next/static/chunks/app/i/slug/page.js');
    expect(readFileSync(html, 'utf8')).not.toContain('%5B');
    expect(readFileSync(join(root, '_next', 'static', 'chunks', 'app', 'i', 'slug', 'page.js'), 'utf8')).toBe('page');
    expect(readFileSync(join(root, 'route.js'), 'utf8')).toContain('[slug]');
  });
});
