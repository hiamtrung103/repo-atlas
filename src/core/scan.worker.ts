import { scanSources } from './scanner';
import type { SourceFile } from './types';

self.onmessage = (event: MessageEvent<{ sources: SourceFile[]; name: string }>) => {
  try {
    self.postMessage({ graph: scanSources(event.data.sources, event.data.name) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Unable to scan project.' });
  }
};
