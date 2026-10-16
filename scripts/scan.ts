import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { scanSources } from '../src/core/scanner';
import { analyze } from '../src/core/analysis';
import {
  IGNORED,
  SOURCE_RE,
  isConfig,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_BYTES,
  type SourceFile,
} from '../src/core/types';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    'Repo Atlas — map a local JS/TS project\n\nUsage: npm run scan -- <folder> [--out <file.json>]\n\nExcludes dependencies, build outputs and symlinks. Output contains paths and\ndependency metadata, never source code. Limits: 2,500 files / 15 MB / 1 MB per file.',
  );
  process.exit(0);
}
async function main() {
  const outIndex = args.indexOf('--out');
  const folder = args[0] && !args[0].startsWith('--') ? args[0] : undefined;
  if (
    !folder ||
    args.some((arg, i) => i > 0 && i !== outIndex && i !== outIndex + 1) ||
    (outIndex !== -1 && !args[outIndex + 1])
  )
    throw new Error('Usage: npm run scan -- <folder> [--out <file.json>]');
  const root = resolve(folder);
  if (!(await stat(root)).isDirectory()) throw new Error('The project path must be a directory.');
  const sources: SourceFile[] = [];
  let count = 0,
    total = 0;
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (IGNORED.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && (SOURCE_RE.test(entry.name) || isConfig(entry.name))) {
        if (SOURCE_RE.test(entry.name) && ++count > MAX_FILES)
          throw new Error('Project exceeds the 2,500 source-file limit.');
        const metadata = await stat(path);
        if (metadata.size > MAX_FILE_BYTES)
          throw new Error(`${relative(root, path)} exceeds 1 MB.`);
        total += metadata.size;
        if (total > MAX_BYTES) throw new Error('Project exceeds the 15 MB scan limit.');
        sources.push({
          path: relative(root, path).replace(/\\/g, '/'),
          content: await readFile(path, 'utf8'),
        });
      }
    }
  }
  await walk(root);
  if (!count) throw new Error('No JavaScript or TypeScript source files found.');
  const graph = scanSources(sources, basename(root));
  const analysis = analyze(graph);
  const output = resolve(outIndex < 0 ? 'repo-atlas.json' : args[outIndex + 1]);
  // Exclusive creation protects existing files; choose another --out to rescan.
  await writeFile(output, JSON.stringify(graph, null, 2) + '\n', { flag: 'wx' });
  console.log(
    `\n  REPO ATLAS\n  ${graph.nodes.length} files · ${graph.edges.length} dependencies · ${analysis.cycles.length} circular groups\n\n  Saved ${output}\n  Open this JSON in the Repo Atlas viewer.\n`,
  );
  for (const warning of graph.warnings) console.warn(`  Note: ${warning}`);
}
main().catch((error) => {
  console.error(`Repo Atlas: ${error.message}`);
  process.exitCode = 1;
});
