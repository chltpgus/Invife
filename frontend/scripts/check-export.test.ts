import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bracketPaths } from './check-export';

describe('정적 내보내기 경로', () => {
  it('대괄호가 들어간 폴더를 찾는다', () => {
    const root = mkdtempSync(join(tmpdir(), 'invife-out-'));
    mkdirSync(join(root, 'i', '[slug]'), { recursive: true });
    mkdirSync(join(root, 'i', 'plain'), { recursive: true });
    const found = bracketPaths(root);
    expect(found.some((item) => item.endsWith(`${join('i', '[slug]')}`))).toBe(true);
    expect(found.some((item) => item.endsWith('plain'))).toBe(false);
  });
});
