import {
  isConfig,
  isIgnored,
  MAX_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  SOURCE_RE,
  type AtlasGraph,
  type SourceFile,
} from './types';

export async function readProject(
  files: File[],
  onProgress: (message: string) => void,
): Promise<{ sources: SourceFile[]; name: string }> {
  const firstPath = files[0]?.webkitRelativePath;
  const root = firstPath?.split('/')[0] ?? 'my-project';
  const selected = files.filter(
    (f) =>
      !isIgnored(f.webkitRelativePath || f.name) && (SOURCE_RE.test(f.name) || isConfig(f.name)),
  );
  const count = selected.filter((f) => SOURCE_RE.test(f.name)).length;
  if (!count)
    throw new Error(
      'No JavaScript or TypeScript files found. Choose a project folder containing .js, .jsx, .ts or .tsx files.',
    );
  if (count > MAX_FILES)
    throw new Error(
      `Found ${count.toLocaleString()} source files; the limit is ${MAX_FILES.toLocaleString()}. Choose a smaller folder.`,
    );
  if (selected.some((f) => f.size > MAX_FILE_BYTES))
    throw new Error('A source/config file exceeds the 1 MB limit. Choose a smaller project.');
  if (selected.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES)
    throw new Error('Project sources exceed the 15 MB scan limit. Choose a smaller folder.');
  const sources: SourceFile[] = [];
  for (let i = 0; i < selected.length; i += 40) {
    onProgress(`Reading ${Math.min(i + 40, selected.length)} of ${selected.length} files…`);
    sources.push(
      ...(await Promise.all(
        selected.slice(i, i + 40).map(async (f) => ({
          path: f.webkitRelativePath ? f.webkitRelativePath.slice(root.length + 1) : f.name,
          content: await f.text(),
        })),
      )),
    );
  }
  return { sources, name: root };
}

export function scanInWorker(sources: SourceFile[], name: string): Promise<AtlasGraph> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Scan timed out after 60 seconds. Try a smaller folder.'));
    }, 60000);
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event) => {
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.graph);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('The scanner could not start. Reload the page and try again.'));
    };
    worker.postMessage({ sources, name });
  });
}

export function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvg() {
  const svg = document.querySelector<SVGSVGElement>('.dependency-svg');
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const { width, height } = svg.viewBox.baseVal;
  clone.setAttribute('width', '1600');
  clone.setAttribute('height', String(Math.round((1600 * height) / width)));
  // Freeze the current theme into the export rather than depending on app CSS.
  const originalTexts = svg.querySelectorAll('text');
  clone.querySelectorAll('text').forEach((text, index) => {
    const computed = getComputedStyle(originalTexts[index]);
    for (const property of [
      'stroke',
      'stroke-width',
      'stroke-linejoin',
      'paint-order',
      'font-family',
    ]) {
      text.style.setProperty(property, computed.getPropertyValue(property));
    }
  });
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', String(width));
  background.setAttribute('height', String(height));
  background.setAttribute('fill', getComputedStyle(svg.parentElement!).backgroundColor);
  clone.prepend(background);
  download(new XMLSerializer().serializeToString(clone), 'repo-atlas-map.svg', 'image/svg+xml');
}
