import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownUp, ArrowRight, Download, Route, X } from 'lucide-react';
import { findImportPath } from '../core/analysis';
import { download } from '../core/io';
import type { Analysis, AtlasGraph } from '../core/types';

interface Props {
  graph: AtlasGraph;
  analysis: Analysis;
  selected: string | null;
  includeTypes: boolean;
  onClose: () => void;
  onTrace: (path: string[]) => void;
}

export default function PathFinder({
  graph,
  analysis,
  selected,
  includeTypes,
  onClose,
  onTrace,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState(selected ?? graph.nodes[0]?.id ?? '');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<{ path: string[] | null } | null>(null);
  const [error, setError] = useState('');
  const choices = useMemo(() => [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)), [graph]);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function edit(which: 'from' | 'to', value: string) {
    if (which === 'from') setFrom(value);
    else setTo(value);
    setResult(null);
    setError('');
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!analysis.outgoing.has(from) || !analysis.outgoing.has(to)) {
      setError('Choose two existing file paths from this project.');
      setResult(null);
      return;
    }
    setError('');
    setResult({ path: findImportPath(analysis.outgoing, from, to) });
  }
  function exportPath() {
    if (!result?.path) return;
    download(
      [
        `Repo Atlas import path · ${graph.name}`,
        `From: ${from}`,
        `To: ${to}`,
        `Imports: ${result.path.length - 1}`,
        `Type-only imports: ${includeTypes ? 'included' : 'excluded'}`,
        '',
        ...result.path.map((id, index) => `${index + 1}. ${id}`),
        '',
      ].join('\n'),
      'repo-atlas-path.txt',
      'text/plain',
    );
  }
  return (
    <dialog
      ref={dialog}
      className="project-dialog path-dialog"
      aria-labelledby="path-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <button className="icon-button dialog-close" aria-label="Close path finder" onClick={onClose}>
        <X size={18} />
      </button>
      <div className="dialog-icon">
        <Route size={27} />
      </div>
      <div className="eyebrow">FOLLOW THE THREAD</div>
      <h2 id="path-title">How do these files connect?</h2>
      <p>Find the shortest directed import path between two mapped files.</p>
      <form className="path-form" onSubmit={submit} noValidate>
        <label>
          From file
          <input
            list="atlas-path-files"
            value={from}
            onChange={(event) => edit('from', event.target.value)}
            placeholder="src/App.tsx"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button
          className="path-swap icon-button"
          type="button"
          aria-label="Swap endpoints"
          title="Swap endpoints"
          onClick={() => {
            setFrom(to);
            setTo(from);
            setResult(null);
            setError('');
          }}
        >
          <ArrowDownUp size={16} />
        </button>
        <label>
          To file
          <input
            list="atlas-path-files"
            value={to}
            onChange={(event) => edit('to', event.target.value)}
            placeholder="src/lib/client.ts"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <datalist id="atlas-path-files">
          {choices.map((node) => (
            <option key={node.id} value={node.id} />
          ))}
        </datalist>
        <div className="path-type-note">
          Type-only imports {includeTypes ? 'included' : 'excluded'} · follows importer → imported
          file
        </div>
        {error && (
          <p className="path-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" type="submit">
          <Route size={15} /> Trace import path
        </button>
      </form>
      {result &&
        (result.path ? (
          <section className="path-result" aria-label="Import path result">
            <div className="path-result-heading">
              <strong>
                {result.path.length === 1
                  ? 'Same file · 0 imports'
                  : `${result.path.length - 1} import${result.path.length === 2 ? '' : 's'} · ${result.path.length} files`}
              </strong>
              <span>Shortest path</span>
            </div>
            <ol className="path-steps">
              {result.path.slice(0, 100).map((id, index) => (
                <li key={id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <code>{id}</code>
                </li>
              ))}
            </ol>
            {result.path.length > 100 && (
              <p className="path-type-note">
                Showing the first 100 steps. Download the path for all {result.path.length} files.
              </p>
            )}
            <div className="path-result-actions">
              <button className="button button-secondary" onClick={exportPath}>
                <Download size={14} /> Download path
              </button>
              <button className="button button-primary" onClick={() => onTrace(result.path!)}>
                Show on map <ArrowRight size={14} />
              </button>
            </div>
          </section>
        ) : (
          <div className="path-not-found" role="status">
            <Route size={22} />
            <strong>No directed import path</strong>
            <p>
              The first file cannot reach the second through the current mapped imports. Try
              swapping endpoints or changing the type-import filter.
            </p>
          </div>
        ))}
    </dialog>
  );
}
