import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const SKIP = new Set(['node_modules', '.next', 'out', 'coverage']);

export function packageRoot(file, name) {
  let dir = path.dirname(path.resolve(file));
  while (true) {
    if (path.basename(dir) === name && existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** @returns {'frontend' | 'backend' | null} */
export function crossPackageImport(fromFile, spec) {
  if (typeof spec !== 'string' || spec.length === 0) return null;
  const frontend = packageRoot(fromFile, 'frontend');
  const backend = packageRoot(fromFile, 'backend');
  const origin = frontend ? 'frontend' : backend ? 'backend' : null;
  if (!origin) return null;
  const other = origin === 'frontend' ? 'backend' : 'frontend';
  if (origin === 'backend' && spec.startsWith('@/')) return 'frontend';
  if (!spec.startsWith('.') && (spec === other || spec.startsWith(`${other}/`))) return other;

  let resolved = null;
  if (spec.startsWith('.')) resolved = path.normalize(path.join(path.dirname(path.resolve(fromFile)), spec));
  else if (spec.startsWith('@/') && frontend) resolved = path.normalize(path.join(frontend, 'src', spec.slice(2)));
  else return null;

  const originRoot = frontend || backend;
  const sibling = path.join(path.dirname(originRoot), other);
  if (resolved === sibling || resolved.startsWith(sibling + path.sep)) return other;
  return null;
}

export function importSpecs(file) {
  const text = readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const specs = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push({ spec: node.moduleSpecifier.text, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        specs.push({ spec: arg.text, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specs;
}

export function scanTree(root) {
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue;
      const full = path.join(dir, entry);
      const info = statSync(full);
      if (info.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|mts)$/.test(entry) || entry.endsWith('.d.ts')) continue;
      for (const item of importSpecs(full)) {
        const target = crossPackageImport(full, item.spec);
        if (target) hits.push({ file: full, line: item.line, spec: item.spec, target });
      }
    }
  };
  if (existsSync(root)) walk(root);
  return hits;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const hits = [...scanTree(path.join(repo, 'frontend')), ...scanTree(path.join(repo, 'backend'))];
  if (hits.length === 0) {
    console.log('frontend/backend import 없음');
  } else {
    for (const hit of hits) console.error(`${hit.file}:${hit.line} ${hit.spec} -> ${hit.target}`);
    process.exit(1);
  }
}
