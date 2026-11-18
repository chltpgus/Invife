import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lintSource } from './scan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const component = join(root, 'src/components/example.tsx');

function ids(code: string, filename: string) {
  return lintSource(code, filename).map((message: { ruleId: string | null }) => message.ruleId);
}

describe('invife 규칙', () => {
  it('컴포넌트의 fetch, axios, useQuery를 막는다', () => {
    const found = ids(
      `import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
export function Box() {
  useQuery({ queryKey: ['a'], queryFn: () => axios.get('/a') });
  fetch('/a');
  return null;
}
`,
      component,
    );
    expect(found).toContain('invife/no-fetch');
    expect(found).toContain('invife/no-axios-outside-api');
    expect(found).toContain('invife/no-query-outside-api');
    expect(found).toContain('invife/component-folder');
  });

  it('query.ts와 createInstance와 테스트는 허용한다', () => {
    const query = join(root, 'src/domain/rsvp/query.ts');
    expect(
      ids(
        `import { useMutation, useQuery } from '@tanstack/react-query';
export function useThing() { return useQuery({ queryKey: ['a'], queryFn: async () => 1 }); }
export function useSave() { return useMutation({ mutationFn: async () => 1 }); }
`,
        query,
      ),
    ).toEqual([]);
    expect(ids(`import axios from 'axios';\nexport const client = axios.create();\n`, join(root, 'src/api/createInstance.ts'))).not.toContain(
      'invife/no-axios-outside-api',
    );
    expect(ids(`import axios from 'axios';\nexport const http = axios.create();\n`, join(root, 'src/rsvp/api-client.test.ts'))).not.toContain(
      'invife/no-axios-outside-api',
    );
    expect(
      ids(`import { createInstance } from '@/api/createInstance';\nexport const clientInstance = createInstance({});\n`, join(root, 'src/api/clientInstance.ts')),
    ).not.toContain('invife/no-axios-outside-api');
    expect(ids(`import { clientInstance } from '@/api/clientInstance';\nexport const http = clientInstance;\n`, join(root, 'src/data/api-source.ts'))).not.toContain(
      'invife/no-axios-outside-api',
    );
    expect(ids(`import { clientInstance } from '@/api/clientInstance';\nexport const http = clientInstance;\n`, component)).toContain('invife/no-axios-outside-api');
  });

  it('effect 안의 조회만 막고 타이머는 둔다', () => {
    const toast = join(root, 'src/components/toast.tsx');
    expect(
      ids(
        `import { useEffect } from 'react';
export function Box() {
  useEffect(() => {
    const id = setTimeout(() => undefined, 10);
    return () => clearTimeout(id);
  }, []);
  return null;
}
`,
        toast,
      ),
    ).not.toContain('invife/no-effect-fetch');
    expect(
      ids(
        `import { useEffect } from 'react';
declare const client: { context(input: { slug: string }): Promise<unknown> };
export function Box() {
  useEffect(() => {
    void client.context({ slug: 'a' });
  }, []);
  return null;
}
`,
        toast,
      ),
    ).toContain('invife/no-effect-fetch');
  });

  it('사진 초점 외의 인라인 style을 막는다', () => {
    expect(ids(`export function Box() { return <div style={{ marginTop: 8 }} />; }\n`, component)).toContain('invife/no-inline-style');
    expect(
      ids(
        `export function Box({ position }: { position: string }) { return <img alt="" style={{ objectPosition: position }} />; }\n`,
        join(root, 'src/components/photo.tsx'),
      ),
    ).not.toContain('invife/no-inline-style');
  });

  it('새 컴포넌트는 폴더와 default export를 요구한다', () => {
    const file = join(root, 'src/components/atoms/Seal/index.tsx');
    expect(ids(`export function Seal() { return null; }\n`, file)).toContain('invife/component-folder');
    expect(ids(`export default function Seal() { return null; }\n`, file)).not.toContain('invife/component-folder');
    expect(ids(`export default function Check() { return null; }\n`, join(root, 'src/components/atoms/svg/Check/index.tsx'))).not.toContain(
      'invife/component-folder',
    );
  });

  it('backend import를 막는다', () => {
    const file = join(root, 'src/components/accounts.tsx');
    expect(ids(`import { app } from '../../../backend/src/app';\nexport const value = app;\n`, file)).toContain('invife/no-cross-import');
    expect(ids(`import { dates } from '@/domain/dates';\nexport const value = dates;\n`, file)).not.toContain('invife/no-cross-import');
  });

  it('현재 참석 칸은 통과한다', () => {
    const file = join(root, 'src/components/organisms/RsvpSection/index.tsx');
    expect(lintSource(readFileSync(file, 'utf8'), file)).toEqual([]);
  });
});
