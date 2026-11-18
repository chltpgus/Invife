import { crossPackageImport } from './boundaries.mjs';

const QUERY_HOOKS = new Set(['useQuery', 'useMutation']);
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'request']);
const CLIENT_METHODS = new Set(['context', 'submit', 'get', 'post', 'put', 'patch', 'delete', 'request']);
const STYLE_KEYS = new Set(['objectFit', 'objectPosition', 'backgroundImage']);
const LEGACY_COMPONENTS = new Set([
  'accounts.tsx',
  'cover.tsx',
  'directions.tsx',
  'ended-view.tsx',
  'envelope.tsx',
  'gallery.tsx',
  'icon.tsx',
  'invitation-view.tsx',
  'photo.tsx',
  'quick-nav.tsx',
  'reveal.tsx',
  'rsvp-section.tsx',
  'share-button.tsx',
  'story.tsx',
  'toast.tsx',
  'venue-map.tsx',
  'when.tsx',
]);

const fetchMessage = 'fetch를 쓰지 마세요. src/api/createInstance.ts로 만든 클라이언트를 도메인 query.ts에서만 호출하세요.';
const axiosMessage =
  'axios는 src/api/createInstance.ts에서만 가져오세요. 화면은 src/api/<도메인>/query.ts가 내보내는 useXxx 훅을 씁니다.';
const clientMessage =
  'apiClient와 createInstance는 src/api/<도메인>/query.ts에서만 쓰세요. 참석 전송은 이미 있는 src/rsvp/client.ts가 맡습니다. 화면은 useXxx 훅만 부릅니다.';
const queryMessage =
  'useQuery와 useMutation은 src/api/<도메인>/query.ts 안에서만 부르세요. 컴포넌트는 그 파일의 useXxx 훅을 씁니다. 키는 queryKey.ts, 요청 타입은 api.type.ts에 두세요.';
const effectMessage =
  'useEffect 안에서 서버 데이터를 가져오지 마세요. 조회와 저장은 src/api/<도메인>/query.ts의 useQuery, useMutation으로 두고 컴포넌트는 그 훅을 부르세요. DOM이나 애니메이션 타이머는 그대로 두어도 됩니다.';
const styleMessage =
  '스타일은 Tailwind 클래스로 주세요. 인라인 style은 사진의 objectFit, objectPosition, backgroundImage, 또는 CSS 변수(--*)만 허용합니다.';
const folderMessage =
  '컴포넌트는 src/components/atoms|molecules|organisms/<파스칼이름>/index.tsx에 두고 default export 하세요. 조각은 atoms, 한 구역은 molecules, 한 화면은 organisms입니다. 기존 파일 목록에 이름을 넣지 마세요.';
const defaultExportMessage = '이 컴포넌트 폴더의 index.tsx는 default export 하세요.';
const crossMessage = 'frontend와 backend는 서로 import하지 마세요. 값은 docs/api 계약과 HTTP로만 맞춥니다.';

export const invifeRules = {
  'invife/no-fetch': 'error',
  'invife/no-axios-outside-api': 'error',
  'invife/no-query-outside-api': 'error',
  'invife/no-effect-fetch': 'error',
  'invife/no-inline-style': 'error',
  'invife/component-folder': 'error',
  'invife/no-cross-import': 'error',
};

function norm(filename) {
  return filename.split('\\').join('/');
}

function isTest(filename) {
  return /\.test\.tsx?$/.test(norm(filename));
}

function isCreateInstance(filename) {
  return norm(filename).endsWith('/src/api/createInstance.ts');
}

function isApiQuery(filename) {
  return /\/src\/api\/(?:[^/]+\/)*query\.ts$/.test(norm(filename));
}

function isRsvpTransport(filename) {
  return norm(filename).endsWith('/src/rsvp/client.ts');
}

function allowsAxiosValue(filename) {
  return isCreateInstance(filename) || isTest(filename);
}

