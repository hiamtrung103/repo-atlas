import { listProjects } from '../services/projects';
import type { Project } from '../types/project';

export const cache: Project[] = [{ id: 'atlas', name: 'repo atlas' }];
export function refresh(): Project[] {
  return listProjects();
}
