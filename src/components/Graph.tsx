import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { Minus, Plus, Maximize, MousePointer2, Eye, EyeOff } from 'lucide-react';
import { edgeKey, type Analysis, type AtlasEdge, type AtlasNode } from '../core/types';
import type { ResolvedTheme } from '../hooks/useTheme';

export const COLORS = [
  '#b6a1f5',
  '#75b8fb',
  '#e9b975',
  '#77ceae',
  '#e390b7',
  '#a9bf76',
  '#88c8d2',
  '#b8b9c8',
];
const LIGHT_COLORS = [
  '#7351ba',
  '#286caa',
  '#a26918',
  '#258265',
  '#b0467a',
  '#687e28',
  '#2c7f8e',
  '#687085',
];
export function colorFor(folder: string, folders: string[], theme: ResolvedTheme = 'dark') {
  return (theme === 'light' ? LIGHT_COLORS : COLORS)[
    Math.max(0, folders.indexOf(folder)) % COLORS.length
  ];
}
interface Point extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
  folder: string;
}
interface Props {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  analysis: Analysis;
  folders: string[];
  selected: string | null;
  onSelect: (id: string) => void;
  mode: string;
  resetKey: number;
  theme: ResolvedTheme;
}

export default function Graph({
  nodes,
  edges,
  analysis,
  folders,
  selected,
  onSelect,
  mode,
  resetKey,
  theme,
}: Props) {
  const palette =
    theme === 'light'
      ? {
          accent: '#3b741e',
          cycle: '#b55b23',
          edge: '#647568',
          ink: '#334637',
          selectedInk: '#285018',
          core: '#f8faf6',
          halo: '#f8faf6',
          focus: '#fff',
        }
      : {
          accent: '#c3f36b',
          cycle: '#f3a075',
          edge: '#8b9498',
          ink: '#b5bdb9',
          selectedInk: '#d6f6a3',
          core: '#161a19',
          halo: '#151817',
          focus: '#28331d',
        };
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [labels, setLabels] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [lastReset, setLastReset] = useState(resetKey);
  if (lastReset !== resetKey) {
    setLastReset(resetKey);
    setView({ x: 0, y: 0, k: 1 });
  }
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 600 });
  const cx = size.width / 2,
    cy = size.height / 2;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) {
        const w = Math.max(430, Math.min(1200, width));
        const h = Math.max(330, (height / width) * w);
        setSize((previous) =>
          Math.abs(previous.width - w) < 1 && Math.abs(previous.height - h) < 1
            ? previous
            : { width: w, height: h },
        );
      }
    });
    observer.observe(canvasRef.current!);
    return () => observer.disconnect();
  }, []);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const positions = useMemo(() => {
    const groupNames = [...new Set(nodes.map((n) => n.folder))];
    const centers = new Map(
      groupNames.map((name, i) => {
        const angle = (i / Math.max(1, groupNames.length)) * Math.PI * 2 - Math.PI / 2;
        return [
          name,
          {
            x: cx + Math.cos(angle) * (groupNames.length === 1 ? 0 : size.width * 0.27),
            y: cy + Math.sin(angle) * (groupNames.length === 1 ? 0 : size.height * 0.27),
          },
        ];
      }),
    );
    const points: Point[] = nodes.map((n, i) => {
      const c = centers.get(n.folder)!;
      return {
        id: n.id,
        folder: n.folder,
        x: c.x + Math.sin(i * 7.13) * 60,
        y: c.y + Math.cos(i * 3.17) * 60,
      };
    });
    const links: SimulationLinkDatum<Point>[] = edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));
    const simulation = forceSimulation(points)
      .force(
        'link',
        forceLink<Point, SimulationLinkDatum<Point>>(links)
          .id((n) => n.id)
          .distance(76)
          .strength(0.13),
      )
      .force('charge', forceManyBody().strength(-115))
      .force('collision', forceCollide<Point>(nodes.length > 100 ? 13 : 29))
      .force('x', forceX<Point>((n) => centers.get(n.folder)!.x).strength(0.14))
      .force('y', forceY<Point>((n) => centers.get(n.folder)!.y).strength(0.17))
      .stop();
    simulation.tick(220);
    // Normalize the settled layout to the viewport, including label space.
    const minX = Math.min(...points.map((p) => p.x), cx - 50),
      maxX = Math.max(...points.map((p) => p.x), cx + 50);
    const minY = Math.min(...points.map((p) => p.y), cy - 50),
      maxY = Math.max(...points.map((p) => p.y), cy + 50);
    const scaleX = (size.width - 170) / Math.max(1, maxX - minX);
    const scaleY = (size.height - 160) / Math.max(1, maxY - minY);
    for (const p of points) {
      p.x = cx + (p.x - (minX + maxX) / 2) * scaleX;
      p.y = cy + (p.y - (minY + maxY) / 2) * scaleY;
    }
    return new Map(points.map((p) => [p.id, p]));
  }, [nodes, edges, size, cx, cy]);
  const groups = useMemo(
    () =>
      folders
        .map((folder) => {
          const points = nodes.filter((n) => n.folder === folder).map((n) => positions.get(n.id)!);
          if (!points.length) return null;
          const x = Math.min(...points.map((p) => p.x)) - 37;
          const y = Math.min(...points.map((p) => p.y)) - 37;
          return {
            folder,
            x,
            y,
            width: Math.max(...points.map((p) => p.x)) - x + 67,
            height: Math.max(...points.map((p) => p.y)) - y + 57,
          };
        })
        .filter((g) => g !== null),
    [nodes, positions, folders],
  );
  const active = hovered ?? selected;
  const neighbors = new Set(
    active
      ? [active, ...(analysis.incoming.get(active) ?? []), ...(analysis.outgoing.get(active) ?? [])]
      : [],
  );
  const maxDegree = Math.max(1, ...analysis.degree.values());
  const toPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = toPoint(e.clientX, e.clientY);
    drag.current = { x: p.x, y: p.y, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  function zoom(factor: number) {
    setView((v) => ({ ...v, k: Math.max(0.35, Math.min(3.5, v.k * factor)) }));
  }
  return (
    <div className="graph-canvas" ref={canvasRef}>
      <div className="canvas-caption">
        <span className="live-dot" /> DEPENDENCY MAP{' '}
        <span className="canvas-caption-separator">/</span>{' '}
        <span>{nodes.length} visible files</span>
      </div>
      <svg
        ref={svgRef}
        className="dependency-svg"
        viewBox={`0 0 ${size.width} ${size.height}`}
        aria-label="Interactive file dependency map"
        role="group"
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          if (drag.current) {
            const p = toPoint(e.clientX, e.clientY);
            setView((v) => ({
              ...v,
              x: drag.current!.vx + p.x - drag.current!.x,
              y: drag.current!.vy + p.y - drag.current!.y,
            }));
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(e) => {
          const p = toPoint(e.clientX, e.clientY);
          setView((v) => {
            const k = Math.max(0.35, Math.min(3.5, v.k * Math.exp(-e.deltaY * 0.001)));
            const ratio = k / v.k;
            return {
              k,
              x: p.x - cx - (p.x - cx - v.x) * ratio,
              y: p.y - cy - (p.y - cy - v.y) * ratio,
            };
          });
        }}
      >
        <defs>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="18"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={palette.accent} />
          </marker>
          <marker
            id="arrow-cycle"
            viewBox="0 0 10 10"
            refX="18"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={palette.cycle} />
          </marker>
          <radialGradient id="node-glow">
            <stop stopColor={palette.accent} stopOpacity=".15" />
            <stop offset="1" stopColor={palette.accent} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g
          transform={`translate(${cx + view.x},${cy + view.y}) scale(${view.k}) translate(${-cx},${-cy})`}
        >
          {groups.map((g) => (
            <g
              key={g.folder}
              className="folder-region"
              style={{ color: colorFor(g.folder, folders, theme) }}
            >
              <rect
                x={g.x}
                y={g.y}
                width={g.width}
                height={g.height}
                rx="29"
                fill="currentColor"
                fillOpacity=".022"
                stroke="currentColor"
                strokeOpacity=".12"
                strokeDasharray="3 7"
              />
              <text
                x={g.x + 17}
                y={g.y - 11}
                fill="currentColor"
                opacity=".6"
                fontSize="10"
                fontFamily="monospace"
                letterSpacing="1"
              >
                {g.folder.replace('src/', '')}
              </text>
            </g>
          ))}
          {edges.map((e) => {
            const a = positions.get(e.source),
              b = positions.get(e.target);
            if (!a || !b) return null;
            const isCycle = analysis.cycleEdges.has(edgeKey(e.source, e.target));
            const connected = e.source === active || e.target === active;
            const highlighted = connected || (mode === 'cycles' && isCycle);
            const color = isCycle ? palette.cycle : highlighted ? palette.accent : palette.edge;
            const dx = b.x - a.x,
              dy = b.y - a.y;
            const d =
              e.source === e.target
                ? `M${a.x},${a.y} c-40,-55 40,-55 0,0`
                : `M${a.x},${a.y} Q${(a.x + b.x) / 2 - dy * 0.08},${(a.y + b.y) / 2 + dx * 0.08} ${b.x},${b.y}`;
            return (
              <path
                key={`${e.source}:${e.target}:${e.kind}`}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={highlighted ? 1.7 : 1}
                strokeOpacity={highlighted ? 0.85 : active ? (theme === 'light' ? 0.2 : 0.1) : 0.3}
                strokeDasharray={e.kind === 'type' ? '4 4' : undefined}
                markerEnd={highlighted ? `url(#arrow-${isCycle ? 'cycle' : 'active'})` : undefined}
              />
            );
          })}
          {nodes.map((n) => {
            const p = positions.get(n.id)!;
            const isSelected = n.id === selected,
              isCycle = analysis.cycleNodes.has(n.id);
            const color = isSelected
              ? palette.accent
              : mode === 'cycles' && isCycle
                ? palette.cycle
                : colorFor(n.folder, folders, theme);
            const radius =
              mode === 'hotspots'
                ? 5 + ((analysis.degree.get(n.id) ?? 0) / maxDegree) * 14
                : 6 + Math.min(7, (analysis.degree.get(n.id) ?? 0) * 0.75);
            const dimmed = !!active && !neighbors.has(n.id);
            return (
              <g
                key={n.id}
                role="button"
                tabIndex={0}
                aria-label={`Select ${n.id}`}
                aria-pressed={isSelected}
                className="graph-node"
                transform={`translate(${p.x},${p.y})`}
                opacity={dimmed ? (theme === 'light' ? 0.75 : 0.55) : 1}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(n.id);
                  }
                }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>{`${n.id}\n${analysis.incoming.get(n.id)?.length ?? 0} dependents · ${analysis.outgoing.get(n.id)?.length ?? 0} imports`}</title>
                {isSelected && (
                  <>
                    <circle r="48" fill="url(#node-glow)" />
                    <circle
                      r={radius + 8}
                      fill="none"
                      stroke={color}
                      strokeOpacity=".5"
                      strokeDasharray="2 4"
                    />
                  </>
                )}
                <circle className="node-hit-area" r={Math.max(20, radius + 8)} fill="transparent" />
                <circle
                  className="node-core"
                  r={radius}
                  fill={color}
                  fillOpacity={isSelected ? 1 : 0.8}
                  stroke={color}
                  strokeWidth="1.5"
                />
                <circle r="2.5" fill={isSelected ? palette.focus : palette.core} />
                {isCycle && (
                  <circle
                    cx={radius - 1}
                    cy={-radius + 1}
                    r="3.3"
                    fill={palette.cycle}
                    stroke={palette.halo}
                    strokeWidth="1.6"
                  />
                )}
                {((labels && (size.width > 550 || neighbors.has(n.id))) ||
                  isSelected ||
                  hovered === n.id) && (
                  <text
                    y={radius + 18}
                    textAnchor="middle"
                    fill={isSelected ? palette.selectedInk : palette.ink}
                    fontSize={isSelected ? '12' : '11'}
                    fontFamily="monospace"
                    fontWeight={isSelected ? '600' : '400'}
                  >
                    {n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {!nodes.length && (
        <div className="graph-empty">
          <MousePointer2 size={28} />
          <h3>No files in this view</h3>
          <p>Try a different search or enable more folders.</p>
        </div>
      )}
      <div className="canvas-bottom">
        <span>
          <MousePointer2 size={13} /> Drag to pan <i /> Scroll to zoom
        </span>
        <div className="zoom-controls">
          <button
            aria-label={labels ? 'Hide labels' : 'Show labels'}
            title="Toggle file labels"
            onClick={() => setLabels((v) => !v)}
          >
            {labels ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <div className="control-divider" />
          <button aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>
            <Minus size={15} />
          </button>
          <span>{Math.round(view.k * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => zoom(1.2)}>
            <Plus size={15} />
          </button>
          <div className="control-divider" />
          <button
            aria-label="Fit graph"
            title="Fit graph"
            onClick={() => setView({ x: 0, y: 0, k: 1 })}
          >
            <Maximize size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
