import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // 정적 내보내기에서는 next/image 최적화를 쓰지 않고, 스펙의 srcset <img> 를 쓴다.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
