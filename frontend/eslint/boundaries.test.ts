import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crossPackageImport } from './boundaries.mjs';

describe('패키지 경계', () => {
  it('frontend와 backend 사이의 import만 찾는다', () => {
    const root = mkdtempSync(join(tmpdir(), 'invife-boundary-'));
    mkdirSync(join(root, 'frontend', 'src'), { recursive: true });
    mkdirSync(join(root, 'backend', 'src'), { recursive: true });
    writeFileSync(join(root, 'frontend', 'package.json'), '{"name":"fe"}\n');
    writeFileSync(join(root, 'backend', 'package.json'), '{"name":"be"}\n');
    const frontendFile = join(root, 'frontend', 'src', 'a.ts');
    const backendFile = join(root, 'backend', 'src', 'b.ts');
    expect(crossPackageImport(frontendFile, '../../backend/src/app')).toBe('backend');
    expect(crossPackageImport(frontendFile, '@/domain/types')).toBeNull();
    expect(crossPackageImport(backendFile, '../../frontend/src/a')).toBe('frontend');
  });
});
