import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';

const extensions = ['.ts', '.tsx', '.mts', '.js'];

export function packageDir(file: string): string {
  let dir = dirname(file);
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`package.json not found from ${file}`);
    dir = parent;
  }
}

function asFile(target: string): string | null {
  const candidates = [target, ...extensions.flatMap((ext) => [target + ext, join(target, `index${ext}`)])];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export function importSpecifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const specs: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) specs.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specs;
}

export function resolveImport(fromFile: string, spec: string, alias?: (file: string) => string | null): string | null {
  let target: string | null = null;
  if (spec.startsWith('@/')) target = join(packageDir(fromFile), 'src', spec.slice(2));
  else if (spec.startsWith('.')) target = join(dirname(fromFile), spec);
  else return null;
  const resolved = asFile(target);
  if (!resolved) return null;
  const redirected = alias?.(resolved);
  return redirected ? (asFile(redirected) ?? redirected) : resolved;
}

export function reachable(entry: string, alias?: (file: string) => string | null): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    for (const spec of importSpecifiers(file)) {
      const next = resolveImport(file, spec, alias);
      if (next) queue.push(next);
    }
  }
  return [...seen];
}
