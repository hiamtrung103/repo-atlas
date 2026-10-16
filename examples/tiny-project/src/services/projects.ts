import { cache } from '../store/cache';
import { formatName } from '../lib/format';
import type { Project } from '../types/project';

// Intentional cycle for exploring circular groups in Repo Atlas.
export function listProjects(): Project[] {
  return cache.map((project) => ({ ...project, name: formatName(project.name) }));
}
