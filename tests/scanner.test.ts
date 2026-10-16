import { describe, expect, it } from 'vitest';
import { scanSources, normalize } from '../src/core/scanner';
import { analyze, collectImpact, parseGraph } from '../src/core/analysis';
import { demoGraph } from '../src/core/demo';
import type { AtlasGraph } from '../src/core/types';

describe('AST dependency scanner', () => {
  it('does not map imports outside the selected root to files inside it', () => {
    const g = scanSources([
      { path: 'src/main.ts', content: `import '../../inside';` },
      { path: 'inside.ts', content: '' },
    ]);
    expect(g.edges).toEqual([]);
    expect(g.nodes.find((n) => n.id === 'src/main.ts')!.unresolved).toEqual(['../../inside']);
    expect(normalize('../../outside')).toBe('../../outside');
  });
  it('prefers the primary config and respects .mjs/.cjs TypeScript counterparts', () => {
    const g = scanSources([
      { path: 'tsconfig.test.json', content: '{"compilerOptions":{"paths":{"@/*":["wrong/*"]}}}' },
      { path: 'tsconfig.json', content: '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}' },
      {
        path: 'main.ts',
        content: `import '@/module.mjs'; import './common.cjs'; import './decl';`,
      },
      { path: 'src/module.ts', content: '' },
      { path: 'src/module.mts', content: '' },
      { path: 'common.ts', content: '' },
      { path: 'common.cts', content: '' },
      { path: 'decl.d.ts', content: '' },
    ]);
    expect(g.edges.map((e) => e.target)).toEqual(['src/module.mts', 'common.cts', 'decl.d.ts']);
  });
  it('resolves relative modules, index files, emitted JS imports and Windows paths', () => {
    const g = scanSources([
      {
        path: 'src\\main.ts',
        content: `import './feature'; import './helper.js'; import './thing.mjs';`,
      },
      { path: 'src/feature/index.tsx', content: '' },
      { path: 'src/helper.ts', content: '' },
      { path: 'src/thing.mts', content: '' },
    ]);
    expect(g.edges.map((e) => e.target)).toEqual([
      'src/feature/index.tsx',
      'src/helper.ts',
      'src/thing.mts',
    ]);
    expect(normalize('src/../src/./file.ts')).toBe('src/file.ts');
  });
  it('handles config comments, aliases, baseUrl and exact aliases before wildcards', () => {
    const g = scanSources([
      {
        path: 'tsconfig.json',
        content:
          '{ // alias config\n"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"],"@/special":["other.ts"]},},}',
      },
      {
        path: 'src/main.ts',
        content: `import '@/lib/helper'; import '@/special'; import 'src/base'; import '@/missing';`,
      },
      { path: 'src/lib/helper.ts', content: '' },
      { path: 'other.ts', content: '' },
      { path: 'src/base.ts', content: '' },
    ]);
    expect(g.edges.map((e) => e.target)).toEqual(['src/lib/helper.ts', 'other.ts', 'src/base.ts']);
    expect(g.nodes.find((n) => n.id === 'src/main.ts')!.unresolved).toEqual(['@/missing']);
  });
  it('uses the closest nested config and reports unsupported inheritance', () => {
    const g = scanSources([
      { path: 'tsconfig.json', content: '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}' },
      {
        path: 'packages/ui/tsconfig.json',
        content: '{"extends":"../../tsconfig.json","compilerOptions":{"paths":{"@/*":["lib/*"]}}}',
      },
      { path: 'packages/ui/main.ts', content: `import '@/button';` },
      { path: 'packages/ui/lib/button.ts', content: '' },
    ]);
    expect(g.edges[0].target).toBe('packages/ui/lib/button.ts');
    expect(g.warnings).toHaveLength(1);
  });
  it('distinguishes static, dynamic, require and type-only dependencies without matching comments', () => {
    const g = scanSources([
      {
        path: 'main.ts',
        content: `// import './fake';\nconst text = "import './fake'";\nimport type { A } from './a';\nimport { type B } from './b';\nexport type { C } from './c';\nexport { type D } from './d';\nexport * from './e';\nconst f = import('./f');\nconst g = require('./g');\nimport h = require('./h');\ntype I = import('./i').I;`,
      },
      ...'abcdefghi'.split('').map((letter) => ({ path: `${letter}.ts`, content: '' })),
    ]);
    expect(g.edges.map((e) => [e.target, e.kind])).toEqual([
      ['a.ts', 'type'],
      ['b.ts', 'type'],
      ['c.ts', 'type'],
      ['d.ts', 'type'],
      ['e.ts', 'static'],
      ['f.ts', 'dynamic'],
      ['g.ts', 'require'],
      ['h.ts', 'require'],
      ['i.ts', 'type'],
    ]);
    expect(g.nodes.find((n) => n.id === 'main.ts')!.unresolved).toEqual([]);
  });
  it('deduplicates edges, separates external packages and reports unresolved code imports', () => {
    const g = scanSources([
      {
        path: 'main.ts',
        content: `import './a'; import './a'; import './missing'; import './styles.css'; import './logo.svg?raw'; import 'react'; import 'react/jsx-runtime'; import '@scope/pkg/path';`,
      },
      { path: 'a.ts', content: '' },
    ]);
    expect(g.edges).toHaveLength(1);
    const main = g.nodes.find((n) => n.id === 'main.ts')!;
    expect(main.external).toEqual(['@scope/pkg', 'react']);
    expect(main.unresolved).toEqual(['./missing']);
  });
  it('ignores generated folders and enforces byte/file limits', () => {
    expect(
      scanSources([
        { path: 'node_modules/react/index.js', content: '' },
        { path: '.git/temp.ts', content: '' },
        { path: 'src/ok.ts', content: '' },
      ]).nodes,
    ).toHaveLength(1);
    expect(() => scanSources([{ path: 'large.ts', content: 'a'.repeat(1024 * 1024 + 1) }])).toThrow(
      '1 MB',
    );
    expect(() =>
      scanSources(Array.from({ length: 2501 }, (_, i) => ({ path: `${i}.ts`, content: '' }))),
    ).toThrow('limit');
  });
});

