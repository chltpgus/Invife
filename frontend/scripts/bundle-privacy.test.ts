import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sampleDirectory } from '@/rsvp/fixture-directory';
import { packageDir, reachable } from './source-graph';

const root = packageDir(fileURLToPath(import.meta.url));

function apiAlias(file: string): string | null {
  if (file.endsWith(`${join('src', 'rsvp', 'create-client.ts')}`)) return file.replace(/create-client\.ts$/, 'create-client.api.ts');
  return null;
}

describe('샘플 하객 이름', () => {
  it('api 치환을 적용한 페이지 그래프에 없다', () => {
    const entry = join(root, 'src/components/organisms/RsvpSection/index.tsx');
    const names = sampleDirectory.flatMap((item) => item.recipients.map((person) => person.name));
    const bundled = reachable(entry, apiAlias)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    for (const name of names) {
      expect(bundled, `${name} 이 페이지 그래프에 있습니다. api 빌드는 create-client.api.ts로 바꿔 fixture-directory를 빼야 합니다.`).not.toContain(name);
    }
    expect(reachable(entry).some((file) => file.endsWith('fixture-directory.ts'))).toBe(true);
  });

  it('api 빌드 설정이 create-client를 api 파일로 바꿉니다', () => {
    const source = readFileSync(join(root, 'next.config.ts'), 'utf8');
    expect(source).toContain("process.env.NEXT_PUBLIC_DATA_SOURCE === 'api'");
    expect(source).toContain('NormalModuleReplacementPlugin');
    expect(source).toContain('create-client.api.ts');
    const pattern = source.match(/\/\[[\\/]+\]rsvp\[[\\/]+\]create-client\\?\.ts\$\//);
    expect(pattern, 'create-client.ts 를 가리키는 치환 정규식이 없습니다.').not.toBeNull();
  });
});