function allowsApiClient(filename) {
  return isApiQuery(filename) || isCreateInstance(filename) || isRsvpTransport(filename) || isTest(filename);
}

function componentRel(filename) {
  const name = norm(filename);
  const marker = '/src/components/';
  const index = name.indexOf(marker);
  if (index < 0) return null;
  return name.slice(index + marker.length);
}

function isFetchCall(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier' && callee.name === 'fetch') return true;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' && callee.property.name === 'fetch') {
    const object = callee.object;
    return object.type === 'Identifier' && (object.name === 'window' || object.name === 'globalThis' || object.name === 'self');
  }
  return false;
}

function isAxiosCall(node) {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.computed) return false;
  const object = node.callee.object;
  return object.type === 'Identifier' && object.name === 'axios';
}

function isDataCall(node) {
  if (isFetchCall(node) || isAxiosCall(node)) return true;
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier' && QUERY_HOOKS.has(callee.name)) return true;
  if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') return false;
  const prop = callee.property.name;
  const object = callee.object;
  if (object.type !== 'Identifier') return false;
  if ((object.name === 'apiClient' || object.name === 'apiHttp' || object.name === 'http') && HTTP_METHODS.has(prop)) return true;
  if ((object.name === 'client' || object.name.endsWith('Client')) && CLIENT_METHODS.has(prop)) return true;
  return false;
}

function isUseEffect(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier') return callee.name === 'useEffect' || callee.name === 'useLayoutEffect';
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    return callee.property.name === 'useEffect' || callee.property.name === 'useLayoutEffect';
  }
  return false;
}

function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item.type === 'string') visit(item, fn);
      }
    } else if (value && typeof value.type === 'string') visit(value, fn);
  }
}

function importedName(specifier) {
  if (specifier.type === 'ImportDefaultSpecifier') return specifier.local.name;
  if (specifier.type === 'ImportSpecifier') return specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
  return specifier.local?.name ?? '';
}

function isValueSpecifier(node, specifier) {
  if (node.importKind === 'type' || specifier.importKind === 'type') return false;
  return specifier.type === 'ImportDefaultSpecifier' || specifier.type === 'ImportSpecifier';
}

function styleKey(prop) {
  if (!prop || prop.type === 'SpreadElement' || prop.type === 'ExperimentalSpreadProperty') return null;
  if (prop.computed && prop.key?.type === 'Literal' && typeof prop.key.value === 'string') return prop.key.value;
  if (prop.computed) return null;
  if (prop.key?.type === 'Identifier') return prop.key.name;
  if (prop.key?.type === 'Literal' && typeof prop.key.value === 'string') return prop.key.value;
  return null;
}

function styleAllowed(name) {
  return Boolean(name) && (name.startsWith('--') || STYLE_KEYS.has(name));
}

function checkStyle(context, node) {
  if (!node) return;
  if (node.type === 'ObjectExpression') {
    for (const prop of node.properties) {
      if (!styleAllowed(styleKey(prop))) context.report({ node: prop, messageId: 'style' });
    }
    return;
  }
  if (node.type === 'Literal') {
    if (typeof node.value === 'string') context.report({ node, messageId: 'style' });
    return;
  }
  if (node.type === 'Identifier' && node.name === 'undefined') return;
  if (node.type === 'ConditionalExpression') {
    checkStyle(context, node.consequent);
    checkStyle(context, node.alternate);
    return;
  }
  if (node.type === 'LogicalExpression') {
    checkStyle(context, node.left);
    checkStyle(context, node.right);
    return;
  }
  context.report({ node, messageId: 'style' });
}

function problem(description, messages, create) {
  return { meta: { type: 'problem', docs: { description }, messages, schema: [] }, create };
}