describe('graph analysis and import validation', () => {
  it('finds transitive dependents without looping through cycles or including unrelated files', () => {
    const incoming = new Map([
      ['a', []],
      ['b', ['a', 'c']],
      ['c', ['b']],
      ['island', []],
    ]);
    expect(collectImpact(incoming, 'c')).toEqual(new Set(['a', 'b', 'c']));
    expect(collectImpact(incoming, 'island')).toEqual(new Set(['island']));
    expect(collectImpact(incoming, 'absent')).toEqual(new Set());
  });
  it('strips unknown imported fields before a graph can be re-exported', () => {
    const value = {
      ...demoGraph,
      nodes: demoGraph.nodes.map((n) => ({ ...n, content: 'private source' })),
      edges: demoGraph.edges.map((e) => ({ ...e, sourceText: 'private source' })),
    };
    expect(JSON.stringify(parseGraph(value))).not.toContain('private source');
  });
  it('finds strongly connected groups and self-loops, without marking bridges as cyclic', () => {
    const g = scanSources([
      { path: 'a.ts', content: `import './b';` },
      { path: 'b.ts', content: `import './a'; import './c';` },
      { path: 'c.ts', content: `import './c';` },
      { path: 'island.ts', content: '' },
    ]);
    const a = analyze(g);
    expect(a.cycles).toHaveLength(2);
    expect(a.cycleNodes).toEqual(new Set(['a.ts', 'b.ts', 'c.ts']));
    expect(a.cycleEdges.has('b.ts\0c.ts')).toBe(false);
    expect(a.incoming.get('c.ts')).toEqual(['b.ts', 'c.ts']);
  });
  it('does not count type-only cycles when those edges are excluded', () => {
    const g = scanSources([
      { path: 'a.ts', content: `import type { B } from './b';` },
      { path: 'b.ts', content: `import type { A } from './a';` },
    ]);
    expect(analyze(g).cycles).toHaveLength(1);
    expect(analyze({ ...g, edges: g.edges.filter((e) => e.kind !== 'type') }).cycles).toHaveLength(
      0,
    );
  });
  it('handles a long dependency chain without recursion overflow', () => {
    const graph: AtlasGraph = {
      version: 1,
      name: 'long-chain',
      warnings: [],
      nodes: Array.from({ length: 2500 }, (_, i) => ({
        id: `${i}`,
        label: `${i}`,
        folder: '.',
        lines: 1,
        bytes: 1,
        external: [],
        unresolved: [],
      })),
      edges: Array.from({ length: 2499 }, (_, i) => ({
        source: `${i}`,
        target: `${i + 1}`,
        kind: 'static',
      })),
    };
    expect(analyze(graph).cycles).toHaveLength(0);
  });
  it('round-trips exported graphs and rejects malformed data', () => {
    expect(parseGraph(JSON.parse(JSON.stringify(demoGraph)))).toEqual(demoGraph);
    expect(() => parseGraph({ ...demoGraph, version: 2 })).toThrow('Unsupported');
    expect(() =>
      parseGraph({ ...demoGraph, nodes: [demoGraph.nodes[0], demoGraph.nodes[0]] }),
    ).toThrow('duplicate');
    expect(() =>
      parseGraph({
        ...demoGraph,
        edges: [{ source: 'absent', target: demoGraph.nodes[0].id, kind: 'static' }],
      }),
    ).toThrow('invalid dependency');
    expect(() => parseGraph({ ...demoGraph, warnings: [123] })).toThrow('warnings');
  });
  it('keeps the demo honest: exactly two circular groups', () => {
    expect(analyze(demoGraph).cycles).toHaveLength(2);
  });
});
