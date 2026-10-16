import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  Folder,
  FolderOpen,
  GitBranch,
  GitFork as Github,
  Layers,
  Focus,
  LoaderCircle,
  LockKeyhole,
  Orbit,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import Graph, { colorFor } from './components/Graph';
import ThemeControl from './components/ThemeControl';
import { useTheme } from './hooks/useTheme';
import { version } from '../package.json';
import { analyze, collectImpact, parseGraph } from './core/analysis';
import { demoGraph } from './core/demo';
import { download, exportSvg, readProject, scanInWorker } from './core/io';
import { MAX_BYTES, type AtlasGraph } from './core/types';

const REPO_URL = 'https://github.com/hiamtrung103/repo-atlas';
type Mode = 'all' | 'cycles' | 'hotspots';

function ProjectDialog({
  onClose,
  onFolder,
  onJson,
}: {
  onClose: () => void;
  onFolder: () => void;
  onJson: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="project-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <button className="icon-button dialog-close" aria-label="Close dialog" onClick={onClose}>
        <X size={18} />
      </button>
      <div className="dialog-icon">
        <Orbit size={28} />
      </div>
      <div className="eyebrow">YOUR NEXT DISCOVERY</div>
      <h2 id="dialog-title">Every codebase has a story.</h2>
      <p>Open a project to see how it all connects.</p>
      <button className="upload-option" onClick={onFolder}>
        <span className="upload-option-icon">
          <FolderOpen size={24} />
        </span>
        <span>
          <strong>Choose a project folder</strong>
          <small>JavaScript & TypeScript · up to 2,500 files</small>
        </span>
        <ArrowUpRight size={19} />
      </button>
      <button className="upload-option" onClick={onJson}>
        <span className="upload-option-icon muted">
          <FileJson size={24} />
        </span>
        <span>
          <strong>Import an Atlas graph</strong>
          <small>Continue exploring an exported .json file</small>
        </span>
        <ArrowUpRight size={19} />
      </button>
      <div className="privacy-note">
        <ShieldCheck size={17} />
        <span>
          Your code stays on your device. Files are parsed in a browser worker and are never
          uploaded.
        </span>
      </div>
      <div className="cli-hint">
        <span>Prefer the terminal?</span>
        <code>npm run scan -- ./your-project</code>
      </div>
    </dialog>
  );
}

