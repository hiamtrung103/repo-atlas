import { listProjects } from '@/services/projects';
import type { Project } from '@/types/project';

export const projects: Project[] = listProjects();
export const loadPanel = () => import('./features/lazy');