const plugin = {
  meta: { name: 'invife' },
  rules: {
    'no-fetch': problem('fetch 금지', { fetch: fetchMessage }, (context) => ({
      CallExpression(node) {
        if (isFetchCall(node)) context.report({ node, messageId: 'fetch' });
      },
    })),
    'no-axios-outside-api': problem('axios는 createInstance만', { axios: axiosMessage, client: clientMessage }, (context) => ({
      ImportDeclaration(node) {
        if (typeof node.source.value !== 'string') return;
        if (node.source.value === 'axios' && !allowsAxiosValue(context.filename)) {
          if (node.specifiers.some((specifier) => isValueSpecifier(node, specifier))) context.report({ node, messageId: 'axios' });
          return;
        }
        if (!allowsApiClient(context.filename) && (node.source.value === '@/api/createInstance' || node.source.value.endsWith('/api/createInstance'))) {
          if (node.specifiers.some((specifier) => isValueSpecifier(node, specifier) && (importedName(specifier) === 'apiClient' || importedName(specifier) === 'createInstance'))) {
            context.report({ node, messageId: 'client' });
          }
        }
      },
      CallExpression(node) {
        if (!allowsAxiosValue(context.filename) && isAxiosCall(node)) context.report({ node, messageId: 'axios' });
      },
    })),
    'no-query-outside-api': problem('useQuery는 query.ts만', { query: queryMessage }, (context) => ({
      ImportDeclaration(node) {
        if (isApiQuery(context.filename) || node.source.value !== '@tanstack/react-query') return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && QUERY_HOOKS.has(importedName(specifier))) {
            context.report({ node: specifier, messageId: 'query' });
          }
        }
      },
      CallExpression(node) {
        if (isApiQuery(context.filename)) return;
        const callee = node.callee;
        const name = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' ? callee.property.name : '';
        if (QUERY_HOOKS.has(name)) context.report({ node, messageId: 'query' });
      },
    })),
    'no-effect-fetch': problem('effect 안 데이터 호출 금지', { effect: effectMessage }, (context) => ({
      CallExpression(node) {
        if (!isUseEffect(node)) return;
        const fn = node.arguments[0];
        if (!fn || (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression')) return;
        visit(fn.body, (child) => {
          if (isDataCall(child)) context.report({ node: child, messageId: 'effect' });
        });
      },
    })),
    'no-inline-style': problem('인라인 style 제한', { style: styleMessage }, (context) => ({
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'style' || !node.value) return;
        if (node.value.type === 'Literal') {
          context.report({ node, messageId: 'style' });
          return;
        }
        if (node.value.type === 'JSXExpressionContainer') checkStyle(context, node.value.expression);
      },
    })),
    'component-folder': problem('컴포넌트 폴더', { folder: folderMessage, defaultExport: defaultExportMessage }, (context) => ({
      Program(node) {
        const rel = componentRel(context.filename);
        if (!rel || !rel.endsWith('.tsx')) return;
        if (!rel.includes('/') && LEGACY_COMPONENTS.has(rel)) return;
        if (!/^(atoms|molecules|organisms)\/[A-Z][A-Za-z0-9]*\/index\.tsx$/.test(rel)) {
          context.report({ node, messageId: 'folder' });
          return;
        }
        if (!node.body.some((statement) => statement.type === 'ExportDefaultDeclaration')) {
          context.report({ node, messageId: 'defaultExport' });
        }
      },
    })),
    'no-cross-import': problem('frontend/backend 경계', { cross: crossMessage }, (context) => ({
      ImportDeclaration(node) {
        reportCross(context, node, node.source?.value);
      },
      ExportAllDeclaration(node) {
        reportCross(context, node, node.source?.value);
      },
      ExportNamedDeclaration(node) {
        reportCross(context, node, node.source?.value);
      },
      ImportExpression(node) {
        if (node.source?.type === 'Literal') reportCross(context, node, node.source.value);
      },
    })),
  },
};

function reportCross(context, node, spec) {
  if (typeof spec !== 'string') return;
  if (crossPackageImport(context.filename, spec)) context.report({ node, messageId: 'cross' });
}

export default plugin;