export default function App() {
  const { preference, setPreference, resolvedTheme } = useTheme();
  const folderColor = (folder: string, folders: string[]) =>
    colorFor(folder, folders, resolvedTheme);
  const [graph, setGraph] = useState<AtlasGraph>(demoGraph);
  const [isDemo, setIsDemo] = useState(true);
  const [selected, setSelected] = useState<string | null>('src/App.tsx');
  const [mode, setMode] = useState<Mode>('all');
  const [focus, setFocus] = useState<'neighbors' | 'impact' | null>(null);
  const [query, setQuery] = useState('');
  const [hiddenFolders, setHiddenFolders] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [includeTypes, setIncludeTypes] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'files' | 'cycles'>('files');
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const folderInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const folders = useMemo(() => [...new Set(graph.nodes.map((n) => n.folder))].sort(), [graph]);
  const activeGraph = useMemo(
    () => ({
      ...graph,
      edges: includeTypes ? graph.edges : graph.edges.filter((e) => e.kind !== 'type'),
    }),
    [graph, includeTypes],
  );
  const analysis = useMemo(() => analyze(activeGraph), [activeGraph]);
  const impact = useMemo(
    () => (selected ? collectImpact(analysis.incoming, selected) : new Set<string>()),
    [analysis, selected],
  );
  const scopeIds = useMemo(
    () =>
      focus === 'impact'
        ? impact
        : new Set(
            selected
              ? [
                  selected,
                  ...(analysis.incoming.get(selected) ?? []),
                  ...(analysis.outgoing.get(selected) ?? []),
                ]
              : [],
          ),
    [focus, impact, analysis, selected],
  );
  const sortedHotspots = useMemo(
    () =>
      [...graph.nodes].sort(
        (a, b) => (analysis.degree.get(b.id) ?? 0) - (analysis.degree.get(a.id) ?? 0),
      ),
    [graph, analysis],
  );
  const hotspotIds = useMemo(
    () =>
      new Set(
        sortedHotspots
          .slice(0, Math.max(1, Math.ceil(graph.nodes.length * 0.2)))
          .filter((n) => (analysis.degree.get(n.id) ?? 0) > 0)
          .map((n) => n.id),
      ),
    [sortedHotspots, graph.nodes.length, analysis],
  );
  const matching = useMemo(
    () =>
      graph.nodes.filter(
        (n) =>
          !hiddenFolders.has(n.folder) &&
          n.id.toLowerCase().includes(query.toLowerCase()) &&
          (!focus || scopeIds.has(n.id)) &&
          (mode !== 'cycles' || analysis.cycleNodes.has(n.id)) &&
          (mode !== 'hotspots' || hotspotIds.has(n.id)),
      ),
    [graph, hiddenFolders, query, mode, analysis, hotspotIds, focus, scopeIds],
  );
  const visibleNodes = useMemo(() => {
    if (matching.length <= 350) return matching;
    const ranked = [...matching].sort(
      (a, b) =>
        Number(b.id === selected) - Number(a.id === selected) ||
        (analysis.degree.get(b.id) ?? 0) - (analysis.degree.get(a.id) ?? 0),
    );
    return ranked.slice(0, 350);
  }, [matching, selected, analysis]);
  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    return activeGraph.edges.filter(
      (e) =>
        ids.has(e.source) &&
        ids.has(e.target) &&
        (mode !== 'cycles' || analysis.cycleEdges.has(`${e.source}\0${e.target}`)),
    );
  }, [activeGraph, visibleNodes, mode, analysis]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const inspected = selected ? nodeById.get(selected) : undefined;
  const selectedCycle = analysis.cycles.find((c) => c.includes(selected ?? ''));
  const externalCount = new Set(graph.nodes.flatMap((n) => n.external)).size;
  const unresolvedCount = graph.nodes.reduce((count, n) => count + n.unresolved.length, 0);

  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.current?.focus();
      }
      if (e.key === 'Escape') {
        setExportOpen(false);
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [exportOpen]);

  function loadGraph(next: AtlasGraph, demo = false) {
    setGraph(next);
    setIsDemo(demo);
    setSelected(
      next.nodes.find((n) => /(?:^|\/)App\.[jt]sx?$/.test(n.id))?.id ?? next.nodes[0]?.id ?? null,
    );
    setQuery('');
    setHiddenFolders(new Set());
    setCollapsed(new Set());
    changeMode('all');
    setSidebarTab('files');
    setIncludeTypes(true);
    setResetKey((k) => k + 1);
    setError('');
  }
  async function chooseFolder(files: File[]) {
    setOpen(false);
    setError('');
    setBusy('Preparing your project…');
    try {
      if (!files.length) return;
      const input = await readProject(files, setBusy);
      setBusy('Mapping imports & discovering connections…');
      const next = await scanInWorker(input.sources, input.name);
      loadGraph(next);
      setToast(`Mapped ${next.nodes.length} files. Ready to explore.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open project.');
    } finally {
      setBusy('');
      if (folderInput.current) folderInput.current.value = '';
    }
  }
  async function chooseJson(file?: File) {
    setOpen(false);
    if (!file) return;
    try {
      if (file.size > MAX_BYTES) throw new Error('Graph JSON exceeds the 15 MB import limit.');
      const next = parseGraph(JSON.parse(await file.text()));
      loadGraph(next);
      setToast('Atlas graph imported.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import graph.');
    } finally {
      if (jsonInput.current) jsonInput.current.value = '';
    }
  }
  function selectFile(id: string) {
    setSelected(id);
  }
  function changeMode(next: Mode) {
    setMode(next);
    setFocus(null);
  }
  function focusFile(next: 'neighbors' | 'impact') {
    changeMode('all');
    setFocus(next);
    setQuery('');
    setHiddenFolders(new Set());
    setResetKey((k) => k + 1);
  }
  async function copyPath() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected);
      setToast('File path copied.');
    } catch {
      setToast('Clipboard unavailable. Select the path in the inspector to copy it.');
    }
  }
  function toggleFolder(folder: string) {
    setHiddenFolders((current) => {
      const next = new Set(current);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }
  function exportGraph(kind: 'json' | 'svg' | 'report') {
    if (kind === 'json')
      download(JSON.stringify(graph, null, 2), 'repo-atlas-graph.json', 'application/json');
    if (kind === 'svg') exportSvg();
    if (kind === 'report') {
      const safe = (s: string) => s.replace(/[\r\n`|<>]/g, ' ');
      const report = [
        `# Repo Atlas · ${safe(graph.name)}`,
        '',
        `Generated: ${new Date().toISOString().slice(0, 10)}`,
        '',
        `- Files: ${graph.nodes.length}`,
        `- Dependencies: ${activeGraph.edges.length}`,
        `- Circular groups: ${analysis.cycles.length}`,
        `- Type-only imports: ${includeTypes ? 'included' : 'excluded'}`,
        `- External packages: ${externalCount}`,
        `- Unresolved imports: ${unresolvedCount}`,
        '',
        '## Most connected files',
        '',
        '| File | Imported by | Imports |',
        '| --- | ---: | ---: |',
        ...sortedHotspots
          .slice(0, 10)
          .map(
            (n) =>
              `| ${safe(n.id)} | ${analysis.incoming.get(n.id)!.length} | ${analysis.outgoing.get(n.id)!.length} |`,
          ),
        '',
        '## Circular groups',
        '',
        'Each group is a strongly connected component, not an ordered cycle path.',
        '',
        ...analysis.cycles.flatMap((c, i) => [
          `### Group ${i + 1}`,
          ...c.map((id) => `- ${safe(id)}`),
          '',
        ]),
        '## Scan notes',
        '',
        ...graph.warnings.map((w) => `- ${safe(w)}`),
        ...graph.nodes
          .filter((n) => n.unresolved.length)
          .map((n) => `- ${safe(n.id)}: unresolved ${n.unresolved.map(safe).join(', ')}`),
      ].join('\n');
      download(report, 'repo-atlas-report.md', 'text/markdown');
    }
    setExportOpen(false);
    setToast('Export ready.');
  }

  return (
    <div className="app-shell">
      <input
        ref={folderInput}
        className="sr-only"
        type="file"
        tabIndex={-1}
        aria-label="Project folder"
        multiple
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(e) => void chooseFolder(Array.from(e.target.files ?? []))}
      />
      <input
        ref={jsonInput}
        className="sr-only"
        type="file"
        tabIndex={-1}
        aria-label="Graph JSON file"
        accept="application/json,.json"
        onChange={(e) => void chooseJson(e.target.files?.[0])}
      />
      <header className="app-header">
        <a
          className="brand"
          href="#"
          aria-label="Repo Atlas home"
          onClick={(e) => {
            e.preventDefault();
            loadGraph(demoGraph, true);
          }}
        >
          <span className="brand-symbol">
            <Orbit size={25} strokeWidth={1.6} />
          </span>
          <span>
            repo<span className="brand-light">atlas</span>
            <small>CODEBASE EXPLORER</small>
          </span>
        </a>
        <div className="header-divider" />
        <div className="header-project">
          <GitBranch size={14} />
          <span>{graph.name}</span>
          {isDemo && <span className="badge">DEMO</span>}
        </div>
        <div className="header-actions">
          <ThemeControl preference={preference} onChange={setPreference} />
          <a
            className="github-link"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="View Repo Atlas on GitHub"
          >
            <Github size={17} />
            <span>GitHub</span>
            <ArrowUpRight size={13} />
          </a>
          <div className="export-wrap" ref={exportRef}>
            <button
              className="button button-secondary"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((v) => !v)}
            >
              <Download size={15} />
              <span>Export</span>
              <ChevronDown size={13} />
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button onClick={() => exportGraph('json')}>
                  <FileJson size={16} /> Graph JSON
                </button>
                <button onClick={() => exportGraph('svg')}>
                  <Workflow size={16} /> Map as SVG
                </button>
                <button onClick={() => exportGraph('report')}>
                  <FileCode2 size={16} /> Architecture report
                </button>
              </div>
            )}
          </div>
          <button className="button button-primary" disabled={!!busy} onClick={() => setOpen(true)}>
            <FolderOpen size={16} />
            <span>Open project</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-project">
            <span className="project-icon">
              <Braces size={19} />
            </span>
            <div>
              <strong title={graph.name}>{graph.name}</strong>
              <small>
                {isDemo ? 'Sample TypeScript project' : 'Local project'} <span>·</span>{' '}
                {graph.nodes.length} files
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Open another project"
              onClick={() => setOpen(true)}
            >
              <ChevronDown size={15} />
            </button>
          </div>
          <label className="search-box">
            <Search size={15} />
            <input
              ref={searchInput}
              placeholder="Find a file…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Find a file"
            />
            {query ? (
              <button
                className="icon-button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            ) : (
              <kbd>⌃ K</kbd>
            )}
          </label>
          <div className="sidebar-tabs">
            <button
              className={sidebarTab === 'files' ? 'active' : ''}
              onClick={() => setSidebarTab('files')}
            >
              <Folder size={14} /> Explorer
            </button>
            <button
              className={sidebarTab === 'cycles' ? 'active' : ''}
              onClick={() => setSidebarTab('cycles')}
            >
              <RefreshCw size={13} /> Cycles <span>{analysis.cycles.length}</span>
            </button>
          </div>
          <div className="sidebar-content">
            {sidebarTab === 'files' ? (
              <>
                <div className="section-label">
                  PROJECT FILES <span>{matching.length}</span>
                </div>
                <div className="file-tree">
                  {folders.map((folder) => {
                    const children = matching.filter((n) => n.folder === folder);
                    const allChildren = graph.nodes.filter(
                      (n) =>
                        n.folder === folder && n.id.toLowerCase().includes(query.toLowerCase()),
                    );
                    if (!allChildren.length) return null;
                    return (
                      <div key={folder} className="tree-group">
                        <div className="tree-folder">
                          <button
                            aria-expanded={!collapsed.has(folder)}
                            onClick={() =>
                              setCollapsed((current) => {
                                const next = new Set(current);
                                if (next.has(folder)) next.delete(folder);
                                else next.add(folder);
                                return next;
                              })
                            }
                          >
                            {collapsed.has(folder) ? (
                              <ChevronRight size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )}
                            <Folder size={14} color={folderColor(folder, folders)} />
                            <span>{folder}</span>
                          </button>
                          <small>{allChildren.length}</small>
                        </div>
                        {!collapsed.has(folder) &&
                          children.slice(0, 150).map((n) => (
                            <button
                              key={n.id}
                              title={n.id}
                              className={`tree-file ${selected === n.id ? 'selected' : ''}`}
                              onClick={() => selectFile(n.id)}
                            >
                              <span
                                className={`file-extension ${n.label.endsWith('tsx') || n.label.endsWith('jsx') ? 'jsx' : ''}`}
                              >
                                {n.label.endsWith('tsx') || n.label.endsWith('jsx')
                                  ? '✳'
                                  : /\.[cm]?ts$/.test(n.label)
                                    ? 'TS'
                                    : 'JS'}
                              </span>
                              <span>{n.label}</span>
                              {analysis.cycleNodes.has(n.id) && (
                                <span
                                  className="cycle-dot"
                                  title="Part of a circular import group"
                                />
                              )}
                            </button>
                          ))}
                        {children.length > 150 && !collapsed.has(folder) && (
                          <p className="tree-more">
                            {children.length - 150} more files · narrow your search
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {!matching.length && (
                    <p className="empty-copy">No matching files. Adjust your search or filters.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="section-label">
                  CIRCULAR GROUPS <span>{analysis.cycles.length}</span>
                </div>
                <p className="cycle-explainer">
                  Files in a group can reach each other through imports.
                </p>
                {analysis.cycles.map((cycle, i) => (
                  <div className="cycle-card" key={cycle[0]}>
                    <div>
                      <RefreshCw size={13} />
                      <strong>Group {String(i + 1).padStart(2, '0')}</strong>
                      <span>{cycle.length} files</span>
                    </div>
                    {cycle.map((id) => (
                      <button
                        key={id}
                        onClick={() => {
                          setSelected(id);
                          changeMode('cycles');
                          setQuery('');
                          setHiddenFolders(new Set());
                        }}
                        title={id}
                      >
                        <FileCode2 size={12} />
                        {nodeById.get(id)?.label}
                      </button>
                    ))}
                  </div>
                ))}
                {!analysis.cycles.length && (
                  <div className="cycle-clear">
                    <ShieldCheck size={28} />
                    <strong>No circular imports</strong>
                    <p>This dependency graph has no circular groups.</p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="folder-filters">
            <div className="section-label">
              FOLDER LEGEND{' '}
              <button
                onClick={() => setHiddenFolders(hiddenFolders.size ? new Set() : new Set(folders))}
              >
                {hiddenFolders.size ? 'Show all' : 'Hide all'}
              </button>
            </div>
            <div className="legend-list">
              {folders.map((folder) => (
                <label key={folder}>
                  <input
                    type="checkbox"
                    checked={!hiddenFolders.has(folder)}
                    onChange={() => toggleFolder(folder)}
                  />
                  <span className="legend-check" style={{ color: folderColor(folder, folders) }}>
                    {!hiddenFolders.has(folder) && <Check size={11} />}
                  </span>
                  <span>{folder.replace('src/', '')}</span>
                  <small>{graph.nodes.filter((n) => n.folder === folder).length}</small>
                </label>
              ))}
            </div>
          </div>
          <div className="sidebar-footer">
            <LockKeyhole size={13} />
            <span>Local by design. Yours to explore.</span>
            <span className="online-dot" />
          </div>
        </aside>

        <main className="main-panel">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> A LITTLE PERSPECTIVE GOES A LONG WAY
              </div>
              <h1>
                See the shape of your code<span>.</span>
              </h1>
              <p>Follow the connections. Find the friction. Know your codebase.</p>
            </div>
            <div className="heading-mark" aria-hidden="true">
              <Orbit size={54} strokeWidth={0.65} />
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={17} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-icon lavender">
                <FileCode2 size={17} />
              </span>
              <div>
                <span>Source files</span>
                <strong>
                  {graph.nodes.length.toLocaleString()}
                  <small>files mapped</small>
                </strong>
              </div>
              <span className="stat-spark spark-files" />
            </div>
            <div className="stat-card">
              <span className="stat-icon blue">
                <GitBranch size={17} />
              </span>
              <div>
                <span>Dependencies</span>
                <strong>
                  {activeGraph.edges.length.toLocaleString()}
                  <small>connections</small>
                </strong>
              </div>
              <span className="stat-spark spark-links" />
            </div>
            <button
              className={`stat-card stat-button ${mode === 'cycles' ? 'stat-active' : ''}`}
              onClick={() => {
                changeMode(mode === 'cycles' ? 'all' : 'cycles');
                setSidebarTab('cycles');
              }}
            >
              <span className="stat-icon orange">
                <RefreshCw size={17} />
              </span>
              <div>
                <span>
                  Circular groups <ArrowUpRight size={11} />
                </span>
                <strong>
                  {analysis.cycles.length}
                  <small>{analysis.cycles.length ? 'worth a closer look' : 'looking good'}</small>
                </strong>
              </div>
            </button>
            <div className="stat-card">
              <span className="stat-icon green">
                <Layers size={17} />
              </span>
              <div>
                <span>External packages</span>
                <strong>
                  {externalCount}
                  <small>unique imports</small>
                </strong>
              </div>
            </div>
          </div>
          <section className="map-panel" aria-label="Architecture explorer">
            <div className="map-toolbar">
              <div className="view-tabs" aria-label="Map view">
                <button
                  className={mode === 'all' ? 'active' : ''}
                  onClick={() => changeMode('all')}
                >
                  <Workflow size={14} /> All files
                </button>
                <button
                  className={mode === 'cycles' ? 'active' : ''}
                  onClick={() => changeMode('cycles')}
                >
                  <RefreshCw size={13} /> Cycles <span>{analysis.cycles.length}</span>
                </button>
                <button
                  className={mode === 'hotspots' ? 'active' : ''}
                  onClick={() => changeMode('hotspots')}
                >
                  <Activity size={14} /> Hotspots
                </button>
              </div>
              <label className="type-toggle">
                <input
                  type="checkbox"
                  checked={includeTypes}
                  onChange={(e) => setIncludeTypes(e.target.checked)}
                />
                <span className="switch" /> Type imports
              </label>
            </div>
            {focus && (
              <div className="focus-banner">
                <Focus size={14} />
                <span>
                  <strong>{focus === 'impact' ? 'Change impact' : 'Connections'}:</strong>{' '}
                  {inspected?.label} <small>· {matching.length} matching files</small>
                </span>
                <button onClick={() => setFocus(null)} aria-label="Clear focus">
                  <X size={14} /> Show all
                </button>
              </div>
            )}
            {matching.length > 350 && (
              <div className="graph-notice">
                Showing the 350 most connected of {matching.length} matching files. Search or filter
                folders to explore the rest.
              </div>
            )}
            {mode === 'hotspots' && (
              <div className="graph-notice">
                Top 20% by total connections. Larger nodes have more imports and dependents.
              </div>
            )}
            <Graph
              nodes={visibleNodes}
              edges={visibleEdges}
              folders={folders}
              analysis={analysis}
              selected={selected}
              onSelect={selectFile}
              mode={mode}
              resetKey={resetKey}
              theme={resolvedTheme}
            />
            <div className="map-status">
              <span>
                <span className="status-dot" />
                {isDemo ? 'Exploring sample project' : 'Project mapped locally'}
                <span className="status-divider">/</span>
                {visibleEdges.length} visible connections
              </span>
              <span>
                <span className="dashed-line" />
                Type-only <span className="cycle-dot" />
                Circular import
              </span>
            </div>
          </section>
          <div className="below-map">
            <span>
              <ShieldCheck size={14} /> No uploads. No account. Just your architecture.
            </span>
            {!isDemo && (
              <button onClick={() => loadGraph(demoGraph, true)}>
                Load demo <ArrowRight size={13} />
              </button>
            )}
            {isDemo && (
              <span className="demo-note">
                <Sparkles size={13} /> Sample graph with two intentional circular groups
              </span>
            )}
          </div>
          {(unresolvedCount > 0 || (!isDemo && graph.warnings.length > 0)) && (
            <details className="scan-notes">
              <summary>
                <CircleAlert size={14} /> Scan notes · {unresolvedCount} unresolved imports ·{' '}
                {graph.warnings.length} warnings
              </summary>
              {graph.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
              {graph.nodes
                .filter((n) => n.unresolved.length)
                .map((n) => (
                  <p key={n.id}>
                    <code>{n.id}</code>: {n.unresolved.join(', ')}
                  </p>
                ))}
            </details>
          )}
        </main>

        <aside className="inspector" aria-label="File inspector">
          <div className="inspector-heading">
            <span>FILE INSPECTOR</span>
            <Code2 size={15} />
          </div>
          {inspected ? (
            <>
              <div className="inspected-file">
                <span
                  className="inspected-icon"
                  style={{ color: folderColor(inspected.folder, folders) }}
                >
                  <FileCode2 size={25} />
                </span>
                <h2>{inspected.label}</h2>
                <p title={inspected.id}>{inspected.id}</p>
                <div>
                  <span className="file-badge">
                    {inspected.label.split('.').pop()?.toUpperCase()}
                  </span>
                  <span>{inspected.lines.toLocaleString()} lines</span>
                  <span>·</span>
                  <span>{(inspected.bytes / 1024).toFixed(1)} KB</span>
                </div>
              </div>
              <div className="inspector-actions">
                <button onClick={() => focusFile('neighbors')}>
                  <Focus size={13} /> Focus connections
                </button>
                <button
                  onClick={() => void copyPath()}
                  title="Copy file path"
                  aria-label="Copy file path"
                >
                  <Copy size={14} />
                </button>
              </div>
              <div className="connection-stats">
                <div>
                  <strong>{analysis.outgoing.get(inspected.id)?.length ?? 0}</strong>
                  <span>
                    <ArrowUpRight size={12} /> Imports
                  </span>
                </div>
                <div>
                  <strong>{analysis.incoming.get(inspected.id)?.length ?? 0}</strong>
                  <span>
                    <ArrowDownLeft size={12} /> Imported by
                  </span>
                </div>
              </div>
              <div className="impact-card">
                <div>
                  <Activity size={15} />
                  <span>Potential change impact</span>
                  <strong>{Math.max(0, impact.size - 1)}</strong>
                </div>
                <p>Files that depend on this one, directly or through other files.</p>
                <button onClick={() => focusFile('impact')}>
                  Explore impact <ArrowUpRight size={13} />
                </button>
              </div>
              {selectedCycle && (
                <button
                  className="cycle-alert"
                  onClick={() => {
                    changeMode('cycles');
                    setSidebarTab('cycles');
                    setQuery('');
                    setHiddenFolders(new Set());
                  }}
                >
                  <span>
                    <RefreshCw size={15} />
                    <strong>Circular dependency</strong>
                  </span>
                  <p>
                    Part of a {selectedCycle.length}-file circular group. Inspect the connections.
                  </p>
                  <ArrowUpRight size={15} />
                </button>
              )}
              <div className="inspector-connections">
                {(['outgoing', 'incoming'] as const).map((direction) => {
                  const connections = analysis[direction].get(inspected.id) ?? [];
                  return (
                    <section key={direction}>
                      <div className="section-label">
                        {direction === 'outgoing' ? 'IMPORTS' : 'IMPORTED BY'}
                        <span>{connections.length}</span>
                      </div>
                      {connections.length ? (
                        connections.slice(0, 80).map((id) => (
                          <button
                            className="connection-file"
                            key={id}
                            title={id}
                            onClick={() => selectFile(id)}
                          >
                            <FileCode2
                              size={14}
                              color={folderColor(nodeById.get(id)!.folder, folders)}
                            />
                            <span>
                              <strong>{nodeById.get(id)!.label}</strong>
                              <small>{id.slice(0, Math.max(0, id.lastIndexOf('/')))}</small>
                            </span>
                            <ChevronRight size={13} />
                          </button>
                        ))
                      ) : (
                        <p className="empty-copy">
                          {direction === 'outgoing'
                            ? 'No local imports. A little island.'
                            : 'No other mapped files import this file.'}
                        </p>
                      )}
                      {connections.length > 80 && (
                        <p className="empty-copy">
                          {connections.length - 80} more connections. Export JSON for the full list.
                        </p>
                      )}
                    </section>
                  );
                })}
                {inspected.external.length > 0 && (
                  <section>
                    <div className="section-label">
                      EXTERNAL PACKAGES<span>{inspected.external.length}</span>
                    </div>
                    <div className="package-list">
                      {inspected.external.map((pkg) => (
                        <span key={pkg}>
                          {pkg}
                          <ExternalLink size={10} />
                        </span>
                      ))}
                    </div>
                  </section>
                )}
                {inspected.unresolved.length > 0 && (
                  <section>
                    <div className="section-label">
                      UNRESOLVED IMPORTS<span>{inspected.unresolved.length}</span>
                    </div>
                    {inspected.unresolved.map((s) => (
                      <p key={s} className="unresolved-path">
                        {s}
                      </p>
                    ))}
                  </section>
                )}
              </div>
            </>
          ) : (
            <div className="inspector-empty">
              <MousePointerIllustration />
              <h3>A closer look</h3>
              <p>Select a file on the map to explore its connections.</p>
            </div>
          )}
          <div className="inspector-tip">
            <span>
              <Sparkles size={14} /> A DIFFERENT ANGLE
            </span>
            <p>
              {mode === 'hotspots'
                ? 'Highly connected files can make changes travel further. Start your architectural review here.'
                : 'Select a node to trace its neighbors. Dashed lines represent type-only imports.'}
            </p>
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>
          <Orbit size={13} /> Built for the curious developer.
        </span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Open source, open possibilities <ArrowUpRight size={12} />
        </a>
        <span>
          REPO ATLAS <i /> v{version}
        </span>
      </footer>
      {open && (
        <ProjectDialog
          onClose={() => setOpen(false)}
          onFolder={() => folderInput.current?.click()}
          onJson={() => jsonInput.current?.click()}
        />
      )}
      {busy && (
        <div className="busy-overlay" role="status" aria-live="polite">
          <span className="busy-orbit">
            <Orbit size={44} />
          </span>
          <h2>A new world is taking shape.</h2>
          <p>{busy}</p>
          <LoaderCircle className="spin" size={20} />
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function MousePointerIllustration() {
  return (
    <div className="inspector-empty-icon">
      <Workflow size={30} />
    </div>
  );
}
