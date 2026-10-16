import type { AtlasGraph, AtlasEdge } from './types';

const modules: Record<string, string[]> = {
  'src/App.tsx': [
    'src/components/Sidebar.tsx',
    'src/components/Header.tsx',
    'src/features/Workspace.tsx',
    'src/hooks/useTheme.ts',
    'src/store/index.ts',
  ],
  'src/main.tsx': ['src/App.tsx', 'src/lib/telemetry.ts'],
  'src/components/Sidebar.tsx': [
    'src/components/Avatar.tsx',
    'src/hooks/useWorkspace.ts',
    'src/lib/cn.ts',
  ],
  'src/components/Header.tsx': [
    'src/components/Avatar.tsx',
    'src/components/Button.tsx',
    'src/hooks/useTheme.ts',
  ],
  'src/components/Avatar.tsx': ['src/lib/cn.ts', 'src/types/user.ts'],
  'src/components/Button.tsx': ['src/lib/cn.ts'],
  'src/components/Dialog.tsx': [
    'src/components/Button.tsx',
    'src/hooks/useKeybind.ts',
    'src/lib/cn.ts',
  ],
  'src/components/EmptyState.tsx': ['src/components/Button.tsx', 'src/lib/cn.ts'],
  'src/features/Workspace.tsx': [
    'src/features/ProjectList.tsx',
    'src/features/ProjectView.tsx',
    'src/hooks/useWorkspace.ts',
    'src/store/index.ts',
  ],
  'src/features/ProjectList.tsx': [
    'src/components/Button.tsx',
    'src/components/EmptyState.tsx',
    'src/hooks/useProjects.ts',
    'src/lib/format.ts',
  ],
  'src/features/ProjectView.tsx': [
    'src/features/Activity.tsx',
    'src/features/Settings.tsx',
    'src/hooks/useProjects.ts',
    'src/components/Dialog.tsx',
  ],
  'src/features/Activity.tsx': ['src/lib/format.ts', 'src/api/events.ts', 'src/types/project.ts'],
  'src/features/Settings.tsx': [
    'src/features/Workspace.tsx',
    'src/components/Button.tsx',
    'src/store/preferences.ts',
  ],
  'src/hooks/useTheme.ts': ['src/store/preferences.ts'],
  'src/hooks/useWorkspace.ts': ['src/store/index.ts', 'src/api/workspaces.ts'],
  'src/hooks/useProjects.ts': [
    'src/api/projects.ts',
    'src/store/projects.ts',
    'src/types/project.ts',
  ],
  'src/hooks/useKeybind.ts': [],
  'src/hooks/useAuth.ts': ['src/api/client.ts', 'src/store/session.ts'],
  'src/store/index.ts': [
    'src/store/session.ts',
    'src/store/projects.ts',
    'src/store/preferences.ts',
  ],
  'src/store/session.ts': ['src/hooks/useAuth.ts', 'src/types/user.ts'],
  'src/store/projects.ts': ['src/types/project.ts'],
  'src/store/preferences.ts': ['src/lib/storage.ts'],
  'src/api/client.ts': ['src/lib/storage.ts', 'src/lib/telemetry.ts'],
  'src/api/projects.ts': ['src/api/client.ts', 'src/types/project.ts'],
  'src/api/workspaces.ts': ['src/api/client.ts', 'src/types/project.ts'],
  'src/api/events.ts': ['src/api/client.ts', 'src/lib/format.ts'],
  'src/lib/cn.ts': [],
  'src/lib/format.ts': [],
  'src/lib/storage.ts': [],
  'src/lib/telemetry.ts': ['src/lib/format.ts'],
  'src/types/user.ts': [],
  'src/types/project.ts': ['src/types/user.ts'],
  'src/lib/colorTokens.ts': [],
};

export const demoGraph: AtlasGraph = {
  version: 1,
  name: 'orbit-workspace',
  nodes: Object.keys(modules).map((id, i) => ({
    id,
    label: id.split('/').pop()!,
    folder: id.split('/').length > 2 ? id.split('/').slice(0, 2).join('/') : 'src',
    lines: 24 + ((i * 47) % 230),
    bytes: 640 + ((i * 893) % 7000),
    external: id.endsWith('.tsx') || id.includes('/hooks/') ? ['react'] : [],
    unresolved: [],
  })),
  edges: Object.entries(modules).flatMap(([source, targets]) =>
    targets.map(
      (target) =>
        ({ source, target, kind: target.includes('/types/') ? 'type' : 'static' }) as AtlasEdge,
    ),
  ),
  warnings: [
    'This is an illustrative demo. Line counts are sample data; dependency connections are intentional, including two circular groups.',
  ],
};
