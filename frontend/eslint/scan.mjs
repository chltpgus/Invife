import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import plugin, { invifeRules } from './invife.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function virtualName(filename) {
  const name = path.resolve(filename).split('\\').join('/');
  const marker = '/frontend/';
  const index = name.lastIndexOf(marker);
  if (index < 0) return path.resolve(filename);
  return path.join(frontendRoot, name.slice(index + marker.length));
}

const SKIP = new Set(['node_modules', '.next', 'out', 'coverage']);

export function lintSource(code, filename) {
  const linter = new Linter({ configType: 'flat' });
  return linter.verify(
    code,
    [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
          parser: tsParser,
          parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
        },
        plugins: { invife: plugin },
        rules: invifeRules,
      },
    ],
    { filename: virtualName(filename) },
  );
}

export function lintTree(root) {
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry) || entry.endsWith('.d.ts')) continue;
      for (const message of lintSource(readFileSync(full, 'utf8'), full)) {
        if (!message.ruleId) hits.push({ file: full, line: message.line, rule: 'parse', message: message.message });
        else if (message.severity === 2 && message.ruleId.startsWith('invife/')) {
          hits.push({ file: full, line: message.line, rule: message.ruleId, message: message.message });
        }
      }
    }
  };
  walk(root);
  return hits;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  const root = path.resolve(process.argv[2] ?? 'src');
  const hits = lintTree(root);
  for (const hit of hits) console.log(`${hit.rule}\t${hit.file}:${hit.line}\t${hit.message}`);
  console.log(`${hits.length} violations`);
  process.exit(hits.length === 0 ? 0 : 1);
}
