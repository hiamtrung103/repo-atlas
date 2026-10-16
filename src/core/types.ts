export interface SourceFile {
  path: string;
  content: string;
}
export type EdgeKind = 'static' | 'dynamic' | 'require' | 'type';
export interface AtlasNode {
  id: string;
  label: string;
  folder: string;
  lines: number;
  bytes: number;
  external: string[];
  unresolved: string[];
}
export interface AtlasEdge {
  source: string;
  target: string;
  kind: EdgeKind;
}
export interface AtlasGraph {
  version: 1;
  name: string;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  warnings: string[];
}
export interface Analysis {
  incoming: Map<string, string[]>;
  outgoing: Map<string, string[]>;
  degree: Map<string, number>;
  cycles: string[][];
  cycleNodes: Set<string>;
  cycleEdges: Set<string>;
}
export const MAX_FILES = 2500;
export const MAX_EDGES = 50000;
export const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_FILE_BYTES = 1024 * 1024;
export const SOURCE_RE = /\.(?:[cm]?[jt]sx?)$/i;
export const IGNORED = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.cache',
  'vendor',
  'playwright-report',
  'test-results',
]);
export const isIgnored = (path: string) => path.split(/[\\/]/).some((part) => IGNORED.has(part));
export const isConfig = (path: string) => /(?:^|\/)(?:tsconfig[^/]*|jsconfig)\.json$/.test(path);
export const edgeKey = (source: string, target: string) => `${source}\0${target}`;
