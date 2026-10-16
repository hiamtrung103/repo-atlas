import ts from 'typescript';
import {
  MAX_FILES,
  MAX_EDGES,
  MAX_BYTES,
  MAX_FILE_BYTES,
  SOURCE_RE,
  isIgnored,
  isConfig,
  type AtlasGraph,
  type AtlasEdge,
  type SourceFile,
  type EdgeKind,
} from './types';

export function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}
const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const join = (...parts: string[]) => normalize(parts.join('/'));
interface Config {
  filename: string;
  dir: string;
  baseUrl: string;
  hasBaseUrl: boolean;
  paths: Record<string, string[]>;
}

export function scanSources(input: SourceFile[], name = 'my-project'): AtlasGraph {
  const warnings: string[] = [];
  const files = input
    .filter((f) => !isIgnored(f.path))
    .map((f) => ({ ...f, path: normalize(f.path) }));
  const sources = files.filter((f) => SOURCE_RE.test(f.path));
  if (sources.length > MAX_FILES)
    throw new Error(
      `This project has ${sources.length} source files. The limit is ${MAX_FILES.toLocaleString()}. Select a smaller folder.`,
    );
  let total = 0;
  const encoder = new TextEncoder();
  const sizes = new Map<string, number>();
  for (const f of sources) {
    const bytes = encoder.encode(f.content).length;
    if (bytes > MAX_FILE_BYTES) throw new Error(`${f.path} exceeds the 1 MB per-file limit.`);
    sizes.set(f.path, bytes);
    total += bytes;
  }
  if (total > MAX_BYTES)
    throw new Error('Source files exceed the 15 MB scan limit. Select a smaller folder.');
  const configs: Config[] = [];
  for (const f of files.filter((f) => isConfig(f.path))) {
    const parsed = ts.parseConfigFileTextToJson(f.path, f.content);
    if (parsed.error) {
      warnings.push(`Could not parse ${f.path}; its aliases were skipped.`);
      continue;
    }
    const options = parsed.config?.compilerOptions ?? {};
    if (parsed.config?.extends)
      warnings.push(
        `${f.path}: inherited tsconfig options are not resolved; declare baseUrl/paths in this config for alias resolution.`,
      );
    const dir = dirname(f.path);
    const paths: Record<string, string[]> = {};
    if (options.paths && typeof options.paths === 'object') {
      for (const [key, val] of Object.entries(options.paths))
        if (Array.isArray(val) && val.every((v) => typeof v === 'string')) paths[key] = val;
    }
    configs.push({
      filename: f.path.split('/').pop()!,
      dir,
      baseUrl: join(dir, typeof options.baseUrl === 'string' ? options.baseUrl : ''),
      hasBaseUrl: typeof options.baseUrl === 'string',
      paths,
    });
  }
  const configPriority = (name: string) =>
    name === 'tsconfig.json' ? 0 : name === 'jsconfig.json' ? 1 : 2;
  configs.sort(
    (a, b) =>
      b.dir.length - a.dir.length ||
      configPriority(a.filename) - configPriority(b.filename) ||
      a.filename.localeCompare(b.filename),
  );
  const ids = new Set(sources.map((f) => f.path));
  function candidate(base: string): string | undefined {
    const clean = base.replace(/[?#].*$/, '');
    const extension = clean.match(/\.(js|jsx|mjs|cjs)$/)?.[1];
    const replacements: Record<string, string[]> = {
      js: ['.ts', '.tsx', '.d.ts'],
      jsx: ['.tsx', '.ts', '.d.ts'],
      mjs: ['.mts', '.d.mts'],
      cjs: ['.cts', '.d.cts'],
    };
    const choices = extension
      ? [
          ...replacements[extension].map((ext) => clean.slice(0, -(extension.length + 1)) + ext),
          clean,
        ]
      : [clean];
    choices.push(
      ...[
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.mts',
        '.cts',
        '.mjs',
        '.cjs',
        '.d.ts',
        '.d.mts',
        '.d.cts',
        '/index.ts',
        '/index.tsx',
        '/index.js',
        '/index.jsx',
        '/index.mts',
        '/index.cts',
        '/index.mjs',
        '/index.cjs',
        '/index.d.ts',
      ].map((ext) => clean + ext),
    );
    return choices.find((c) => ids.has(c));
  }
  function resolve(from: string, specifier: string): { target?: string; local: boolean } {
    if (specifier.startsWith('.'))
      return { target: candidate(join(dirname(from), specifier)), local: true };
    if (specifier.startsWith('/')) return { target: candidate(normalize(specifier)), local: true };
    const config = configs.find((c) => !c.dir || from.startsWith(c.dir + '/'));
    if (config) {
      const entries = Object.entries(config.paths).sort(
        ([a], [b]) =>
          Number(a.includes('*')) - Number(b.includes('*')) || b.indexOf('*') - a.indexOf('*'),
      );
      for (const [pattern, replacements] of entries) {
        const star = pattern.indexOf('*');
        const matches =
          star < 0
            ? specifier === pattern
            : specifier.startsWith(pattern.slice(0, star)) &&
              specifier.endsWith(pattern.slice(star + 1)) &&
              specifier.length >= pattern.length - 1;
        if (!matches) continue;
        const middle =
          star < 0
            ? ''
            : specifier.slice(
                star,
                pattern.length - star - 1 ? -(pattern.length - star - 1) : undefined,
              );
        for (const replacement of replacements) {
          const target = candidate(join(config.baseUrl, replacement.replace('*', middle)));
          if (target) return { target, local: true };
        }
        return { local: true };
      }
      if (config.hasBaseUrl) {
        const target = candidate(join(config.baseUrl, specifier));
        if (target) return { target, local: true };
      }
    }
    return { local: false };
  }
  const edges: AtlasEdge[] = [];
  const edgeIds = new Set<string>();
  const nodes = sources.map((f) => {
    const external = new Set<string>();
    const unresolved = new Set<string>();
    const source = ts.createSourceFile(f.path, f.content, ts.ScriptTarget.Latest, true);
    function add(specifier: string, kind: EdgeKind) {
      const { target, local } = resolve(f.path, specifier);
      if (target) {
        const key = `${f.path}\0${target}\0${kind}`;
        if (!edgeIds.has(key)) {
          if (edges.length >= MAX_EDGES)
            throw new Error(
              'Project exceeds the 50,000 dependency limit. Select a smaller folder.',
            );
          edges.push({ source: f.path, target, kind });
          edgeIds.add(key);
        }
      } else if (local) {
        // Styles/assets are deliberately outside this source-code graph.
        if (
          !/\.(?:css|s[ac]ss|less|svg|png|jpe?g|gif|webp|ico|json|woff2?|ttf|mp4|wasm)(?:[?#].*)?$/i.test(
            specifier,
          )
        )
          unresolved.add(specifier);
      } else
        external.add(
          specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0],
        );
    }
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const onlyType =
          clause?.isTypeOnly ||
          (!!clause &&
            !clause.name &&
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((e) => e.isTypeOnly));
        add(node.moduleSpecifier.text, onlyType ? 'type' : 'static');
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const onlyType =
          node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((e) => e.isTypeOnly));
        add(node.moduleSpecifier.text, onlyType ? 'type' : 'static');
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        add(node.moduleReference.expression.text, node.isTypeOnly ? 'type' : 'require');
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        add(node.argument.literal.text, 'type');
      } else if (
        ts.isCallExpression(node) &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword)
          add(node.arguments[0].text, 'dynamic');
        else if (ts.isIdentifier(node.expression) && node.expression.text === 'require')
          add(node.arguments[0].text, 'require');
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    const folderParts = dirname(f.path).split('/').filter(Boolean);
    const folder =
      folderParts[0] === 'src' && folderParts.length > 1
        ? `src/${folderParts[1]}`
        : (folderParts[0] ?? '(root)');
    return {
      id: f.path,
      label: f.path.split('/').pop()!,
      folder,
      lines: f.content ? f.content.split(/\r?\n/).length : 0,
      bytes: sizes.get(f.path)!,
      external: [...external].sort(),
      unresolved: [...unresolved].sort(),
    };
  });
  return {
    version: 1,
    name: name.slice(0, 200),
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges,
    warnings,
  };
}
