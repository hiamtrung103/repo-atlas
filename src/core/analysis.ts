import { edgeKey, MAX_FILES, MAX_EDGES, type Analysis, type AtlasGraph } from './types';

// Reverse reachability includes the starting file exactly once, even in cycles.
export function collectImpact(incoming: Map<string, string[]>, id: string): Set<string> {
  const result = new Set<string>();
  if (!incoming.has(id)) return result;
  const queue = [id];
  result.add(id);
  for (let index = 0; index < queue.length; index++) {
    for (const next of incoming.get(queue[index]) ?? []) {
      if (!result.has(next)) {
        result.add(next);
        queue.push(next);
      }
    }
  }
  return result;
}

// Iterative Kosaraju: no call-stack limit, even for long dependency chains.
export function analyze(graph: AtlasGraph): Analysis {
  const incoming = new Map(graph.nodes.map((n) => [n.id, [] as string[]]));
  const outgoing = new Map(graph.nodes.map((n) => [n.id, [] as string[]]));
  for (const e of graph.edges) {
    if (!incoming.has(e.target) || !outgoing.has(e.source)) continue;
    if (!outgoing.get(e.source)!.includes(e.target)) outgoing.get(e.source)!.push(e.target);
    if (!incoming.get(e.target)!.includes(e.source)) incoming.get(e.target)!.push(e.source);
  }
  const visited = new Set<string>();
  const order: string[] = [];
  for (const id of outgoing.keys()) {
    if (visited.has(id)) continue;
    visited.add(id);
    const stack: [string, number][] = [[id, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const neighbors = outgoing.get(top[0])!;
      if (top[1] < neighbors.length) {
        const next = neighbors[top[1]++];
        if (!visited.has(next)) {
          visited.add(next);
          stack.push([next, 0]);
        }
      } else {
        order.push(top[0]);
        stack.pop();
      }
    }
  }
  visited.clear();
  const cycles: string[][] = [];
  const componentByNode = new Map<string, number>();
  for (const id of order.reverse()) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of incoming.get(current)!) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    if (component.length > 1 || outgoing.get(id)!.includes(id)) {
      for (const node of component) componentByNode.set(node, cycles.length);
      cycles.push(component.sort());
    }
  }
  const cycleEdges = new Set(
    graph.edges
      .filter(
        (e) =>
          componentByNode.has(e.source) &&
          componentByNode.get(e.source) === componentByNode.get(e.target),
      )
      .map((e) => edgeKey(e.source, e.target)),
  );
  return {
    incoming,
    outgoing,
    degree: new Map(
      graph.nodes.map((n) => [n.id, incoming.get(n.id)!.length + outgoing.get(n.id)!.length]),
    ),
    cycles,
    cycleNodes: new Set(cycles.flat()),
    cycleEdges,
  };
}

export function parseGraph(value: unknown): AtlasGraph {
  if (!value || typeof value !== 'object') throw new Error('This is not a Repo Atlas graph.');
  const g = value as AtlasGraph;
  if (
    g.version !== 1 ||
    typeof g.name !== 'string' ||
    g.name.length > 200 ||
    !Array.isArray(g.nodes) ||
    !Array.isArray(g.edges)
  )
    throw new Error('Unsupported graph format. Expected a version 1 Repo Atlas JSON file.');
  if (g.nodes.length > MAX_FILES || g.edges.length > MAX_EDGES)
    throw new Error('Graph is too large (maximum 2,500 files / 50,000 edges).');
  const ids = new Set<string>();
  for (const n of g.nodes) {
    if (
      !n ||
      typeof n.id !== 'string' ||
      !n.id.length ||
      n.id.includes('\0') ||
      n.id.length > 1000 ||
      ids.has(n.id) ||
      typeof n.label !== 'string' ||
      typeof n.folder !== 'string' ||
      !Number.isFinite(n.lines) ||
      n.lines < 0 ||
      !Number.isFinite(n.bytes) ||
      n.bytes < 0 ||
      !Array.isArray(n.external) ||
      !Array.isArray(n.unresolved) ||
      [...n.external, ...n.unresolved].some((s) => typeof s !== 'string')
    )
      throw new Error('Invalid or duplicate file in graph.');
    ids.add(n.id);
  }
  for (const e of g.edges) {
    if (
      !e ||
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      !['static', 'dynamic', 'require', 'type'].includes(e.kind)
    )
      throw new Error('Graph contains an invalid dependency.');
  }
  if (
    g.warnings !== undefined &&
    (!Array.isArray(g.warnings) || g.warnings.some((w) => typeof w !== 'string'))
  )
    throw new Error('Invalid graph warnings.');
  // Whitelist graph fields: unknown imported properties (including source text)
  // must never accidentally become part of a later export.
  return {
    version: 1,
    name: g.name,
    nodes: g.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      folder: n.folder,
      lines: n.lines,
      bytes: n.bytes,
      external: [...n.external],
      unresolved: [...n.unresolved],
    })),
    edges: g.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind })),
    warnings: [...(g.warnings ?? [])],
  };
}
